/**
 * Tests for RoboSystems MCP Client
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'

// Mock environment variables before importing index.js
process.env.ROBOSYSTEMS_API_KEY = 'test-api-key'
process.env.ROBOSYSTEMS_GRAPH_ID = 'test-graph-id'

// Mock EventSource before importing index.js
vi.mock('eventsource', () => {
  const MockEventSource = class {
    constructor() {
      this.close = vi.fn()
      this.addEventListener = vi.fn()
      this.onmessage = vi.fn()
    }
  }
  return {
    EventSource: MockEventSource,
  }
})

// Import after mocking
import { RoboSystemsMCPClient, SSEConnectionPool, ResultCache } from './index.js'

describe('SSEConnectionPool', () => {
  let pool

  beforeEach(() => {
    pool = new SSEConnectionPool(3)
  })

  afterEach(() => {
    pool.closeAll()
  })

  it('should create a new connection when none exists', () => {
    const eventSource = pool.getConnection('test-1', 'http://example.com', {})
    expect(eventSource).toBeDefined()
    expect(pool.connections.size).toBe(1)
  })

  it('should reuse an existing connection', () => {
    const eventSource1 = pool.getConnection('test-1', 'http://example.com', {})
    const eventSource2 = pool.getConnection('test-1', 'http://example.com', {})
    expect(eventSource1).toBe(eventSource2)
    expect(pool.connections.size).toBe(1)
  })

  it('should evict oldest connection when at max capacity', async () => {
    // Create connections with small delays to ensure different lastUsed times
    pool.getConnection('test-1', 'http://example.com', {})
    await new Promise((resolve) => setTimeout(resolve, 10))
    pool.getConnection('test-2', 'http://example.com', {})
    await new Promise((resolve) => setTimeout(resolve, 10))
    pool.getConnection('test-3', 'http://example.com', {})
    expect(pool.connections.size).toBe(3)

    // Small delay before adding 4th connection
    await new Promise((resolve) => setTimeout(resolve, 10))

    // Should evict oldest when adding a 4th connection
    pool.getConnection('test-4', 'http://example.com', {})
    expect(pool.connections.size).toBe(3)
    expect(pool.connections.has('test-1')).toBe(false)
  })

  it('should close a specific connection', () => {
    pool.getConnection('test-1', 'http://example.com', {})
    expect(pool.connections.size).toBe(1)
    pool.closeConnection('test-1')
    expect(pool.connections.size).toBe(0)
  })

  it('should close all connections', () => {
    pool.getConnection('test-1', 'http://example.com', {})
    pool.getConnection('test-2', 'http://example.com', {})
    expect(pool.connections.size).toBe(2)
    pool.closeAll()
    expect(pool.connections.size).toBe(0)
  })
})

describe('ResultCache', () => {
  let cache

  beforeEach(() => {
    cache = new ResultCache()
  })

  afterEach(() => {
    cache.clear()
  })

  it('should generate consistent cache keys for the same inputs', () => {
    const key1 = cache.generateKey('tool-1', { arg1: 'value1', arg2: 'value2' })
    const key2 = cache.generateKey('tool-1', { arg2: 'value2', arg1: 'value1' })
    expect(key1).toBe(key2)
  })

  it('should generate different cache keys for different inputs', () => {
    const key1 = cache.generateKey('tool-1', { arg1: 'value1' })
    const key2 = cache.generateKey('tool-1', { arg1: 'value2' })
    expect(key1).not.toBe(key2)
  })

  it('should generate different cache keys for different workspaces', () => {
    const key1 = cache.generateKey('tool-1', { arg1: 'value1' }, 'workspace-1')
    const key2 = cache.generateKey('tool-1', { arg1: 'value1' }, 'workspace-2')
    const key3 = cache.generateKey('tool-1', { arg1: 'value1' })
    expect(key1).not.toBe(key2)
    expect(key1).not.toBe(key3)
    expect(key2).not.toBe(key3)
  })

  it('should isolate cache entries by workspace', () => {
    const result1 = { type: 'text', text: 'workspace 1 result' }
    const result2 = { type: 'text', text: 'workspace 2 result' }

    cache.set('tool-1', { arg1: 'value1' }, result1, 10, 'workspace-1')
    cache.set('tool-1', { arg1: 'value1' }, result2, 10, 'workspace-2')

    const retrieved1 = cache.get('tool-1', { arg1: 'value1' }, 'workspace-1')
    const retrieved2 = cache.get('tool-1', { arg1: 'value1' }, 'workspace-2')

    expect(retrieved1).toEqual(result1)
    expect(retrieved2).toEqual(result2)
    expect(retrieved1).not.toEqual(retrieved2)
  })

  it('should store and retrieve cached results', () => {
    const result = { type: 'text', text: 'test result' }
    cache.set('tool-1', { arg1: 'value1' }, result, 10)
    const retrieved = cache.get('tool-1', { arg1: 'value1' })
    expect(retrieved).toEqual(result)
  })

  it('should return null for non-existent cache entries', () => {
    const retrieved = cache.get('tool-1', { arg1: 'value1' })
    expect(retrieved).toBeNull()
  })

  it('should expire cached results after TTL', async () => {
    const result = { type: 'text', text: 'test result' }
    cache.set('tool-1', { arg1: 'value1' }, result, 0.05) // 50ms TTL

    // Should be cached initially
    let retrieved = cache.get('tool-1', { arg1: 'value1' })
    expect(retrieved).toEqual(result)

    // Wait for expiration
    await new Promise((resolve) => setTimeout(resolve, 100))

    // Should be expired now
    retrieved = cache.get('tool-1', { arg1: 'value1' })
    expect(retrieved).toBeNull()
  })

  it('should handle nested objects in cache keys', () => {
    const args1 = { level1: { level2: { value: 'test' } } }
    const args2 = { level1: { level2: { value: 'test' } } }
    const key1 = cache.generateKey('tool-1', args1)
    const key2 = cache.generateKey('tool-1', args2)
    expect(key1).toBe(key2)
  })

  it('should handle arrays in cache keys', () => {
    const args1 = { items: [1, 2, 3] }
    const args2 = { items: [1, 2, 3] }
    const key1 = cache.generateKey('tool-1', args1)
    const key2 = cache.generateKey('tool-1', args2)
    expect(key1).toBe(key2)
  })

  it('should clear all cached results', () => {
    cache.set('tool-1', { arg1: 'value1' }, { type: 'text', text: 'result1' }, 10)
    cache.set('tool-2', { arg1: 'value1' }, { type: 'text', text: 'result2' }, 10)
    expect(cache.cache.size).toBe(2)
    cache.clear()
    expect(cache.cache.size).toBe(0)
  })
})

describe('RoboSystemsMCPClient', () => {
  let client
  let fetchMock

  beforeEach(() => {
    fetchMock = vi.fn()
    global.fetch = fetchMock
    client = new RoboSystemsMCPClient('https://api.example.com', 'test-api-key', 'test-graph-id')
  })

  afterEach(() => {
    client.cleanup()
    vi.clearAllMocks()
  })

  describe('constructor', () => {
    it('should initialize with correct base URL', () => {
      expect(client.baseUrl).toBe('https://api.example.com')
    })

    it('should remove trailing slash from base URL', () => {
      const clientWithSlash = new RoboSystemsMCPClient(
        'https://api.example.com/',
        'test-api-key',
        'test-graph-id'
      )
      expect(clientWithSlash.baseUrl).toBe('https://api.example.com')
    })

    it('should initialize with correct API key', () => {
      expect(client.apiKey).toBe('test-api-key')
    })

    it('should initialize with correct graph IDs', () => {
      expect(client.primaryGraphId).toBe('test-graph-id')
      expect(client.activeGraphId).toBe('test-graph-id')
      expect(client.graphId).toBe('test-graph-id')
    })

    it('should set up proper headers', () => {
      expect(client.headers['X-API-Key']).toBe('test-api-key')
      expect(client.headers['Content-Type']).toBe('application/json')
      expect(client.headers['User-Agent']).toContain('robosystems-mcp/')
    })

    it('should initialize components', () => {
      expect(client.connectionPool).toBeInstanceOf(SSEConnectionPool)
      expect(client.resultCache).toBeInstanceOf(ResultCache)
    })

    it('should initialize primary workspace', () => {
      expect(client.workspaces.size).toBe(1)
      expect(client.workspaces.has('test-graph-id')).toBe(true)
      const primaryWorkspace = client.workspaces.get('test-graph-id')
      expect(primaryWorkspace.type).toBe('primary')
      expect(primaryWorkspace.name).toBe('main')
    })

    it('should initialize metrics', () => {
      expect(client.metrics.totalRequests).toBe(0)
      expect(client.metrics.cacheHits).toBe(0)
      expect(client.metrics.errors).toBe(0)
      expect(client.metrics.workspaceSwitches).toBe(0)
    })
  })

  describe('getTools', () => {
    it('should fetch tools from API successfully', async () => {
      const mockTools = [
        {
          name: 'test-tool',
          description: 'A test tool',
          inputSchema: { type: 'object' },
        },
      ]

      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: mockTools }),
      })

      const tools = await client.getTools()
      expect(tools).toHaveLength(mockTools.length + 4) // +4 for workspace tools
      expect(tools[0].name).toBe('test-tool')
    })

    it('should add workspace tools when not provided by server', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [] }),
      })

      const tools = await client.getTools()
      const workspaceToolNames = tools.map((t) => t.name)
      expect(workspaceToolNames).toContain('create-workspace')
      expect(workspaceToolNames).toContain('switch-workspace')
      expect(workspaceToolNames).toContain('delete-workspace')
      expect(workspaceToolNames).toContain('list-workspaces')
    })

    it('should handle API errors gracefully', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Error details',
      })

      const tools = await client.getTools()
      expect(tools).toEqual([])
    })

    it('should handle network errors gracefully', async () => {
      fetchMock.mockRejectedValueOnce(new Error('Network error'))

      const tools = await client.getTools()
      expect(tools).toEqual([])
    })

    it('should capture per-graph instructions from the response', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [], instructions: 'ROUTING GUIDANCE' }),
      })

      await client.getTools()
      expect(client.instructions).toBe('ROUTING GUIDANCE')
    })

    it('should null out instructions when the response omits them', async () => {
      client.instructions = 'stale'
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [] }),
      })

      await client.getTools()
      expect(client.instructions).toBeNull()
    })
  })

  describe('callTool - caching', () => {
    it('should cache results for cacheable tools', async () => {
      const mockResult = { result: { type: 'text', text: 'test result' } }

      fetchMock.mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResult,
      })

      // First call - should hit API
      await client.callTool('get-graph-schema', { arg1: 'value1' })
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Second call - should use cache
      await client.callTool('get-graph-schema', { arg1: 'value1' })
      expect(fetchMock).toHaveBeenCalledTimes(1) // Still 1, not 2
      expect(client.metrics.cacheHits).toBe(1)
    })

    it('should not cache results for non-cacheable tools', async () => {
      const mockResult = { result: { type: 'text', text: 'test result' } }

      fetchMock.mockResolvedValue({
        ok: true,
        headers: new Map([['content-type', 'application/json']]),
        json: async () => mockResult,
      })

      // First call
      await client.callTool('non-cacheable-tool', { arg1: 'value1' })
      expect(fetchMock).toHaveBeenCalledTimes(1)

      // Second call - should hit API again
      await client.callTool('non-cacheable-tool', { arg1: 'value1' })
      expect(fetchMock).toHaveBeenCalledTimes(2)
      expect(client.metrics.cacheHits).toBe(0)
    })
  })

  describe('isCacheable', () => {
    it('should identify cacheable tools', () => {
      expect(client.isCacheable('get-graph-schema')).toBe(true)
      expect(client.isCacheable('get-graph-info')).toBe(true)
      expect(client.isCacheable('describe-graph-structure')).toBe(true)
    })

    it('should identify non-cacheable tools', () => {
      expect(client.isCacheable('some-other-tool')).toBe(false)
    })
  })

  describe('getCacheTTL', () => {
    it('should return correct TTL for known tools', () => {
      expect(client.getCacheTTL('get-graph-schema')).toBe(3600)
      expect(client.getCacheTTL('get-graph-info')).toBe(300)
      expect(client.getCacheTTL('describe-graph-structure')).toBe(1800)
    })

    it('should return default TTL for unknown tools', () => {
      expect(client.getCacheTTL('unknown-tool')).toBe(300)
    })
  })

  describe('workspace management', () => {
    it('should switch workspace correctly', async () => {
      // Add a test workspace
      client.workspaces.set('test-workspace-1', {
        type: 'workspace',
        name: 'test',
        parent_graph_id: client.primaryGraphId,
      })

      const result = await client._handleSwitchWorkspace({
        workspace_id: 'test-workspace-1',
      })

      expect(client.activeGraphId).toBe('test-workspace-1')
      expect(client.metrics.workspaceSwitches).toBe(1)

      const parsedResult = JSON.parse(result.text)
      expect(parsedResult.success).toBe(true)
      expect(parsedResult.switched_to).toBe('test-workspace-1')
    })

    it('should switch to primary workspace using "primary" alias', async () => {
      // First switch to a different workspace
      client.workspaces.set('test-workspace-1', {
        type: 'workspace',
        name: 'test',
        parent_graph_id: client.primaryGraphId,
      })
      client.activeGraphId = 'test-workspace-1'

      // Now switch back to primary
      const result = await client._handleSwitchWorkspace({
        workspace_id: 'primary',
      })

      expect(client.activeGraphId).toBe(client.primaryGraphId)

      const parsedResult = JSON.parse(result.text)
      expect(parsedResult.success).toBe(true)
    })

    it('should handle switching to unknown workspace', async () => {
      const result = await client._handleSwitchWorkspace({
        workspace_id: 'unknown-workspace',
      })

      const parsedResult = JSON.parse(result.text)
      expect(parsedResult.error).toBe('Unknown workspace')
    })

    it('should handle switching to current workspace', async () => {
      const result = await client._handleSwitchWorkspace({
        workspace_id: client.primaryGraphId,
      })

      const parsedResult = JSON.parse(result.text)
      expect(parsedResult.success).toBe(true)
      expect(parsedResult.message).toContain('Already in workspace')
    })

    it('should surface the target graph instructions in the switch result', async () => {
      client.workspaces.set('test-workspace-1', {
        type: 'workspace',
        name: 'test',
        parent_graph_id: client.primaryGraphId,
      })

      // _handleSwitchWorkspace refreshes instructions via getTools()
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ tools: [], instructions: 'WORKSPACE GUIDANCE' }),
      })

      const result = await client._handleSwitchWorkspace({
        workspace_id: 'test-workspace-1',
      })

      const parsedResult = JSON.parse(result.text)
      expect(parsedResult.switched_to).toBe('test-workspace-1')
      expect(parsedResult.instructions).toBe('WORKSPACE GUIDANCE')
    })

    it('should refresh the roster via list-subgraphs when switching to an unknown workspace', async () => {
      // The regression: a subgraph created after handshake (via the server's
      // create-subgraph tool) is not in the local roster; the on-miss refresh
      // must speak the server's `list-subgraphs` protocol to find it.
      const listSubgraphsResult = {
        primary_graph_id: 'test-graph-id',
        total_subgraphs: 1,
        subgraphs: [
          {
            subgraph_id: 'test-graph-id',
            name: 'main',
            type: 'primary',
            parent_graph_id: null,
          },
          {
            subgraph_id: 'test-graph-id_sandbox',
            name: 'sandbox',
            type: 'subgraph',
            parent_graph_id: 'test-graph-id',
            created_at: '2026-07-24T03:11:04.089824',
          },
        ],
      }
      fetchMock
        .mockResolvedValueOnce({
          // the refresh call
          ok: true,
          json: async () => ({
            result: { type: 'text', text: JSON.stringify(listSubgraphsResult) },
          }),
        })
        .mockResolvedValueOnce({
          // getTools() for the switched-to graph's instructions
          ok: true,
          json: async () => ({ tools: [] }),
        })

      const result = await client._handleSwitchWorkspace({
        workspace_id: 'test-graph-id_sandbox',
      })

      const refreshCall = fetchMock.mock.calls[0]
      expect(JSON.parse(refreshCall[1].body).name).toBe('list-subgraphs')

      const parsedResult = JSON.parse(result.text)
      expect(parsedResult.success).toBe(true)
      expect(parsedResult.switched_to).toBe('test-graph-id_sandbox')
      expect(client.activeGraphId).toBe('test-graph-id_sandbox')
      // The refreshed roster keeps the primary recognizable.
      expect(client.workspaces.get('test-graph-id').type).toBe('primary')
      expect(client.workspaces.get('test-graph-id_sandbox').type).toBe('workspace')
    })

    it('should normalize list-subgraphs into the workspace shape for list-workspaces', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            type: 'text',
            text: JSON.stringify({
              primary_graph_id: 'test-graph-id',
              subgraphs: [
                {
                  subgraph_id: 'test-graph-id',
                  name: 'main',
                  type: 'primary',
                  parent_graph_id: null,
                },
                {
                  subgraph_id: 'test-graph-id_scratch',
                  name: 'scratch',
                  type: 'subgraph',
                  parent_graph_id: 'test-graph-id',
                },
              ],
            }),
          },
        }),
      })

      const result = await client._handleListWorkspaces()
      const parsed = JSON.parse(result.text)
      expect(parsed.primary_graph_id).toBe('test-graph-id')
      expect(parsed.total_workspaces).toBe(2)
      expect(parsed.workspaces.map((ws) => ws.workspace_id)).toEqual([
        'test-graph-id',
        'test-graph-id_scratch',
      ])
      expect(parsed.workspaces[0].active).toBe(true)
    })

    it('should create a workspace via the server create-subgraph tool', async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            type: 'text',
            text: JSON.stringify({
              subgraph_id: 'test-graph-id_lab',
              name: 'lab',
              parent_graph_id: 'test-graph-id',
              subgraph_type: 'static',
            }),
          },
        }),
      })

      const result = await client._handleCreateWorkspace({ name: 'lab' })

      const createCall = fetchMock.mock.calls[0]
      expect(JSON.parse(createCall[1].body).name).toBe('create-subgraph')

      const parsed = JSON.parse(result.text)
      expect(parsed.success).toBe(true)
      expect(parsed.workspace_id).toBe('test-graph-id_lab')
      expect(client.activeGraphId).toBe('test-graph-id_lab')
    })

    it('should delete a workspace via the server delete-subgraph tool', async () => {
      client.workspaces.set('test-graph-id_lab', {
        type: 'workspace',
        name: 'lab',
        parent_graph_id: client.primaryGraphId,
      })
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          result: {
            type: 'text',
            text: JSON.stringify({ deleted: true, subgraph_id: 'test-graph-id_lab' }),
          },
        }),
      })

      const result = await client._handleDeleteWorkspace({
        workspace_id: 'test-graph-id_lab',
      })

      const deleteCall = fetchMock.mock.calls[0]
      const body = JSON.parse(deleteCall[1].body)
      expect(body.name).toBe('delete-subgraph')
      expect(body.arguments.subgraph_id).toBe('test-graph-id_lab')

      const parsed = JSON.parse(result.text)
      expect(parsed.success).toBe(true)
      expect(client.workspaces.has('test-graph-id_lab')).toBe(false)
    })
  })

  describe('aggregateStreamedResults', () => {
    it('should return error event if present', () => {
      const events = [
        { event: 'data', data: { value: 'test' } },
        { event: 'error', data: { error: 'Something went wrong' } },
      ]

      const result = client.aggregateStreamedResults(events)
      expect(result.type).toBe('text')
      expect(result.text).toContain('Error: Something went wrong')
    })

    it('should aggregate query chunks', () => {
      const events = [
        {
          event: 'query_chunk',
          data: { columns: ['col1', 'col2'], data: [[1, 2]] },
        },
        { event: 'query_chunk', data: { data: [[3, 4]] } },
      ]

      const result = client.aggregateStreamedResults(events)
      expect(result.type).toBe('text')

      const parsed = JSON.parse(result.text)
      expect(parsed.columns).toEqual(['col1', 'col2'])
      expect(parsed.data).toEqual([
        [1, 2],
        [3, 4],
      ])
      expect(parsed.row_count).toBe(2)
    })

    it('should handle operation_completed event', () => {
      const events = [
        {
          event: 'operation_completed',
          data: { result: { success: true, message: 'Done' } },
        },
      ]

      const result = client.aggregateStreamedResults(events)
      expect(result.type).toBe('text')

      const parsed = JSON.parse(result.text)
      expect(parsed.success).toBe(true)
    })

    it('should return all events as fallback', () => {
      const events = [
        { event: 'unknown', data: { value: 1 } },
        { event: 'unknown', data: { value: 2 } },
      ]

      const result = client.aggregateStreamedResults(events)
      expect(result.type).toBe('text')

      const parsed = JSON.parse(result.text)
      expect(parsed).toHaveLength(2)
    })
  })

  describe('getMetrics', () => {
    it('should return correct metrics', () => {
      client.metrics.totalRequests = 100
      client.metrics.cacheHits = 25
      client.metrics.errors = 5

      const metrics = client.getMetrics()
      expect(metrics.totalRequests).toBe(100)
      expect(metrics.cacheHits).toBe(25)
      expect(metrics.cacheHitRate).toBe('25.0%')
      expect(metrics.errors).toBe(5)
      expect(metrics.activeWorkspace).toBe('test-graph-id')
      expect(metrics.totalWorkspaces).toBe(1)
    })

    it('should handle zero requests', () => {
      const metrics = client.getMetrics()
      expect(metrics.cacheHitRate).toBe('0%')
    })
  })

  describe('cleanup', () => {
    it('should close all connections and clear cache', () => {
      const closeAllSpy = vi.spyOn(client.connectionPool, 'closeAll')
      const clearCacheSpy = vi.spyOn(client.resultCache, 'clear')

      client.cleanup()

      expect(closeAllSpy).toHaveBeenCalled()
      expect(clearCacheSpy).toHaveBeenCalled()
    })
  })

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue({ success: true })
      const result = await client.executeWithRetry(fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(result.success).toBe(true)
    })

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('500 error'))
        .mockResolvedValueOnce({ success: true })

      const result = await client.executeWithRetry(fn)

      expect(fn).toHaveBeenCalledTimes(2)
      expect(result.success).toBe(true)
    })

    it('should not retry on auth errors', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('401 Unauthorized'))

      const result = await client.executeWithRetry(fn)

      expect(fn).toHaveBeenCalledTimes(1)
      expect(result.type).toBe('text')
      expect(result.text).toContain('401 Unauthorized')
    })

    it('should return error after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('500 error'))

      const result = await client.executeWithRetry(fn)

      expect(fn).toHaveBeenCalledTimes(3) // maxRetries = 3
      expect(result.type).toBe('text')
      expect(result.text).toContain('Error after 3 attempts')
    })
  })
})
