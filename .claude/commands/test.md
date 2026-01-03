Run `npm test` and systematically fix all failures to achieve 100% completion.

## Strategy

1. **Run full suite first**: `npm test` to see the full picture
2. **Fix in order**: Linting → Type errors → Test failures
3. **Stop when done**: Once tests pass completely, stop immediately

## Key Commands

- `npm test` - Run vitest test suite
- `npm run lint` - Check linting (if available)

## Goal

100% pass rate on `npm test` with no errors of any kind.
