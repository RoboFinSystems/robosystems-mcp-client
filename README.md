# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official MCP (Model Context Protocol) client adapter for connecting AI agents to the RoboSystems Financial Knowledge Graph API. Access comprehensive financial data including accounting transactions, financial reports, and advanced graph analytics through the Model Context Protocol.

## Features

- **Workspace Management** - Create isolated environments for experimentation
- **MCP-compliant server** for Claude Desktop and other AI agents
- **Streaming support** for memory-efficient processing of large result sets
- **Connection pooling** for optimal SSE performance
- **Smart caching** for frequently accessed schemas and metadata
- **Automatic retry logic** with exponential backoff
- **Real-time progress tracking** for long-running operations

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

| Variable | Description | Example |
|----------|-------------|---------|
| `ROBOSYSTEMS_API_URL` | The RoboSystems API endpoint | `https://api.robosystems.ai` |
| `ROBOSYSTEMS_API_KEY` | Your API key | `rfs...` |
| `ROBOSYSTEMS_GRAPH_ID` | The primary graph database ID (parent for workspaces) | `kg...` or `sec` |

## Workspace Management

Create isolated environments for experimentation without affecting your primary graph:

```javascript
// Create a workspace
"Create a workspace called 'dev'"
// AI calls: create-workspace { name: "dev" }
// → Creates isolated environment, automatically switches to it

// Work in isolation
"Load this test data into the workspace"
// AI calls: ingest-file { ... }
// → Data goes to workspace, not primary graph

// Fork parent data
"Create a workspace called 'staging' with production data"
// AI calls: create-workspace { name: "staging", fork_parent: true }
// → Copies parent graph data to workspace

// Switch between environments
"Switch back to the main graph"
// AI calls: switch-workspace { workspace_id: "primary" }

// List all workspaces
"What workspaces do I have?"
// AI calls: list-workspaces {}

// Clean up
"Delete the dev workspace"
// AI calls: delete-workspace { workspace_id: "kg123_dev" }
```

### Workspace Features

- **Isolation**: Each workspace is a separate database
- **Security**: Same permissions as parent graph
- **Context Switching**: Transparently switch between environments
- **Data Forking**: Optional copy of parent data
- **Auto-cleanup**: Deletion automatically switches back to primary

### Workspace Naming

- Alphanumeric only (no hyphens, underscores, special characters)
- 1-20 characters
- Examples: `dev`, `staging`, `prod1`, `test123`

## API Reference

- [RoboSystems](https://robosystems.ai)
- [MCP API documentation](https://api.robosystems.ai/docs#tag/MCP)

## Support

- [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues)
- [Discussions](https://github.com/RoboFinSystems/robosystems/discussions)
- [Projects](https://github.com/RoboFinSystems/robosystems/projects)
- [Wiki](https://github.com/RoboFinSystems/robosystems/wiki)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2025 RFS LLC