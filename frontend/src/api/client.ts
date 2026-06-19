import type {
  Analysis,
  ApplyOutcome,
  HealthResponse,
  LlmSuggestion,
  LlmStatus,
  RuleInfo,
} from "./types";

export type ApiErrorKind = "network" | "http" | "parse" | "timeout";

// A single error type the UI can branch on. `network`/`timeout` map to the
// "API unavailable" state; `http` carries a status for actionable messages.
export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, message: string, status?: number) {
    super(message);
    this.name = "ApiError";
    this.kind = kind;
    this.status = status;
  }
}

function joinUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}${path}`;
}

async function request<T>(
  baseUrl: string,
  path: string,
  init: RequestInit = {},
  timeoutMs = 12_000,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(joinUrl(baseUrl, path), {
      ...init,
      signal: controller.signal,
      headers: { Accept: "application/json", ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new ApiError("timeout", `Request to ${path} timed out.`);
    }
    throw new ApiError(
      "network",
      `Could not reach the Alfaraheedi API at ${baseUrl}.`,
    );
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new ApiError(
      "http",
      body.trim() || `Request to ${path} failed (${response.status}).`,
      response.status,
    );
  }

  try {
    return (await response.json()) as T;
  } catch {
    throw new ApiError("parse", `Response from ${path} was not valid JSON.`);
  }
}

export interface AlfaraheediApi {
  health(): Promise<HealthResponse>;
  rules(): Promise<RuleInfo[]>;
  llmStatus(): Promise<LlmStatus>;
  llmSuggest(text: string): Promise<LlmSuggestion>;
  analyze(text: string): Promise<Analysis>;
  applySafe(text: string): Promise<ApplyOutcome>;
}

export function createApi(baseUrl: string): AlfaraheediApi {
  return {
    health: () => request<HealthResponse>(baseUrl, "/v1/health", {}, 5_000),
    rules: () =>
      request<{ rules: RuleInfo[] }>(baseUrl, "/v1/rules").then((r) => r.rules),
    llmStatus: () => request<LlmStatus>(baseUrl, "/v1/llm/status"),
    llmSuggest: (text) =>
      request<LlmSuggestion>(baseUrl, "/v1/llm/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
    analyze: (text) =>
      request<Analysis>(baseUrl, "/v1/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      }),
    applySafe: (text) =>
      request<ApplyOutcome>(baseUrl, "/v1/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, mode: "safe" }),
      }),
  };
}
