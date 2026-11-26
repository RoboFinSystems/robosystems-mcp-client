/**
 * Tests for the proxy entry point. The proxy itself is covered in
 * proxy.test.js; this pins the two decisions the entry makes.
 */

import { readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { describe, it, expect } from 'vitest'
import { _isNewerVersion, isEnabled, resolveEndpoint } from './index.js'

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
