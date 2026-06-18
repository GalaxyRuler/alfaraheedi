# UI Integration Test Report - 2026-06-19

## Scope

Integrated the local web workbench into the canonical repository and verified the primary local-first UI/API contract.

## Stack

- Frontend: TypeScript, React, Vite, CodeMirror 6.
- Tests: Vitest with Testing Library and jsdom.
- Backend: Axum API with loopback-only CORS for local development.

## Commands Run

- `npm ci`
- `npm run lint`
- `npm run test`
- `npm run build`
- `npm audit --audit-level=moderate`
- `cargo fmt --all --check`
- `cargo clippy --workspace -- -D warnings`
- `cargo test --workspace`
- `cargo deny check licenses bans sources`

## Local Smoke

Started short-lived local servers:

- API: `http://127.0.0.1:3198`
- Frontend: `http://127.0.0.1:5178`

Verified:

- `GET /v1/health` returned `ok`.
- `POST /v1/analyze` returned 2 suggestions for `مرحبــا  بالعالم`.
- `GET /v1/llm/status` returned `available = false`.
- Vite served the app shell.

Both test servers were stopped after the smoke.

## Automated Coverage

Vitest covers:

- Analyze flow renders grouped suggestions.
- Safe apply flow updates editor text.
- API unavailable state shows an offline banner and actionable error.
- Rules panel renders rule catalog.
- Local LLM panel renders the `write-llm` catalog policy.
- UI language switch updates chrome independently from editor text.

Rust tests cover:

- CORS preflight allows loopback origins.
- CORS preflight rejects a remote origin.
- Existing API, CLI, core, Arabic rules, eval, and LLM status behavior.

## Accessibility And Visual Status

- Automated component tests exercise role/name based interactions for the primary controls.
- Drawer focus trapping and focus restoration were added during integration.
- Full browser visual regression was not run; no Playwright/Cypress visual baseline is configured.
- Axe or screen-reader testing was not run; no automated accessibility tool is configured yet.
- Manual cross-browser and 400% zoom checks were not run.

## Findings

- S3: Full browser visual regression is not yet configured.
- S3: Axe-based accessibility regression is not yet configured.
- S3: Mobile and high-zoom responsive checks need a browser automation lane before release-quality UI claims.

## Result

Ready for local development use after the passing static, unit, build, supply-chain, and smoke gates above. Visual and deep accessibility coverage remain future hardening work.
