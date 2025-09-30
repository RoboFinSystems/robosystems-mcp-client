# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

Official MCP (Model Context Protocol) client adapter for connecting AI agents to the RoboSystems Financial Knowledge Graph API. Access comprehensive financial data including accounting transactions, financial reports, and advanced graph analytics through the Model Context Protocol.

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

| Variable | Description | Required | Default | Example |
|----------|-------------|----------|---------|---------|
| `ROBOSYSTEMS_API_KEY` | Your API key | Yes | - | `rfs...` |
| `ROBOSYSTEMS_GRAPH_ID` | The graph database ID to connect to | Yes | - | `kg...` or `sec` |
| `ROBOSYSTEMS_API_URL` | The RoboSystems API endpoint | No | `http://localhost:8000` | `https://api.robosystems.ai` |

## API Reference

- API reference: [https://api.robosystems.ai](https://api.robosystems.ai)
- API documentation: [https://api.robosystems.ai/docs](https://api.robosystems.ai/docs)
- OpenAPI specification: [https://api.robosystems.ai/openapi.json](https://api.robosystems.ai/openapi.json)

## Support

- Issues: [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues)
- Discussions: [Discussions](https://github.com/RoboFinSystems/robosystems-mcp-client/discussions)
- Projects: [Projects](https://github.com/RoboFinSystems/robosystems-mcp-client/projects)
- Wiki: [Wiki](https://github.com/RoboFinSystems/robosystems-mcp-client/wiki)

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2025 RFS LLC