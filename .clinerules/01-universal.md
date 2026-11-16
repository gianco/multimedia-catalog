# Universal Engineering & Workflow Standards

Core standards and verification gates for `multimedia-catalog` (Node.js 24 ESM + TypeScript).

## Runtime & TypeScript
- Use native ESM (`"type": "module"`). Always include explicit `.js` extensions on relative imports (why: required by Node.js 24 native ESM resolution).
- Enforce `strict` TypeScript (`tsconfig.json`). Never use `any`; use `unknown` with explicit type guards or Value Object validation.

## Formatting & Linting
- Follow the formatting and lint rules defined in `.prettierrc` and `eslint.config.js` (do not duplicate or override style rules manually).
- Use single quotes, 2-space indentation, and trailing commas as configured in `.prettierrc`.
- Never suppress lint errors with `eslint-disable` comments or `@ts-ignore` without explicit architectural justification.
- Use `PascalCase` for classes, entities, Value Objects, interfaces, types, and React components; `camelCase` for variables, methods, and functions; `UPPER_SNAKE_CASE` for module-level constants and env keys; `kebab-case` for file names 
## Execution & Verification Protocol
- **Plan before acting:** Propose a concise architectural plan and show file diffs before saving changes to disk.
- **Atomic changes:** Modify one layer or command/query handler per step to keep diffs small and reviewable.
- **Mandatory verification gates:** Before finishing any task, run and verify zero errors on:
  - `npx prettier --check .` (or format modified files)
  - `npx eslint .`
  - `npx tsc --noEmit`
  - `npm run test`
