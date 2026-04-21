Run `npm run test:all` and systematically fix all failures to achieve 100% completion.

## Timeouts

Use `timeout: 300000` (5 minutes) on Bash calls for `npm run test:all`. The default 2-minute Bash timeout can be too short — prettier walks the tree and the full suite runs vitest + format + lint sequentially.

## Strategy

1. **Run full suite first**: use the grep pattern below to extract the signal. Prettier's file-by-file output buries earlier vitest results.
2. **Fix in the order `test:all` runs**: prettier (auto-write) → eslint (auto-fix) → eslint check → vitest. The script short-circuits on the first failure.
3. **Iterate on the failing layer only** before re-running the full suite (see Key Commands below).
4. **Stop when done**: once `npm run test:all` passes, stop immediately. Do NOT re-run to "confirm."

## Output Handling

`npm run test:all` prints many "unchanged" lines from prettier, then vitest output. Filter for the signal:

```
npm run test:all 2>&1 | grep -E "Test Files|Tests |FAIL|✗|×|✖|Error:" | tail -30
```

Captures: vitest summary (`Test Files`, `Tests`), failing files/tests (`FAIL`, `✗`, `×`), ESLint errors (`✖`), and generic `Error:` lines. Absence of any failure marker plus presence of "passed" means success — stop there.

For single-layer commands (below), output is short enough that `| tail -30` alone works.

## Key Commands

**Full suite:**

- `npm run test:all` — validate (format + lint:fix + lint) + test

**Iteration (one layer at a time):**

- `npx vitest run <path>` — run a single test file (fastest feedback)
- `npm run test` — vitest only, no other checks
- `npm run lint` — eslint check (no `--fix`)
- `npm run lint:fix` — eslint auto-fix
- `npm run format:check` — prettier check (no write)
- `npm run format` — prettier auto-write

## Notes

- Vitest uses `✓` for pass and `✗`/`×` for fail, plus a `FAIL` prefix for files containing failures.
- The pre-commit hook runs check-only commands (`format:check`, `lint`, `test`) — if the formatter would have changed a file, the hook fails. Run `npm run format` / `npm run lint:fix` then re-stage.

## Goal

100% pass on `npm run test:all` with no errors of any kind.
