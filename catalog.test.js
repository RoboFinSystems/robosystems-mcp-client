/**
 * Tests for catalog mode: one connection, the graph named on every call.
 */

import { describe, it, expect } from 'vitest'
import { Readable } from 'stream'
import { ReadableStream } from 'stream/web'
import { TextEncoder } from 'util'
import {
  CATALOG_TOOLS,
  createCatalog,
  parseGraphSet,
  resolveGraph,
  runCatalog,
  summarize,
} from './catalog.js'

const BASE = 'https://api.example.com'
const PARENT = 'kg1a2b3c4d5e6f7a8b9c0d'
const SUBGRAPH = `${PARENT}_dev`

const TOOLS = [
  {
    name: 'get-trial-balance',
    title: 'Get trial balance',
    description: `**GRAPH:** private graph \`${PARENT}\`.\n\nThe trial balance\nfor a period.\n\n**NOTES:** more.`,
    inputSchema: { type: 'object', properties: { period: { type: 'string' } } },
    annotations: { readOnlyHint: true },
  },
  {
    name: 'create-subgraph',
    title: 'Create subgraph',
    description: 'Create an isolated subgraph under this parent graph.',
    inputSchema: { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
    annotations: { readOnlyHint: false },
  },
  {
    name: 'unannotated-tool',
    description: 'A tool the server sent without hints.',
    inputSchema: { type: 'object' },
  },
]

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
    json: async () => body,
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

/**
 * A fake API: answers the account listing and each graph's MCP endpoint, and
 * records every request so tests can assert what was forwarded where.
 */
function makeApi({ tools = TOOLS, graphs = [], onCall, listingStatus = 200 } = {}) {
  const requests = []
  const fetchImpl = async (url, init = {}) => {
    const body = init.body ? JSON.parse(init.body) : null
    requests.push({ url, headers: init.headers, body })
    if (url === `${BASE}/v1/graphs`) {
      return listingStatus === 200
        ? jsonResponse({ graphs })
        : jsonResponse({ detail: 'Graph-scoped key' }, listingStatus)
    }
    if (body.method === 'tools/list') {
      return jsonResponse({ jsonrpc: '2.0', id: body.id, result: { tools } })
    }
    if (body.method === 'initialize') {
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { protocolVersion: '2025-06-18', instructions: `Instructions for ${url}` },
      })
    }
    if (body.method === 'tools/call') {
      if (onCall) return onCall(body, url)
      return jsonResponse({
        jsonrpc: '2.0',
        id: body.id,
        result: { content: [{ type: 'text', text: `ran ${body.params.name}` }], isError: false },
      })
    }
    throw new Error(`unexpected request to ${url}`)
  }
  return { fetchImpl, requests, mcpCalls: () => requests.filter((r) => r.body) }
}

function makeCatalog(api, options = {}) {
  const output = makeOutput()
  const catalog = createCatalog({
    baseUrl: BASE,
    apiKey: 'rfs-secret',
    version: '9.9.9',
    output,
    fetchImpl: api.fetchImpl,
    ...options,
  })
  const call = async (name, args, extra = {}) => {
    const id = output.lines.length + 100
    await catalog.handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id,
        method: 'tools/call',
        params: { name, arguments: args, ...extra },
      })
    )
    return output.messages().find((m) => m.id === id && m.method === undefined)
  }
  const text = (reply) => reply.result.content[0].text
  return { catalog, output, call, text }
}

describe('parseGraphSet', () => {
  it('returns null when unset or blank, meaning every graph the key reaches', () => {
    expect(parseGraphSet(undefined)).toBeNull()
    expect(parseGraphSet('  ')).toBeNull()
  })

  it('reads ids and alias=id pairs', () => {
    const set = parseGraphSet(` rfs=${PARENT}, sec ,`)
    expect(set.entries).toEqual([
      { id: PARENT, alias: 'rfs' },
      { id: 'sec', alias: null },
    ])
    expect(set.aliases.get('rfs')).toBe(PARENT)
  })

  it('refuses anything that is not a safe reference', () => {
    expect(() => parseGraphSet('../etc')).toThrow(/not a graph id/)
    expect(() => parseGraphSet('bad alias=sec')).toThrow(/not a graph id/)
  })

  it('refuses an alias that is also a graph id', () => {
    expect(() => parseGraphSet(`sec=${PARENT},sec`)).toThrow(/also a graph id/)
  })
})

describe('resolveGraph', () => {
  const set = parseGraphSet(`rfs=${PARENT},sec`)

  it('forwards any safe id when no set is configured', () => {
    expect(resolveGraph('kganything', null)).toBe('kganything')
  })

  it('never yields something that is not a single path segment', () => {
    for (const ref of ['../../v1/user', 'a/b', 'a?b', 'a b', '', '_x', undefined, 42]) {
      expect(() => resolveGraph(ref, null)).toThrow(/graph id or alias/)
    }
  })

  it('resolves an alias, a configured id and a subgraph of one', () => {
    expect(resolveGraph('rfs', set)).toBe(PARENT)
    expect(resolveGraph('sec', set)).toBe('sec')
    expect(resolveGraph(SUBGRAPH, set)).toBe(SUBGRAPH)
  })

  it('refuses a graph outside the configured set and names what is inside', () => {
    expect(() => resolveGraph('kgother', set)).toThrow(/outside this connection.*rfs, sec/)
    expect(() => resolveGraph(`${PARENT}x`, set)).toThrow(/outside this connection/)
  })
})

describe('summarize', () => {
  it('takes the first paragraph that is not the graph banner, on one line', () => {
    expect(summarize(TOOLS[0].description)).toBe('The trial balance for a period.')
  })

  it('cuts a long lead and tolerates a missing description', () => {
    expect(summarize('x'.repeat(500)).length).toBe(180)
    expect(summarize(undefined)).toBe('')
  })
})

describe('handshake', () => {
  it('answers initialize itself with fixed capabilities and its own instructions', async () => {
    const api = makeApi()
    const { catalog, output } = makeCatalog(api, { graphSet: parseGraphSet(`rfs=${PARENT}`) })
    await catalog.handleLine(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: { protocolVersion: '2025-11-25' },
      })
    )
    const { result } = output.messages()[0]
    expect(result.protocolVersion).toBe('2025-06-18')
    expect(result.capabilities).toEqual({ tools: { listChanged: false } })
    expect(result.instructions).toContain('`rfs`')
    expect(api.requests).toHaveLength(0)
  })

  it('lists the same four tools whatever was called before', async () => {
    const api = makeApi()
    const { catalog, output, call } = makeCatalog(api)
    await call('get-tools', { graph: SUBGRAPH })
    await catalog.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }))
    const listed = output.messages().find((m) => m.id === 2).result.tools
    expect(listed).toEqual(CATALOG_TOOLS)
    expect(listed.map((t) => t.name)).toEqual([
      'list-graphs',
      'get-tools',
      'call-read-tool',
      'call-write-tool',
    ])
  })

  it('answers ping, rejects unknown methods, and stays silent on notifications', async () => {
    const { catalog, output } = makeCatalog(makeApi())
    await catalog.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }))
    await catalog.handleLine(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'resources/list' }))
    await catalog.handleLine(
      JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })
    )
    await catalog.handleLine('not json')
    const messages = output.messages()
    expect(messages).toHaveLength(3)
    expect(messages[0].result).toEqual({})
    expect(messages[1].error.code).toBe(-32601)
    expect(messages[2].error.code).toBe(-32700)
  })
})

describe('list-graphs', () => {
  const graphs = [
    {
      graphId: PARENT,
      graphName: 'RFS LLC',
      graphType: 'entity',
      schemaExtensions: ['roboledger'],
    },
    { graphId: SUBGRAPH, graphName: 'dev', parentGraphId: PARENT },
    { graphId: 'kgother', graphName: 'Other' },
  ]

  it('lists every graph the key reaches when no set is configured', async () => {
    const { call, text } = makeCatalog(makeApi({ graphs }))
    const payload = JSON.parse(text(await call('list-graphs', {})))
    expect(payload.graphs.map((g) => g.graph)).toEqual([PARENT, SUBGRAPH, 'kgother'])
    expect(payload.graphs[1].parent).toBe(PARENT)
  })

  it('keeps the configured graphs, their subgraphs and unlisted configured ids', async () => {
    const api = makeApi({ graphs })
    const { call, text } = makeCatalog(api, { graphSet: parseGraphSet(`rfs=${PARENT},sec`) })
    const payload = JSON.parse(text(await call('list-graphs', {})))
    expect(payload.graphs.map((g) => g.graph)).toEqual([PARENT, SUBGRAPH, 'sec'])
    expect(payload.graphs[0].alias).toBe('rfs')
    expect(payload.graphs[2].note).toMatch(/not in the account listing/)
  })

  it('falls back to the configured set when the key cannot list the account', async () => {
    const api = makeApi({ listingStatus: 403 })
    const { call, text } = makeCatalog(api, { graphSet: parseGraphSet(PARENT) })
    const reply = await call('list-graphs', {})
    expect(reply.result.isError).toBe(false)
    expect(JSON.parse(text(reply)).graphs).toEqual([
      { graph: PARENT, note: 'Configured for this connection' },
    ])
  })

  it('says how to configure the set when listing fails and none is configured', async () => {
    const { call, text } = makeCatalog(makeApi({ listingStatus: 403 }))
    const reply = await call('list-graphs', {})
    expect(reply.result.isError).toBe(true)
    expect(text(reply)).toMatch(/HTTP 403: Graph-scoped key.*ROBOSYSTEMS_GRAPH_IDS/)
  })
})

describe('get-tools', () => {
  it('returns the index split by read and write, with the graph instructions', async () => {
    const api = makeApi()
    const { call, text } = makeCatalog(api)
    const payload = JSON.parse(text(await call('get-tools', { graph: PARENT })))
    expect(payload.tool_count).toBe(3)
    expect(payload.read_tools).toEqual([
      { name: 'get-trial-balance', summary: 'The trial balance for a period.' },
    ])
    expect(payload.write_tools.map((t) => t.name)).toEqual(['create-subgraph', 'unannotated-tool'])
    expect(payload.instructions).toBe(`Instructions for ${BASE}/v1/graphs/${PARENT}/mcp`)
    expect(api.requests.every((r) => r.headers['X-API-Key'] === 'rfs-secret')).toBe(true)
  })

  it('returns full definitions by name and reports names the graph lacks', async () => {
    const { call, text } = makeCatalog(makeApi())
    const payload = JSON.parse(
      text(await call('get-tools', { graph: PARENT, names: ['create-subgraph', 'nope'] }))
    )
    expect(payload.tools).toEqual([
      {
        name: 'create-subgraph',
        call_with: 'call-write-tool',
        description: TOOLS[1].description,
        inputSchema: TOOLS[1].inputSchema,
      },
    ])
    expect(payload.not_on_this_graph).toEqual(['nope'])
    expect(payload.instructions).toBeUndefined()
  })

  it('filters the index by query without re-sending instructions', async () => {
    const api = makeApi()
    const { call, text } = makeCatalog(api)
    const payload = JSON.parse(text(await call('get-tools', { graph: PARENT, query: 'Subgraph' })))
    expect(payload.read_tools).toEqual([])
    expect(payload.write_tools.map((t) => t.name)).toEqual(['create-subgraph'])
    expect(api.mcpCalls().some((r) => r.body.method === 'initialize')).toBe(false)
  })

  it('reads each graph from its own endpoint and caches the list briefly', async () => {
    let clock = 0
    const api = makeApi()
    const { call } = makeCatalog(api, { now: () => clock })
    await call('get-tools', { graph: PARENT, query: 'x' })
    await call('get-tools', { graph: PARENT, query: 'y' })
    await call('get-tools', { graph: SUBGRAPH, query: 'x' })
    expect(api.mcpCalls().map((r) => r.url)).toEqual([
      `${BASE}/v1/graphs/${PARENT}/mcp`,
      `${BASE}/v1/graphs/${SUBGRAPH}/mcp`,
    ])
    clock = 61_000
    await call('get-tools', { graph: PARENT, query: 'x' })
    expect(api.mcpCalls()).toHaveLength(3)
  })

  it('turns an upstream denial into a tool error the model can read', async () => {
    const api = makeApi()
    const denied = {
      fetchImpl: async () => jsonResponse({ error: { message: 'access denied to graph' } }, 403),
    }
    const { call, text } = makeCatalog({ ...api, ...denied })
    const reply = await call('get-tools', { graph: 'kgnotmine' })
    expect(reply.result.isError).toBe(true)
    expect(text(reply)).toBe('HTTP 403: access denied to graph')
  })

  it('refuses an unsafe graph reference before any request', async () => {
    const api = makeApi()
    const { call } = makeCatalog(api)
    const reply = await call('get-tools', { graph: '../../v1/user' })
    expect(reply.result.isError).toBe(true)
    expect(api.requests).toHaveLength(0)
  })
})

describe('call-read-tool and call-write-tool', () => {
  it('forwards the call to the named graph with the host request id and arguments', async () => {
    const api = makeApi()
    const { call, text } = makeCatalog(api, { graphSet: parseGraphSet(`rfs=${PARENT}`) })
    const reply = await call('call-read-tool', {
      graph: 'rfs',
      name: 'get-trial-balance',
      arguments: { period: '2026-10' },
    })
    expect(text(reply)).toBe('ran get-trial-balance')
    const forwarded = api.mcpCalls().find((r) => r.body.method === 'tools/call')
    expect(forwarded.url).toBe(`${BASE}/v1/graphs/${PARENT}/mcp`)
    expect(forwarded.body.id).toBe(reply.id)
    expect(forwarded.body.params).toEqual({
      name: 'get-trial-balance',
      arguments: { period: '2026-10' },
    })
  })

  it('reaches a subgraph by id on the call after it is created', async () => {
    const api = makeApi()
    const { call } = makeCatalog(api, { graphSet: parseGraphSet(`rfs=${PARENT}`) })
    await call('call-write-tool', {
      graph: 'rfs',
      name: 'create-subgraph',
      arguments: { name: 'dev' },
    })
    await call('call-read-tool', { graph: SUBGRAPH, name: 'get-trial-balance' })
    const urls = api
      .mcpCalls()
      .filter((r) => r.body.method === 'tools/call')
      .map((r) => r.url)
    expect(urls).toEqual([`${BASE}/v1/graphs/${PARENT}/mcp`, `${BASE}/v1/graphs/${SUBGRAPH}/mcp`])
  })

  it('refuses a write tool on the read call and a read tool on the write call', async () => {
    const api = makeApi()
    const { call, text } = makeCatalog(api)
    const asRead = await call('call-read-tool', { graph: PARENT, name: 'create-subgraph' })
    const asWrite = await call('call-write-tool', { graph: PARENT, name: 'get-trial-balance' })
    expect(text(asRead)).toMatch(/write tool.*call-write-tool/)
    expect(text(asWrite)).toMatch(/read tool.*call-read-tool/)
    expect(api.mcpCalls().some((r) => r.body.method === 'tools/call')).toBe(false)
  })

  it('treats a tool without a read-only hint as a write', async () => {
    const api = makeApi()
    const { call, text } = makeCatalog(api)
    const asRead = await call('call-read-tool', { graph: PARENT, name: 'unannotated-tool' })
    expect(asRead.result.isError).toBe(true)
    const asWrite = await call('call-write-tool', { graph: PARENT, name: 'unannotated-tool' })
    expect(text(asWrite)).toBe('ran unannotated-tool')
  })

  it('refuses a tool the graph does not serve and a graph outside the set', async () => {
    const api = makeApi()
    const { call, text } = makeCatalog(api, { graphSet: parseGraphSet(PARENT) })
    const missing = await call('call-read-tool', { graph: PARENT, name: 'nope' })
    expect(text(missing)).toMatch(/has no tool named "nope"/)
    const outside = await call('call-write-tool', { graph: 'kgother', name: 'create-subgraph' })
    expect(text(outside)).toMatch(/outside this connection/)
    expect(api.mcpCalls().some((r) => r.body.method === 'tools/call')).toBe(false)
  })

  it('relays streamed progress and passes the progress token upstream', async () => {
    const api = makeApi({
      onCall: (body) =>
        sseResponse(
          [
            `data: ${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/progress', params: { progressToken: 'tok', progress: 1 } })}`,
            '',
            `data: ${JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { content: [{ type: 'text', text: 'done' }], isError: false } })}`,
            '',
            '',
          ].join('\n')
        ),
    })
    const { call, output, text } = makeCatalog(api)
    const reply = await call(
      'call-write-tool',
      { graph: PARENT, name: 'create-subgraph', arguments: { name: 'dev' } },
      { _meta: { progressToken: 'tok' } }
    )
    expect(text(reply)).toBe('done')
    expect(output.messages().filter((m) => m.method === 'notifications/progress')).toHaveLength(1)
    const forwarded = api.mcpCalls().find((r) => r.body.method === 'tools/call')
    expect(forwarded.body.params._meta).toEqual({ progressToken: 'tok' })
  })

  it('passes the graph’s own tool error through unchanged', async () => {
    const result = { content: [{ type: 'text', text: 'period is closed' }], isError: true }
    const api = makeApi({
      onCall: (body) => jsonResponse({ jsonrpc: '2.0', id: body.id, result }),
    })
    const { call } = makeCatalog(api)
    const reply = await call('call-write-tool', { graph: PARENT, name: 'create-subgraph' })
    expect(reply.result).toEqual(result)
  })

  it('answers once with a tool error when the graph refuses the call over HTTP', async () => {
    const api = makeApi({
      onCall: () => jsonResponse({ error: { message: 'rate limited' } }, 429),
    })
    const { call, output, text } = makeCatalog(api)
    const reply = await call('call-read-tool', { graph: PARENT, name: 'get-trial-balance' })
    expect(reply.result.isError).toBe(true)
    expect(text(reply)).toBe('HTTP 429: rate limited')
    expect(output.messages()).toHaveLength(1)
  })

  it('never puts the API key in a result', async () => {
    const api = makeApi({ graphs: [{ graphId: PARENT }] })
    const { call, output } = makeCatalog(api)
    await call('list-graphs', {})
    await call('get-tools', { graph: PARENT })
    await call('call-read-tool', { graph: PARENT, name: 'get-trial-balance' })
    expect(output.lines.join('')).not.toContain('rfs-secret')
  })

  it('names the catalog tools when a graph tool is called directly', async () => {
    const { call, text } = makeCatalog(makeApi())
    const reply = await call('get-trial-balance', {})
    expect(reply.result.isError).toBe(true)
    expect(text(reply)).toMatch(/call-read-tool/)
  })
})

describe('runCatalog', () => {
  it('serves stdin lines until the host closes the stream', async () => {
    const api = makeApi({ graphs: [{ graphId: PARENT }] })
    const output = makeOutput()
    const input = Readable.from([
      JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }) + '\n',
      JSON.stringify({
        jsonrpc: '2.0',
        id: 2,
        method: 'tools/call',
        params: { name: 'list-graphs', arguments: {} },
      }) + '\n',
    ])
    await runCatalog({
      baseUrl: BASE,
      apiKey: 'rfs-secret',
      version: '9.9.9',
      input,
      output,
      fetchImpl: api.fetchImpl,
    })
    expect(
      output
        .messages()
        .map((m) => m.id)
        .sort()
    ).toEqual([1, 2])
  })
})
