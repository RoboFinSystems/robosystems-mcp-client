# RoboSystems MCP Bridge

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The stdio bridge to the MCP server of [RoboSystems](https://github.com/RoboFinSystems/robosystems), the open-source knowledge graph for finance.** RoboSystems serves MCP over the Streamable HTTP transport; `@robosystems/mcp` connects a client that only runs local stdio servers to it, with an API key. It forwards every message unchanged, so the tools and instructions are the server's own. It connects one of two endpoints:

- **Every graph** (the default): one connection for every graph your key reaches. Four tools take the graph as an argument, so you can work across graphs and use a subgraph the moment it is created
- **One graph**: that graph's own tools, with `ROBOSYSTEMS_GRAPH_ID` set

Diagnostics go to stderr, including a notice at startup when a newer version is on npm.

## Connect directly if your client speaks HTTP

An MCP client with HTTP transport does not need this package. Connect it to the hosted server instead:

- **OAuth**: `https://api.robosystems.ai/v1/mcp`. Sign in and choose the graph on the consent screen. `https://api.robosystems.ai/v1/mcp/roboledger` is the same for RoboLedger graphs, with the accounting tools only
- **API key, every graph**: `https://api.robosystems.ai/v1/mcp/graphs`, with an account-wide key in the `X-API-Key` header and never in the URL. This is the endpoint the bridge connects by default
- **API key, one graph**: `https://api.robosystems.ai/v1/graphs/{graph_id}/mcp`. The URL picks the graph: `sec` for the public SEC repository, your graph id for your own

```bash
claude mcp add --transport http robosystems \
  https://api.robosystems.ai/v1/mcp/graphs \
  --header "X-API-Key: <your key>"
```

The app's MCP page has the snippet for each client. The bridge is for clients that cannot do this: ones that only take stdio `command` entries, or that cannot send a header. It authenticates with an API key only, never through the OAuth endpoints.

## Install

No install step: MCP clients run it through `npx`. Tested on Node.js 22, 24 and 26.

```json
{
  "mcpServers": {
    "robosystems": {
      "command": "npx",
      "args": ["-y", "@robosystems/mcp@latest"],
      "env": {
        "ROBOSYSTEMS_API_KEY": "<your key>"
      }
    }
  }
}
```

This is the shape of `claude_desktop_config.json` and of other clients that take stdio `command` entries. With the key alone the bridge reaches every graph; add `ROBOSYSTEMS_GRAPH_ID` to connect one graph. Keep `@latest` in the arguments: a global `npm install -g @robosystems/mcp` can shadow `npx` and pin an old version.

## Every graph

The server serves four tools on this endpoint, the same on every connection:

| Tool              | Does                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `list-graphs`     | Lists the graphs the connection reaches, with the id or alias to pass as `graph`                                         |
| `get-tools`       | For one graph: the index of its tools and its instructions; with `names`, the full description and input schema of those |
| `call-read-tool`  | Runs one of a graph's read tools                                                                                         |
| `call-write-tool` | Runs one of a graph's write tools                                                                                        |

Every call names its graph. There is no current graph and nothing to switch, so two conversations sharing one bridge cannot redirect each other. The server checks your key's access to the named graph on each call, as it does for a direct connection.

This needs an account-wide key and a server that serves `/v1/mcp/graphs`. A key scoped to one graph connects that graph with `ROBOSYSTEMS_GRAPH_ID`. For a self-hosted stack that predates the endpoint, upgrade it, or run the last bridge with the catalog built in (`@robosystems/mcp@1.0`). The bridge says which at startup and exits.

A subgraph is a graph: `create-subgraph` on the parent (through `call-write-tool`) returns an id that works as `graph` on the next call. The read and write split follows the hints the server publishes for each tool, so a client can approve reads without prompting and still show each write by name.

To limit a connection to some graphs, and to name them, set `ROBOSYSTEMS_GRAPH_IDS`:

```json
"env": {
  "ROBOSYSTEMS_API_KEY": "<your key>",
  "ROBOSYSTEMS_GRAPH_IDS": "books=kg1a2b3c4d5e6f7a8b9c0d,sec"
}
```

Each entry is a graph id or `alias=id`. The connection then reaches those graphs and their subgraphs, and refuses any other.

### Read-only

Text a model reads from one graph can try to steer a write on another. Two settings take writes off the table:

- `ROBOSYSTEMS_READ_ONLY=true` makes the whole connection read-only: `call-write-tool` is not listed and cannot be called
- A `:ro` suffix in `ROBOSYSTEMS_GRAPH_IDS` does the same for one graph and its subgraphs: `books=kg1a2b3c4d5e6f7a8b9c0d,sec:ro`

Either way the graph's write tools are left out of `get-tools`, and the server still enforces what the key itself may do.

## Configuration

The bridge reads six environment variables and takes no command-line arguments. `ROBOSYSTEMS_GRAPH_IDS` and `ROBOSYSTEMS_READ_ONLY` are passed to the server, which applies them.

| Variable                | Purpose                                                                                     | Default                      |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| `ROBOSYSTEMS_API_KEY`   | API key, sent as `X-API-Key`. Reaching every graph takes an account-wide key                | none                         |
| `ROBOSYSTEMS_GRAPH_IDS` | Every graph: the graphs to reach, as ids or `alias=id` pairs separated by commas            | every graph the key reaches  |
| `ROBOSYSTEMS_READ_ONLY` | Every graph: `true` withholds every write tool                                              | `false`                      |
| `ROBOSYSTEMS_GRAPH_ID`  | One graph: the graph to connect, `sec`, a graph id, or a subgraph id such as `kg…_dev`      | none                         |
| `ROBOSYSTEMS_API_URL`   | Base URL of the API. A graph's endpoint is `{ROBOSYSTEMS_API_URL}/v1/graphs/{graph_id}/mcp` | `https://api.robosystems.ai` |
| `ROBOSYSTEMS_MCP_URL`   | A full endpoint URL. Overrides the derived one, and needs no graph id                       | derived                      |

Setting `ROBOSYSTEMS_GRAPH_ID` or `ROBOSYSTEMS_MCP_URL` connects that one endpoint, and `ROBOSYSTEMS_GRAPH_IDS` and `ROBOSYSTEMS_READ_ONLY` are then ignored. For a self-hosted stack, set `ROBOSYSTEMS_API_URL` to its address (`http://localhost:8000` in local development). See [Authentication & API Keys](https://robosystems.ai/docs/technical/authentication-and-api-keys) and [Self-Hosting on a Server](https://robosystems.ai/docs/technical/self-hosting-on-a-server).

## Documentation

- **MCP**: [AI Operators & MCP](https://robosystems.ai/docs/technical/ai-operators-and-mcp)
- **Technical docs**: [robosystems.ai/docs/technical](https://robosystems.ai/docs/technical)
- **Related**: [RoboSystems](https://github.com/RoboFinSystems/robosystems) · [Python client](https://github.com/RoboFinSystems/robosystems-python-client) · [TypeScript client](https://github.com/RoboFinSystems/robosystems-typescript-client)

## Support

- [Issues](https://github.com/RoboFinSystems/robosystems-mcp-bridge/issues) · [Discussions](https://github.com/orgs/RoboFinSystems/discussions) · [Projects](https://github.com/orgs/RoboFinSystems/projects)
- [CONTRIBUTING.md](.github/CONTRIBUTING.md): branch conventions, coding standards and the pull request process

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

MIT © 2026 RFS LLC
