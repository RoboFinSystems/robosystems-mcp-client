/**
 * Tests for the proxy entry point. The proxy itself is covered in
 * proxy.test.js; this pins the two decisions the entry makes.
 */

import { describe, it, expect } from 'vitest'
import { _isNewerVersion, resolveEndpoint } from './index.js'

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
