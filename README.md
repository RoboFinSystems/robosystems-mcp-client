# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official MCP (Model Context Protocol) client adapter for connecting AI agents to the RoboSystems Financial Knowledge Graph API. Access comprehensive financial data including accounting transactions, financial reports, and advanced graph analytics through the Model Context Protocol.

## Features

- **AI Memory Graphs** - Persistent agent memory via dedicated memory subgraph workspaces
- **Workspace Management** - Create isolated subgraphs for memory, data workspaces, and experimentation
- **MCP-compliant server** for Claude Desktop, Claude Code, Cursor, and other AI agents
- **Streaming support** for memory-efficient processing of large result sets
- **Connection pooling** for optimal SSE performance
- **Smart caching** for frequently accessed schemas and metadata
- **Automatic retry logic** with exponential backoff

## Quick Start

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

## Environment Variables

| Variable               | Description                                           | Example                      |
| ---------------------- | ----------------------------------------------------- | ---------------------------- |
| `ROBOSYSTEMS_API_URL`  | The RoboSystems API endpoint                          | `https://api.robosystems.ai` |
| `ROBOSYSTEMS_API_KEY`  | Your API key                                          | `rfs...`                     |
| `ROBOSYSTEMS_GRAPH_ID` | The primary graph database ID (parent for workspaces) | `kg...` or `sec`             |

## Resources

- [RoboSystems Platform](https://robosystems.ai)
- [GitHub Repository](https://github.com/RoboFinSystems/robosystems)
- [MCP API Documentation](https://api.robosystems.ai/docs#tag/MCP)

## Support

- [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues)
- [Wiki](https://github.com/RoboFinSystems/robosystems/wiki)
- [Projects](https://github.com/orgs/RoboFinSystems/projects)
- [Discussions](https://github.com/orgs/RoboFinSystems/discussions)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2026 RFS LLC
