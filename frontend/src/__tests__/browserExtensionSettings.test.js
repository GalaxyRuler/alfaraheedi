import axe from "axe-core";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

import { checkLocalApiHealth } from "../../../browser-extension/src/localApi.js";
import {
  DEFAULT_EXTENSION_SETTINGS,
  getExtensionSettings,
  normalizeExtensionSettings,
  saveExtensionSettings,
} from "../../../browser-extension/src/settings.js";

const repoRoot = path.resolve(__dirname, "../../..");
const extensionRoot = path.join(repoRoot, "browser-extension");

async function writeStaticExtensionPage(pageName) {
  const html = await readFile(path.join(extensionRoot, pageName), "utf8");
  document.open();
  document.write(html);
  document.close();
}

describe("browser extension settings", () => {
  it("has no automated accessibility violations in static popup and options pages", async () => {
    for (const pageName of ["popup.html", "options.html"]) {
      await writeStaticExtensionPage(pageName);
      const results = await axe.run(document, {
        rules: {
          // jsdom does not compute real browser contrast. Visual contrast still needs manual/browser QA.
          "color-contrast": { enabled: false },
        },
      });

      expect(results.violations).toEqual([]);
    }
  });

  it("checks local API health without sending editor text", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ status: "ok", service: "write-api" }),
    }));

    await expect(
      checkLocalApiHealth({
        apiBaseUrl: "http://localhost:3402/",
        fetchImpl: fetchMock,
      }),
    ).resolves.toEqual({
      ok: true,
      service: "write-api",
    });

    expect(fetchMock).toHaveBeenCalledWith("http://localhost:3402/v1/health", {
      method: "GET",
    });
  });

  it("sanitizes local API health errors before showing them in extension UI", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("failed to fetch http://127.0.0.1:3402/v1/health?text=private");
    });

    await expect(
      checkLocalApiHealth({
        apiBaseUrl: "http://localhost:3402/",
        fetchImpl: fetchMock,
      }),
    ).resolves.toEqual({
      ok: false,
      error: "Could not reach local API.",
    });
  });

  it("normalizes settings to loopback-only API URLs and supported writing modes", () => {
    expect(
      normalizeExtensionSettings({
        apiBaseUrl: "https://example.com",
        writingMode: "unsupported",
        enabled: false,
      }),
    ).toEqual({
      ...DEFAULT_EXTENSION_SETTINGS,
      enabled: false,
    });

    expect(
      normalizeExtensionSettings({
        apiBaseUrl: "http://localhost:3402/",
        writingMode: "mixed",
        enabled: false,
      }),
    ).toEqual({
      apiBaseUrl: "http://localhost:3402",
      writingMode: "mixed",
      enabled: false,
    });
  });

  it("round-trips normalized settings through extension storage", async () => {
    const store = {};
    const chromeApi = {
      storage: {
        local: {
          get: vi.fn(async () => ({ alfaraheediSettings: store.alfaraheediSettings })),
          set: vi.fn(async (value) => Object.assign(store, value)),
        },
      },
    };

    await saveExtensionSettings(
      {
        apiBaseUrl: "http://127.0.0.1:3402/",
        writingMode: "english",
        enabled: false,
      },
      chromeApi,
    );

    await expect(getExtensionSettings(chromeApi)).resolves.toEqual({
      apiBaseUrl: "http://127.0.0.1:3402",
      writingMode: "english",
      enabled: false,
    });
    expect(chromeApi.storage.local.set).toHaveBeenCalledWith({
      alfaraheediSettings: {
        apiBaseUrl: "http://127.0.0.1:3402",
        writingMode: "english",
        enabled: false,
      },
    });
  });

  it("rejects explicit non-loopback API URLs when saving settings", async () => {
    const chromeApi = {
      storage: {
        local: {
          set: vi.fn(async () => undefined),
        },
      },
    };

    await expect(
      saveExtensionSettings(
        {
          apiBaseUrl: "https://example.com",
          writingMode: "english",
          enabled: true,
        },
        chromeApi,
      ),
    ).rejects.toThrow("Nahou extension only connects to a loopback API URL.");
    expect(chromeApi.storage.local.set).not.toHaveBeenCalled();
  });

  it("rejects loopback URLs outside the packaged manifest host permissions", async () => {
    const chromeApi = {
      storage: {
        local: {
          set: vi.fn(async () => undefined),
        },
      },
    };

    for (const apiBaseUrl of ["https://localhost:3000", "http://[::1]:3000"]) {
      await expect(
        saveExtensionSettings(
          {
            apiBaseUrl,
            writingMode: "auto",
            enabled: true,
          },
          chromeApi,
        ),
      ).rejects.toThrow("Nahou extension only connects to a loopback API URL.");
    }
    expect(chromeApi.storage.local.set).not.toHaveBeenCalled();
  });

  it("uses stored settings when the background worker analyzes text", async () => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => listeners.push(listener)),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            alfaraheediSettings: {
              apiBaseUrl: "http://127.0.0.1:3402",
              writingMode: "english",
              enabled: true,
            },
          })),
        },
      },
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await import("../../../browser-extension/src/background.js?settings-test");

    const sendResponse = vi.fn();
    const keepsChannelOpen = listeners[0](
      {
        type: "ALFARAHEEDI_ANALYZE_TEXT",
        text: "helo wat you are do?",
      },
      {},
      sendResponse,
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(keepsChannelOpen).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3402/v1/analyze",
      expect.objectContaining({
        body: JSON.stringify({
          text: "helo wat you are do?",
          writing_mode: "english",
        }),
      }),
    );
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      analysis: { suggestions: [] },
    });

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("ignores message-level API URL and writing-mode overrides in the background worker", async () => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => listeners.push(listener)),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            alfaraheediSettings: {
              apiBaseUrl: "http://127.0.0.1:3402",
              writingMode: "english",
              enabled: true,
            },
          })),
        },
      },
    };
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [] }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    await import("../../../browser-extension/src/background.js?message-override-test");

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: "ALFARAHEEDI_ANALYZE_TEXT",
        text: "helo wat you are do?",
        apiBaseUrl: "https://example.com",
        writingMode: "arabic",
      },
      {},
      sendResponse,
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3402/v1/analyze",
      expect.objectContaining({
        body: JSON.stringify({
          text: "helo wat you are do?",
          writing_mode: "english",
        }),
      }),
    );
    expect(sendResponse).toHaveBeenCalledWith({
      ok: true,
      analysis: { suggestions: [] },
    });

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("rejects malformed background analysis text before reading settings or calling the API", async () => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => listeners.push(listener)),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            alfaraheediSettings: {
              apiBaseUrl: "http://127.0.0.1:3402",
              writingMode: "english",
              enabled: true,
            },
          })),
        },
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await import("../../../browser-extension/src/background.js?malformed-text-test");

    for (const text of [undefined, "", "   "]) {
      const sendResponse = vi.fn();
      const keepsChannelOpen = listeners[0](
        {
          type: "ALFARAHEEDI_ANALYZE_TEXT",
          text,
        },
        {},
        sendResponse,
      );

      expect(keepsChannelOpen).toBe(false);
      expect(sendResponse).toHaveBeenCalledWith({
        ok: false,
        skipped: true,
        error: "No text to check.",
      });
    }

    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("rejects oversized background analysis text before reading settings or calling the API", async () => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => listeners.push(listener)),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            alfaraheediSettings: {
              apiBaseUrl: "http://127.0.0.1:3402",
              writingMode: "english",
              enabled: true,
            },
          })),
        },
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await import("../../../browser-extension/src/background.js?oversized-text-test");

    const sendResponse = vi.fn();
    const keepsChannelOpen = listeners[0](
      {
        type: "ALFARAHEEDI_ANALYZE_TEXT",
        text: "a".repeat(6_001),
      },
      {},
      sendResponse,
    );

    expect(keepsChannelOpen).toBe(false);
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      skipped: true,
      error: "Text is too long for local checking.",
    });
    expect(chrome.storage.local.get).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("skips background analysis without calling the API when checking is paused", async () => {
    const listeners = [];
    globalThis.chrome = {
      runtime: {
        onMessage: {
          addListener: vi.fn((listener) => listeners.push(listener)),
        },
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            alfaraheediSettings: {
              apiBaseUrl: "http://127.0.0.1:3402",
              writingMode: "english",
              enabled: false,
            },
          })),
        },
      },
    };
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await import("../../../browser-extension/src/background.js?paused-test");

    const sendResponse = vi.fn();
    const keepsChannelOpen = listeners[0](
      {
        type: "ALFARAHEEDI_ANALYZE_TEXT",
        text: "helo wat you are do?",
      },
      {},
      sendResponse,
    );
    await vi.waitFor(() => expect(sendResponse).toHaveBeenCalled());

    expect(keepsChannelOpen).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendResponse).toHaveBeenCalledWith({
      ok: false,
      skipped: true,
      error: "Nahou checking is paused.",
    });

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("lets background settings choose writing mode for content script messages", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: { suggestions: [] },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?settings-message-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo wat you are do?",
    });

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("shows local API reachability in the toolbar popup", async () => {
    document.body.innerHTML = `
      <main>
        <h1>Nahou</h1>
        <dl>
          <dt>Local API</dt>
          <dd id="api-base-url">Loading...</dd>
          <dt>Writing mode</dt>
          <dd id="writing-mode">Loading...</dd>
          <dt>API status</dt>
          <dd id="api-status">Checking...</dd>
          <dt>Checking</dt>
          <dd id="checking-status">Loading...</dd>
        </dl>
        <button id="toggle-enabled" type="button">Loading...</button>
        <button id="open-options" type="button">Open settings</button>
        <p id="status" role="status"></p>
      </main>
    `;
    globalThis.chrome = {
      runtime: {
        openOptionsPage: vi.fn(async () => undefined),
      },
      storage: {
        local: {
          get: vi.fn(async () => ({
            alfaraheediSettings: {
              apiBaseUrl: "http://127.0.0.1:3402",
              writingMode: "mixed",
              enabled: true,
            },
          })),
          set: vi.fn(async () => undefined),
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "ok", service: "write-api" }),
      })),
    );

    await import("../../../browser-extension/src/popup.js?health-popup-test");
    await vi.waitFor(() =>
      expect(document.querySelector("#api-status").textContent).toBe(
        "Local API reachable.",
      ),
    );

    expect(document.querySelector("#api-base-url").textContent).toBe(
      "http://127.0.0.1:3402",
    );
    expect(document.querySelector("#writing-mode").textContent).toBe("Mixed");
    expect(document.querySelector("#checking-status").textContent).toBe("On");
    expect(document.querySelector("#toggle-enabled").textContent).toBe(
      "Pause checking",
    );
    expect(fetch).toHaveBeenCalledWith("http://127.0.0.1:3402/v1/health", {
      method: "GET",
    });

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("lets the toolbar popup pause extension checking", async () => {
    document.body.innerHTML = `
      <main>
        <h1>Nahou</h1>
        <dl>
          <dt>Local API</dt>
          <dd id="api-base-url">Loading...</dd>
          <dt>Writing mode</dt>
          <dd id="writing-mode">Loading...</dd>
          <dt>API status</dt>
          <dd id="api-status">Checking...</dd>
          <dt>Checking</dt>
          <dd id="checking-status">Loading...</dd>
        </dl>
        <button id="toggle-enabled" type="button">Loading...</button>
        <button id="open-options" type="button">Open settings</button>
        <p id="status" role="status"></p>
      </main>
    `;
    const store = {
      alfaraheediSettings: {
        apiBaseUrl: "http://127.0.0.1:3402",
        writingMode: "mixed",
        enabled: true,
      },
    };
    globalThis.chrome = {
      runtime: {
        openOptionsPage: vi.fn(async () => undefined),
      },
      storage: {
        local: {
          get: vi.fn(async () => store),
          set: vi.fn(async (value) => Object.assign(store, value)),
        },
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ status: "ok", service: "write-api" }),
      })),
    );

    await import("../../../browser-extension/src/popup.js?toggle-popup-test");
    await vi.waitFor(() =>
      expect(document.querySelector("#toggle-enabled").textContent).toBe(
        "Pause checking",
      ),
    );

    document.querySelector("#toggle-enabled").click();
    await vi.waitFor(() =>
      expect(document.querySelector("#checking-status").textContent).toBe("Paused"),
    );

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      alfaraheediSettings: {
        apiBaseUrl: "http://127.0.0.1:3402",
        writingMode: "mixed",
        enabled: false,
      },
    });
    expect(document.querySelector("#toggle-enabled").textContent).toBe(
      "Resume checking",
    );

    vi.unstubAllGlobals();
    delete globalThis.chrome;
  });

  it("saves the enabled setting from the extension options page", async () => {
    document.body.innerHTML = `
      <form id="settings-form">
        <input id="api-base-url" name="apiBaseUrl" type="url">
        <select id="writing-mode" name="writingMode">
          <option value="auto">Auto</option>
          <option value="mixed">Mixed</option>
        </select>
        <input id="enabled" name="enabled" type="checkbox">
        <button type="submit">Save</button>
      </form>
      <p id="status" role="status"></p>
    `;
    const store = {
      alfaraheediSettings: {
        apiBaseUrl: "http://127.0.0.1:3402",
        writingMode: "mixed",
        enabled: true,
      },
    };
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => store),
          set: vi.fn(async (value) => Object.assign(store, value)),
        },
      },
    };

    await import("../../../browser-extension/src/options.js?enabled-options-test");
    await vi.waitFor(() =>
      expect(document.querySelector("#api-base-url").value).toBe(
        "http://127.0.0.1:3402",
      ),
    );

    document.querySelector("#enabled").checked = false;
    document.querySelector("#settings-form").dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector("#status").textContent).toBe("Saved."),
    );

    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      alfaraheediSettings: {
        apiBaseUrl: "http://127.0.0.1:3402",
        writingMode: "mixed",
        enabled: false,
      },
    });

    delete globalThis.chrome;
  });

  it("shows an error and preserves settings when options save uses a remote API URL", async () => {
    document.body.innerHTML = `
      <form id="settings-form">
        <input id="api-base-url" name="apiBaseUrl" type="url">
        <select id="writing-mode" name="writingMode">
          <option value="auto">Auto</option>
          <option value="english">English</option>
          <option value="mixed">Mixed</option>
        </select>
        <input id="enabled" name="enabled" type="checkbox">
        <button type="submit">Save</button>
      </form>
      <p id="status" role="status"></p>
    `;
    const store = {
      alfaraheediSettings: {
        apiBaseUrl: "http://127.0.0.1:3402",
        writingMode: "mixed",
        enabled: true,
      },
    };
    globalThis.chrome = {
      storage: {
        local: {
          get: vi.fn(async () => store),
          set: vi.fn(async (value) => Object.assign(store, value)),
        },
      },
    };

    await import("../../../browser-extension/src/options.js?remote-url-options-test");
    await vi.waitFor(() =>
      expect(document.querySelector("#api-base-url").value).toBe(
        "http://127.0.0.1:3402",
      ),
    );

    document.querySelector("#api-base-url").value = "https://example.com";
    document.querySelector("#writing-mode").value = "english";
    document.querySelector("#enabled").checked = false;
    document.querySelector("#settings-form").dispatchEvent(
      new SubmitEvent("submit", { bubbles: true, cancelable: true }),
    );
    await vi.waitFor(() =>
      expect(document.querySelector("#status").textContent).toBe(
        "Nahou extension only connects to a loopback API URL.",
      ),
    );

    expect(chrome.storage.local.set).not.toHaveBeenCalled();
    expect(store.alfaraheediSettings).toEqual({
      apiBaseUrl: "http://127.0.0.1:3402",
      writingMode: "mixed",
      enabled: true,
    });

    delete globalThis.chrome;
  });
});
