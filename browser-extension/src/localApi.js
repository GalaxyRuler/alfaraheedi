export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";
export const DEFAULT_WRITING_MODE = "auto";

export function buildAnalyzeRequest(text, writingMode = DEFAULT_WRITING_MODE) {
  return {
    text,
    writing_mode: writingMode,
  };
}

export function isLoopbackApiBaseUrl(apiBaseUrl) {
  try {
    const url = new URL(apiBaseUrl);
    return (
      url.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function normalizeApiBaseUrl(apiBaseUrl = DEFAULT_API_BASE_URL) {
  return apiBaseUrl.trim().replace(/\/+$/, "");
}

export async function analyzeTextWithLocalApi({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = fetch,
  text,
  writingMode = DEFAULT_WRITING_MODE,
}) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  if (!isLoopbackApiBaseUrl(baseUrl)) {
    throw new Error("Nahou extension only connects to a loopback API URL.");
  }

  const response = await fetchImpl(`${baseUrl}/v1/analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildAnalyzeRequest(text, writingMode)),
  });

  if (!response.ok) {
    throw new Error(`Nahou local API returned HTTP ${response.status}`);
  }

  return response.json();
}

export async function checkLocalApiHealth({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = fetch,
} = {}) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  if (!isLoopbackApiBaseUrl(baseUrl)) {
    return {
      ok: false,
      error: "Nahou extension only connects to a loopback API URL.",
    };
  }

  try {
    const response = await fetchImpl(`${baseUrl}/v1/health`, {
      method: "GET",
    });
    if (!response.ok) {
      return {
        ok: false,
        error: `HTTP ${response.status}`,
      };
    }

    const payload = await response.json();
    return {
      ok: true,
      service: typeof payload?.service === "string" ? payload.service : "unknown",
    };
  } catch (error) {
    return {
      ok: false,
      error: "Could not reach local API.",
    };
  }
}
