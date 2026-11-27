/**
 * Tests for the entry point. The proxy itself is covered in proxy.test.js;
 * this pins the decisions the entry makes.
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect, vi } from 'vitest'
import {
  _isNewerVersion,
  isEnabled,
  isGraphScopedKey,
  probeGraphsEndpoint,
  resolveEndpoint,
  resolveGraphsEndpoint,
} from './index.js'

describe('_isNewerVersion', () => {
  it('compares the three core components numerically', () => {
    expect(_isNewerVersion('0.5.0', '0.4.2')).toBe(true)
    expect(_isNewerVersion('0.4.10', '0.4.2')).toBe(true)
    expect(_isNewerVersion('0.4.2', '0.4.2')).toBe(false)
    expect(_isNewerVersion('0.3.9', '0.4.2')).toBe(false)
  })

  it('ignores pre-release tags', () => {
    expect(_isNewerVersion('0.5.0-beta.1', '0.4.2')).toBe(true)
  })
})

describe('resolveEndpoint', () => {
  it('derives the per-graph transport URL from the graph id', () => {
    expect(resolveEndpoint({ graphId: 'sec' })).toBe('https://api.robosystems.ai/v1/graphs/sec/mcp')
  })

  it('respects a custom API base without doubling slashes', () => {
    expect(resolveEndpoint({ baseUrl: 'http://localhost:8000/', graphId: 'kg1a2b3c' })).toBe(
      'http://localhost:8000/v1/graphs/kg1a2b3c/mcp'
    )
  })

  it('lets an explicit MCP URL win, including the graph-agnostic endpoint', () => {
    expect(resolveEndpoint({ graphId: 'sec', mcpUrl: 'https://api.robosystems.ai/v1/mcp' })).toBe(
      'https://api.robosystems.ai/v1/mcp'
    )
  })

  it('returns null when nothing identifies an endpoint', () => {
    expect(resolveEndpoint({})).toBeNull()
  })
})

describe('resolveGraphsEndpoint', () => {
  it('is the every-graph route on the hosted API by default', () => {
    expect(resolveGraphsEndpoint({})).toBe('https://api.robosystems.ai/v1/mcp/graphs')
  })

  it('carries the graph set and the read-only flag as the query', () => {
    const url = new URL(
      resolveGraphsEndpoint({
        baseUrl: 'http://localhost:8000/',
        graphIds: ' books=kg1a2b3c4d5e6f7a8b9c0d,sec:ro ',
        readOnly: true,
      })
    )
    expect(url.origin + url.pathname).toBe('http://localhost:8000/v1/mcp/graphs')
    expect(url.searchParams.get('graphs')).toBe('books=kg1a2b3c4d5e6f7a8b9c0d,sec:ro')
    expect(url.searchParams.get('read_only')).toBe('true')
  })

  it('adds no query for an empty graph set', () => {
    expect(resolveGraphsEndpoint({ graphIds: '  ', readOnly: false })).toBe(
      'https://api.robosystems.ai/v1/mcp/graphs'
    )
  })
})

describe('isGraphScopedKey', () => {
  it('goes by the whole shape, since an account-wide key can begin rfsc', () => {
    expect(isGraphScopedKey('rfsc' + 'a'.repeat(64))).toBe(true)
    expect(isGraphScopedKey('rfs' + 'c' + 'a'.repeat(63))).toBe(false)
    expect(isGraphScopedKey(undefined)).toBe(false)
  })
})

describe('probeGraphsEndpoint', () => {
  const probe = (response) =>
    probeGraphsEndpoint({
      url: 'https://api.example.com/v1/mcp/graphs',
      apiKey: 'k',
      version: '0.0.0',
      fetchImpl:
        response instanceof Error
          ? vi.fn().mockRejectedValue(response)
          : vi.fn().mockResolvedValue(response),
    })
  const answer = (status, body) => ({ status, json: async () => body })

  it('goes on when the endpoint answers', async () => {
    expect(await probe(answer(200, { jsonrpc: '2.0', id: 'probe', result: {} }))).toBeNull()
  })

  it('goes on when the server cannot be reached or is rate limited', async () => {
    expect(await probe(new Error('offline'))).toBeNull()
    expect(await probe(answer(429, {}))).toBeNull()
    expect(await probe(answer(503, {}))).toBeNull()
  })

  it('stops on a server that predates the route, and says what to do', async () => {
    const reason = await probe(answer(404, { detail: 'Not Found' }))
    expect(reason).toContain('/v1/mcp/graphs')
    expect(reason).toContain('ROBOSYSTEMS_GRAPH_ID')
  })

  it('stops on refused settings with the server’s reason', async () => {
    const reason = await probe(answer(400, { detail: 'graphs: "x" is not a graph id' }))
    expect(reason).toContain('ROBOSYSTEMS_GRAPH_IDS')
    expect(reason).toContain('"x" is not a graph id')
  })

  it('stops on a refused key', async () => {
    expect(await probe(answer(401, { detail: 'Invalid API key' }))).toContain(
      'ROBOSYSTEMS_API_KEY was refused: Invalid API key'
    )
  })

  it('sends the key in the header and never in the URL', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(answer(200, {}))
    await probeGraphsEndpoint({
      url: 'https://api.example.com/v1/mcp/graphs',
      apiKey: 'secret-key',
      version: '0.0.0',
      fetchImpl,
    })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).not.toContain('secret-key')
    expect(init.headers['X-API-Key']).toBe('secret-key')
  })
})

describe('isEnabled', () => {
  it('is on only for an explicit yes', () => {
    for (const value of ['true', 'TRUE', ' 1 ', 'yes']) expect(isEnabled(value)).toBe(true)
    for (const value of [undefined, '', '0', 'false', 'no', 'on']) {
      expect(isEnabled(value)).toBe(false)
    }
  })
})

describe('the MCP Registry listing', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const text = (name) => readFileSync(join(here, name), 'utf8')
  const pkg = JSON.parse(text('package.json'))
  const listing = JSON.parse(text('server.json'))

  it('pins the version the package releases', () => {
    expect(listing.version).toBe(pkg.version)
    expect(listing.packages.map((p) => p.version)).toEqual([pkg.version])
  })

  it('names the package the registry checks ownership against', () => {
    expect(listing.packages[0].identifier).toBe(pkg.name)
    expect(pkg.mcpName).toBe(listing.name)
    expect(listing.description.length).toBeLessThanOrEqual(100)
  })

  it('declares only settings the bridge reads', () => {
    const source = text('index.js')
    for (const variable of listing.packages[0].environmentVariables) {
      expect(source).toContain(`process.env.${variable.name}`)
    }
    const key = listing.packages[0].environmentVariables.find(
      (v) => v.name === 'ROBOSYSTEMS_API_KEY'
    )
    expect(key).toMatchObject({ isRequired: true, isSecret: true })
  })
})
