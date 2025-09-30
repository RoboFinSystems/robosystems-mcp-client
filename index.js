#!/usr/bin/env node

/**
 * RoboSystems MCP Client
 *
 * This client connects to the RoboSystems HTTP API and exposes it as MCP tools.
 * It handles multiple response formats (JSON, SSE, NDJSON) and provides a
 * unified interface to AI agents like Claude Desktop.
 * 
 * Features:
 * - SSE connection pooling for performance
 * - Smart caching for frequently accessed data
 * - Retry logic for network resilience
 * - Progress tracking for long operations
 * - Clean resource management
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { EventSource } from 'eventsource'
import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { createHash } from 'crypto'

// Get package version dynamically
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'))
const PACKAGE_VERSION = packageJson.version

/**
 * Simple SSE Connection Pool
 * Reuses connections for better performance
 */
class SSEConnectionPool {
  constructor(maxConnections = 5) {
    this.connections = new Map()
    this.maxConnections = maxConnections
    this.connectionTTL = 30000 // 30 seconds
  }

  getConnection(operationId, url, headers) {
    // Check for existing connection
    if (this.connections.has(operationId)) {
      const conn = this.connections.get(operationId)
      conn.lastUsed = Date.now()
      return conn.eventSource
    }

    // Clean up old connections if at limit
    if (this.connections.size >= this.maxConnections) {
      this.evictOldest()
    }

    // Create new connection
    const eventSource = new EventSource(url, { headers })
    this.connections.set(operationId, {
      eventSource,
      createdAt: Date.now(),
      lastUsed: Date.now(),
    })

    // Auto-cleanup after TTL
    setTimeout(() => {
      this.closeConnection(operationId)
    }, this.connectionTTL)
    
    return eventSource
  }

  evictOldest() {
    let oldest = null
    let oldestTime = Date.now()

    for (const [id, conn] of this.connections) {
      if (conn.lastUsed < oldestTime) {
        oldest = id
        oldestTime = conn.lastUsed
      }
    }

    if (oldest) {
      this.closeConnection(oldest)
    }
  }

  closeConnection(operationId) {
    const conn = this.connections.get(operationId)
    if (conn) {
      conn.eventSource.close()
      this.connections.delete(operationId)
    }
  }

  closeAll() {
    for (const [id] of this.connections) {
      this.closeConnection(id)
    }
  }
}

/**
 * Simple Result Cache
 * Caches frequently accessed data like schemas
 */
class ResultCache {
  constructor() {
    this.cache = new Map()
    this.cacheExpiry = new Map()
  }

  generateKey(tool, args) {
    // Sort object keys to ensure deterministic cache keys
    const sortedArgs = this._sortObjectKeys(args)
    const data = JSON.stringify({ tool, args: sortedArgs }, null, 0)
    return createHash('sha256').update(data).digest('hex')
  }

  _sortObjectKeys(obj) {
    if (obj === null || typeof obj !== 'object') {
      return obj
    }
    if (Array.isArray(obj)) {
      return obj.map(item => this._sortObjectKeys(item))
    }
    const sortedObj = {}
    Object.keys(obj).sort().forEach(key => {
      sortedObj[key] = this._sortObjectKeys(obj[key])
    })
    return sortedObj
  }

  get(tool, args) {
    const key = this.generateKey(tool, args)
    
    if (this.cache.has(key)) {
      const expiry = this.cacheExpiry.get(key)
      if (expiry > Date.now()) {
        return this.cache.get(key)
      } else {
        // Expired - remove from cache
        this.cache.delete(key)
        this.cacheExpiry.delete(key)
      }
    }
    
    return null
  }

  set(tool, args, result, ttlSeconds = 300) {
    const key = this.generateKey(tool, args)
    this.cache.set(key, result)
    this.cacheExpiry.set(key, Date.now() + (ttlSeconds * 1000))
  }

  clear() {
    this.cache.clear()
    this.cacheExpiry.clear()
  }
}

/**
 * RoboSystems MCP Client
 * Handles communication with the RoboSystems API
 */
class RoboSystemsMCPClient {
  constructor(baseUrl, apiKey, graphId) {
    this.baseUrl = baseUrl.replace(/\/$/, '') // Remove trailing slash
    this.apiKey = apiKey
    this.graphId = graphId
    this.headers = {
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
      'User-Agent': `robosystems-mcp/${PACKAGE_VERSION}`,
      'X-MCP-Client': PACKAGE_VERSION,
    }
    
    // Initialize components
    this.connectionPool = new SSEConnectionPool()
    this.resultCache = new ResultCache()
    this.maxRetries = 3
    this.baseRetryDelay = 1000
    
    // Simple metrics
    this.metrics = {
      totalRequests: 0,
      cacheHits: 0,
      errors: 0,
    }
  }

  async getTools() {
    try {
      console.error(`Fetching tools from ${this.baseUrl}/v1/graphs/${this.graphId}/mcp/tools`)
      const response = await fetch(
        `${this.baseUrl}/v1/graphs/${this.graphId}/mcp/tools`,
        {
          headers: this.headers,
        }
      )

      if (!response.ok) {
        const text = await response.text()
        console.error(`API returned ${response.status}: ${text}`)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data = await response.json()
      console.error(`Got ${data.tools?.length || 0} tools from API`)
      return data.tools || []
    } catch (error) {
      console.error(`Failed to get tools: ${error.message}`)
      console.error(`Stack: ${error.stack}`)
      return []
    }
  }

  async callTool(name, args = {}) {
    this.metrics.totalRequests++
    
    // Check cache first for cacheable tools
    if (this.isCacheable(name)) {
      const cached = this.resultCache.get(name, args)
      if (cached) {
        this.metrics.cacheHits++
        return cached
      }
    }
    
    // Execute with simple retry logic
    return this.executeWithRetry(() => this._callToolInternal(name, args))
  }

  async _callToolInternal(name, args) {
    try {
      const headers = {
        ...this.headers,
        'Accept': 'text/event-stream, application/x-ndjson, application/json',
      }

      const response = await fetch(
        `${this.baseUrl}/v1/graphs/${this.graphId}/mcp/call-tool`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ name, arguments: args }),
        }
      )

      const contentType = response.headers.get('content-type') || ''

      let result
      if (contentType.includes('text/event-stream')) {
        result = await this.handleSSEResponse(response, name)
      } else if (contentType.includes('application/x-ndjson')) {
        result = await this.handleNDJSONResponse(response, name)
      } else if (response.status === 202) {
        result = await this.handleQueuedResponse(response, name)
      } else {
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const data = await response.json()
        // The API returns { result: { type: 'text', text: JSON.stringify(actualData) } }
        if (data.result && data.result.type === 'text' && data.result.text) {
          // Parse the text field if it contains JSON data
          try {
            const parsedText = JSON.parse(data.result.text)
            result = { type: 'text', text: JSON.stringify(parsedText, null, 2) }
          } catch (e) {
            // If it's not JSON, just use it as-is
            result = data.result
          }
        } else {
          result = data.result || { type: 'text', text: 'No result' }
        }
      }
      
      // Cache the result if appropriate
      if (this.isCacheable(name)) {
        const ttl = this.getCacheTTL(name)
        this.resultCache.set(name, args, result, ttl)
      }
      
      return result
    } catch (error) {
      this.metrics.errors++
      console.error(`Failed to call tool ${name}: ${error.message}`)
      throw error
    }
  }

  async executeWithRetry(fn) {
    let lastError = null
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        return await fn()
      } catch (error) {
        lastError = error
        
        // Don't retry on auth errors or client errors
        if (error.message.includes('401') || 
            error.message.includes('403') || 
            error.message.includes('400')) {
          break
        }
        
        if (attempt < this.maxRetries - 1) {
          const delay = this.baseRetryDelay * Math.pow(2, attempt)
          await new Promise(resolve => setTimeout(resolve, delay))
        }
      }
    }
    
    return { 
      type: 'text', 
      text: `Error after ${this.maxRetries} attempts: ${lastError?.message || 'Unknown error'}` 
    }
  }

  async handleSSEResponse(response, toolName) {
    return new Promise((resolve, reject) => {
      const events = []
      const operationId = response.headers.get('x-operation-id') || `sse-${Date.now()}`
      
      const eventSource = this.connectionPool.getConnection(
        operationId,
        response.url,
        this.headers
      )
      
      const timeout = setTimeout(() => {
        this.connectionPool.closeConnection(operationId)
        reject(new Error('SSE timeout after 5 minutes'))
      }, 300000)

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          events.push({ event: event.type || 'message', data })
        } catch (e) {
          console.error('Failed to parse SSE event:', e)
        }
      }

      eventSource.addEventListener('complete', () => {
        clearTimeout(timeout)
        const result = this.aggregateStreamedResults(events, toolName)
        resolve(result)
      })

      // Listen for the actual server event types
      eventSource.addEventListener('operation_completed', () => {
        clearTimeout(timeout)
        this.connectionPool.closeConnection(operationId)
        const result = this.aggregateStreamedResults(events, toolName)
        resolve(result)
      })

      eventSource.addEventListener('operation_error', (event) => {
        clearTimeout(timeout)
        this.connectionPool.closeConnection(operationId)
        try {
          const data = JSON.parse(event.data)
          reject(new Error(data.error || data.message || 'Operation failed'))
        } catch (e) {
          reject(new Error('Operation failed'))
        }
      })

      eventSource.addEventListener('error', () => {
        clearTimeout(timeout)
        this.connectionPool.closeConnection(operationId)
        
        if (events.length > 0) {
          const result = this.aggregateStreamedResults(events, toolName)
          resolve(result)
        } else {
          reject(new Error('SSE connection failed'))
        }
      })

      // Handle specific event types
      eventSource.addEventListener('query_chunk', (event) => {
        try {
          const data = JSON.parse(event.data)
          events.push({ event: 'query_chunk', data })
        } catch (e) {
          console.error('Failed to parse query chunk:', e)
        }
      })

      eventSource.addEventListener('progress', (event) => {
        try {
          const data = JSON.parse(event.data)
          console.error(`Progress: ${data.message || 'Processing...'}`)
        } catch (e) {
          // Ignore progress parsing errors
        }
      })

      // Also listen for operation_progress events
      eventSource.addEventListener('operation_progress', (event) => {
        try {
          const data = JSON.parse(event.data)
          const progress = data.percentage ? `${data.percentage}% - ` : ''
          console.error(`Progress: ${progress}${data.message || 'Processing...'}`)
        } catch (e) {
          // Ignore progress parsing errors
        }
      })
    })
  }

  async handleNDJSONResponse(response) {
    const events = []
    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.trim()) {
            try {
              const event = JSON.parse(line)
              events.push(event)
            } catch (e) {
              console.error('Failed to parse NDJSON line:', e)
            }
          }
        }
      }

      if (buffer.trim()) {
        try {
          const event = JSON.parse(buffer)
          events.push(event)
        } catch (e) {
          console.error('Failed to parse final NDJSON line:', e)
        }
      }

      return this.aggregateStreamedResults(events, 'ndjson')
    } catch (error) {
      console.error('NDJSON parsing error:', error)
      return { type: 'text', text: `Error parsing streaming response: ${error.message}` }
    }
  }

  async handleQueuedResponse(response) {
    const data = await response.json()

    if (data.queued && data.queue_id) {
      console.error(`Query queued with ID: ${data.queue_id}`)
      
      const statusUrl = data.status_url ||
        `${this.baseUrl}/v1/graphs/${this.graphId}/query/${data.queue_id}/status`
      const resultUrl = data.result_url ||
        `${this.baseUrl}/v1/graphs/${this.graphId}/query/${data.queue_id}/result`

      // Simple polling with exponential backoff
      let attempts = 0
      let delay = 1000
      const maxAttempts = 30

      while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delay))

        try {
          const statusResponse = await fetch(statusUrl, { headers: this.headers })

          if (statusResponse.ok) {
            const status = await statusResponse.json()
            
            if (status.status === 'completed') {
              const resultResponse = await fetch(resultUrl, { headers: this.headers })
              if (resultResponse.ok) {
                const result = await resultResponse.json()
                return { type: 'text', text: JSON.stringify(result, null, 2) }
              }
            } else if (status.status === 'failed') {
              return { type: 'text', text: `Query failed: ${status.error || 'Unknown error'}` }
            } else if (status.status === 'cancelled') {
              return { type: 'text', text: 'Query was cancelled' }
            }
          }
        } catch (e) {
          console.error('Polling error:', e)
        }

        attempts++
        delay = Math.min(delay * 1.5, 10000)
      }

      return { type: 'text', text: 'Query timed out waiting for result' }
    }

    return { type: 'text', text: JSON.stringify(data, null, 2) }
  }

  aggregateStreamedResults(events) {
    // Check for errors
    const errorEvent = events.find(e => e.event === 'error' || e.event === 'operation_error')
    if (errorEvent) {
      return {
        type: 'text',
        text: `Error: ${errorEvent.data.error || errorEvent.data.message || 'Tool execution failed'}`,
      }
    }

    // Check for non-streaming query results first (fallback path)
    const queryResult = events.find(e => e.event === 'query_result')
    if (queryResult && queryResult.data) {
      const result = queryResult.data.result
      if (result) {
        return {
          type: 'text',
          text: typeof result === 'string' ? result : JSON.stringify(result, null, 2)
        }
      }
    }

    // Aggregate query chunks - check for both possible event names
    const queryChunks = events.filter(e => 
      e.event === 'query_chunk' || 
      e.event === 'data_chunk'
    )
    if (queryChunks.length > 0) {
      const allRows = []
      let columns = null

      for (const chunk of queryChunks) {
        if (!columns && chunk.data.columns) {
          columns = chunk.data.columns
        }
        if (chunk.data.data) {
          allRows.push(...chunk.data.data)
        }
      }

      // Only return data if we actually got some
      if (allRows.length > 0 || columns) {
        return {
          type: 'text',
          text: JSON.stringify({
            columns: columns || [],
            data: allRows,
            row_count: allRows.length,
          }, null, 2),
        }
      }
    }

    // Look for completion event - match what server actually sends
    const resultEvent = events.find(e => 
      e.event === 'operation_completed' || 
      e.event === 'complete' ||
      e.event === 'query_complete' ||
      e.event === 'result' ||
      e.event === 'query_result'
    )
    if (resultEvent) {
      const result = resultEvent.data.result || resultEvent.data
      return { 
        type: 'text', 
        text: typeof result === 'string' ? result : JSON.stringify(result, null, 2) 
      }
    }

    // Default: return all events
    return { type: 'text', text: JSON.stringify(events, null, 2) }
  }

  isCacheable(toolName) {
    const cacheableTools = [
      'get-graph-schema',
      'get-graph-info',
      'describe-graph-structure',
    ]
    return cacheableTools.includes(toolName)
  }

  getCacheTTL(toolName) {
    const ttlMap = {
      'get-graph-schema': 3600,      // 1 hour
      'get-graph-info': 300,         // 5 minutes
      'describe-graph-structure': 1800, // 30 minutes
    }
    return ttlMap[toolName] || 300
  }

  getMetrics() {
    const cacheHitRate = this.metrics.totalRequests > 0 
      ? (this.metrics.cacheHits / this.metrics.totalRequests * 100).toFixed(1) + '%'
      : '0%'

    return {
      totalRequests: this.metrics.totalRequests,
      cacheHits: this.metrics.cacheHits,
      cacheHitRate,
      errors: this.metrics.errors,
      activeConnections: this.connectionPool.connections.size,
    }
  }

  cleanup() {
    this.connectionPool.closeAll()
    this.resultCache.clear()
  }
}

async function main() {
  const baseUrl = process.env.ROBOSYSTEMS_API_URL || 'http://localhost:8000'
  const apiKey = process.env.ROBOSYSTEMS_API_KEY
  const graphId = process.env.ROBOSYSTEMS_GRAPH_ID || 'default'

  if (!apiKey) {
    console.error('ROBOSYSTEMS_API_KEY environment variable is required')
    console.error('Please set ROBOSYSTEMS_API_KEY in your MCP configuration')
    process.exit(1)
  }

  console.error(`RoboSystems MCP Client v${PACKAGE_VERSION}`)
  console.error(`Connecting to ${baseUrl} for graph ${graphId}`)
  console.error(`API Key: ${apiKey.substring(0, 10)}...`)

  const remoteClient = new RoboSystemsMCPClient(baseUrl, apiKey, graphId)

  const server = new Server(
    {
      name: 'robosystems-mcp',
      version: PACKAGE_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
    }
  )

  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    try {
      const toolsData = await remoteClient.getTools()
      const tools = toolsData.map((toolData) => ({
        name: toolData.name,
        description: toolData.description,
        inputSchema: toolData.inputSchema,
      }))
      return { tools }
    } catch (error) {
      console.error(`Error listing tools: ${error.message}`)
      return { tools: [] }
    }
  })

  // Call tool handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    try {
      const { name, arguments: args } = request.params
      const result = await remoteClient.callTool(name, args || {})

      const content = []
      if (result.type === 'text') {
        content.push({ type: 'text', text: result.text })
      } else {
        content.push({ type: 'text', text: JSON.stringify(result, null, 2) })
      }

      return { content }
    } catch (error) {
      console.error(`Error calling tool ${request.params.name}: ${error.message}`)
      return {
        content: [{
          type: 'text',
          text: `Error: ${error.message}`,
        }],
      }
    }
  })

  // Test connection and start server
  try {
    console.error('Testing API connection...')
    const tools = await remoteClient.getTools()
    const toolNames = tools.map((t) => t.name)
    console.error(`Connected successfully. Available tools: ${toolNames.join(', ')}`)

    const transport = new StdioServerTransport()
    console.error('Starting MCP stdio transport...')
    await server.connect(transport)

    console.error('RoboSystems MCP server running')
    console.error('Features: Connection pooling, smart caching, retry logic, progress tracking')

    // Log metrics every 5 minutes
    metricsInterval = setInterval(() => {
      const metrics = remoteClient.getMetrics()
      console.error(`Metrics: ${JSON.stringify(metrics)}`)
    }, 300000)

    // Keep the process alive
    await new Promise(() => {})
  } catch (error) {
    console.error(`MCP server error: ${error.message}`)
    process.exit(1)
  }
}

// Graceful shutdown
let metricsInterval = null
const cleanup = () => {
  console.error('Shutting down RoboSystems MCP client')
  if (metricsInterval) {
    clearInterval(metricsInterval)
  }
  process.exit(0)
}

process.on('SIGINT', cleanup)
process.on('SIGTERM', cleanup)

// Export for programmatic use
export {
  RoboSystemsMCPClient,
  SSEConnectionPool,
  ResultCache
}

// Only run as server if this is the main module
// Check if we're being run directly (not imported)
// This works with both `node index.js` and `npx` invocations
const isMainModule = 
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith('/mcp') ||  // npx binary name
  process.argv[1]?.endsWith('/@robosystems/mcp') || // alternative npx name
  process.argv[1]?.includes('robosystems-mcp'); // package name in path

if (isMainModule) {
  // Run the server
  main().catch((error) => {
    console.error(`Fatal error: ${error.message}`)
    process.exit(1)
  })
}