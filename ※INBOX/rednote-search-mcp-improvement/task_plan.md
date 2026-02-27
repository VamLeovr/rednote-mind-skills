# Task Plan - rednote-search-mcp-improvement

## Goal
1. Clarify boundary between rednote-search-mcp and rednote-mind-mcp in current repository.
2. Enable Codex environment to discover and invoke this MCP server.
3. Improve generated Markdown quality and isolate root cause (code pipeline vs model capability/config).

## Phases
| Phase | Status | Notes |
|---|---|---|
| 1. Baseline & scope lock | in_progress | Confirm current repo behavior and Codex MCP availability |
| 2. Design options & approval | pending | 2-3 approaches with recommendation |
| 3. MCP registration/deployment for Codex | pending | Config + validation |
| 4. Markdown quality optimization (TDD) | pending | Prompting and article compiler improvements |
| 5. Verification & summary | pending | Run checks and provide evidence |

## Risks
- Codex client may not support `/mcp` command path used by user.
- Repo naming/version drift may confuse runtime and MCP registration.
- Quality issue may be mixed: model quality + insufficient extraction/synthesis logic.

## Error Log
| Time | Error | Attempt | Resolution |
|---|---|---|---|
| 2026-02-27 | none | - | - |
