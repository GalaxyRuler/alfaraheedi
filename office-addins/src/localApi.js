export const DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";
export const DEFAULT_WRITING_MODE = "auto";

export function normalizeApiBaseUrl(apiBaseUrl = DEFAULT_API_BASE_URL) {
  return apiBaseUrl.trim().replace(/\/+$/, "");
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

export async function analyzeTextWithLocalApi({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = fetch,
  text,
  writingMode = DEFAULT_WRITING_MODE,
}) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  if (!isLoopbackApiBaseUrl(baseUrl)) {
    throw new Error("Office add-in only connects to the local Alfaraheedi API.");
  }

  const response = await fetchImpl(`${baseUrl}/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, writing_mode: writingMode }),
  });

  if (!response.ok) {
    throw new Error(`Alfaraheedi local API returned HTTP ${response.status}`);
  }

  return response.json();
}

export async function applySafeWithLocalApi({
  apiBaseUrl = DEFAULT_API_BASE_URL,
  fetchImpl = fetch,
  text,
  writingMode = DEFAULT_WRITING_MODE,
}) {
  const baseUrl = normalizeApiBaseUrl(apiBaseUrl);
  if (!isLoopbackApiBaseUrl(baseUrl)) {
    throw new Error("Office add-in only connects to the local Alfaraheedi API.");
  }

  const response = await fetchImpl(`${baseUrl}/v1/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text,
      mode: "safe",
      writing_mode: writingMode,
    }),
  });

  if (!response.ok) {
    throw new Error(`Alfaraheedi local API returned HTTP ${response.status}`);
  }

  return response.json();
}
