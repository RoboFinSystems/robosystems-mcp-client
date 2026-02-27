# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official MCP (Model Context Protocol) server for connecting AI agents to the RoboSystems Financial Knowledge Graph API. Query financial statements, explore graph structures, resolve XBRL elements, and build fact grids — all from Claude Desktop, Claude Code, Cursor, or any MCP-compatible client.

## Features

- **Financial data tools** for statements, disclosures, and multidimensional fact grids
- **Graph exploration** with Cypher queries, schema introspection, and element resolution
- **Workspace management** for isolated subgraphs, staging data, and persistent agent memory
- **Streaming support** via SSE and NDJSON for large result sets
- **Connection pooling** with LRU eviction for optimal performance
- **Smart caching** for frequently accessed schemas and metadata
- **Automatic retry logic** with exponential backoff

## Installation

Add to your MCP servers configuration:

```json
{
  "mcpServers": {
    "robosystems": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp"],
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

| Variable               | Description                              | Default                      |
| ---------------------- | ---------------------------------------- | ---------------------------- |
| `ROBOSYSTEMS_API_KEY`  | Your API key                             | _(required)_                 |
| `ROBOSYSTEMS_GRAPH_ID` | Primary graph ID (parent for workspaces) | _(required)_                 |
| `ROBOSYSTEMS_API_URL`  | API endpoint                             | `https://api.robosystems.ai` |

## Tools

Tools are loaded dynamically from the RoboSystems API based on your graph. The client also provides built-in workspace management tools.

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

### Workspaces

| Tool               | Description                                         |
| ------------------ | --------------------------------------------------- |
| `create-workspace` | Create an isolated subgraph (static or memory type) |
| `switch-workspace` | Switch active workspace context                     |
| `list-workspaces`  | List all workspaces with active indicator           |
| `delete-workspace` | Remove a workspace and its data                     |

Workspaces let you create isolated subgraphs for experimentation, staging data, or persistent agent memory. Use `subgraph_type: "memory"` when creating a workspace to get a dedicated memory graph.

## Resources

- [RoboSystems Platform](https://robosystems.ai)
- [GitHub Repository](https://github.com/RoboFinSystems/robosystems)
- [MCP API Documentation](https://api.robosystems.ai/docs#tag/MCP)
- [OpenAPI Specification](https://api.robosystems.ai/openapi.json)

## Support

- [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues)
- [Wiki](https://github.com/RoboFinSystems/robosystems/wiki)
- [Projects](https://github.com/orgs/RoboFinSystems/projects)
- [Discussions](https://github.com/orgs/RoboFinSystems/discussions)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2026 RFS LLC
