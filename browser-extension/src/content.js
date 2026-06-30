(() => {
  const ANALYZE_MESSAGE = "ALFARAHEEDI_ANALYZE_TEXT";
  const PAGE_LOCATION_MESSAGE = "ALFARAHEEDI_PAGE_LOCATION";
  const SETTINGS_STORAGE_KEY = "alfaraheediSettings";
  const DEBOUNCE_MS = 650;
  const MAX_TEXT_CHARS = 6_000;
  const DEFAULT_CONTENT_SETTINGS = Object.freeze({
    enabled: true,
    disabledHosts: [],
  });
  const CLOSED_CONTENT_SETTINGS = Object.freeze({
    enabled: false,
    disabledHosts: [],
  });
  const runtime = globalThis.NahouExtensionRuntime;

  if (!runtime) {
    throw new Error("Nahou extension runtime helpers must load before src/content.js.");
  }

  const {
    addDetachedEditorCallback,
    clearInjectedSuggestionUi,
    clearSuggestionMarks,
    clearSuggestionPanel,
    editableElementForEvent,
    editableElementForTarget,
    editorForFieldBadgeTarget,
    editorForSuggestionPanelTarget,
    isFieldBadgeFocusTarget,
    isSuggestionPanelFocusTarget,
    renderStatusPanel,
    renderFieldBadge,
    renderSuggestionMarks,
    renderSuggestionPanel,
    shouldKeepSuggestionUiForFocusMove,
    suggestionPanelForEditor,
    textFromEditor,
  } = runtime;
  const composingEditors = new WeakSet();
  let activeEditor = null;
  let debounceTimer = 0;
  let requestSeq = 0;
  let contentSettings = null;
  let contentSettingsPromise = null;

  addDetachedEditorCallback((editor) => {
    if (activeEditor === editor) activeEditor = null;
  });

  setupSettingsChangeListener();

  if (globalThis.chrome?.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
      if (message?.type !== PAGE_LOCATION_MESSAGE) return false;
      sendResponse({ url: window.location.href });
      return false;
    });
  }

  document.addEventListener("focusin", (event) => {
    activeEditor = editableElementForEvent(event);
    if (activeEditor) scheduleAnalysis(activeEditor);
  });

  document.addEventListener("input", (event) => {
    const editor = editableElementForEvent(event);
    if (!editor) return;
    activeEditor = editor;
    if (event.isComposing || composingEditors.has(editor)) return;
    clearSuggestionPanel(editor);
    clearSuggestionMarks(editor);
    clearInjectedSuggestionUi();
    scheduleAnalysis(editor);
  });

  document.addEventListener("compositionstart", (event) => {
    const editor = editableElementForEvent(event);
    if (!editor) return;
    activeEditor = editor;
    composingEditors.add(editor);
    window.clearTimeout(debounceTimer);
  });

  document.addEventListener("compositionend", (event) => {
    const editor = editableElementForEvent(event);
    if (!editor) return;
    activeEditor = editor;
    composingEditors.delete(editor);
    scheduleAnalysis(editor);
  });

  document.addEventListener("focusout", (event) => {
    const editor = editableElementForEvent(event);
    if (editor) {
      const panel = suggestionPanelForEditor(editor);
      if (
        (panel && shouldKeepSuggestionUiForFocusMove(editor, panel, event.relatedTarget)) ||
        isSuggestionPanelFocusTarget(event.relatedTarget) ||
        isFieldBadgeFocusTarget?.(event.relatedTarget)
      ) {
        return;
      }
      cancelPendingAnalysisForEditor(editor);
      clearSuggestionPanel(editor);
      clearSuggestionMarks(editor);
      clearInjectedSuggestionUi();
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;
    const editor = editorForDismissEvent(event);
    if (!editor) return;

    clearSuggestionPanel(editor);
    clearSuggestionMarks(editor);
    clearInjectedSuggestionUi();
    focusEditor(editor);
    event.preventDefault();
    event.stopPropagation();
  });

  function scheduleAnalysis(editor) {
    window.clearTimeout(debounceTimer);
    debounceTimer = window.setTimeout(() => {
      void analyzeEditor(editor);
    }, DEBOUNCE_MS);
  }

  function cancelPendingAnalysisForEditor(editor) {
    if (activeEditor === editor) {
      activeEditor = null;
    }
    window.clearTimeout(debounceTimer);
    debounceTimer = 0;
  }

  async function analyzeEditor(editor) {
    if (composingEditors.has(editor)) return;
    if (!editorHasFocus(editor)) return;

    const currentSeq = requestSeq + 1;
    requestSeq = currentSeq;
    const settings = await getContentSettings();
    if (requestSeq !== currentSeq || activeEditor !== editor) return;
    if (!editorHasFocus(editor)) return;
    if (!canAnalyzeCurrentPage(settings)) {
      clearSuggestionPanel(editor);
      clearSuggestionMarks(editor);
      clearInjectedSuggestionUi();
      return;
    }

    const text = textFromEditor(editor);
    if (!text.trim()) {
      clearSuggestionPanel(editor);
      return;
    }
    if (text.length > MAX_TEXT_CHARS) {
      clearInjectedSuggestionUi();
      clearSuggestionMarks(editor);
      renderStatusPanel(editor, "Text is too long for local checking.");
      return;
    }

    const response = await Promise.resolve(sendAnalyzeMessage(text)).catch(() => ({
      ok: false,
      error: "Nahou local API is unavailable.",
    }));
    if (requestSeq !== currentSeq || activeEditor !== editor) return;
    if (textFromEditor(editor) !== text) return;

    if (response?.ok) {
      clearInjectedSuggestionUi();
      renderSuggestionMarks(editor, response.analysis);
      renderFieldBadge?.(editor, response.analysis, { statusLabel: "Local" });
    } else if (response?.skipped) {
      clearSuggestionPanel(editor);
      clearSuggestionMarks(editor);
      clearInjectedSuggestionUi();
    } else {
      clearInjectedSuggestionUi();
      clearSuggestionMarks(editor);
      renderStatusPanel(editor, safeAnalysisError(response));
    }
  }

  function safeAnalysisError(response) {
    if (response?.error === "Nahou checking is paused.") {
      return response.error;
    }
    if (response?.error === "Nahou checking is disabled on this site.") {
      return response.error;
    }
    if (response?.error === "Nahou extension only connects to a loopback API URL.") {
      return response.error;
    }
    return "Nahou local API is unavailable.";
  }

  function editorHasFocus(editor) {
    const root = editor.getRootNode();
    const activeElement =
      root instanceof Document || root instanceof ShadowRoot
        ? root.activeElement
        : document.activeElement;
    return activeElement === editor || editor.contains(activeElement);
  }

  function sendAnalyzeMessage(text) {
    if (!globalThis.chrome?.runtime?.sendMessage) {
      return Promise.resolve({ ok: false, error: "Extension runtime is unavailable." });
    }

    return chrome.runtime.sendMessage({
      type: ANALYZE_MESSAGE,
      text,
    });
  }

  async function getContentSettings() {
    if (contentSettings) return contentSettings;
    if (contentSettingsPromise) return contentSettingsPromise;
    if (typeof globalThis.chrome?.storage?.local?.get !== "function") {
      contentSettings = CLOSED_CONTENT_SETTINGS;
      return contentSettings;
    }

    contentSettingsPromise = Promise.resolve(
      globalThis.chrome.storage.local.get(SETTINGS_STORAGE_KEY),
    )
      .then((stored) => {
        contentSettings = normalizeContentSettings(stored?.[SETTINGS_STORAGE_KEY]);
        return contentSettings;
      })
      .catch(() => {
        contentSettings = CLOSED_CONTENT_SETTINGS;
        return contentSettings;
      });

    return contentSettingsPromise;
  }

  function setupSettingsChangeListener() {
    if (typeof globalThis.chrome?.storage?.onChanged?.addListener !== "function") {
      return;
    }

    globalThis.chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== "local" || !changes?.[SETTINGS_STORAGE_KEY]) return;
      contentSettings = normalizeContentSettings(
        changes[SETTINGS_STORAGE_KEY].newValue,
      );
      contentSettingsPromise = null;

      if (!canAnalyzeCurrentPage(contentSettings)) {
        window.clearTimeout(debounceTimer);
        debounceTimer = 0;
        requestSeq += 1;
        if (activeEditor) {
          clearSuggestionPanel(activeEditor);
          clearSuggestionMarks(activeEditor);
          clearInjectedSuggestionUi();
        }
      }
    });
  }

  function normalizeContentSettings(settings) {
    if (!settings || typeof settings !== "object") return DEFAULT_CONTENT_SETTINGS;
    return {
      enabled:
        typeof settings.enabled === "boolean"
          ? settings.enabled
          : DEFAULT_CONTENT_SETTINGS.enabled,
      disabledHosts: normalizeDisabledHosts(settings.disabledHosts),
    };
  }

  function normalizeDisabledHosts(hosts) {
    if (!Array.isArray(hosts)) return [];
    return Array.from(
      new Set(
        hosts
          .map((host) => (typeof host === "string" ? host.trim().toLowerCase() : ""))
          .filter((host) => /^[a-z0-9.-]+$/u.test(host)),
      ),
    ).sort();
  }

  function canAnalyzeCurrentPage(settings) {
    if (!settings.enabled) return false;
    const host = currentPageHost();
    return !host || !settings.disabledHosts.includes(host);
  }

  function currentPageHost() {
    try {
      const url = new URL(window.location.href);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      return url.hostname.toLowerCase();
    } catch {
      return null;
    }
  }

  function editorForDismissEvent(event) {
    const editor = editableElementForEvent(event);
    if (editor) return editor;
    return editorForDismissTarget(event.target);
  }

  function editorForDismissTarget(target) {
    const editor = editableElementForTarget(target);
    if (editor) return editor;
    const badgeEditor = editorForFieldBadgeTarget?.(target);
    if (badgeEditor) return badgeEditor;
    return editorForSuggestionPanelTarget(target, activeEditor);
  }

  function focusEditor(editor) {
    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }
  }
})();
