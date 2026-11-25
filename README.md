# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The stdio bridge to the MCP server of [RoboSystems](https://github.com/RoboFinSystems/robosystems), the open-source knowledge graph for finance.** Every graph is an MCP server over the Streamable HTTP transport; `@robosystems/mcp` connects MCP clients without HTTP transport to it. It is in maintenance mode.

The bridge reads JSON-RPC messages from stdin, posts each one unchanged to a graph's MCP endpoint with your API key in the `X-API-Key` header, and writes the replies to stdout. The instructions, tools and progress notifications are the server's own; the bridge adds none. Diagnostics go to stderr, including a notice at startup when a newer version is on npm.

## Connect directly if you can

An MCP client with HTTP transport does not need this package. Connect it to the hosted server instead:

- **OAuth**: `https://api.robosystems.ai/v1/mcp`. Sign in and choose the graph on the consent screen. `https://api.robosystems.ai/v1/mcp/roboledger` is the same for RoboLedger graphs, with the accounting tools only
- **API key**: `https://api.robosystems.ai/v1/graphs/{graph_id}/mcp`, with the key in the `X-API-Key` header and never in the URL. The URL picks the graph: `sec` for the public SEC repository, your graph id for your own

```bash
claude mcp add --transport http robosystems-sec \
  https://api.robosystems.ai/v1/graphs/sec/mcp \
  --header "X-API-Key: <your key>"
```

The app's MCP page has the snippet for each client. The bridge authenticates with an API key only, so it connects to a per-graph URL, never to the OAuth endpoints.

## Install

No install step: MCP clients run it through `npx`. Tested on Node.js 22, 24 and 26.

```json
{
  "mcpServers": {
    "robosystems": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp@latest"],
      "env": {
        "ROBOSYSTEMS_API_KEY": "<your key>",
        "ROBOSYSTEMS_GRAPH_ID": "sec"
      }
    }
  }
}
```

This is the shape of `claude_desktop_config.json` and of other clients that take stdio `command` entries. Keep `@latest` in the arguments: a global `npm install -g @robosystems/mcp` can shadow `npx` and pin an old version.

## Configuration

The bridge reads four environment variables and takes no command-line arguments.

| Variable               | Purpose                                                                                                                   | Default                      |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------- |
| `ROBOSYSTEMS_API_KEY`  | API key, sent as `X-API-Key`; account-wide or scoped to one graph                                                         | none                         |
| `ROBOSYSTEMS_GRAPH_ID` | The graph to connect: `sec`, a graph id, or a subgraph id such as `kg…_dev`. Required unless `ROBOSYSTEMS_MCP_URL` is set | none                         |
| `ROBOSYSTEMS_API_URL`  | Base URL the endpoint is derived from: `{ROBOSYSTEMS_API_URL}/v1/graphs/{ROBOSYSTEMS_GRAPH_ID}/mcp`                       | `https://api.robosystems.ai` |
| `ROBOSYSTEMS_MCP_URL`  | Full endpoint URL. Overrides the derived one, and needs no graph id                                                       | derived                      |

For a self-hosted stack, set `ROBOSYSTEMS_API_URL` to its address (`http://localhost:8000` in local development), or point `ROBOSYSTEMS_MCP_URL` at the full per-graph URL. See [Authentication & API Keys](https://robosystems.ai/docs/technical/authentication-and-api-keys) and [Self-Hosting on a Server](https://robosystems.ai/docs/technical/self-hosting-on-a-server).

## Documentation

- **MCP**: [AI Operators & MCP](https://robosystems.ai/docs/technical/ai-operators-and-mcp)
- **Technical docs**: [robosystems.ai/docs/technical](https://robosystems.ai/docs/technical)
- **Related**: [RoboSystems](https://github.com/RoboFinSystems/robosystems) · [Python client](https://github.com/RoboFinSystems/robosystems-python-client) · [TypeScript client](https://github.com/RoboFinSystems/robosystems-typescript-client)

## Support

- [Issues](https://github.com/RoboFinSystems/robosystems-mcp-client/issues) · [Discussions](https://github.com/orgs/RoboFinSystems/discussions) · [Projects](https://github.com/orgs/RoboFinSystems/projects)
- [CONTRIBUTING.md](.github/CONTRIBUTING.md): branch conventions, coding standards and the pull request process

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2026 RFS LLC
