(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});
  const state = runtime.state || (runtime.state = {});
  const HIGHLIGHT_NAME = "alfaraheedi-suggestions";
  const BADGE_SIZE_PX = 32;
  const BADGE_GAP_PX = 8;
  const VIEWPORT_MARGIN_PX = 8;

  if (!state.panelByEditor) state.panelByEditor = new WeakMap();
  if (!state.editorByPanel) state.editorByPanel = new WeakMap();
  if (!state.badgeByEditor) state.badgeByEditor = new WeakMap();
  if (!state.editorByBadge) state.editorByBadge = new WeakMap();
  if (!state.analysisByEditor) state.analysisByEditor = new WeakMap();
  if (!state.contentEditableInlineApply) {
    state.contentEditableInlineApply = new WeakMap();
  }
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
    state.contentEditableInlineApply.delete(editor);
    untrackEditorIfNoUi(editor);
  }

  function renderSuggestionMarks(editor, analysis) {
    clearSuggestionMarks(editor);
    state.analysisByEditor.set(editor, analysis);
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
    const rangeEntries = runtime.suggestionRangesForText(text, analysis);
    if (rangeEntries.length === 0) return null;
    const suggestions = Array.isArray(analysis?.suggestions) ? analysis.suggestions : [];

    const marks = document.createElement("div");
    marks.setAttribute("data-alfaraheedi-marks", "true");
    marks.className = "alfaraheedi-extension-marks";
    marks.setAttribute("aria-hidden", "true");

    let cursor = 0;
    for (const entry of rangeEntries) {
      const { range, suggestion } = entry;
      marks.append(document.createTextNode(text.slice(cursor, range.start)));
      const mark = document.createElement("mark");
      mark.textContent = text.slice(range.start, range.end);
      const suggestionIndex = suggestions.indexOf(suggestion);
      mark.setAttribute("data-alfaraheedi-suggestion-index", String(suggestionIndex));
      mark.addEventListener("mousedown", (event) => event.preventDefault());
      mark.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        runtime.renderSuggestionPanel?.(editor, analysis, {
          anchor: mark,
          selectedIndex: suggestionIndex,
        });
      });
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
    if (!supportsCssHighlights()) {
      state.contentEditableInlineApply.set(editor, false);
      return null;
    }

    const text = runtime.textFromContentEditable(editor);
    const ranges = runtime
      .markRangesForText(text, analysis)
      .map((range) => runtime.textRangeToDomRange(editor, range.start, range.end))
      .filter(Boolean);
    if (ranges.length === 0) return null;

    const highlight = new Highlight(...ranges);
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    state.cssHighlightEditor = editor;
    state.contentEditableInlineApply.set(editor, true);
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
      clearFieldBadge(editor);
      clearSuggestionMarks(editor);
    }
    document
      .querySelectorAll(
        "[data-alfaraheedi-panel], [data-alfaraheedi-marks], [data-alfaraheedi-badge]",
      )
      .forEach((element) => element.remove());
    clearCssHighlight();
  }

  function clearFieldBadge(editor) {
    const badge = state.badgeByEditor.get(editor);
    if (!badge) return;
    badge.remove();
    state.editorByBadge.delete(badge);
    state.badgeByEditor.delete(editor);
    untrackEditorIfNoUi(editor);
  }

  function renderFieldBadge(editor, analysis, options = {}) {
    clearFieldBadge(editor);
    const suggestions = Array.isArray(analysis?.suggestions)
      ? analysis.suggestions
      : [];
    if (suggestions.length === 0) return null;

    state.analysisByEditor.set(editor, analysis);
    const badge = document.createElement("button");
    badge.type = "button";
    badge.className = "alfaraheedi-extension-badge";
    badge.setAttribute("data-alfaraheedi-badge", "true");
    const issueLabel = suggestions.length === 1 ? "1 issue" : `${suggestions.length} issues`;
    const statusLabel = options.statusLabel ?? "Local";
    badge.setAttribute("aria-label", `Nahou suggestions: ${issueLabel}, ${statusLabel}`);
    badge.innerHTML = `<span class="alfaraheedi-extension-badge__count">${suggestions.length}</span><span class="alfaraheedi-extension-badge__status"></span>`;
    badge.querySelector(".alfaraheedi-extension-badge__status").textContent = statusLabel;
    const openCard = (event) => {
      event.preventDefault();
      event.stopPropagation();
      runtime.renderSuggestionPanel?.(editor, analysis, { anchor: badge });
    };
    badge.addEventListener("mousedown", (event) => event.preventDefault());
    badge.addEventListener("click", openCard);
    badge.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      openCard(event);
    });
    document.body.append(badge);
    positionFieldBadge(badge, editor);
    state.badgeByEditor.set(editor, badge);
    state.editorByBadge.set(badge, editor);
    trackEditorLayout(editor);
    trackEditorForRemoval(editor);
    return badge;
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
      clearFieldBadge(editor);
      clearSuggestionMarks(editor);
      for (const callback of state.detachedEditorCallbacks) {
        callback(editor);
      }
      state.trackedEditors.delete(editor);
    }
    disconnectEditorRemovalObserverIfIdle();
  }

  function untrackEditorIfNoUi(editor) {
    if (
      state.panelByEditor.has(editor) ||
      state.marksByEditor.has(editor) ||
      state.badgeByEditor.has(editor)
    ) {
      return;
    }
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
    const marks = state.marksByEditor.get(editor);
    if (marks instanceof HTMLElement) {
      positionMarks(marks, editor);
      syncPlainTextMarksToEditor(marks, editor);
    }

    const badge = state.badgeByEditor.get(editor);
    if (badge) {
      positionFieldBadge(badge, editor);
    }

    const panel = state.panelByEditor.get(editor);
    if (panel) {
      runtime.positionPanel(panel, editor);
    }
  }

  function positionFieldBadge(badge, editor) {
    const rect = editor.getBoundingClientRect();
    const isRtl = directionForEditor(editor) === "rtl";
    const minLeft = window.scrollX + VIEWPORT_MARGIN_PX;
    const maxLeft = window.scrollX + window.innerWidth - VIEWPORT_MARGIN_PX - BADGE_SIZE_PX;
    const preferredLeft = isRtl
      ? rect.left + window.scrollX + BADGE_GAP_PX
      : rect.right + window.scrollX - BADGE_SIZE_PX - BADGE_GAP_PX;
    const minTop = window.scrollY + VIEWPORT_MARGIN_PX;
    const maxTop = window.scrollY + window.innerHeight - VIEWPORT_MARGIN_PX - BADGE_SIZE_PX;
    const preferredTop = rect.bottom + window.scrollY - BADGE_SIZE_PX - BADGE_GAP_PX;

    badge.dir = isRtl ? "rtl" : "ltr";
    badge.style.left = `${Math.max(minLeft, Math.min(preferredLeft, maxLeft))}px`;
    badge.style.top = `${Math.max(minTop, Math.min(preferredTop, maxTop))}px`;
  }

  function directionForEditor(editor) {
    const computedDirection = window.getComputedStyle(editor).direction;
    if (computedDirection === "rtl" || computedDirection === "ltr") {
      const explicitDirection = editor
        .closest?.("[dir]")
        ?.getAttribute("dir")
        ?.toLowerCase();
      return explicitDirection === "rtl" || explicitDirection === "ltr"
        ? explicitDirection
        : computedDirection;
    }
    const explicitDirection = editor.getAttribute?.("dir")?.toLowerCase();
    return explicitDirection === "rtl" ? "rtl" : "ltr";
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

  function isFieldBadgeFocusTarget(target) {
    return (
      target instanceof Element &&
      target.closest("[data-alfaraheedi-badge]") !== null
    );
  }

  function editorForFieldBadgeTarget(target) {
    if (!(target instanceof Element)) return null;

    const badge = target.closest("[data-alfaraheedi-badge]");
    if (!badge) return null;
    return state.editorByBadge.get(badge) ?? null;
  }

  Object.assign(runtime, {
    addDetachedEditorCallback,
    clearFieldBadge,
    clearInjectedSuggestionUi,
    clearSuggestionMarks,
    editorForFieldBadgeTarget,
    isFieldBadgeFocusTarget,
    renderSuggestionMarks,
    renderFieldBadge,
    trackEditorForRemoval,
    trackEditorLayout,
    untrackEditorIfNoUi,
  });
})();
