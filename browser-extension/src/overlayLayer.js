(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});
  const state = runtime.state || (runtime.state = {});
  const HIGHLIGHT_NAME = "alfaraheedi-suggestions";

  if (!state.panelByEditor) state.panelByEditor = new WeakMap();
  if (!state.editorByPanel) state.editorByPanel = new WeakMap();
  if (!state.marksByEditor) state.marksByEditor = new WeakMap();
  if (!state.plainMarkScrollHandlers) state.plainMarkScrollHandlers = new WeakMap();
  if (!state.layoutSyncHandlers) state.layoutSyncHandlers = new WeakMap();
  if (!state.trackedEditors) state.trackedEditors = new Set();
  if (!state.detachedEditorCallbacks) state.detachedEditorCallbacks = new Set();
  if (!Object.prototype.hasOwnProperty.call(state, "cssHighlightEditor")) {
    state.cssHighlightEditor = null;
  }
  if (!Object.prototype.hasOwnProperty.call(state, "editorRemovalObserver")) {
    state.editorRemovalObserver = null;
  }

  function clearSuggestionMarks(editor) {
    const scrollHandler = state.plainMarkScrollHandlers.get(editor);
    if (scrollHandler) {
      editor.removeEventListener("scroll", scrollHandler);
      state.plainMarkScrollHandlers.delete(editor);
    }

    const marks = state.marksByEditor.get(editor);
    if (marks) {
      if (typeof marks.remove === "function") {
        marks.remove();
      }
      state.marksByEditor.delete(editor);
    }
    if (state.cssHighlightEditor === editor) {
      clearCssHighlight();
    }
    untrackEditorIfNoUi(editor);
  }

  function renderSuggestionMarks(editor, analysis) {
    clearSuggestionMarks(editor);
    if (state.cssHighlightEditor && state.cssHighlightEditor !== editor) {
      clearCssHighlight();
    }

    if (runtime.isContentEditableElement(editor)) {
      return renderContentEditableSuggestionMarks(editor, analysis);
    }

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      return renderPlainTextSuggestionMarks(editor, analysis);
    }

    return null;
  }

  function renderPlainTextSuggestionMarks(editor, analysis) {
    const text = editor.value;
    const ranges = runtime.markRangesForText(text, analysis);
    if (ranges.length === 0) return null;

    const marks = document.createElement("div");
    marks.setAttribute("data-alfaraheedi-marks", "true");
    marks.className = "alfaraheedi-extension-marks";
    marks.setAttribute("aria-hidden", "true");

    let cursor = 0;
    for (const range of ranges) {
      marks.append(document.createTextNode(text.slice(cursor, range.start)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(range.start, range.end);
      marks.append(mark);
      cursor = range.end;
    }
    marks.append(document.createTextNode(text.slice(cursor)));

    positionMarks(marks, editor);
    document.body.append(marks);
    syncPlainTextMarksToEditor(marks, editor);
    const scrollHandler = () => syncPlainTextMarksToEditor(marks, editor);
    editor.addEventListener("scroll", scrollHandler, { passive: true });
    state.plainMarkScrollHandlers.set(editor, scrollHandler);
    state.marksByEditor.set(editor, marks);
    trackEditorLayout(editor);
    trackEditorForRemoval(editor);
    return marks;
  }

  function renderContentEditableSuggestionMarks(editor, analysis) {
    if (!supportsCssHighlights()) return null;

    const text = runtime.textFromContentEditable(editor);
    const ranges = runtime
      .markRangesForText(text, analysis)
      .map((range) => runtime.textRangeToDomRange(editor, range.start, range.end))
      .filter(Boolean);
    if (ranges.length === 0) return null;

    const highlight = new Highlight(...ranges);
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    state.cssHighlightEditor = editor;
    state.marksByEditor.set(editor, { kind: "css-highlight" });
    trackEditorForRemoval(editor);
    return highlight;
  }

  function supportsCssHighlights() {
    return (
      typeof globalThis.Highlight === "function" &&
      typeof globalThis.CSS?.highlights?.set === "function" &&
      typeof document.createRange === "function"
    );
  }

  function clearCssHighlight() {
    if (typeof globalThis.CSS?.highlights?.delete === "function") {
      CSS.highlights.delete(HIGHLIGHT_NAME);
    }
    state.cssHighlightEditor = null;
  }

  function clearInjectedSuggestionUi() {
    for (const editor of [...state.trackedEditors]) {
      runtime.clearSuggestionPanel?.(editor);
      clearSuggestionMarks(editor);
    }
    document
      .querySelectorAll("[data-alfaraheedi-panel], [data-alfaraheedi-marks]")
      .forEach((element) => element.remove());
    clearCssHighlight();
  }

  function addDetachedEditorCallback(callback) {
    state.detachedEditorCallbacks.add(callback);
    return () => state.detachedEditorCallbacks.delete(callback);
  }

  function trackEditorForRemoval(editor) {
    state.trackedEditors.add(editor);
    if (state.editorRemovalObserver) return;
    state.editorRemovalObserver = new MutationObserver(cleanupDetachedEditors);
    state.editorRemovalObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function cleanupDetachedEditors() {
    for (const editor of [...state.trackedEditors]) {
      if (editor.isConnected) continue;
      runtime.clearSuggestionPanel?.(editor);
      clearSuggestionMarks(editor);
      for (const callback of state.detachedEditorCallbacks) {
        callback(editor);
      }
      state.trackedEditors.delete(editor);
    }
    disconnectEditorRemovalObserverIfIdle();
  }

  function untrackEditorIfNoUi(editor) {
    if (state.panelByEditor.has(editor) || state.marksByEditor.has(editor)) return;
    untrackEditorLayout(editor);
    state.trackedEditors.delete(editor);
    disconnectEditorRemovalObserverIfIdle();
  }

  function disconnectEditorRemovalObserverIfIdle() {
    if (state.trackedEditors.size > 0 || !state.editorRemovalObserver) return;
    state.editorRemovalObserver.disconnect();
    state.editorRemovalObserver = null;
  }

  function trackEditorLayout(editor) {
    if (state.layoutSyncHandlers.has(editor)) return;
    const syncLayout = () => syncInjectedUiLayout(editor);
    window.addEventListener("scroll", syncLayout, true);
    window.addEventListener("resize", syncLayout);
    state.layoutSyncHandlers.set(editor, syncLayout);
  }

  function untrackEditorLayout(editor) {
    const syncLayout = state.layoutSyncHandlers.get(editor);
    if (!syncLayout) return;
    window.removeEventListener("scroll", syncLayout, true);
    window.removeEventListener("resize", syncLayout);
    state.layoutSyncHandlers.delete(editor);
  }

  function syncInjectedUiLayout(editor) {
    const panel = state.panelByEditor.get(editor);
    if (panel) {
      runtime.positionPanel(panel, editor);
    }

    const marks = state.marksByEditor.get(editor);
    if (marks instanceof HTMLElement) {
      positionMarks(marks, editor);
      syncPlainTextMarksToEditor(marks, editor);
    }
  }

  function positionMarks(marks, editor) {
    const rect = editor.getBoundingClientRect();
    const style = window.getComputedStyle(editor);
    marks.style.position = "absolute";
    marks.style.boxSizing = "border-box";
    marks.style.insetInlineStart = `${rect.left + window.scrollX}px`;
    marks.style.top = `${rect.top + window.scrollY}px`;
    marks.style.width = `${rect.width}px`;
    marks.style.height = `${rect.height}px`;
    marks.style.minHeight = `${rect.height}px`;
    marks.style.padding = style.padding;
    marks.style.border = "1px solid transparent";
    marks.style.font = style.font;
    marks.style.letterSpacing = style.letterSpacing;
    marks.style.lineHeight = style.lineHeight;
  }

  function syncPlainTextMarksToEditor(marks, editor) {
    marks.scrollTop = editor.scrollTop;
    marks.scrollLeft = editor.scrollLeft;
  }

  Object.assign(runtime, {
    addDetachedEditorCallback,
    clearInjectedSuggestionUi,
    clearSuggestionMarks,
    renderSuggestionMarks,
    trackEditorForRemoval,
    trackEditorLayout,
    untrackEditorIfNoUi,
  });
})();
