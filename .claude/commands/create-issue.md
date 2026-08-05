---
description: Create a GitHub issue from the repo's templates, with the right type and labels.
argument-hint: '[what the issue is about]'
---

Create a GitHub issue for the current repository based on the user's input.

## Instructions

1. **Check you're in the right repo first** - This package is a **stdio MCP bridge**: it exposes the RoboSystems HTTP API as MCP tools for Claude Desktop, Claude Code, Cursor, and other MCP clients. It holds almost no domain logic of its own. Before filing here, work out which layer the bug is in:
   - **Wrong data, a failing query, a missing capability** — that's the API. File it in `RoboFinSystems/robosystems`. The bridge only forwarded what it was given.
   - **The tool contract** — a tool's name, description, input schema, or how a response is shaped for the agent — belongs here. So does anything about how a tool's description reads to a model, which is this package's real product surface.
   - **Transport and resilience** — SSE and NDJSON handling, connection pooling, retries, caching, progress reporting, resource cleanup — belongs here.
   - **Configuration and startup** — `ROBOSYSTEMS_API_URL`, `ROBOSYSTEMS_API_KEY`, `ROBOSYSTEMS_GRAPH_ID`, the stale-version check — belongs here.
   - **The hosted remote MCP endpoint** (`/v1/graphs/{graph_id}/mcp`) is a different implementation living in the API repo. A bug that reproduces there and not through this bridge is not this repo's.

   Ask which path the reporter used before assuming — the README recommends the hosted endpoint, so "MCP is broken" often isn't about this package at all.

2. **Determine Issue Type** - Based on the user's description, pick one:
   - **Bug**: Defects or unexpected behavior
   - **Task**: Specific, bounded work items that can be completed in one PR
   - **Feature**: Request a new capability (no design required)
   - **RFC**: Propose a design for discussion before implementation
   - **Spec**: Approved implementation plan ready for execution

   Confirm what this repo actually offers before assuming — `ls .github/ISSUE_TEMPLATE/` for the templates and `gh issue create --help` for whether `--type` is supported.

3. **Gather Context** - If the user provides a file path or references existing code:
   - Read the relevant part of `index.js` — the server is a single file, so "where does this live" is usually one grep away
   - Check `index.test.js` for whether the behavior is already covered
   - Review any referenced documentation

4. **Draft the Issue** - Read the matching YAML template in `.github/ISSUE_TEMPLATE/` and mirror its structure. Each template declares its own `type:` in frontmatter and marks which fields are required — read the file rather than guessing the sections. Fill the optional fields too where you have the information; they're the ones that make an issue actionable later.

   Note `gh issue create --title/--body` **bypasses templates entirely** — nothing prefills and nothing validates. That's exactly why the body has to be hand-matched to the template structure.

   For a bug here, the reproduction needs things a normal bug report omits, because the failure is mediated by an AI client:
   - **Which MCP client** (Claude Desktop, Claude Code, Cursor, other) and its version.
   - **The version of this package that actually ran.** Users launch it via `npx -y @robosystems/mcp@latest`, but a global `npm i -g @robosystems/mcp` shadows that and silently pins an old version — the startup stale-version warning on stderr is the tell. Ask for it.
   - **The tool call**, not just the prompt: which tool, with what arguments. A model's phrasing is not a reproduction.
   - **stderr output.** This is a stdio server, so stderr is where its diagnostics go; the MCP client's log file is usually the only place the user can see them.

5. **Sanitize for Public Visibility** - This repo is public and the issue is world-readable immediately. Before creating:
   - Remove `ROBOSYSTEMS_API_KEY` values — MCP configuration blocks are pasted into issues constantly and they contain the key inline. Check every JSON snippet.
   - Remove graph IDs, customer names, and real financial payloads; reconstruct with dummy values.
   - Remove internal pricing, margins, or cost details.
   - For anything security-adjacent, keep the text terse and non-actionable — no exploit mechanics, no endpoint enumerations, no payloads. For coordinated disclosure use a private GitHub Security Advisory, never a public issue.
   - Keep ordinary technical implementation details (these are fine to share)

6. **Create the Issue** - One command, with the type set inline:

   ```bash
   gh issue create \
     --type <Bug|Task|Feature|RFC|Spec> \
     --title "<clear, concise title>" \
     --body-file /tmp/issue-body.md \
     --label "<labels>"
   ```

   No prefixes like `[SPEC]` in the title — the type handles categorization. Write the body to a file rather than inlining it, to avoid shell-escaping problems.

   To change the type on an **existing** issue: `gh issue edit <n> --type <Type>` (or `--remove-type`).

## Labels

Issue types handle primary categorization; labels carry the metadata. Always enumerate what actually exists rather than working from memory — and raise the limit, since the default truncates at 30:

```bash
gh label list --limit 100
```

The families to expect in this repo:

- **`area:*`** — the primary routing dimension: `tools` (the MCP tool surface), `resources`, `api` (the HTTP bridge to RoboSystems), `auth`, `errors`, `types`, `docs`, `testing`, `ci-cd`. **Always apply one.**
- **`priority:*`** — when to do it. Note the ladder is `critical` / `high` / `low` — there is **no `priority:medium`**.
- **`size:*`** — rough effort: `small` (< 1 day), `medium` (1–3 days), `large` (> 3 days).
- **Status** — `blocked`, `needs-review`.
- `dependencies` and `javascript` also exist; those are Dependabot's, not for hand-filing.

## Questions vs issues

`.github/ISSUE_TEMPLATE/config.yml` disables blank issues and routes open-ended questions to the org's GitHub Discussions. `gh issue create` bypasses that chooser entirely, so apply the intent yourself: if the user's input is a setup question ("how do I connect Claude Desktop?") rather than actionable work, say so and suggest a Discussion instead of filing it.

## Example Usage

User: "Claude keeps calling the wrong tool for balance sheets"

Response: That's a tool-description problem rather than a data problem — let me read the tool definitions...

[Grep index.js for the tool's `name` and `description`; the model's choice is driven by that text]
[Read bug.yml and draft a body matching its structure, with the client, the version that actually ran, and the tool call]
[Create with `gh issue create --type Bug --label area:tools,size:small`]

## Output Format

After creating the issue, provide:

1. The issue URL
2. Brief summary of what was created
3. Issue type and labels applied
4. Whether the fix belongs here or in the API, and any companion issue that should be filed there

$ARGUMENTS
