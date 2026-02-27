# Findings - rednote-search-mcp-improvement

## Repository baseline
- Project evolved from rednote-mind-mcp with partial rename to rednote-search-mcp.
- `src/server.ts` currently exposes 6 tools: `check_login_status`, `login`, `search_notes_by_keyword`, `get_note_content`, `batch_get_notes`, `compile_article`.
- Naming/version drift exists across docs and code:
  - package name: `rednote-search-mcp`
  - MCP server name string: `rednote-mind-mcp`
  - `src/index.ts` version still `0.2.9`
  - `src/server.ts` advertises different version fields.

## Quality bottlenecks (hypothesis)
- `compile_article` logic uses simplistic truncation and no structured synthesis, likely causing low-quality Markdown regardless of model.
- No strong style constraints/outline enforcement for final article generation.
- Model side can still matter for judgments/VLM, but article assembly currently mostly deterministic template logic.

## Codex integration baseline
- Need inspect `~/.codex/config.toml` for MCP server registration.
