# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official MCP (Model Context Protocol) stdio bridge for connecting stdio-only AI clients to the RoboSystems financial intelligence platform. Query financial statements, explore graph structures, resolve XBRL elements, and build fact grids.

> **The preferred way to connect is the hosted remote MCP endpoint — no install required.** Every RoboSystems graph serves the MCP Streamable HTTP transport directly. OAuth-capable clients (claude.ai, Claude Code, ChatGPT, VS Code, Cursor) add `https://api.robosystems.ai/v1/mcp`, sign in, and pick the graph on the consent screen; any HTTP-capable client can instead add a per-graph URL `https://api.robosystems.ai/v1/graphs/{graph_id}/mcp` with an API key in the `X-API-Key` header. **This npx package is in maintenance mode** and exists only for clients that speak nothing but the stdio transport: it is a transparent proxy that forwards that same transport over stdio. See [Migrating to the remote endpoint](#migrating-to-the-remote-endpoint).

## Features

- **Native MCP transport over stdio** — a transparent proxy that forwards the graph's Streamable HTTP endpoint verbatim: per-session instructions, live tool lists, and streamed progress notifications, identical to connecting the URL directly
- **Every server tool, as the server advertises it** — financial statements, disclosures and fact grids; Cypher, schema introspection and element resolution; subgraphs and agent memory on graphs that have them

## Installation

Add to your MCP servers configuration:

```json
{
  "mcpServers": {
    "robosystems": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp@latest"],
      "env": {
        "ROBOSYSTEMS_API_URL": "https://api.robosystems.ai",
        "ROBOSYSTEMS_API_KEY": "rfs...",
        "ROBOSYSTEMS_GRAPH_ID": "kg..."
      }
    }
  }
}
```

### Environment Variables

| Variable               | Description                                                     | Default                                          |
| ---------------------- | --------------------------------------------------------------- | ------------------------------------------------ |
| `ROBOSYSTEMS_API_KEY`  | Your API key, sent as `X-API-Key`                               | _(required unless the URL carries credentials)_  |
| `ROBOSYSTEMS_GRAPH_ID` | The graph to connect (derives the per-graph endpoint URL)       | _(required unless `ROBOSYSTEMS_MCP_URL` is set)_ |
| `ROBOSYSTEMS_API_URL`  | API endpoint                                                    | `https://api.robosystems.ai`                     |
| `ROBOSYSTEMS_MCP_URL`  | Full MCP endpoint URL — overrides the URL derived from graph ID | _(derived from graph ID)_                        |

### How it works

By default this package is a transparent pipe between your stdio client and the graph's native MCP endpoint (`POST /v1/graphs/{graph_id}/mcp`, Streamable HTTP). Every JSON-RPC message is forwarded verbatim, so per-session instructions, the live server tool list, and streamed progress notifications behave exactly as they do when connecting the URL directly — the only thing the proxy adds is the API-key header the stdio client can't send itself. The standard configuration above is all it needs.

To target a specific endpoint (for example a local stack), point `ROBOSYSTEMS_MCP_URL` at the full URL, e.g. `http://localhost:8000/v1/graphs/kg.../mcp` — no graph ID needed.

## Migrating to the Remote Endpoint

If your client supports HTTP transports, replace the npx entry with a direct connection — the URL picks the graph (`sec` for the public SEC repository, your `kg…` graph id for your own; a subgraph id like `kg…_dev` is just another URL), and your account-wide API key goes in the `X-API-Key` header, one connector per graph.

**OAuth — sign in and pick a graph** (claude.ai, Claude Code, ChatGPT, VS Code, Cursor): add the graph-agnostic endpoint and no key at all; the consent screen is where you choose the graph.

```bash
claude mcp add --transport http robosystems https://api.robosystems.ai/v1/mcp
```

**Claude Code with an API key** — one command:

```bash
claude mcp add --transport http robosystems-sec \
  https://api.robosystems.ai/v1/graphs/sec/mcp \
  --header "X-API-Key: <your key>"
```

**Cursor / VS Code** — replace the `command`/`args`/`env` entry in `mcp.json` with:

```json
"robosystems-sec": {
  "url": "https://api.robosystems.ai/v1/graphs/sec/mcp",
  "headers": { "X-API-Key": "<your key>" }
}
```

Local development uses the same shape against a local stack: `http://localhost:8000/v1/graphs/{graph_id}/mcp`.

**Claude (claude.ai / Desktop)** connects with a **connector URL** instead of a header: generate one from the MCP page in the RoboSystems app (`/connect`) and paste it into Settings → Connectors → Add custom connector. The URL carries its own graph-scoped, revocable API key, since Claude's custom connectors cannot send custom headers. Claude Desktop can alternatively run this package via `claude_desktop_config.json` (the config file accepts only stdio-shaped `command` entries); in its default [proxy mode](#proxy-mode-the-default) it delivers the same remote-endpoint behavior over stdio.

## Tools

Tools are loaded dynamically from the RoboSystems API based on your graph, so the authoritative list is whatever your server advertises — the proxy adds nothing of its own. The tables below are representative.

### Financial Data

| Tool                      | Description                                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------ |
| `get-financial-statement` | Retrieve structured financial statements (income, balance sheet, cash flow) by ticker and period |
| `list-disclosures`        | List available disclosure types with counts, optionally filtered by ticker                       |
| `get-disclosure-detail`   | Get facts for a specific disclosure type                                                         |
| `build-fact-grid`         | Construct multidimensional fact grids from graph data for analysis                               |

### Graph Exploration

| Tool                       | Description                                                                  |
| -------------------------- | ---------------------------------------------------------------------------- |
| `execute-cypher`           | Run Cypher queries against the knowledge graph with validation and streaming |
| `get-graph-schema`         | Introspect node types, relationships, and properties                         |
| `describe-graph-structure` | Explore graph structure and relationship patterns                            |
| `get-graph-info`           | Graph metadata and statistics                                                |
| `resolve-element`          | Map financial concepts (e.g. "revenue") to XBRL element qnames               |
| `resolve-structure`        | Find financial statement structures by type                                  |
| `get-properties`           | Discover available properties on node types                                  |
| `get-example-queries`      | Query templates and examples for common patterns                             |

## Resources

- [RoboSystems Platform](https://robosystems.ai)
- [GitHub Repository](https://github.com/RoboFinSystems/robosystems)
- [API Documentation](https://api.robosystems.ai/docs)
- [OpenAPI Specification](https://api.robosystems.ai/openapi.json)

## Support

- [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues)
- [Wiki](https://github.com/RoboFinSystems/robosystems/wiki)
- [Projects](https://github.com/orgs/RoboFinSystems/projects)
- [Discussions](https://github.com/orgs/RoboFinSystems/discussions)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2026 RFS LLC
