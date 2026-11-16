---
paths:
  - "src/domain/**"
  - "src/application/**"
---

# Tactical DDD & CQRS Guidelines

Rules governing domain modeling, naming conventions, and application use cases.

## Domain Layer (`src/domain/**`)
- **Zero external dependencies:** Never import SQLite, HTTP servers, MCP SDK, or `process.env` inside `src/domain/` (why: keeps core business logic pure, framework-agnostic, and testable in memory).
- **Rich domain models:** Encapsulate business invariants and state transitions inside Entities (`CatalogItem`, `Book`, `Vinyl`, `CD`, `VideoFile`, `AudioFile`). Avoid anemic models and public setters.
- **Self-validating Value Objects:** Validate, normalize, and freeze inputs inside Value Object constructors or static factories (e.g., `IsbnVo` strips hyphens/spaces and enforces 10 or 13 digits before instantiation).
- **Domain naming suffixes:** Suffix Value Objects with `Vo` (`IsbnVo`, `BarcodeVo`, `AbsolutePathVo`) and repository contracts with `Repository` (`CatalogItemRepository`).
- **Native ID generation:** Generate entity IDs inside the domain using Node's native `crypto.randomUUID()`.

## Application Layer (`src/application/**`)
- **Strict CQRS separation:** Keep write operations in explicit Command handlers (`*Command` / `*CommandHandler`, e.g., `EnrichAndCreateItemCommand`) and read operations in Query handlers (`*Query` / `*QueryHandler`).
- **Dependency inversion:** Depend exclusively on domain repository interfaces (`CatalogItemRepository`) and domain types, never on concrete SQLite implementations or raw MCP schemas.
