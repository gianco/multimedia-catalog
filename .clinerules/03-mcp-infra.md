---
paths:
  - "src/infrastructure/**"
---

# Infrastructure, MCP & Anticorruption Layer

Rules governing external MCP servers, payload sanitization, SQLite persistence, and environment configuration.

## MCP Client & Anticorruption Layer (ACL)
- **Tool namespacing:** Always namespace discovered MCP tools as `<serverName>__<toolName>` inside `src/infrastructure/mcp/mcp-client.service.ts` to prevent collisions across Stdio child processes.
- **Primitive input sanitization:** Pass only validated, normalized primitives extracted from Value Objects (e.g., clean 10/13-digit strings from `IsbnVo`) into `mcpClient.executeTool()`.
- **Deterministic payload & token protection:** Truncate, slice, or filter oversized JSON responses returned by external MCP servers (such as Open Library multi-edition arrays) deterministically in TypeScript *before* passing context back to the LLM (why: prevents context window saturation, parsing failures, and unnecessary token costs).
- **ACL isolation:** Never leak raw external MCP JSON schemas into `src/application/` or `src/domain/`; normalize all external responses into strongly typed domain DTOs inside the infrastructure layer.

## Persistence & Configuration
- **SQLite repositories:** Implement domain repository contracts (`*Repository`) using parameterized SQL queries and explicit Data Mappers (`*Mapper`). Never concatenate raw user strings into SQL queries.
- **Typed environment config:** Read `PORT`, `DATABASE_FILE`, `ANTHROPIC_API_KEY`, `CLAUDE_MODEL`, and `MUSICBRAINZ_CONTACT` strictly through the typed configuration layer (`src/infrastructure/config/`), never via scattered `process.env` lookups.
