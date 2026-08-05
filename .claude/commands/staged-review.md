---
description: Review the staged diff against this MCP server's tool contract, transport, and publishing rules.
---

Review all staged changes (`git diff --cached`) with focus on the contexts below. Read the diff first — if nothing is staged, say so rather than reviewing the working tree.

This is `@robosystems/mcp`: the **stdio MCP server** bridging the RoboSystems HTTP API to Claude Desktop, Claude Code, Cursor, and other MCP clients. It is hand-written — a single `index.js` with a single `index.test.js` — and it is a **public repository**. Users launch it as `npx -y @robosystems/mcp@latest`, so whatever ships reaches every agent on its next launch with no lockfile in between.

## Tool contract

The tool surface is the product. For anything staged that touches a tool definition:

- Is a tool renamed or removed, an input schema changed, or a response reshaped? Agents that learned the old shape break immediately, and in-flight conversations can break mid-session. That needs to be deliberate and stated, not incidental.
- **Descriptions are behavior, not prose.** A model decides whether and how to call a tool entirely from its `description` and parameter docs. Review a description change the way you'd review code: does it still say when _not_ to use the tool? Does it disambiguate from neighbouring tools? Treating this as copy-editing is the most common miss in this repo.
- Does a schema change come with the matching description change? A schema and a description that disagree is worse than either being wrong alone.
- Is a new tool worth its context cost? Every tool is loaded into every agent's context on every session.

## Right layer

- Is this fixing a bridge problem, or compensating for an API problem? Response reshaping added here to patch over API output is a workaround that has to be maintained forever — flag it and point at `RoboFinSystems/robosystems`.
- The hosted remote MCP endpoint (`/v1/graphs/{graph_id}/mcp`) is a separate implementation in the API repo. A fix that belongs to both should be filed against both, not silently forked here.

## Transport, streaming, and resources

This is where the real bugs are:

- SSE and NDJSON handling: does every path that opens a connection close it — including on error, on abort, and on early return? A leaked `EventSource` in a long-lived stdio server accumulates for the whole session.
- Connection pooling and LRU eviction: does the change respect the pool's bounds, or can it grow unbounded under an unusual call pattern?
- Retries: is the backoff bounded, and does it avoid retrying non-idempotent calls or non-retryable statuses?
- Caching: is anything cached that shouldn't be — user-scoped or graph-scoped data under a key that doesn't include the scope is a cross-tenant leak.
- Progress reporting on long operations: still emitted, and still on the right channel?

## stdio discipline

- **stdout is the MCP protocol channel.** Anything written there that isn't protocol corrupts the session. A stray `console.log` is not a style issue here — it's a broken connector.
- stderr is the log, and it lands in the user's MCP client log file. Keep it useful and keep credentials out of it.

## Auth and secrets

- `ROBOSYSTEMS_API_KEY` handling and header construction: is the key ever logged, stringified into an error, or echoed back in a tool response? Tool responses go into a model's context and from there into a transcript.
- No API keys, graph IDs, or real financial payloads in tests, fixtures, or comments. Fixtures should be invented.

## Errors

- When the API fails, does the tool return something the **model** can act on — a clear message it can relay or retry from — rather than an opaque stack trace? Error text here is read by an agent, not a developer.
- Are failures distinguishable? "Not authorized," "graph not found," and "the API is down" should not collapse into one generic error.

## Configuration and startup

- New environment variables need to appear in the README's configuration block; an undocumented one may as well not exist, since users configure this through a JSON snippet they copy.
- Changes to `package.json` `bin`/`files`, the shebang, or the Node version expectation affect whether `npx` can launch it at all. A failure here is total: the server never starts and the user sees only a broken connector.
- Never stage a `package.json` version bump in a feature branch: `create-release.yml` owns the bump on `main`, and pushing `release/**` is what triggers `publish.yml`.

## Testing

- Does new behavior have a test? The gate has **no typecheck and no build** — this is plain JS, so vitest is the only thing between a typo and a published release.
- Do tests cover the error and abort paths, not just the happy one?
- Is the test asserting correct behavior, or just asserting what the code currently does?

## Public-repo hygiene

- No customer names, graph IDs, internal cost/pricing detail, or real financial payloads in code, comments, or fixtures.
- If the change fixes a security issue, keep commit messages and comments terse and non-actionable — the area hardened, never the mechanism.

## Output

Provide a summary with:

1. **Agent-facing impact**: TOOL CONTRACT / TOOL DESCRIPTION / ADDITIVE / INTERNAL, and for a contract change, what breaks for an agent already using it
2. **Issues**: Problems that should be fixed before commit
3. **Suggestions**: Improvements that aren't blocking
4. **Questions**: Anything unclear that needs clarification

Anchor each finding to `file:line`. If the staged diff is clean, say so plainly rather than manufacturing findings.
