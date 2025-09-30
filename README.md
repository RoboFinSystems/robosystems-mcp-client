# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official MCP (Model Context Protocol) client adapter for connecting AI agents to RoboSystems Financial Knowledge Graph API. Access comprehensive financial data including accounting transactions, financial reports, and advanced graph analytics through the Model Context Protocol.

## Features

- **MCP-compliant server** for Claude Desktop and other AI agents
- **Streaming support** for memory-efficient processing of large result sets
- **Connection pooling** for optimal SSE performance
- **Smart caching** for frequently accessed schemas and metadata
- **Automatic retry logic** with exponential backoff
- **Real-time progress tracking** for long-running operations

## Installation

```bash
npm install @robosystems/mcp
```

Or run directly with npx:

```bash
npx @robosystems/mcp
```

## Quick Start

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "robosystems": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp"],
      "env": {
        "ROBOSYSTEMS_API_URL": "https://api.robosystems.ai",
        "ROBOSYSTEMS_API_KEY": "your-api-key-here",
        "ROBOSYSTEMS_GRAPH_ID": "your-graph-id"
      }
    }
  }
}
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ROBOSYSTEMS_API_URL` | The RoboSystems API endpoint | `http://localhost:8000` |
| `ROBOSYSTEMS_API_KEY` | Your API key | **Required** |
| `ROBOSYSTEMS_GRAPH_ID` | The graph database ID to connect to | `default` |

## Configuration Details

### Connection Pooling
- **Maximum Connections**: 5 concurrent SSE connections (hardcoded)
- **Connection TTL**: 30 seconds before automatic cleanup
- Connections are reused across requests for better performance

### Smart Caching
Cache TTL values per tool type:
- **`get-graph-schema`**: 1 hour (3600 seconds)
- **`get-graph-info`**: 5 minutes (300 seconds) 
- **`describe-graph-structure`**: 30 minutes (1800 seconds)
- **Other tools**: 5 minutes (300 seconds) default

### Timeouts
- **SSE Timeout**: 5 minutes for streaming operations
- **Metrics Logging**: Every 5 minutes

## Available Tools

### Core Query Tools
- **`read-graph-cypher`**: Execute read-only Cypher queries on the graph database
  - Supports streaming for large result sets
  - Automatic result aggregation
  - Progress tracking for complex queries

### Schema & Information Tools
- **`get-graph-schema`**: Retrieve the complete database schema
  - Returns node types and relationship definitions
  
- **`get-graph-info`**: Get basic information about the graph
  - Includes node counts, relationship counts, and metadata

- **`describe-graph-structure`**: Get natural language description of the graph
  - AI-friendly format for better understanding

## Technical Details

### Response Formats
The MCP server automatically handles multiple response formats:
- **JSON**: Standard synchronous responses
- **SSE (Server-Sent Events)**: Real-time streaming for long operations
- **NDJSON**: Newline-delimited JSON for batch processing
- **Queued**: Queued operations with status polling

## Integration Examples

### Claude Desktop
```json
{
  "mcpServers": {
    "robosystems": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp"],
      "env": {
        "ROBOSYSTEMS_API_URL": "https://api.robosystems.ai",
        "ROBOSYSTEMS_API_KEY": "your-api-key-here",
        "ROBOSYSTEMS_GRAPH_ID": "your-graph-id"
      }
    }
  }
}
```

### Local Development
```json
{
  "mcpServers": {
    "robosystems-local": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp"],
      "env": {
        "ROBOSYSTEMS_API_URL": "http://localhost:8000",
        "ROBOSYSTEMS_API_KEY": "your-api-dev-key-here",
        "ROBOSYSTEMS_GRAPH_ID": "your-dev-graph-id"
      }
    }
  }
}
```

## Usage Examples

Once configured, you can ask Claude to:

- **Query the graph**: "Show me all companies in the technology sector"
- **Get schema information**: "What types of data are available in this graph?"
- **Explore relationships**: "How are companies connected to their financial reports?"
- **Run complex analyses**: "Find companies with revenue growth over 20% in the last year"

## Support

- Issues: [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues)
- Discussions: [Discussions](https://github.com/RoboFinSystems/robosystems-mcp-client/discussions)
- Projects: [Projects](https://github.com/RoboFinSystems/robosystems-mcp-client/projects)
- Wiki: [Wiki](https://github.com/RoboFinSystems/robosystems-mcp-client/wiki)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2025 RFS LLC