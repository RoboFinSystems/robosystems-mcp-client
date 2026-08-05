Draft curated release notes for an upcoming milestone release, following the convention in `.github/release-notes/README.md`.

## Why this command exists

`tag-release.yml` generates release bodies from the changes since the last tag. That suits routine releases but reads poorly for milestones, where the story is what the version _is_. The curated-notes override has non-obvious rules (body-only format, the file must exist at the tagged ref), and these notes are read by everyone who upgrades a published npm package — this command encodes the review and hygiene checks that keep them accurate and safe to publish.

## Instructions

### 1. Decide whether to curate at all

Not every release deserves curated notes. Routine patch releases should keep the generated changelog — skipping is a normal outcome, not a failure. Curate when the release is a milestone: a minor that changes the tool surface, a headline capability, the 1.0 graduation, or a version the documentation will reference. If the user invoked this command for a plain patch, say so and confirm they still want curated notes.

### 2. Establish the version and the range

- The target version comes from the argument (e.g. `/release-notes 0.4.0`). If none was given, ask what version the user intends to tag — the filename must match the eventual tag exactly, and a mismatched file is silently ignored. Derive it from the current `package.json` version plus the bump type the user will dispatch (`0.3.12` + `minor` → `0.4.0`).
- **Never bump the version yourself.** `create-release.yml` bumps `package.json` on `main` as its first step and derives the tag from the result — a hand-bump collides with it.
- **The range depends on the release kind.** A minor memorializes the whole series since the _previous minor_ (`vX.(Y-1).0..origin/main`) — patches got generated changelogs; the minor is the digest nobody gets from reading a dozen of them. A curated patch or hotfix covers only the span since the last tag:

```bash
LAST=$(git tag --sort=-creatordate | head -1)          # patch: last tag
# minor: previous minor tag, e.g. v0.3.0 when cutting v0.4.0
git log "$RANGE_START"..origin/main --merges --format='%s'
gh pr list --state merged --limit 30 --json number,title,mergedAt
```

Note the generated links section will still compare against the last tag; the prose should state the span it covers (e.g. "since v0.3.0") explicitly.

### 3. Review the changes for real

Do not write notes from commit subjects alone. Read the PR bodies (`gh pr view <n>`) and spot-check diffs where the description is thin. Classify everything into tool-surface changes, fixes, and internals, then check specifically:

- **The tool surface.** This is what an agent actually sees: tool names, argument shapes, descriptions, and the handshake. Renaming or removing a tool, or changing what an argument means, breaks running agent configurations even though this package is pre-1.0 and owes no formal semver promise. Anything in that category leads the notes.
- **Client configuration.** Changes to how the server is registered — command, args, environment variables, API-key handling, workspace/graph selection — mean users have to edit their client config. Say so explicitly and show the new shape.
- **Upstream API coupling.** The server is a bridge to the RoboSystems API. If a new tool or argument only works against an API version that isn't deployed yet, the notes must say so — users will try it the day they upgrade.
- **Hosted vs. stdio path.** The hosted remote MCP endpoint and this npx bridge are two ways in. If a change applies to only one of them, name which; conflating them sends users down the wrong path.
- **Runtime floors.** A raised Node floor is an upgrade blocker for someone. Note it.

### 4. Security disclosure review

This repo is public and the release publishes to npm in the same run, so the notes are world-readable immediately. For any security-adjacent change:

- Keep the line at PR-title neutrality: what area was hardened, never how or against what.
- No exploit mechanics, no affected-endpoint enumerations, no detection signatures or thresholds, no "previously protected only by X" tells.
- Never paste content from private analysis documents into the notes.
- Credential handling deserves particular care: say that key handling was hardened, never where it used to leak.
- When in doubt, terser.

### 5. Write the file

Write `.github/release-notes/v<version>.md` — **body only**:

- No `# RoboSystems SDK v<version>` heading (that is the heading this repo's workflow emits), no release-statistics section, no links section, no generated-with footer. The workflow supplies all of those. Start at the first line of prose.
- Lead with one or two sentences saying what the version is. Then sections as warranted: tool-surface changes, key features, breaking changes (only if any truly exist), bug fixes. Ground every line in a change you actually reviewed.

### 6. Hand off — sequencing matters

The file must exist **at the tagged ref**, and there is no window to add it late: `create-release.yml` bumps the version on `main`, cuts `release/<version>` from the result, and tags it in the same run. Pushing that release branch is also what triggers `publish.yml`, so by the time the package is on npm the notes are already fixed. They have to be **merged into `main` before the workflow is dispatched**.

Write the draft on a feature branch (created via `npm run feature:create`), never on `main`. Present it for review and leave the merge and the dispatch to the user.
