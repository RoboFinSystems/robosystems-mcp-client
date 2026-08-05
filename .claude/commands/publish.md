---
description: Monitor a release/publish run — diagnose failures, verify the package actually landed on npm.
argument-hint: '[run-id]'
---

Monitor a release and publish run — pinpoint why it failed, and confirm the version actually landed on npm. Releases go through GitHub Actions; this command is about watching and diagnosing them, not replacing the pipeline.

## How a release actually happens here

Two workflows, and the trigger between them is the part that surprises people:

1. **`create-release.yml`** (`workflow_dispatch`, or `npm run release:create`) — reads the current version from `package.json`, computes the next one from the requested bump, commits the bump **to `main`**, cuts `release/<version>` from that commit, and tags it.
2. **`publish.yml`** — triggered by **a push to `release/**`**, not by a merge and not by the tag. It reads the version from `package.json`, checks whether that version already exists on npm, and if not, publishes with `npm publish --provenance --access public` over OIDC trusted publishing.

So: **merging a PR to `main` publishes nothing.** The release branch push is the publishing event. And because `publish.yml` short-circuits when the version already exists on npm, a re-run of a successful publish is a no-op rather than an error — useful, but it also means "the run went green" is not by itself proof that _this_ run published anything.

`tag-release.yml` writes the GitHub release body separately; see `/release-notes` for the curated-notes override.

## Scope & guardrails

- **`gh` reads are free; triggering a release is not.** Reading runs, jobs, and logs (`gh run list/view/watch`) needs no confirmation. **Dispatching `create-release.yml`** is an outward-facing, effectively irreversible action, and it lands harder here than for a library: users launch `npx -y @robosystems/mcp@latest`, so a published version reaches every agent on its next launch with no lockfile in between. An npm version also cannot be unpublished after 72 hours. Confirm the bump type and the ref with the user, and default to watching a run they already started.
- **Never bump `package.json` by hand.** The workflow owns the bump; a hand-bump collides with it and can produce a version that's tagged but never published, or published twice.
- **Never push `main` or `release/*`.** Those are the user's. The pre-push hook blocks them.
- **The user owns the decision to publish a tool-contract change.** Renaming or removing a tool, or reshaping a response, breaks agents mid-conversation the moment it ships. If the change set carries one, say so and stop — don't dispatch.

## 1. Find the run

```bash
gh run list --workflow=publish.yml --limit 5
gh run list --workflow=create-release.yml --limit 5
gh run view <run-id>
gh run watch <run-id>            # live, if it's in flight
```

## 2. Pinpoint the failure

```bash
gh run view <run-id> --log-failed
```

Classify by stage:

- **`create-release.yml` — branch already exists.** The workflow checks for `release/<version>` before creating it. A failure here usually means a previous run got partway, and the fix is to resolve the leftover branch, not to re-dispatch blindly.
- **`create-release.yml` — push to `main` rejected.** The version bump commits directly to a protected branch and needs `ACTIONS_TOKEN`; a permissions failure here looks like an auth error at the push step.
- **`publish.yml` — "already published".** Not a failure. The version exists on npm, so every subsequent step is skipped by condition. Read it as "nothing to do," and if you expected a publish, the version wasn't bumped.
- **`publish.yml` — install.** `npm install` only; there is no build step, because the published artifact is the source. A failure here is a dependency or registry problem, not a code problem.
- **`publish.yml` — `npm publish`.** OIDC trusted publishing with provenance. Failures are usually the npm-side trust configuration or a version/name mismatch, not the code.

## 3. Verify it actually landed

A green workflow is not proof. Check npm directly:

```bash
npm view @robosystems/mcp version              # latest published — this is what `@latest` now resolves to
npm view @robosystems/mcp versions --json      # full history
npm view @robosystems/mcp dist-tags
```

Then confirm the published artifact actually launches, since `files`/`bin` problems don't fail the publish and a broken package means every user's connector fails to start:

```bash
npm pack @robosystems/mcp@<version> --dry-run     # what actually ships
```

There is **no `--help` or `--version` flag** — the server has no CLI argument handling, so launching it directly just starts a stdio server and blocks. To smoke-test the published version, feed it one MCP request and see whether it answers:

```bash
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' \
  | npx -y @robosystems/mcp@<version> 2>/dev/null | head -c 400
```

A JSON-RPC response means the package launches and the tool surface is intact. No output, or a stack trace on stderr, means the artifact is broken for every user — treat it as a live incident, since `@latest` is already pointing at it.

If the release changed the tool contract, users don't adopt it — it adopts them, on their next launch. Say plainly what agents will now see differently. And note the one case where a publish _doesn't_ reach someone: a global `npm i -g @robosystems/mcp` shadows `npx -y` and silently pins an old version, which is exactly what the startup stale-version check on stderr exists to surface.

## Output

A short status: which workflow, what failed and at which step, the root cause, the re-run link if any, and the verified published version from `npm view`. If nothing failed, say so — don't manufacture work.

$ARGUMENTS
