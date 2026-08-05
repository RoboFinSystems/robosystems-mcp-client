## Summary

<!-- What this PR does and why. Ground it in the actual change, not the diff mechanics. -->

## Changes

<!-- The substantive changes, grouped by area: tool definitions, transport/resilience,
     configuration, tests. Call out anything reviewers should look at closely. -->

-

## Agent-facing impact

<!-- Required judgment, not an optional section. Users launch this via `npx -y @robosystems/mcp@latest`,
     so whatever ships reaches every agent on its next launch — there is no lockfile in between.
     - TOOL CONTRACT: a tool renamed or removed, an input schema changed, a response reshaped.
       Breaks agents immediately and can break conversations mid-session. Say what changes for them.
     - TOOL DESCRIPTION: wording changes to a tool's description or parameter docs. Not cosmetic —
       that text is the entire basis on which a model decides whether and how to call the tool.
       Say what you expect it to change about tool selection.
     - ADDITIVE: a new tool or optional parameter. Note that every tool costs context in every session.
     - INTERNAL: transport, caching, retries, tests. State whether any tool's observable behavior changed. -->

INTERNAL

## Testing

<!-- How the change was verified. Run `npm run test:all` (validate -> test) before opening. Note the
     gate has NO typecheck and NO build — this is plain JS published as source, so vitest is the only
     thing between a typo and a published release. No test touches a live API, so say whether this was
     exercised end to end against a running one. "Not run" is a valid answer. -->
