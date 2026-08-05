---
description: Review a pull request — gather metadata, diff, and existing feedback, then give a verdict.
argument-hint: '[pr-number-or-url]'
---

Review a pull request by gathering all PR metadata, diff, and review comments, then provide a comprehensive review summary.

## Instructions

### 1. Identify the PR

The user may provide a PR URL, number, or nothing:

- **URL provided** (e.g., `https://github.com/RoboFinSystems/robosystems-mcp-client/pull/42`): Extract the repo and PR number
- **Number provided** (e.g., `42`): Use the current repository
- **Nothing provided**: Detect from the current branch using `gh pr view --json number,url` — if no open PR exists for the current branch, ask the user which PR to review

### 2. Gather PR Data

Run these `gh` commands to collect all context:

```bash
# PR metadata + conversation comments in one call
gh pr view <NUMBER> --json number,url,title,body,author,state,isDraft,labels,comments,reviews,reviewDecision,latestReviews,reviewRequests,statusCheckRollup,mergeStateStatus,headRefName,headRefOid,baseRefName,additions,deletions,changedFiles,files,closingIssuesReferences,createdAt,updatedAt

# PR diff (the actual code changes)
gh pr diff <NUMBER>

# Inline review comments — no --json equivalent exists, so this call is still required
gh api repos/$(gh repo view --json nameWithOwner -q .nameWithOwner)/pulls/<NUMBER>/comments --paginate
```

**Field notes:**

- `reviews` not `reviewers` — `reviewers` is not a valid field and errors.
- `reviewDecision` is the single field that answers "has this been approved."
- `comments` covers the top-level conversation, so no separate `issues/<n>/comments` call is needed.
- `files` is rarely interesting here — the server is one `index.js` plus one test file, so almost every PR touches the same two paths. Read the diff, not the file list.
- Keep `--paginate` **bare**. Adding `-q`/`--jq` makes gh emit one JSON document _per page_ instead of a merged array, and `--slurp` can't be combined with `--jq`. Pipe to `jq` after the call, not through it.

### 3. Categorize Review Feedback

Organize all comments and checks into categories:

- **Human Reviews**: Comments from human reviewers (approve, request changes, general feedback)
- **AI Reviews**: Comments from Claude, Copilot, or other AI review bots
- **Code Quality**: Comments from linters, formatters, type checkers
- **Security**: Findings from security scanners (Dependabot, CodeQL)
- **CI/CD**: Build status, test results

**How feedback actually arrives in this repo** — don't read the categories too literally:

- Formal `reviews` and inline `pulls/<n>/comments` are typically **empty**, and `reviewDecision` is usually blank. That's the norm here, not a signal that review was skipped. Don't report "no review feedback" on the strength of an empty `reviews` array.
- **AI review is opt-in.** `claude.yml` only fires on an explicit `@claude` mention from an `OWNER`/`MEMBER`/`COLLABORATOR` — there is no automatic review on PR open. When it has run, the findings are a **bot comment in the conversation `comments`**, not a formal review.
- In `statusCheckRollup`, checks expose `.name` while legacy statuses expose `.context`, and a `conclusion` of `NEUTRAL` or `SKIPPED` is not a failure. Read the conclusion, don't pattern-match on non-`SUCCESS`.
- Note what CI does **not** cover: there is no typecheck and no build (plain JS), and no test touches a live API. Green CI means "the unit tests pass," not "the bridge works against the API."

### 4. Review the Diff

With the full PR diff in hand, perform your own review focusing on:

- **Tool contract first.** Users launch this via `npx -y @robosystems/mcp@latest`, so whatever merges and ships reaches every agent on its next launch with no lockfile in between. Does the diff rename or remove a tool, change an input schema, or reshape a response? That breaks agents immediately — treat it as blocking unless it's deliberate and stated.
- **Tool descriptions are behavior, not prose.** A model decides whether and how to call a tool entirely from its `description` and parameter docs. A wording change is a behavior change and deserves the same scrutiny as a code change: does it still say when _not_ to use the tool, and does it disambiguate from its neighbors? Reviewing this as copy-editing is the most common miss in this repo.
- **Right layer.** Is this fixing a bridge problem, or papering over an API problem? Response reshaping added here to compensate for API output is a workaround that has to be maintained forever — flag it and point at the API.
- **Streaming and resource cleanup.** SSE and NDJSON paths, the connection pool, and abort handling are where this server's real bugs live. Does every path that opens a connection close it, including on error and on abort? A leaked EventSource in a long-lived stdio server accumulates for the whole session.
- **Correctness**: does the code do what the PR description says?
- **Auth and secrets**: `ROBOSYSTEMS_API_KEY` handling and header construction. This is a **stdio** server: stdout is the MCP protocol channel and stderr is the log. Anything written to stdout that isn't protocol corrupts the session, and anything logged to stderr lands in the user's client log file — so a dumped request object is both a protocol hazard and a credential leak.
- **Error handling**: are API errors mapped to something a consumer can branch on, or swallowed into a generic throw?
- **Error surfaces**: when the API fails, does the tool return something the _model_ can act on — a clear message it can relay or retry from — rather than an opaque stack trace? Error text here is read by an agent, not a developer.
- **Packaging and startup**: changes to `package.json` `bin`/`files`, the shebang, or Node version expectations affect whether `npx` can launch it at all. A failure here is total — the server never starts and the user sees only a broken connector.
- **Tests**: are changes covered? Read the test, don't trust that it's green — a test that asserts the buggy behavior passes just as happily as a correct one.
- **Disclosure hygiene** (this repo is public): does the PR _text_ over-disclose? A security-fix description should name the area hardened, never the mechanism. Because users run `@latest`, a patch reaches them quickly — flag whether one is needed rather than assuming the merge is sufficient.
- **Missing changes**: a new tool without a test, a new environment variable undocumented in the README's configuration block, or a tool whose description wasn't updated alongside its schema.

### 5. Output Format

Provide a structured review:

```
## PR Summary
**Title**: ...
**Author**: ... | **Branch**: ... → ...
**Status**: ... | **Changes**: +X / -Y across Z files

<Brief summary of what the PR does>

## Agent-facing impact
<TOOL CONTRACT / TOOL DESCRIPTION / ADDITIVE / INTERNAL — and for a contract change, exactly what breaks for an agent already using it>

## Existing Review Feedback

### Human Reviews
<Summarize human reviewer comments and their status>

### AI Reviews
<Summarize AI review comments — highlight unresolved items>

### Code Quality
<Summarize code quality bot findings>

### Security
<Summarize security scanner findings — flag anything critical>

### CI/CD Status
<Pass/fail status of all checks>

## My Review

### Issues (should fix before merge)
<Numbered list of problems found>

### Suggestions (non-blocking improvements)
<Numbered list of suggestions>

### Questions
<Anything unclear that needs clarification>

## Verdict
<APPROVE / REQUEST_CHANGES / NEEDS_DISCUSSION — with brief rationale>
```

### Notes

- Read tool definitions in full — schema and description together. A schema that changed without its description is a mismatch a model will trip on
- For security findings, always err on the side of flagging — false positives are better than missed vulnerabilities
- Cross-reference the PR description with the actual diff to catch scope creep or an unstated tool-contract change
- If the PR references an issue (`closingIssuesReferences`), check that the issue requirements are met

$ARGUMENTS
