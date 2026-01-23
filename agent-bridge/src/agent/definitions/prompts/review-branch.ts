/*---------------------------------------------------------------------------------------------
 *  /review-branch - Senior-level code review of branch changes vs base branch
 *--------------------------------------------------------------------------------------------*/

export const REVIEW_BRANCH_PROMPT = `<task>
You are conducting a senior-level code review of all changes on this branch compared to {{BASE_BRANCH:main}}. Your goal is to ensure the code is correct, follows best practices, and is production-ready.
</task>

<context>
Review scope: All commits on the current branch that are not in {{BASE_BRANCH:main}}.

Before reviewing, detect the project context:
- Read package.json, Cargo.toml, pyproject.toml, go.mod, or equivalent to identify the tech stack
- Check for .eslintrc, tsconfig.json, .prettierrc, rustfmt.toml, or similar config files to understand enforced standards
- Look at existing code patterns in the repository to understand conventions

Apply the detected standards and patterns throughout your review.
</context>

<instructions>
Think step by step. Follow these steps exactly:

STEP 1: DISCOVERY
Run these commands to understand the scope:
- \`git diff {{BASE_BRANCH:main}} --name-only\` - list all changed files
- \`git diff {{BASE_BRANCH:main}}\` - see the full diff
- \`git log {{BASE_BRANCH:main}}..HEAD --oneline\` - understand commit history and intent

Read each modified file completely. Do NOT skip this step or make assumptions about code you haven't read.

STEP 2: DETECT PROJECT CONTEXT
- Read configuration files (package.json, tsconfig.json, Cargo.toml, etc.)
- Identify the tech stack, framework, and language versions
- Note any linting rules, type checking settings, or code style configs
- Understand the project structure and architecture patterns in use

STEP 3: TRACE FULL CONTEXT
Do NOT review changes in isolation. For each changed file:
- Read the ENTIRE file, not just the diff lines
- Identify all imports, dependencies, and modules the changed code interacts with
- Read those related files to understand how data flows in and out
- Trace function calls upstream (what calls this code?) and downstream (what does this code call?)
- Check for existing patterns in the codebase that the new code should follow
- Verify the changes integrate correctly with existing code

Ask yourself: "Do I understand the complete data flow and logic flow that touches this change?" If no, keep reading related files until you do.

STEP 4: UNDERSTAND INTENT
Before critiquing, understand what the code is trying to accomplish. Use the commit messages and code changes to infer intent. Trace the logic flow end-to-end across all affected files. If the intent is unclear, say so.

STEP 5: EVALUATE
Review against these criteria:

**Correctness & Logic**
- Does the code actually do what it's supposed to do?
- Are conditionals correct? Watch for off-by-one errors, boundary conditions, null/undefined edge cases
- Is async logic handled properly? (race conditions, cleanup, stale closures)
- Are data transformations accurate?
- Do the changes break any existing functionality that depends on modified code?

**Edge Cases & Error Handling**
For EVERY function, component, and code path, ask: "What could go wrong?"
- Empty states: empty arrays, empty strings, empty objects, zero values
- Null/undefined/None: what if any input is null, undefined, None, or missing?
- Boundary conditions: first item, last item, single item, maximum values
- Invalid input: wrong types, malformed data, unexpected formats
- Network/IO failures: API errors, timeouts, offline state, file not found
- Race conditions: what if events happen out of order? User clicks twice?
- Concurrent state: what if state changes mid-operation?
- User interruption: what if user navigates away, cancels, or refreshes?
- Error propagation: are errors caught and handled gracefully? Do they surface useful messages?
- Loading states: is there feedback during async operations?
- Partial failures: what if only part of an operation succeeds?

**Integration & Consistency**
- Does the new code follow patterns established elsewhere in the codebase?
- Are interfaces/contracts with other modules maintained or properly updated?
- Is the data flow consistent with how similar features work?
- Are there ripple effects the author may have missed?

**Best Practices & Proven Patterns**
- SOLID principles adherence (especially single responsibility, dependency inversion)
- Framework-specific best practices (based on detected stack)
- State management patterns appropriate to the codebase
- Is the approach appropriate or over-engineered for the problem?

**Code Quality**
- Readability: clear naming, self-documenting, comments only where necessary
- DRY: duplicated logic that should be extracted (check if similar code exists elsewhere)
- Function/component size: doing too much?
- Testability: pure functions where possible, injectable dependencies

**Type Safety & Security**
- Proper type annotations (no \`any\`, \`object\`, untyped generics without justification)
- Proper null/undefined/None handling
- Input validation, injection prevention (SQL, XSS, CSRF, command injection)
- No secrets or credentials exposed

**Performance**
- Unnecessary computation or re-execution
- Memory leaks (missing cleanup, unclosed resources)
- N+1 queries or redundant operations
- Algorithmic complexity concerns

STEP 6: REPORT
</instructions>

<output_format>
For each issue, provide:
- **File:Line** - exact location
- **Severity** - CRITICAL (must fix) | WARNING (should fix) | SUGGESTION (nice to have)
- **Category** - Correctness | Edge Case | Logic | Integration | Best Practice | Security | Performance | Quality
- **Problem** - what's wrong and why it matters
- **Fix** - concrete code change (show the diff or exact replacement)

If you don't have enough context to evaluate something, say "INSUFFICIENT CONTEXT" and explain what you'd need to know.

After individual issues:
1. **Branch Summary**: What this branch is trying to accomplish (based on commits and code)
2. **Detected Stack**: Tech stack, frameworks, and standards detected
3. **Files Changed**: List from git diff {{BASE_BRANCH:main}} --name-only
4. **Related Files Read**: List files read for context
5. **Quality Score**: 1-10 with brief justification
6. **Top 3 Priority Fixes**: in order of importance
7. **Edge Cases Missing**: List specific scenarios not handled
8. **Integration Concerns**: any risks to existing functionality
9. **Merge Recommendation**: READY TO MERGE | NEEDS CHANGES | NEEDS REWORK
</output_format>

<red_flags>
Flag immediately if you see:
- console.log, print(), debugger, TODO/FIXME in production code
- Type system escapes (@ts-ignore, # type: ignore, as any) without comment
- Linter disables (eslint-disable, noqa) without justification
- Hardcoded secrets, API keys, or credentials
- Commented-out code blocks
- Magic numbers/strings without explanation
- Empty catch/except blocks that swallow errors
- Breaking changes to interfaces used elsewhere
- Inconsistent patterns with rest of codebase
- Unhandled promise rejections or uncaught exceptions
- Missing error handling around operations that can fail
- No loading/error states for async operations
- Assumptions about data shape without validation
</red_flags>

Begin by running \`git diff {{BASE_BRANCH:main}} --name-only\` and \`git log {{BASE_BRANCH:main}}..HEAD --oneline\` to understand the scope. Then run \`git diff {{BASE_BRANCH:main}}\` to see all changes. Detect the project context by reading config files. Read related files to understand full context before making any judgments.

Note: Replace {{BASE_BRANCH:main}} with the actual base branch if different from main (e.g., master, develop).`;
