/**
 * Catalog mode.
 *
 * One stdio connection for every graph an API key reaches. The bridge serves
 * four fixed tools; each takes the graph as an argument and is forwarded to
 * that graph's own MCP endpoint (POST /v1/graphs/{graph_id}/mcp). A graph's
 * tools are data returned by `get-tools`, never part of this server's
 * `tools/list`, so the list is the same on every connection and a subgraph is
 * usable the moment it exists. There is no current graph: nothing here carries
 * state from one call to the next except short-lived caches of server output.
 */

import { createInterface } from 'readline'
import { relaySSE } from './proxy.js'

export const PROTOCOL_VERSION = '2025-06-18'

const JSONRPC_PARSE_ERROR = -32700
const JSONRPC_METHOD_NOT_FOUND = -32601
const JSONRPC_INVALID_PARAMS = -32602

// A graph reference becomes a URL path segment, so nothing outside this set
// is ever forwarded.
const GRAPH_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

const CACHE_TTL_MS = 60_000
const LOOKUP_TIMEOUT_MS = 30_000
const SUMMARY_CHARS = 180
const MAX_DEFINITIONS = 8
const MAX_QUERY_HITS = 25
const ERROR_BODY_PREVIEW_CHARS = 300

const GRAPH_ARGUMENT = {
  type: 'string',
  description:
    'The graph to act on: a graph id, a subgraph id (`{parent}_{name}`) or an alias, as `list-graphs` returns them',
}

export const CATALOG_TOOLS = [
  {
    name: 'list-graphs',
    title: 'List graphs',
    description:
      'List the graphs this connection can reach, with the id or alias to pass as `graph` to the ' +
      'other tools. Subgraphs are graphs: a parent’s are listed by its own `list-subgraphs` ' +
      'tool (through `call-read-tool`), and a subgraph id works as `graph` as soon as it exists.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: {
      title: 'List graphs',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'get-tools',
    title: 'Get a graph’s tools',
    description:
      'Look up the tools one graph serves. Each graph has its own list: a ledger graph, a shared ' +
      'repository such as `sec` and a subgraph differ.\n\n' +
      '- With `graph` alone: the index (every tool’s name and one-line summary, split into ' +
      'read and write tools) and the graph’s own instructions. Call this first for a graph ' +
      'you have not worked on in this conversation, and read the instructions.\n' +
      '- With `names`: the full description and input schema of those tools. Read a tool’s ' +
      'definition before the first time you call it; never guess its arguments.\n' +
      '- With `query`: the index filtered to tools matching the words given.',
    inputSchema: {
      type: 'object',
      properties: {
        graph: GRAPH_ARGUMENT,
        names: {
          type: 'array',
          items: { type: 'string' },
          maxItems: MAX_DEFINITIONS,
          description: `Tool names to return in full, at most ${MAX_DEFINITIONS} per call`,
        },
        query: {
          type: 'string',
          description: 'Words to filter the index by, matched against names and descriptions',
        },
      },
      required: ['graph'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Get a graph’s tools',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'call-read-tool',
    title: 'Call a read tool',
    description:
      'Run one of a graph’s read tools (listed under `read_tools` by `get-tools`). `name` is ' +
      'the tool and `arguments` is its input, exactly as its definition describes. The result is ' +
      'the tool’s own. A write tool is refused here: use `call-write-tool`.',
    inputSchema: {
      type: 'object',
      properties: {
        graph: GRAPH_ARGUMENT,
        name: { type: 'string', description: 'The tool to run' },
        arguments: {
          type: 'object',
          description: 'The tool’s arguments, per its input schema',
          additionalProperties: true,
        },
      },
      required: ['graph', 'name'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Call a read tool',
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: false,
    },
  },
  {
    name: 'call-write-tool',
    title: 'Call a write tool',
    description:
      'Run one of a graph’s write tools (listed under `write_tools` by `get-tools`). `name` ' +
      'is the tool and `arguments` is its input, exactly as its definition describes. This ' +
      'changes the graph named in `graph`: check it is the one you mean. `create-subgraph` on a ' +
      'parent returns a subgraph id that is usable as `graph` on the next call. A read tool is ' +
      'refused here: use `call-read-tool`.',
    inputSchema: {
      type: 'object',
      properties: {
        graph: GRAPH_ARGUMENT,
        name: { type: 'string', description: 'The tool to run' },
        arguments: {
          type: 'object',
          description: 'The tool’s arguments, per its input schema',
          additionalProperties: true,
        },
      },
      required: ['graph', 'name'],
      additionalProperties: false,
    },
    annotations: {
      title: 'Call a write tool',
      readOnlyHint: false,
      destructiveHint: true,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
]

/**
 * Parse ROBOSYSTEMS_GRAPH_IDS: a comma-separated list of graph ids, each
 * optionally named (`rfs=kg1a…`). Returns null when unset, which means every
 * graph the key reaches. Throws on anything that is not a safe reference.
 */
export function parseGraphSet(raw) {
  if (!raw || !raw.trim()) return null
  const entries = []
  const ids = new Set()
  const aliases = new Map()
  for (const part of raw.split(',')) {
    const item = part.trim()
    if (!item) continue
    const eq = item.indexOf('=')
    const alias = eq === -1 ? null : item.slice(0, eq).trim()
    const id = eq === -1 ? item : item.slice(eq + 1).trim()
    if (!GRAPH_REF.test(id) || (alias !== null && !GRAPH_REF.test(alias))) {
      throw new Error(`ROBOSYSTEMS_GRAPH_IDS: "${item}" is not a graph id or alias=id pair`)
    }
    if (ids.has(id)) continue
    ids.add(id)
    if (alias) aliases.set(alias, id)
    entries.push({ id, alias })
  }
  if (entries.length === 0) return null
  for (const alias of aliases.keys()) {
    if (ids.has(alias)) {
      throw new Error(`ROBOSYSTEMS_GRAPH_IDS: alias "${alias}" is also a graph id`)
    }
  }
  return { entries, ids, aliases }
}

/**
 * Turn the model's `graph` argument into a graph id, or throw with a message
 * the model can act on. With a configured set, only its graphs and their
 * subgraphs resolve; without one, any safe id is forwarded and the server
 * decides what the key may reach.
 */
export function resolveGraph(ref, graphSet) {
  if (typeof ref !== 'string' || !GRAPH_REF.test(ref)) {
    throw new Error('`graph` must be a graph id or alias from `list-graphs`')
  }
  if (!graphSet) return ref
  if (graphSet.aliases.has(ref)) return graphSet.aliases.get(ref)
  if (graphSet.ids.has(ref)) return ref
  for (const id of graphSet.ids) {
    if (ref.startsWith(`${id}_`)) return ref
  }
  const allowed = graphSet.entries.map((e) => e.alias || e.id).join(', ')
  throw new Error(
    `Graph "${ref}" is outside this connection. It reaches: ${allowed}, and their subgraphs`
  )
}

/** The first paragraph of a tool description that says what the tool does. */
export function summarize(description) {
  const paragraphs = String(description || '')
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
  const lead = paragraphs.find((p) => !p.startsWith('**GRAPH:**')) || ''
  return lead.length > SUMMARY_CHARS ? `${lead.slice(0, SUMMARY_CHARS - 1).trimEnd()}…` : lead
}

const isReadTool = (tool) => tool?.annotations?.readOnlyHint === true

function searchTools(tools, query) {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  return tools
    .map((tool) => {
      const name = tool.name.toLowerCase()
      const title = String(tool.title || '').toLowerCase()
      const description = String(tool.description || '').toLowerCase()
      let score = 0
      for (const word of words) {
        if (name.includes(word)) score += 3
        else if (title.includes(word)) score += 2
        else if (description.includes(word)) score += 1
      }
      return { tool, score }
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_QUERY_HITS)
    .map((hit) => hit.tool)
}

function buildInstructions(graphSet) {
  const scope = graphSet
    ? `This connection is limited to these graphs and their subgraphs: ${graphSet.entries
        .map((e) => (e.alias ? `\`${e.alias}\` (\`${e.id}\`)` : `\`${e.id}\``))
        .join(', ')}.`
    : 'This connection reaches every graph the API key can.'
  return [
    'RoboSystems, through one connection for many graphs. Each graph is its own MCP server with ' +
      'its own tools and instructions; this connection looks them up and calls them for you.',
    scope,
    'HOW TO WORK',
    '- `list-graphs` says what you can reach. Every other tool takes `graph`: there is no ' +
      'current or default graph, so name it on every call.',
    '- Before working on a graph, call `get-tools` with `graph` alone and read the instructions ' +
      'it returns. They are that graph’s own and they differ from graph to graph.',
    '- Before the first call to a tool, call `get-tools` with its name in `names` and follow ' +
      'its description and input schema.',
    '- Run it with `call-read-tool` or `call-write-tool`, whichever list the index put it in.',
    'SUBGRAPHS',
    '- A subgraph is a graph with its own, smaller tool list. Create one with the parent’s ' +
      '`create-subgraph` (a write tool); the id it returns works as `graph` on the next call. ' +
      'The parent’s `list-subgraphs` lists them, and `delete-subgraph` removes one.',
    '- A result that says to add a connector for a `connector_url` is written for a connection ' +
      'to a single graph. Here, pass the subgraph id as `graph` instead.',
    'When several graphs are in play, say which graph a figure or a write belongs to.',
  ].join('\n')
}

class UpstreamError extends Error {}

function textResult(text, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

const jsonResult = (value) => textResult(JSON.stringify(value))

/**
 * Create a catalog bound to one API base and key. Exposed separately from
 * runCatalog so tests can drive individual messages without real stdio.
 */
export function createCatalog({
  baseUrl,
  apiKey,
  version,
  graphSet = null,
  output = process.stdout,
  fetchImpl = fetch,
  now = Date.now,
}) {
  const apiBase = (baseUrl || 'https://api.robosystems.ai').replace(/\/$/, '')
  const toolCache = new Map()
  const instructionCache = new Map()
  let lookupId = 0

  const deliver = (message) => output.write(JSON.stringify(message) + '\n')

  const headers = () => ({
    'Content-Type': 'application/json',
    Accept: 'application/json, text/event-stream',
    'User-Agent': `robosystems-mcp/${version}`,
    'X-MCP-Client': version,
    'X-API-Key': apiKey,
  })

  const httpFailure = async (response) => {
    const body = await response.text().catch(() => '')
    let detail = body.slice(0, ERROR_BODY_PREVIEW_CHARS)
    try {
      const parsed = JSON.parse(body)
      const message = parsed?.error?.message ?? parsed?.detail
      if (message) detail = typeof message === 'string' ? message : JSON.stringify(message)
    } catch {
      // Not JSON: keep the preview.
    }
    return new UpstreamError(`HTTP ${response.status}${detail ? `: ${detail}` : ''}`)
  }

  /** POST one JSON-RPC message to a graph and hand each reply to onMessage. */
  const post = async (graphId, message, onMessage, timeoutMs) => {
    const response = await fetchImpl(`${apiBase}/v1/graphs/${graphId}/mcp`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(message),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    })
    if (!response.ok) throw await httpFailure(response)
    const contentType = response.headers.get('content-type') || ''
    if (contentType.includes('text/event-stream')) {
      await relaySSE(response.body, onMessage)
    } else {
      const text = await response.text()
      if (text.trim()) onMessage(JSON.parse(text))
    }
  }

  /** A request the bridge makes on its own account; returns the result. */
  const lookup = async (graphId, method, params) => {
    const id = `catalog-${++lookupId}`
    let reply = null
    await post(
      graphId,
      { jsonrpc: '2.0', id, method, ...(params ? { params } : {}) },
      (message) => {
        if (message?.id === id) reply = message
      },
      LOOKUP_TIMEOUT_MS
    )
    if (!reply) throw new UpstreamError(`No reply to ${method}`)
    if (reply.error) throw new UpstreamError(reply.error.message || `${method} failed`)
    return reply.result
  }

  const cached = async (cache, graphId, load) => {
    const hit = cache.get(graphId)
    if (hit && now() - hit.at < CACHE_TTL_MS) return hit.value
    const value = await load()
    cache.set(graphId, { at: now(), value })
    return value
  }

  const toolsOf = (graphId) =>
    cached(toolCache, graphId, async () => (await lookup(graphId, 'tools/list')).tools || [])

  const instructionsOf = (graphId) =>
    cached(instructionCache, graphId, async () => {
      try {
        const result = await lookup(graphId, 'initialize', {
          protocolVersion: PROTOCOL_VERSION,
          capabilities: {},
          clientInfo: { name: 'robosystems-mcp', version },
        })
        return result?.instructions || null
      } catch {
        // Instructions are guidance; a graph without them is still usable.
        return null
      }
    })

  const listGraphs = async () => {
    let listed = null
    let listingError = null
    try {
      const response = await fetchImpl(`${apiBase}/v1/graphs`, {
        headers: headers(),
        signal: AbortSignal.timeout(LOOKUP_TIMEOUT_MS),
      })
      if (!response.ok) throw await httpFailure(response)
      listed = (await response.json()).graphs || []
    } catch (error) {
      listingError = error.message
    }

    if (!listed && !graphSet) {
      return textResult(
        `Could not list graphs (${listingError}). A key scoped to one graph cannot list the ` +
          'account: set ROBOSYSTEMS_GRAPH_IDS to the graphs this connection should reach.',
        true
      )
    }

    const aliasOf = new Map((graphSet?.entries || []).map((e) => [e.id, e.alias]))
    const inScope = (graph) =>
      !graphSet || graphSet.ids.has(graph.graphId) || graphSet.ids.has(graph.parentGraphId)

    const graphs = (listed || []).filter(inScope).map((graph) => {
      const row = { graph: graph.graphId }
      if (aliasOf.get(graph.graphId)) row.alias = aliasOf.get(graph.graphId)
      if (graph.graphName) row.name = graph.graphName
      if (graph.graphType) row.type = graph.graphType
      if (graph.schemaExtensions?.length) row.extensions = graph.schemaExtensions
      if (graph.repositoryType) row.repository = graph.repositoryType
      if (graph.parentGraphId) row.parent = graph.parentGraphId
      if (graph.role) row.role = graph.role
      if (graph.status) row.status = graph.status
      return row
    })

    const seen = new Set(graphs.map((row) => row.graph))
    for (const entry of graphSet?.entries || []) {
      if (seen.has(entry.id)) continue
      const row = { graph: entry.id }
      if (entry.alias) row.alias = entry.alias
      row.note = listed
        ? 'Configured for this connection; not in the account listing'
        : 'Configured for this connection'
      graphs.push(row)
    }

    return jsonResult({
      graphs,
      scope: graphSet ? 'the configured graphs and their subgraphs' : 'every graph the key reaches',
      next: 'Pass `graph` (the alias when there is one) to `get-tools`.',
    })
  }

  const getTools = async (graphId, args) => {
    const tools = await toolsOf(graphId)

    if (Array.isArray(args.names) && args.names.length > 0) {
      const names = args.names.slice(0, MAX_DEFINITIONS)
      const byName = new Map(tools.map((tool) => [tool.name, tool]))
      const found = names.filter((name) => byName.has(name)).map((name) => byName.get(name))
      const unknown = names.filter((name) => !byName.has(name))
      const payload = {
        graph: graphId,
        tools: found.map((tool) => ({
          name: tool.name,
          call_with: isReadTool(tool) ? 'call-read-tool' : 'call-write-tool',
          description: tool.description,
          inputSchema: tool.inputSchema,
        })),
      }
      if (unknown.length) payload.not_on_this_graph = unknown
      if (args.names.length > MAX_DEFINITIONS) {
        payload.omitted = args.names.slice(MAX_DEFINITIONS)
      }
      return jsonResult(payload)
    }

    const query = typeof args.query === 'string' ? args.query.trim() : ''
    const listed = query ? searchTools(tools, query) : tools
    const row = (tool) => ({ name: tool.name, summary: summarize(tool.description) })
    const payload = {
      graph: graphId,
      tool_count: tools.length,
      read_tools: listed.filter(isReadTool).map(row),
      write_tools: listed.filter((tool) => !isReadTool(tool)).map(row),
      next: 'Call `get-tools` with `names` for the full definition before calling a tool.',
    }
    if (query) {
      payload.query = query
    } else {
      const instructions = await instructionsOf(graphId)
      if (instructions) payload.instructions = instructions
    }
    return jsonResult(payload)
  }

  /** Forward one tool call to its graph and relay everything it sends back. */
  const callTool = async (message, graphId, args, wantRead) => {
    if (typeof args.name !== 'string' || !args.name) {
      return textResult('`name` is required: the tool to run, from `get-tools`', true)
    }
    const tool = (await toolsOf(graphId)).find((t) => t.name === args.name)
    if (!tool) {
      return textResult(
        `Graph ${graphId} has no tool named "${args.name}". ` +
          'Call `get-tools` with this graph for the tools it serves.',
        true
      )
    }
    if (isReadTool(tool) !== wantRead) {
      return textResult(
        wantRead
          ? `"${args.name}" is a write tool: call it with \`call-write-tool\`.`
          : `"${args.name}" is a read tool: call it with \`call-read-tool\`.`,
        true
      )
    }

    const params = { name: args.name, arguments: args.arguments ?? {} }
    if (message.params._meta) params._meta = message.params._meta

    // The host's own request id travels upstream, so the reply and any
    // progress notifications relay back without rewriting.
    let answered = false
    try {
      await post(
        graphId,
        { jsonrpc: '2.0', id: message.id, method: 'tools/call', params },
        (reply) => {
          if (reply && reply.id === message.id && reply.method === undefined) answered = true
          deliver(reply)
        }
      )
    } catch (error) {
      // A stream that broke after the result arrived has nothing left to say.
      if (!answered) throw error
    }
    if (!answered) throw new UpstreamError('The graph sent no result for this call')
    return null
  }

  const handleToolCall = async (message) => {
    const { name, arguments: rawArgs } = message.params
    const args = rawArgs && typeof rawArgs === 'object' ? rawArgs : {}
    if (!CATALOG_TOOLS.some((tool) => tool.name === name)) {
      return textResult(
        `Unknown tool: ${name}. A graph’s own tools run through \`call-read-tool\` or ` +
          '`call-write-tool`.',
        true
      )
    }
    try {
      if (name === 'list-graphs') return await listGraphs()
      const graphId = resolveGraph(args.graph, graphSet)
      if (name === 'get-tools') return await getTools(graphId, args)
      return await callTool(message, graphId, args, name === 'call-read-tool')
    } catch (error) {
      return textResult(error.message, true)
    }
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

    // Notifications and client responses need no answer and have nowhere to go.
    if (!message || typeof message.method !== 'string' || message.id === undefined) return

    const respond = (result) => deliver({ jsonrpc: '2.0', id: message.id, result })
    const fail = (code, text) =>
      deliver({ jsonrpc: '2.0', id: message.id, error: { code, message: text } })

    if (message.method === 'initialize') {
      respond({
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: 'robosystems', title: 'RoboSystems', version },
        instructions: buildInstructions(graphSet),
      })
    } else if (message.method === 'ping') {
      respond({})
    } else if (message.method === 'tools/list') {
      respond({ tools: CATALOG_TOOLS })
    } else if (message.method === 'tools/call') {
      if (!message.params || typeof message.params.name !== 'string') {
        fail(JSONRPC_INVALID_PARAMS, 'Invalid params: expected a tool name')
        return
      }
      const result = await handleToolCall(message)
      if (result) respond(result)
    } else {
      fail(JSONRPC_METHOD_NOT_FOUND, `Method not found: ${message.method}`)
    }
  }

  return { handleLine }
}

/**
 * Run the catalog over real stdio until the host closes stdin.
 */
export async function runCatalog({
  baseUrl,
  apiKey,
  version,
  graphSet = null,
  input = process.stdin,
  output = process.stdout,
  fetchImpl = fetch,
}) {
  const catalog = createCatalog({ baseUrl, apiKey, version, graphSet, output, fetchImpl })

  console.error(`RoboSystems MCP catalog v${version}`)
  console.error(
    graphSet
      ? `Graphs: ${graphSet.entries.map((e) => e.alias || e.id).join(', ')} (and their subgraphs)`
      : 'Graphs: every graph the API key reaches'
  )

  const pending = new Set()
  const rl = createInterface({ input, terminal: false })

  rl.on('line', (line) => {
    const task = catalog
      .handleLine(line)
      .catch((error) => console.error(`Catalog error: ${error.message}`))
      .finally(() => pending.delete(task))
    pending.add(task)
  })

  await new Promise((resolve) => rl.on('close', resolve))
  await Promise.allSettled([...pending])
}
