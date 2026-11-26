#!/usr/bin/env node

/**
 * RoboSystems MCP stdio bridge.
 *
 * Two modes, chosen by the environment:
 *
 * - Proxy (ROBOSYSTEMS_GRAPH_ID or ROBOSYSTEMS_MCP_URL set): a transparent
 *   pipe between a stdio MCP client and one graph's MCP endpoint (Streamable
 *   HTTP). Every JSON-RPC message is forwarded verbatim with the API-key
 *   header attached; the bridge adds nothing of its own.
 * - Catalog (neither set): one connection for every graph the API key
 *   reaches. Four fixed tools take the graph as an argument and forward to
 *   that graph's endpoint, so a subgraph is usable the moment it exists.
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { runProxy } from './proxy.js'
import { parseGraphSet, runCatalog } from './catalog.js'

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

async function main() {
  const apiKey = process.env.ROBOSYSTEMS_API_KEY
  const url = resolveEndpoint({
    baseUrl: process.env.ROBOSYSTEMS_API_URL,
    graphId: process.env.ROBOSYSTEMS_GRAPH_ID,
    mcpUrl: process.env.ROBOSYSTEMS_MCP_URL,
  })

  if (url) {
    if (process.env.ROBOSYSTEMS_GRAPH_IDS) {
      console.error(
        'ROBOSYSTEMS_GRAPH_IDS is ignored: ROBOSYSTEMS_GRAPH_ID or ROBOSYSTEMS_MCP_URL ' +
          'selects the single-graph proxy'
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

  const graphSet = parseGraphSet(process.env.ROBOSYSTEMS_GRAPH_IDS)
  void checkForUpdate()
  await runCatalog({
    baseUrl: process.env.ROBOSYSTEMS_API_URL,
    apiKey,
    version: PACKAGE_VERSION,
    graphSet,
  })
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
