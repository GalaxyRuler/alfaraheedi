import { useCallback, useEffect, useState } from "react";
import type { Lang } from "../i18n/strings";

export type Direction = "rtl" | "ltr" | "auto";

export interface Settings {
  // UI chrome language. Independent of the text the user writes in the editor.
  language: Lang;
  // Where the local engine is reachable. Packaged builds default to same-origin.
  apiBaseUrl: string;
  // Editor base direction. Arabic-first default is RTL; Auto follows content.
  direction: Direction;
  // Persist the editor draft to localStorage. Off by default for privacy:
  // user text never leaves memory unless this is explicitly enabled.
  rememberDraft: boolean;
}

export const LEGACY_DEFAULT_API_BASE_URL = "http://127.0.0.1:3000";

export function resolveDefaultApiBaseUrl({
  configured,
  dev,
  origin,
}: {
  configured?: string;
  dev: boolean;
  origin?: string;
}): string {
  if (configured) return configured;
  if (!dev && origin) return origin;
  return LEGACY_DEFAULT_API_BASE_URL;
}

function browserOrigin(): string | undefined {
  return typeof window === "undefined" ? undefined : window.location.origin;
}

const DEFAULT_API_BASE_URL = resolveDefaultApiBaseUrl({
  configured: import.meta.env.VITE_ALFARAHEEDI_API_BASE_URL,
  dev: import.meta.env.DEV,
  origin: browserOrigin(),
});

export const DEFAULT_SETTINGS: Settings = {
  language: "ar",
  apiBaseUrl: DEFAULT_API_BASE_URL,
  direction: "rtl",
  rememberDraft: false,
};

const SETTINGS_KEY = "alfaraheedi.settings.v1";
const DRAFT_KEY = "alfaraheedi.draft.v1";

function readStorage<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures (private mode, quota). The app stays usable.
  }
}

export function mergeSettingsWithDefaults({
  defaults,
  migrateLegacyDefault,
  stored,
}: {
  defaults: Settings;
  migrateLegacyDefault: boolean;
  stored?: Partial<Settings>;
}): Settings {
  const settings = { ...defaults, ...(stored ?? {}) };

  if (migrateLegacyDefault && stored?.apiBaseUrl === LEGACY_DEFAULT_API_BASE_URL) {
    settings.apiBaseUrl = defaults.apiBaseUrl;
  }

  return settings;
}

function loadSettings(): Settings {
  const stored = readStorage<Partial<Settings>>(SETTINGS_KEY) ?? {};
  return mergeSettingsWithDefaults({
    defaults: DEFAULT_SETTINGS,
    migrateLegacyDefault:
      !import.meta.env.DEV && !import.meta.env.VITE_ALFARAHEEDI_API_BASE_URL,
    stored,
  });
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  useEffect(() => {
    writeStorage(SETTINGS_KEY, settings);
  }, [settings]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  return { settings, update };
}

// Draft persistence is opt-in and lives behind `rememberDraft`. Disabling the
// toggle clears any stored draft immediately.
export function loadDraft(): string {
  return readStorage<string>(DRAFT_KEY) ?? "";
}

export function saveDraft(text: string): void {
  writeStorage(DRAFT_KEY, text);
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    // Ignore.
  }
}
