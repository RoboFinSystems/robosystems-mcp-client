Review all staged changes (`git diff --cached`) with focus on these contexts:

## MCP Implementation Context

**Tool & Resource Definitions:**

- Are tool schemas properly defined with correct input/output types?
- Are resource URIs following MCP conventions?
- Is tool/resource documentation clear and complete?

**API Integration:**

- Are RoboSystems API calls properly authenticated?
- Is error handling appropriate for API failures?
- Are responses properly transformed for MCP format?

**Code Quality:**

- Does the code follow existing patterns?
- Is error handling comprehensive?
- Are types properly defined?

## Testing Context

- Do new tools/resources have corresponding tests?
- Are edge cases covered?
- Is test coverage maintained?

## Documentation Context

- Is README updated for new features?
- Are tool descriptions clear for LLM consumption?

## Output

Provide a summary with:

1. **Issues**: Problems that should be fixed before commit
2. **Suggestions**: Improvements that aren't blocking
3. **Questions**: Anything unclear that needs clarification
