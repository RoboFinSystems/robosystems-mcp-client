/**
 * Streamable HTTP proxy mode.
 *
 * Instead of impersonating the MCP server over the REST tool endpoints
 * (GET /mcp/tools + POST /mcp/call-tool), this mode is a transparent pipe
 * between a stdio MCP client (Claude Desktop, or any stdio-only host) and the
 * platform's native MCP endpoint (POST /v1/graphs/{graph_id}/mcp, Streamable
 * HTTP). Every JSON-RPC message read from stdin is forwarded verbatim with the
 * API key header attached; JSON and SSE responses are relayed back to stdout
 * message-for-message. Per-session instructions, live tool lists, and streamed
 * progress notifications all pass through untouched — connecting through the
 * proxy behaves identically to connecting the URL directly.
 */

import { createInterface } from 'readline'

const JSONRPC_PARSE_ERROR = -32700
const JSONRPC_PROXY_ERROR = -32000
const ERROR_BODY_PREVIEW_CHARS = 300

/**
 * Parse a Server-Sent Events stream and deliver each event's JSON payload.
 * Handles multi-line `data:` fields per the SSE spec and ignores comment
 * (keepalive) lines. `event:`/`id:`/`retry:` fields carry no JSON-RPC content
 * on this endpoint and are skipped.
 */
async function relaySSE(body, deliver) {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let dataLines = []

  const dispatch = () => {
    if (dataLines.length === 0) return
    const dataStr = dataLines.join('\n')
    dataLines = []
    if (!dataStr || dataStr === '[DONE]') return
    try {
      deliver(JSON.parse(dataStr))
    } catch {
      console.error('Proxy: skipping unparseable SSE event')
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''

      for (const line of lines) {
        if (line === '') {
          dispatch()
        } else if (line.startsWith(':')) {
          // Comment / keepalive — ignore
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).replace(/^ /, ''))
        }
      }
    }
    // Flush a trailing event if the stream ended without a final blank line
    if (buffer.startsWith('data:')) {
      dataLines.push(buffer.slice(5).replace(/^ /, ''))
    }
    dispatch()
  } finally {
    reader.cancel().catch(() => {})
  }
}

/**
 * Create a proxy instance bound to one MCP endpoint. Exposed separately from
 * runProxy so tests can drive individual messages without real stdio.
 */
export function createProxy({ url, apiKey, version, output = process.stdout, fetchImpl = fetch }) {
  // Captured from the initialize response and echoed back on subsequent
  // requests via the MCP-Protocol-Version header, per Streamable HTTP.
  let protocolVersion = null

  const deliver = (message) => {
    if (message && typeof message === 'object' && message.result?.protocolVersion) {
      protocolVersion = message.result.protocolVersion
    }
    output.write(JSON.stringify(message) + '\n')
  }

  const buildHeaders = () => {
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      'User-Agent': `robosystems-mcp/${version}`,
      'X-MCP-Client': version,
    }
    if (apiKey) {
      headers['X-API-Key'] = apiKey
    }
    if (protocolVersion) {
      headers['MCP-Protocol-Version'] = protocolVersion
    }
    return headers
  }

  const handleLine = async (line) => {
    const raw = line.trim()
    if (!raw) return

    let message
    try {
      message = JSON.parse(raw)
    } catch {
      deliver({
        jsonrpc: '2.0',
        id: null,
        error: { code: JSONRPC_PARSE_ERROR, message: 'Parse error' },
      })
      return
    }

    // Requests carry both a method and an id and expect a reply; notifications
    // and client→server responses get forwarded but never answered locally.
    const expectsResponse = message.method !== undefined && message.id !== undefined

    try {
      const response = await fetchImpl(url, {
        method: 'POST',
        headers: buildHeaders(),
        body: raw,
      })

      // 202 Accepted — notification or response delivered, nothing to relay
      if (response.status === 202) return

      if (!response.ok) {
        const text = await response.text().catch(() => '')
        if (expectsResponse) {
          const detail = text ? `: ${text.slice(0, ERROR_BODY_PREVIEW_CHARS)}` : ''
          deliver({
            jsonrpc: '2.0',
            id: message.id,
            error: {
              code: JSONRPC_PROXY_ERROR,
              message: `HTTP ${response.status}${detail}`,
            },
          })
        } else {
          console.error(`Proxy: HTTP ${response.status} forwarding ${message.method || 'response'}`)
        }
        return
      }

      const contentType = response.headers.get('content-type') || ''
      if (contentType.includes('text/event-stream')) {
        await relaySSE(response.body, deliver)
      } else {
        const text = await response.text()
        if (!text.trim()) return
        // Re-serialize to guarantee one message per stdout line
        deliver(JSON.parse(text))
      }
    } catch (error) {
      if (expectsResponse) {
        deliver({
          jsonrpc: '2.0',
          id: message.id,
          error: {
            code: JSONRPC_PROXY_ERROR,
            message: `Proxy request failed: ${error.message}`,
          },
        })
      } else {
        console.error(`Proxy request failed: ${error.message}`)
      }
    }
  }

  return {
    handleLine,
    getProtocolVersion: () => protocolVersion,
  }
}

/**
 * Run the proxy over real stdio until the host closes stdin.
 */
export async function runProxy({
  url,
  apiKey,
  version,
  input = process.stdin,
  output = process.stdout,
  fetchImpl = fetch,
}) {
  const proxy = createProxy({ url, apiKey, version, output, fetchImpl })

  console.error(`RoboSystems MCP proxy v${version}`)
  console.error(`Forwarding stdio <-> ${url}`)
  if (!apiKey) {
    console.error(
      'No ROBOSYSTEMS_API_KEY set — forwarding without an X-API-Key header ' +
        '(fine only if the endpoint URL itself carries credentials)'
    )
  }

  const pending = new Set()
  const rl = createInterface({ input, terminal: false })

  rl.on('line', (line) => {
    const task = proxy.handleLine(line).finally(() => pending.delete(task))
    pending.add(task)
  })

  await new Promise((resolve) => rl.on('close', resolve))
  await Promise.allSettled([...pending])
}
