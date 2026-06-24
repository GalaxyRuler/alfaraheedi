import {
  DEFAULT_API_BASE_URL,
  DEFAULT_WRITING_MODE,
  isLoopbackApiBaseUrl,
  normalizeApiBaseUrl,
} from "./localApi.js";

export const SETTINGS_STORAGE_KEY = "alfaraheediSettings";
export const SUPPORTED_WRITING_MODES = ["auto", "arabic", "english", "mixed"];
export const DEFAULT_EXTENSION_SETTINGS = Object.freeze({
  apiBaseUrl: DEFAULT_API_BASE_URL,
  writingMode: DEFAULT_WRITING_MODE,
  enabled: true,
  disabledHosts: [],
});
export const LOOPBACK_API_URL_ERROR =
  "Nahou extension only connects to a loopback API URL.";

export function normalizeExtensionSettings(settings = {}) {
  const apiBaseUrl = normalizeApiBaseUrl(
    typeof settings.apiBaseUrl === "string"
      ? settings.apiBaseUrl
      : DEFAULT_EXTENSION_SETTINGS.apiBaseUrl,
  );
  const writingMode = SUPPORTED_WRITING_MODES.includes(settings.writingMode)
    ? settings.writingMode
    : DEFAULT_EXTENSION_SETTINGS.writingMode;
  const enabled =
    typeof settings.enabled === "boolean"
      ? settings.enabled
      : DEFAULT_EXTENSION_SETTINGS.enabled;
  const disabledHosts = normalizeDisabledHosts(settings.disabledHosts);

  return {
    apiBaseUrl: isLoopbackApiBaseUrl(apiBaseUrl)
      ? apiBaseUrl
      : DEFAULT_EXTENSION_SETTINGS.apiBaseUrl,
    writingMode,
    enabled,
    disabledHosts,
  };
}

export function normalizeDisabledHosts(hosts = []) {
  if (!Array.isArray(hosts)) return [];
  return Array.from(
    new Set(
      hosts
        .map((host) => (typeof host === "string" ? host.trim().toLowerCase() : ""))
        .filter((host) => /^[a-z0-9.-]+$/u.test(host)),
    ),
  ).sort();
}

export function hostFromUrl(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    return parsed.hostname.toLowerCase();
  } catch {
    return null;
  }
}

export function isSiteDisabled(settings, url) {
  const host = hostFromUrl(url);
  if (!host) return false;
  return normalizeExtensionSettings(settings).disabledHosts.includes(host);
}

export function setSiteDisabled(settings, url, disabled) {
  const host = hostFromUrl(url);
  const normalized = normalizeExtensionSettings(settings);
  if (!host) return normalized;

  const hosts = new Set(normalized.disabledHosts);
  if (disabled) {
    hosts.add(host);
  } else {
    hosts.delete(host);
  }

  return normalizeExtensionSettings({
    ...normalized,
    disabledHosts: [...hosts],
  });
}

export async function getExtensionSettings(chromeApi = globalThis.chrome) {
  const stored = await chromeApi.storage.local.get(SETTINGS_STORAGE_KEY);
  return normalizeExtensionSettings(stored?.[SETTINGS_STORAGE_KEY]);
}

export async function saveExtensionSettings(
  settings,
  chromeApi = globalThis.chrome,
) {
  const requestedApiBaseUrl = normalizeApiBaseUrl(
    typeof settings.apiBaseUrl === "string"
      ? settings.apiBaseUrl
      : DEFAULT_EXTENSION_SETTINGS.apiBaseUrl,
  );
  if (!isLoopbackApiBaseUrl(requestedApiBaseUrl)) {
    throw new Error(LOOPBACK_API_URL_ERROR);
  }

  const normalized = normalizeExtensionSettings(settings);
  await chromeApi.storage.local.set({
    [SETTINGS_STORAGE_KEY]: normalized,
  });
  return normalized;
}
