---
paths:
  - "**/*.spec.ts"
---

# Co-located Testing Standards (Jest)

Rules governing unit and integration tests across `multimedia-catalog`.

## Structure & Naming
- **Strict co-location:** Place every `<filename>.spec.ts` in the exact same directory as its production `<filename>.ts` (why: keeps tests discoverable and coupled to their module boundaries).
- **Descriptive test titles:** Format test cases as `"should [expected behavior] when [condition]"`.
- **ESM mocking compatibility:** Use Jest ESM-compatible mocking patterns (`jest.unstable_mockModule` or dependency injection via interfaces) rather than CommonJS `jest.mock` hoisting hacks.

## Test Isolation & Layer Boundaries
- **Domain unit tests (`src/domain/**/*.spec.ts`):** Test Entities and Value Objects directly with zero mocks. Cover both valid invariants and boundary rejections (e.g., invalid ISBN check digits, malformed POSIX paths).
- **Application unit tests (`src/application/**/*.spec.ts`):** Mock repository interfaces (`CatalogItemRepository`) and external enrichment ports via dependency injection to verify CQRS Command/Query orchestration.
- **Infrastructure integration tests (`src/infrastructure/**/*.spec.ts`):** Run SQLite repositories and Data Mappers against isolated `:memory:` SQLite instances with zero disk state. Close database connections cleanly in `afterEach`/`afterAll`.

## Mandatory Edge-Case & Regression Coverage
- **MCP payload protection:** Include regression tests simulating oversized multi-edition JSON payloads (e.g., Open Library responses for *"The Hobbit"*) to verify deterministic truncation and ACL normalization without breaking parsing.
- **Input normalization:** Verify that Value Objects strip whitespace/hyphens and reject malformed inputs before reaching external tool calls.
