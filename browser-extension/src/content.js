(() => {
  const ANALYZE_MESSAGE = "ALFARAHEEDI_ANALYZE_TEXT";
  const PAGE_LOCATION_MESSAGE = "ALFARAHEEDI_PAGE_LOCATION";
  const DEBOUNCE_MS = 650;
  const MAX_TEXT_CHARS = 6_000;
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
    editorForSuggestionPanelTarget,
    isSuggestionPanelFocusTarget,
    renderStatusPanel,
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

  addDetachedEditorCallback((editor) => {
    if (activeEditor === editor) activeEditor = null;
  });

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
        isSuggestionPanelFocusTarget(event.relatedTarget)
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

    const currentSeq = requestSeq + 1;
    requestSeq = currentSeq;
    const response = await Promise.resolve(sendAnalyzeMessage(text)).catch(() => ({
      ok: false,
      error: "Nahou local API is unavailable.",
    }));
    if (requestSeq !== currentSeq || activeEditor !== editor) return;
    if (textFromEditor(editor) !== text) return;

    if (response?.ok) {
      clearInjectedSuggestionUi();
      renderSuggestionMarks(editor, response.analysis);
      renderSuggestionPanel(editor, response.analysis);
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

  function editorForDismissEvent(event) {
    const editor = editableElementForEvent(event);
    if (editor) return editor;
    return editorForDismissTarget(event.target);
  }

  function editorForDismissTarget(target) {
    const editor = editableElementForTarget(target);
    if (editor) return editor;
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
