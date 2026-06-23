# Local LLM

Alfaraheedi can call an opt-in local OpenAI-compatible runtime for suggestion-only rewrites. The default install does not download, bundle, or redistribute model weights.

## Policy

- Runtime: local OpenAI-compatible server.
- Default candidate: `qwen3-1.7b-q4_k_m`.
- Output role: suggestion-only.
- Safe auto-apply: disabled for all LLM output.
- Hosted fallback: disabled by default.
- Raw text logging: disabled by policy.
- Model downloads: user-managed, never automatic.

## Environment

Set these variables before starting `writecheck serve` or `write-api`:

```powershell
$env:ALFARAHEEDI_LLM_BASE_URL = "http://127.0.0.1:8000"
$env:ALFARAHEEDI_LLM_MODEL = "qwen3-1.7b-q4_k_m"
$env:ALFARAHEEDI_LLM_TIMEOUT_MS = "30000"
```

`ALFARAHEEDI_LLM_BASE_URL` is the only required variable. If no model is set, Alfaraheedi uses the catalog default model id.

## Desktop Companion

The desktop companion does not require `writecheck serve` for local LLM suggestions. Open Settings, set a local runtime URL such as `http://127.0.0.1:8000`, confirm the model id and timeout, then use "Check runtime" or "Run doctor" to verify the server before requesting an "LLM suggestion" from the review window.

Desktop runtime settings are stored in the app config directory, not the repository. The URL must point at loopback (`127.0.0.1`, `localhost`, or `::1`); remote hosts are rejected. Existing settings files from older companion versions keep local LLM disabled by default until the user configures a runtime.

The companion doctor uses the same policy checks as the CLI doctor. With no runtime configured, it reports a successful skipped state. With a runtime configured, it validates the loopback URL, model id, timeout range, OpenAI-compatible `/v1/models` response, and a small suggestion-only probe.

LLM suggestions in the companion are full-text suggestions for the currently captured selection. The review window shows progress while the local runtime is working, and the request can be cancelled without applying a stale late result. Suggestions are never safe auto-applied; accepting one only updates the review preview so the user can copy it or replace the original selection intentionally.

## Doctor

Run the built-in doctor before debugging model quality:

```powershell
cargo run -p write-cli -- llm doctor
cargo run -p write-cli -- llm doctor --format json
```

Without `ALFARAHEEDI_LLM_BASE_URL`, the doctor exits successfully with a skipped/unavailable state. Local LLM is optional, so no-runtime is not a failure.

When a runtime is configured, the doctor checks:

- `ALFARAHEEDI_LLM_BASE_URL` is a loopback `http` or `https` URL such as `http://127.0.0.1:8000`.
- `ALFARAHEEDI_LLM_MODEL` is non-empty. Catalog models are reported as known CPU-only candidates; custom model ids are allowed but warned.
- `ALFARAHEEDI_LLM_TIMEOUT_MS` is an integer from `1000` to `120000`.
- `GET /v1/models` returns an OpenAI-compatible model list.
- A small built-in sample produces a non-empty `POST /v1/chat/completions` suggestion.
- The policy remains suggestion-only with `safe_auto_apply = false`, no bundled weights, no automatic downloads, and no hosted fallback.

## llama.cpp Example

If `llama-server` is installed and you already have a GGUF model file, start the local runtime with:

```powershell
.\scripts\llm-serve.ps1 -ModelPath C:\Models\Qwen3-1.7B-Q4_K_M.gguf
```

CPU-only guidance:

- Start with `Qwen3-1.7B-Q4_K_M.gguf` on machines with at least 4 GB available RAM.
- Use `Qwen3-0.6B-Q4_0.gguf` for lower-memory tests.
- Keep downloaded GGUF files outside the repository and release package, for example under `C:\Models`.
- Do not commit model weights or download them automatically from Alfaraheedi scripts.

Then start Alfaraheedi:

```powershell
cargo run -p write-cli -- serve --addr 127.0.0.1:3000
```

The web app button labeled "LLM suggestion" calls `POST /v1/llm/suggest`. The CLI equivalent is:

```powershell
cargo run -p write-cli -- llm suggest path\to\text.txt
```

## API

```http
GET  /v1/llm/status
POST /v1/llm/suggest
```

Request:

```json
{ "text": "مرحبــا بالعالم" }
```

Response:

```json
{
  "source": "llm:local",
  "model_id": "qwen3-1.7b-q4_k_m",
  "replacement": "مرحبا بالعالم",
  "explanation": "Local LLM suggestion.",
  "confidence": 0.5,
  "safe_auto_apply": false
}
```

LLM suggestions are full-text rewrites. They are never merged into `writecheck fix --safe`.

## Smoke Tests

The smoke script verifies the API contract without logging raw input text:

```powershell
.\scripts\smoke-llm.ps1
```

If `ALFARAHEEDI_LLM_BASE_URL` is not set, the script exits successfully with a clear skip message.

Use the mock runtime for CI-style contract verification without downloading model weights:

```powershell
.\scripts\smoke-llm.ps1 -MockRuntime
```

The mock path starts a local OpenAI-compatible server, runs `writecheck llm doctor --format json`, starts the local API, and verifies `POST /v1/llm/suggest`.

Use a real local runtime by starting `llama-server` or another OpenAI-compatible server first, then set `ALFARAHEEDI_LLM_BASE_URL` and run the same smoke script. The script verifies that the runtime is reachable, the doctor passes, `POST /v1/llm/suggest` returns a non-empty replacement, and `safe_auto_apply` remains `false`.
