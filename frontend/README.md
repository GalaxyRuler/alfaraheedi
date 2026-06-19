# Alfaraheedi — Web App

A local-first Arabic writing workbench for the Alfaraheedi engine. TypeScript +
React + Vite, with a CodeMirror 6 editor for RTL-aware Arabic editing and inline
suggestion decorations.

## Principles

- **Local-first / private.** No external network calls, no telemetry, no
  analytics, no hosted LLM calls. The app only talks to the local engine API.
- **No text retention by default.** The draft lives in memory. It is persisted to
  `localStorage` only when you enable "Remember draft" in Settings; disabling the
  toggle clears it immediately.
- **Safe vs. suggest-only is explicit.** Safe auto-apply fixes go through the
  engine's `POST /v1/apply { mode: "safe" }`. Suggest-only items are never
  auto-applied; you can apply a single replacement manually (a local text edit),
  after which the app re-analyzes.
- **Local LLM is opt-in.** The "LLM suggestion" action calls the local API only.
  The API returns `503` until `ALFARAHEEDI_LLM_BASE_URL` points at a local
  OpenAI-compatible runtime.

## Run

Requires Node 20+ and the local API running (default `http://127.0.0.1:3000`).

```bash
npm install
npm run dev      # Vite dev server on http://localhost:5173
```

Start both API and frontend from the repository root:

```powershell
.\scripts\dev.ps1
```

Start the API separately: `cargo run -p write-cli -- serve --addr 127.0.0.1:3000`.

## Scripts

| Script          | Purpose                                            |
| --------------- | -------------------------------------------------- |
| `npm run dev`   | Start the Vite dev server.                         |
| `npm run build` | Type-check (`tsc -b`) and produce a production build. |
| `npm run preview` | Serve the production build locally.              |
| `npm run lint`  | ESLint over `src`.                                 |
| `npm run test`  | Vitest component/integration tests.                |

## Configuration

- **Interface language** — Arabic or English; the whole UI follows the choice.
  Independent of the text you write (you can write Arabic, English, or mixed in
  either UI language). Default Arabic; switching to English also flips the chrome
  to LTR. Engine-provided strings (rule descriptions, explanations) are localized
  to Arabic for the known rules and shown as the engine returns them in English.
- **API base URL** — Settings panel; default `http://127.0.0.1:3000`.
- **Editor direction** — RTL / LTR / Auto (Arabic-first default is RTL). This is
  the direction of the *text being edited*, separate from the UI language.
- **Remember draft** — opt-in local persistence (off by default).

## Layout

- `src/i18n/` — language strings (`ar`/`en`) and the i18n context that the whole
  UI reads from.
- `src/api/` — typed client and response types mirroring the Rust engine output.
- `src/components/` — editor, suggestions panel, toolbar, header, drawers (Rules,
  Local LLM, Settings).
- `src/lib/` — CodeMirror decoration mapping (span → editor range via UTF-16
  offsets) and display/grouping helpers.
- `src/state/` — `localStorage`-backed settings and opt-in draft persistence.
- `src/__tests__/` — Vitest suites with a stubbed `fetch`.
