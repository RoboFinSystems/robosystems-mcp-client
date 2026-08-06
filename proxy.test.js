/**
 * Tests for Streamable HTTP proxy mode
 */

import { describe, it, expect, vi } from 'vitest'
import { Readable } from 'stream'
import { ReadableStream } from 'stream/web'
import { TextEncoder } from 'util'
import { createProxy, runProxy, redactUrl } from './proxy.js'

const URL = 'https://api.example.com/v1/graphs/kg123/mcp'

function makeOutput() {
  const lines = []
  return {
    write: (chunk) => {
      lines.push(chunk)
      return true
    },
    lines,
    messages: () => lines.map((l) => JSON.parse(l)),
  }
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (name) => (name.toLowerCase() === 'content-type' ? 'application/json' : null) },
    text: async () => JSON.stringify(body),
  }
}

function sseResponse(sseText) {
  const encoder = new TextEncoder()
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(sseText))
      controller.close()
    },
  })
  return {
    ok: true,
    status: 200,
    headers: {
      get: (name) => (name.toLowerCase() === 'content-type' ? 'text/event-stream' : null),
    },
    body,
  }
}

function acceptedResponse() {
  return {
    ok: true,
    status: 202,
    headers: { get: () => null },
    text: async () => '',
  }
}

describe('createProxy', () => {
  it('forwards a request verbatim and writes the JSON response as one line', async () => {
    const response = { jsonrpc: '2.0', id: 1, result: { tools: [] } }
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(response))
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'test-key', version: '0.0.0', output, fetchImpl })

    const request = '{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}'
    await proxy.handleLine(request)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const [url, options] = fetchImpl.mock.calls[0]
    expect(url).toBe(URL)
    expect(options.method).toBe('POST')
    expect(options.body).toBe(request)
    expect(options.headers['X-API-Key']).toBe('test-key')
    expect(options.headers.Accept).toBe('application/json, text/event-stream')

    expect(output.lines).toHaveLength(1)
    expect(output.lines[0].endsWith('\n')).toBe(true)
    expect(output.messages()[0]).toEqual(response)
  })

  it('captures the negotiated protocol version and echoes it on later requests', async () => {
    const initResult = {
      jsonrpc: '2.0',
      id: 0,
      result: { protocolVersion: '2025-06-18', capabilities: {}, serverInfo: { name: 's' } },
    }
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(initResult))
      .mockResolvedValueOnce(jsonResponse({ jsonrpc: '2.0', id: 1, result: { tools: [] } }))
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","id":0,"method":"initialize","params":{}}')
    expect(fetchImpl.mock.calls[0][1].headers['MCP-Protocol-Version']).toBeUndefined()
    expect(proxy.getProtocolVersion()).toBe('2025-06-18')

    await proxy.handleLine('{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}')
    expect(fetchImpl.mock.calls[1][1].headers['MCP-Protocol-Version']).toBe('2025-06-18')
  })

  it('relays each SSE event as its own line and ignores keepalive comments', async () => {
    const progress = {
      jsonrpc: '2.0',
      method: 'notifications/progress',
      params: { progressToken: 't', progress: 50 },
    }
    const result = { jsonrpc: '2.0', id: 2, result: { content: [{ type: 'text', text: 'done' }] } }
    const sseText =
      `data: ${JSON.stringify(progress)}\n\n` +
      ': keepalive\n\n' +
      `data: ${JSON.stringify(result)}\n\n`
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(sseText))
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{}}')

    expect(output.messages()).toEqual([progress, result])
  })

  it('joins multi-line SSE data fields before parsing', async () => {
    const result = { jsonrpc: '2.0', id: 3, result: { ok: true } }
    const json = JSON.stringify(result)
    const mid = Math.floor(json.length / 2)
    const sseText = `data: ${json.slice(0, mid)}\ndata: ${json.slice(mid)}\n\n`
    const fetchImpl = vi.fn().mockResolvedValue(sseResponse(sseText))
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{}}')

    // Multi-line data is joined with \n per the SSE spec; JSON tolerates the
    // embedded newline, so the payload must round-trip
    expect(output.messages()).toEqual([result])
  })

  it('writes nothing for a 202-accepted notification', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(acceptedResponse())
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","method":"notifications/initialized"}')

    expect(output.lines).toHaveLength(0)
  })

  it('synthesizes a JSON-RPC error for an HTTP error on a request', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      headers: { get: () => 'application/json' },
      text: async () => '{"detail":"Invalid API key or access denied"}',
    })
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'bad', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","id":7,"method":"tools/list","params":{}}')

    const [message] = output.messages()
    expect(message.id).toBe(7)
    expect(message.error.code).toBe(-32000)
    expect(message.error.message).toContain('HTTP 403')
  })

  it('logs but does not answer an HTTP error on a notification', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: () => null },
      text: async () => 'oops',
    })
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","method":"notifications/cancelled"}')

    expect(output.lines).toHaveLength(0)
  })

  it('synthesizes a JSON-RPC error when the network request fails', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error('socket hang up'))
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('{"jsonrpc":"2.0","id":9,"method":"tools/list","params":{}}')

    const [message] = output.messages()
    expect(message.id).toBe(9)
    expect(message.error.code).toBe(-32000)
    expect(message.error.message).toContain('socket hang up')
  })

  it('answers an unparseable stdin line with a parse error', async () => {
    const fetchImpl = vi.fn()
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: 'k', version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('not json at all')

    expect(fetchImpl).not.toHaveBeenCalled()
    const [message] = output.messages()
    expect(message.error.code).toBe(-32700)
    expect(message.id).toBeNull()
  })

  it('skips blank stdin lines and omits the API key header when unset', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ jsonrpc: '2.0', id: 1, result: {} }))
    const output = makeOutput()
    const proxy = createProxy({ url: URL, apiKey: undefined, version: '0.0.0', output, fetchImpl })

    await proxy.handleLine('')
    await proxy.handleLine('   ')
    expect(fetchImpl).not.toHaveBeenCalled()

    await proxy.handleLine('{"jsonrpc":"2.0","id":1,"method":"ping"}')
    expect(fetchImpl.mock.calls[0][1].headers['X-API-Key']).toBeUndefined()
  })
})

describe('redactUrl', () => {
  it('strips the query string so a ?token= credential never survives', () => {
    const redacted = redactUrl(`${URL}?token=rfsc-super-secret`)
    expect(redacted).not.toContain('rfsc-super-secret')
    expect(redacted).not.toContain('token')
    expect(redacted).toBe(`${URL}?<redacted>`)
  })

  it('strips userinfo and fragment', () => {
    const redacted = redactUrl('https://user:pass@api.example.com/v1/graphs/kg123/mcp#frag')
    expect(redacted).not.toContain('user')
    expect(redacted).not.toContain('pass')
    expect(redacted).not.toContain('frag')
  })

  it('leaves a credential-free URL readable', () => {
    expect(redactUrl(URL)).toBe(URL)
  })

  it('never throws on garbage input', () => {
    expect(redactUrl('not a url')).toBe('<invalid url>')
  })
})

describe('runProxy', () => {
  it('pipes stdin lines through to the endpoint and responses back out', async () => {
    const response = { jsonrpc: '2.0', id: 1, result: { serverInfo: { name: 'robosystems' } } }
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(response))
    const output = makeOutput()
    const input = Readable.from(['{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n'])

    await runProxy({ url: URL, apiKey: 'k', version: '0.0.0', input, output, fetchImpl })

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(output.messages()).toEqual([response])
  })

  it('never writes a URL-carried token to stderr', async () => {
    const token = 'rfsc-super-secret-token'
    const fetchImpl = vi.fn().mockResolvedValue(acceptedResponse())
    const output = makeOutput()
    const input = Readable.from(['{"jsonrpc":"2.0","method":"notifications/initialized"}\n'])
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    try {
      await runProxy({
        url: `${URL}?token=${token}`,
        apiKey: undefined,
        version: '0.0.0',
        input,
        output,
        fetchImpl,
      })

      const stderr = errorSpy.mock.calls.flat().join('\n')
      expect(stderr).not.toContain(token)
      // The endpoint itself stays legible for debugging.
      expect(stderr).toContain('api.example.com')
    } finally {
      errorSpy.mockRestore()
    }
  })
})
