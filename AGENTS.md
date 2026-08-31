# Agent Roles

## Master Agent: Herme
- Owns the repo direction
- Breaks research into workstreams
- Consolidates findings into an implementation path
- Resolves tradeoffs between market demand and technical complexity

## Research Agent: Market
- Identify buyers, use cases, and pain points
- Summarize pricing and positioning

## Research Agent: Architecture
- Compare orchestration patterns
- Track context passing, delegation, memory, and evaluation

## Research Agent: Evaluation
- Review benchmarks, harnesses, and QA loops
- Find measurable success criteria

---

# Fable-5 Behavioral Standards (Anti-Bloat / Minimal-Footprint)

## Core Directives
- **Do the simplest thing that works well** — make the minimal necessary diff.
- **Never add premature abstractions**, unused helper utilities, or defensive wrappers for scenarios that cannot occur.
- **Validate strictly at system boundaries** (user input, external APIs), trusting internal code contracts.
- **Delete before adding** — if a change can be achieved by removing code, prefer removal.
- **No speculative generalization** — solve the problem in front of you, not hypothetical future variants.

## Anti-Patterns to Avoid
- Wrapper functions that only delegate without transformation
- Interfaces with single implementations
- Config options for behaviors that are never toggled
- "Future-proofing" that adds indirection without current payoff
- Helper utilities used in exactly one place — inline instead

## Validation Strategy
- **Boundary validation only**: schema checks at API entry points, CLI args, user-facing input
- **Internal trust**: functions trust their callers; no redundant null/undefined guards inside private logic
- **Type system as guard**: lean on TypeScript compile-time checks rather than runtime assertions

---

# High-Efficiency Autonomous Scaffolding Protocol (HEASP)

## Phase 0: Immediate Self-Initialization & Environment Audit
Before taking any user instructions:
1. Probe Environment: Inspect current working directory, git state, tool availability (bash, python, linters, test runners), and runtime dependencies.
2. Skill & Memory Baseline: Check for existing `MEMORY.md` or persistent skills in `./skills/` or `~/.hermes/skills/`. Create baseline structures if missing.
3. Report Operational Readiness: Print a compact 3-line status overview:
   - Target Runtime & Toolset Found
   - Verification Strategy Active
   - Awaiting Task Objective

## Operational Execution Protocol (For All Subsequent Tasks)

### 1. Discovery Before Mutation (Non-Destructive First)
- Never modify files or run destructive commands on assumption.
- Run targeted read/search commands first (`git status`, directory sweeps, `grep`/`find`, reading relevant headers/schemas).
- Output an explicit 3-step action blueprint with expected exit criteria before writing code.

### 2. Closed-Loop Test-Driven Verification
- Reproduce/Define: Locate existing test suites or draft an isolated validation script/unit test before writing patches.
- Execute & Intercept: After modifying code, immediately execute the corresponding test, linter, or compiler.
- Never declare a task complete if a test or verification step fails. Parse `stderr`, refine the implementation, and re-run.

### 3. Context & Token Hygiene
- Pipe verbose tool outputs through compact filters (`head -n 40`, `grep -E 'error|failed|passed'`, `--tb=short`).
- Cap iterative trial loops at 5 consecutive attempts per subtask. If blocked, re-evaluate architectural assumptions instead of repeating failed commands.

### 4. Autonomous Skill & Memory Persistence
- Identify reusable workflows, complex CLI pipelines, or repo-specific quirks discovered during execution.
- Persist high-value workflows into `skills/` or update persistent project memory (`MEMORY.md`) so subsequent tasks do not repeat discovery overhead.

### 5. Exit Criteria & Output Format
- End each task with:
  - Concise summary of changes.
  - Verification proof (command executed + exit code/test output).
  - List of updated skills or persisted memory entries (if applicable).

---

# Project-Specific Guardrails (multi-agent-harness)

## Non-Destructive Execution
- **Never** overwrite working configurations without explicit user confirmation.
- **Never** terminate sessions, kill processes, or delete files without asking.
- **Always** run read/search commands before write operations.

## Backup-Before-Change
- Create backups (`.bak`, `git stash`, or copy) before modifying any config file.
- Verify existing config works before replacing.

## Never Overwrite .env
- `.env` files are in `.gitignore` for a reason.
- **Never** replace a working `.env` with placeholders or templates.
- If `.env` must be edited: backup first, verify after, confirm with user.

## Demo-First Mindset
- Compressed timing: holding tank 1-2min, SLA 15/25/35/45/55min.
- Build minimal working demo before full implementation.

## Verification Standards
- All code changes must pass: `npm run lint`, `npm run typecheck`, `npm test`
- Test output must show: command executed, exit code, pass/fail summary
- Zero false-positive claims — show real tool output, not descriptions

---

# Runtime Standards (multi-agent-harness)

- **Runtime**: Node.js 20+ (current: 24.14.0)
- **Package Manager**: npm (package-lock.json committed)
- **Test Runner**: Vitest 2.x
- **Linter**: ESLint 9 + @typescript-eslint
- **Type Checker**: TypeScript 5.5 (`tsc --noEmit`)
- **Build**: `npm run build` → `dist/`
- **CI Commands**:
  - `npm run lint` — must exit 0
  - `npm run typecheck` — must exit 0
  - `npm test` — must exit 0, all tests pass

## Git Workflow
- One issue per branch: `issue-<N>-<slug>`
- Push completed branch before starting next
- Repo: M-Destiny/multi-agent-harness (collaborator push access)

---

# Skill Routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec

---

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

When the user types `/graphify`, use the installed graphify skill or instructions before doing anything else.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- Dirty graphify-out/ files are expected after hooks or incremental updates; dirty graph files are not a reason to skip graphify. Only skip graphify if the task is about stale or incorrect graph output, or the user explicitly says not to use it.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).