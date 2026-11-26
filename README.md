# RoboSystems MCP Client

[![npm version](https://badge.fury.io/js/@robosystems%2Fmcp.svg)](https://www.npmjs.com/package/@robosystems/mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**The stdio bridge to the MCP server of [RoboSystems](https://github.com/RoboFinSystems/robosystems), the open-source knowledge graph for finance.** Every graph is an MCP server over the Streamable HTTP transport; `@robosystems/mcp` connects a stdio MCP client to them with an API key. It runs in one of two modes:

- **Catalog**: one connection for every graph your key reaches. Four tools take the graph as an argument, so you can work across graphs and use a subgraph the moment it is created
- **Proxy**: one connection for one graph. The bridge forwards every message unchanged, and the tools and instructions are the server's own

Diagnostics go to stderr, including a notice at startup when a newer version is on npm.

## Connect directly if one graph is enough

An MCP client with HTTP transport does not need this package to reach a single graph. Connect it to the hosted server instead:

- **OAuth**: `https://api.robosystems.ai/v1/mcp`. Sign in and choose the graph on the consent screen. `https://api.robosystems.ai/v1/mcp/roboledger` is the same for RoboLedger graphs, with the accounting tools only
- **API key**: `https://api.robosystems.ai/v1/graphs/{graph_id}/mcp`, with the key in the `X-API-Key` header and never in the URL. The URL picks the graph: `sec` for the public SEC repository, your graph id for your own

```bash
claude mcp add --transport http robosystems-sec \
  https://api.robosystems.ai/v1/graphs/sec/mcp \
  --header "X-API-Key: <your key>"
```

The app's MCP page has the snippet for each client. A direct connection is one graph: each further graph or subgraph is another connection. The bridge authenticates with an API key only, never through the OAuth endpoints.

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

This is the shape of `claude_desktop_config.json` and of other clients that take stdio `command` entries. With the key alone the bridge runs as a catalog; add `ROBOSYSTEMS_GRAPH_ID` to proxy one graph. Keep `@latest` in the arguments: a global `npm install -g @robosystems/mcp` can shadow `npx` and pin an old version.

## Catalog mode

The bridge serves four tools, the same on every connection:

| Tool              | Does                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `list-graphs`     | Lists the graphs the connection reaches, with the id or alias to pass as `graph`                                         |
| `get-tools`       | For one graph: the index of its tools and its instructions; with `names`, the full description and input schema of those |
| `call-read-tool`  | Runs one of a graph's read tools                                                                                         |
| `call-write-tool` | Runs one of a graph's write tools                                                                                        |

Every call names its graph. There is no current graph and nothing to switch, so two conversations sharing one bridge cannot redirect each other. Each call is forwarded to that graph's own endpoint with your key, where the server checks access as it does for a direct connection.

A subgraph is a graph: `create-subgraph` on the parent (through `call-write-tool`) returns an id that works as `graph` on the next call. The read and write split follows the hints the server publishes for each tool, so a client can approve reads without prompting and still show each write by name.

To limit a connection to some graphs, and to name them, set `ROBOSYSTEMS_GRAPH_IDS`:

```json
"env": {
  "ROBOSYSTEMS_API_KEY": "<your key>",
  "ROBOSYSTEMS_GRAPH_IDS": "books=kg1a2b3c4d5e6f7a8b9c0d,sec"
}
```

Each entry is a graph id or `alias=id`. The connection then reaches those graphs and their subgraphs, and refuses any other. A key scoped to one graph cannot list the account, so set its graph here.

## Configuration

The bridge reads five environment variables and takes no command-line arguments.

| Variable                | Purpose                                                                                     | Default                      |
| ----------------------- | ------------------------------------------------------------------------------------------- | ---------------------------- |
| `ROBOSYSTEMS_API_KEY`   | API key, sent as `X-API-Key`; account-wide or scoped to one graph. Required in catalog mode | none                         |
| `ROBOSYSTEMS_GRAPH_IDS` | Catalog mode: the graphs to reach, as ids or `alias=id` pairs separated by commas           | every graph the key reaches  |
| `ROBOSYSTEMS_GRAPH_ID`  | Proxy mode: the one graph to connect, `sec`, a graph id, or a subgraph id such as `kg…_dev` | none                         |
| `ROBOSYSTEMS_API_URL`   | Base URL of the API. A graph's endpoint is `{ROBOSYSTEMS_API_URL}/v1/graphs/{graph_id}/mcp` | `https://api.robosystems.ai` |
| `ROBOSYSTEMS_MCP_URL`   | Proxy mode: a full endpoint URL. Overrides the derived one, and needs no graph id           | derived                      |

Setting `ROBOSYSTEMS_GRAPH_ID` or `ROBOSYSTEMS_MCP_URL` selects proxy mode. For a self-hosted stack, set `ROBOSYSTEMS_API_URL` to its address (`http://localhost:8000` in local development). See [Authentication & API Keys](https://robosystems.ai/docs/technical/authentication-and-api-keys) and [Self-Hosting on a Server](https://robosystems.ai/docs/technical/self-hosting-on-a-server).

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
