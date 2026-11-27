#!/usr/bin/env node

/**
 * RoboSystems MCP stdio bridge.
 *
 * A transparent pipe between a stdio MCP client and one of the platform's MCP
 * endpoints (Streamable HTTP). Every JSON-RPC message is forwarded verbatim
 * with the API-key header attached; the bridge adds nothing of its own, so
 * the tools, descriptions and instructions are the server's.
 *
 * The environment picks the endpoint:
 *
 * - Neither ROBOSYSTEMS_GRAPH_ID nor ROBOSYSTEMS_MCP_URL: every graph the API
 *   key reaches, at /v1/mcp/graphs. ROBOSYSTEMS_GRAPH_IDS and
 *   ROBOSYSTEMS_READ_ONLY narrow the connection.
 * - ROBOSYSTEMS_GRAPH_ID: one graph, at /v1/graphs/{graph_id}/mcp.
 * - ROBOSYSTEMS_MCP_URL: that URL.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runProxy } from './proxy.js'

// Get package version dynamically
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))
const PACKAGE_VERSION = packageJson.version

/**
 * Numeric semver compare for the three core components ("1.2.3").
 * Pre-release tags are ignored — good enough for a stale-version warning.
 */
export function _isNewerVersion(latest, current) {
  const a = String(latest)
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  const b = String(current)
    .split('.')
    .map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

/**
 * Best-effort check for a newer published version. Runs once at startup, never
 * blocks, and only logs to stderr. Surfaces the silent stale-install problem: a
 * global `npm i -g @robosystems/mcp` can shadow `npx -y` and pin an old version
 * without any error, so a published update never reaches the user.
 */
async function checkForUpdate() {
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 2500)
    const response = await fetch('https://registry.npmjs.org/@robosystems/mcp/latest', {
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!response.ok) return
    const data = await response.json()
    const latest = data?.version
    if (latest && _isNewerVersion(latest, PACKAGE_VERSION)) {
      console.error(
        `⚠️  @robosystems/mcp ${latest} is available — you are running ${PACKAGE_VERSION}.`
      )
      console.error('   A global install can shadow `npx -y` and pin an old version. Update with:')
      console.error('     npm i -g @robosystems/mcp@latest')
      console.error('   or pin "@robosystems/mcp@latest" in your MCP config args.')
    }
  } catch {
    // Best-effort only — never block or fail startup on the update check.
  }
}

/**
 * The endpoint to forward to: an explicit ROBOSYSTEMS_MCP_URL wins (a local
 * stack, or the graph-agnostic OAuth endpoint); otherwise the per-graph URL
 * is derived from ROBOSYSTEMS_GRAPH_ID. Returns null when neither is set.
 */
export function resolveEndpoint({ baseUrl, graphId, mcpUrl }) {
  if (mcpUrl) return mcpUrl
  if (!graphId) return null
  return `${(baseUrl || 'https://api.robosystems.ai').replace(/\/$/, '')}/v1/graphs/${graphId}/mcp`
}

/**
 * The every-graph endpoint, with the connection's settings as its query:
 * `graphs` (ids or alias=id pairs, `:ro` for read-only) and `read_only`.
 * The server validates them; they are settings, never credentials.
 */
export function resolveGraphsEndpoint({ baseUrl, graphIds, readOnly }) {
  const url = new URL(
    `${(baseUrl || 'https://api.robosystems.ai').replace(/\/$/, '')}/v1/mcp/graphs`
  )
  if (graphIds && graphIds.trim()) url.searchParams.set('graphs', graphIds.trim())
  if (readOnly) url.searchParams.set('read_only', 'true')
  return url.toString()
}

/** A graph-scoped key by shape: `rfsc` and 64 hex characters. */
export function isGraphScopedKey(apiKey) {
  return /^rfsc[0-9a-f]{64}$/.test(String(apiKey ?? ''))
}

const PROBE_TIMEOUT_MS = 5000

/**
 * Ask the every-graph endpoint for a `ping` before serving, so a setup that
 * can never work fails once with a reason instead of on every call. Returns
 * the reason to stop, or null to go on; an unreachable server is not one,
 * since it may be back by the first real request.
 */
export async function probeGraphsEndpoint({ url, apiKey, version, fetchImpl = fetch }) {
  let response
  try {
    response = await fetchImpl(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        'User-Agent': `robosystems-mcp/${version}`,
        'X-MCP-Client': version,
        'X-API-Key': apiKey,
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: 'probe', method: 'ping' }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
  } catch {
    return null
  }
  if (response.status === 404) {
    return (
      'This RoboSystems server does not serve /v1/mcp/graphs. Upgrade the server, set ' +
      'ROBOSYSTEMS_GRAPH_ID to connect one graph, or run the last bridge with the catalog ' +
      'built in: @robosystems/mcp@1.0'
    )
  }
  if (response.status === 400 || response.status === 401) {
    let detail = ''
    try {
      const body = await response.json()
      detail = typeof body?.detail === 'string' ? body.detail : ''
    } catch {
      // No readable reason: the status says enough.
    }
    return response.status === 400
      ? `ROBOSYSTEMS_GRAPH_IDS or ROBOSYSTEMS_READ_ONLY was refused: ${detail || 'HTTP 400'}`
      : `ROBOSYSTEMS_API_KEY was refused: ${detail || 'HTTP 401'}`
  }
  return null
}

/** A flag is on for `true`, `1` or `yes`, in any case. */
export function isEnabled(value) {
  return ['true', '1', 'yes'].includes(
    String(value ?? '')
      .trim()
      .toLowerCase()
  )
}

async function main() {
  const apiKey = process.env.ROBOSYSTEMS_API_KEY
  const url = resolveEndpoint({
    baseUrl: process.env.ROBOSYSTEMS_API_URL,
    graphId: process.env.ROBOSYSTEMS_GRAPH_ID,
    mcpUrl: process.env.ROBOSYSTEMS_MCP_URL,
  })

  if (url) {
    if (process.env.ROBOSYSTEMS_GRAPH_IDS || process.env.ROBOSYSTEMS_READ_ONLY) {
      console.error(
        'ROBOSYSTEMS_GRAPH_IDS and ROBOSYSTEMS_READ_ONLY are ignored: ROBOSYSTEMS_GRAPH_ID or ' +
          'ROBOSYSTEMS_MCP_URL connects one endpoint as it is'
      )
    }
    void checkForUpdate() // fire-and-forget stale-version warning (stderr only)
    await runProxy({ url, apiKey, version: PACKAGE_VERSION })
    return
  }

  if (!apiKey) {
    console.error('ROBOSYSTEMS_API_KEY is required')
    console.error(
      'Set it alone to reach every graph the key covers, or with ROBOSYSTEMS_GRAPH_ID ' +
        'to connect one graph'
    )
    process.exit(1)
  }
  if (isGraphScopedKey(apiKey)) {
    console.error(
      'This API key is scoped to one graph. Set ROBOSYSTEMS_GRAPH_ID to that graph to ' +
        'connect it; reaching every graph takes an account-wide key'
    )
    process.exit(1)
  }

  const graphIds = process.env.ROBOSYSTEMS_GRAPH_IDS
  const readOnly = isEnabled(process.env.ROBOSYSTEMS_READ_ONLY)
  const graphsUrl = resolveGraphsEndpoint({
    baseUrl: process.env.ROBOSYSTEMS_API_URL,
    graphIds,
    readOnly,
  })
  const refusal = await probeGraphsEndpoint({
    url: graphsUrl,
    apiKey,
    version: PACKAGE_VERSION,
  })
  if (refusal) {
    console.error(refusal)
    process.exit(1)
  }

  void checkForUpdate()
  console.error(
    graphIds && graphIds.trim()
      ? `Graphs: ${graphIds.trim()} (and their subgraphs)`
      : 'Graphs: every graph the API key reaches'
  )
  if (readOnly) console.error('Read-only: write tools are withheld')
  await runProxy({ url: graphsUrl, apiKey, version: PACKAGE_VERSION })
}

// Only run as the bridge if this is the main module (works for `node index.js`
// and the npx binary names); never under the test runner.
const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/mcp') ||
  process.argv[1]?.endsWith('/@robosystems/mcp') ||
  process.argv[1]?.includes('robosystems-mcp')
const isTestMode = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'

if (isMainModule && !isTestMode) {
  main().catch((error) => {
    console.error(`Fatal error: ${error.message}`)
    process.exit(1)
  })
}
