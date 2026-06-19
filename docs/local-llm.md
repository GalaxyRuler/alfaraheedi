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

## llama.cpp Example

If `llama-server` is installed and you already have a GGUF model file, start the local runtime with:

```powershell
.\scripts\llm-serve.ps1 -ModelPath C:\Models\Qwen3-1.7B-Q4_K_M.gguf
```

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
