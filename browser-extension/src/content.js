(() => {
  const ANALYZE_MESSAGE = "ALFARAHEEDI_ANALYZE_TEXT";
  const DEBOUNCE_MS = 650;
  const MAX_TEXT_CHARS = 6_000;
  const HIGHLIGHT_NAME = "alfaraheedi-suggestions";
  const PANEL_MAX_WIDTH_PX = 360;
  const VIEWPORT_MARGIN_PX = 8;
  const BLOCK_LINE_TAGS = new Set([
    "ADDRESS",
    "ARTICLE",
    "ASIDE",
    "BLOCKQUOTE",
    "DD",
    "DIV",
    "DL",
    "DT",
    "FIGCAPTION",
    "FIGURE",
    "FOOTER",
    "H1",
    "H2",
    "H3",
    "H4",
    "H5",
    "H6",
    "HEADER",
    "LI",
    "MAIN",
    "NAV",
    "OL",
    "P",
    "PRE",
    "SECTION",
    "UL",
  ]);
  const panelByEditor = new WeakMap();
  const editorByPanel = new WeakMap();
  const marksByEditor = new WeakMap();
  const plainMarkScrollHandlers = new WeakMap();
  const layoutSyncHandlers = new WeakMap();
  const composingEditors = new WeakSet();
  const trackedEditors = new Set();
  const TEXT_LIKE_INPUT_TYPES = new Set(["email", "search", "tel", "text", "url"]);
  const SENSITIVE_AUTOCOMPLETE_TOKENS = new Set([
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-number",
    "current-password",
    "new-password",
    "one-time-code",
  ]);
  const SENSITIVE_EDITABLE_HINT_RE =
    /(?:^|[-_\s])(?:2fa|api[-_\s]*key|apikey|auth|card|cc|credit|csc|cvc|cvv|mfa|otp|passcode|password|secret|ssn|token)(?:$|[-_\s])/iu;
  const SENSITIVE_CONTEXT_SELECTOR =
    'form,fieldset,[role="group"],[role="region"],[aria-label],[aria-labelledby]';
  const IGNORED_RICH_EDITOR_SENTINEL_SELECTOR =
    '[data-slate-zero-width],[data-slate-placeholder="true"],[data-lexical-placeholder="true"],.ProseMirror-trailingBreak';
  let activeEditor = null;
  let debounceTimer = 0;
  let elementIdSeq = 0;
  let requestSeq = 0;
  let cssHighlightEditor = null;
  let editorRemovalObserver = null;

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
      const panel = panelByEditor.get(editor);
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
    const response = await Promise.resolve(sendAnalyzeMessage(text)).catch((error) => ({
      ok: false,
      error: "Alfaraheedi local API is unavailable.",
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
    if (response?.error === "Alfaraheedi checking is paused.") {
      return response.error;
    }
    if (response?.error === "Alfaraheedi extension only connects to a loopback API URL.") {
      return response.error;
    }
    return "Alfaraheedi local API is unavailable.";
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

  function editableElementForTarget(target) {
    if (!(target instanceof Element)) return null;
    const textControl = target.closest("textarea,input");
    if (textControl) {
      return isIgnoredEditable(textControl) ? null : textControl;
    }
    if (isAriaUnavailableEditable(target)) return null;
    return contentEditableElementForTarget(target);
  }

  function editableElementForEvent(event) {
    if (typeof event.composedPath === "function") {
      for (const target of event.composedPath()) {
        const editor = editableElementForTarget(target);
        if (editor) return editor;
      }
    }

    return editableElementForTarget(event.target);
  }

  function isIgnoredEditable(element) {
    if (isAriaUnavailableEditable(element)) return true;

    if (element instanceof HTMLTextAreaElement) {
      return element.readOnly || element.disabled || hasSensitiveEditableContext(element);
    }

    if (element instanceof HTMLInputElement) {
      return (
        element.readOnly ||
        element.disabled ||
        !TEXT_LIKE_INPUT_TYPES.has(element.type) ||
        hasSensitiveEditableContext(element)
      );
    }

    return false;
  }

  function hasSensitiveEditableHint(element) {
    const autocompleteTokens = (element.getAttribute("autocomplete") ?? "")
      .trim()
      .toLowerCase()
      .split(/\s+/u)
      .filter(Boolean);
    if (autocompleteTokens.some((token) => SENSITIVE_AUTOCOMPLETE_TOKENS.has(token))) {
      return true;
    }

    const hintText = [
      element.id,
      element.getAttribute("name"),
      element.getAttribute("aria-label"),
      element.getAttribute("aria-placeholder"),
      element.getAttribute("placeholder"),
      element.getAttribute("title"),
    ]
      .filter(Boolean)
      .join(" ");
    return SENSITIVE_EDITABLE_HINT_RE.test(hintText);
  }

  function hasSensitiveEditableContext(element) {
    if (hasSensitiveEditableHint(element)) return true;

    let current = element.parentElement;
    while (current && current !== document.body) {
      if (isSensitiveEditableContextElement(current)) return true;
      current = current.parentElement;
    }
    return false;
  }

  function isSensitiveEditableContextElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.matches(SENSITIVE_CONTEXT_SELECTOR)) return false;

    if (hasSensitiveEditableHint(element)) return true;

    const labelText = labelledByText(element);
    if (SENSITIVE_EDITABLE_HINT_RE.test(labelText)) return true;

    if (element instanceof HTMLFieldSetElement) {
      const legend = Array.from(element.children).find(
        (child) => child instanceof HTMLLegendElement,
      );
      return SENSITIVE_EDITABLE_HINT_RE.test(legend?.textContent ?? "");
    }

    return false;
  }

  function labelledByText(element) {
    return (element.getAttribute("aria-labelledby") ?? "")
      .trim()
      .split(/\s+/u)
      .map((id) => element.ownerDocument.getElementById(id)?.textContent ?? "")
      .filter(Boolean)
      .join(" ");
  }

  function isAriaUnavailableEditable(element) {
    return (
      element instanceof Element &&
      (element.getAttribute("aria-readonly")?.trim().toLowerCase() === "true" ||
        element.getAttribute("aria-disabled")?.trim().toLowerCase() === "true")
    );
  }

  function textFromEditor(editor) {
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      return editor.value;
    }
    return textFromContentEditable(editor);
  }

  function textFromContentEditable(editor) {
    let text = "";

    function appendLineBreak() {
      if (text && !text.endsWith("\n")) text += "\n";
    }

    function appendNodeText(node) {
      if (node !== editor && node instanceof HTMLElement && isIgnoredRichEditorIsland(node)) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        text += node.nodeValue ?? "";
        return;
      }

      if (node instanceof HTMLBRElement) {
        text += "\n";
        return;
      }

      const isBlockLine = node !== editor && isBlockLineElement(node);
      if (isBlockLine) appendLineBreak();

      for (const child of node.childNodes) {
        appendNodeText(child);
      }

      if (isBlockLine) appendLineBreak();
    }

    appendNodeText(editor);
    return text.replace(/\n+$/u, "");
  }

  function isBlockLineElement(node) {
    return node instanceof HTMLElement && BLOCK_LINE_TAGS.has(node.tagName);
  }

  function displayReplacementForSuggestion(suggestion) {
    const replacement = replacementForSuggestion(suggestion);
    if (replacement) return replacement;
    return suggestion.explanation ?? "Review this text";
  }

  function applyLabelForSuggestion(suggestion) {
    return `Apply suggestion: ${displayReplacementForSuggestion(suggestion)}`;
  }

  function replacementForSuggestion(suggestion) {
    if (suggestion.replacement) return suggestion.replacement;
    if (Array.isArray(suggestion.replacements) && suggestion.replacements[0]) {
      return suggestion.replacements[0];
    }
    return null;
  }

  function applySuggestionToEditor(editor, suggestion) {
    const original = suggestion?.original;
    const replacement = replacementForSuggestion(suggestion);
    if (!original || !replacement) return false;

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const textRange = rangeForSuggestion(editor.value, suggestion);
      if (!textRange) return false;
      editor.value = replaceAt(
        editor.value,
        textRange.start,
        textRange.end - textRange.start,
        replacement,
      );
      setPlainTextSelection(editor, textRange.start + replacement.length);
      dispatchReplacementInputEvent(editor, replacement);
      return true;
    }

    if (isContentEditableElement(editor)) {
      const text = textFromContentEditable(editor);
      const textRange = rangeForSuggestion(text, suggestion);
      if (!textRange) return false;
      const domRange = textRangeToDomRange(editor, textRange.start, textRange.end);
      if (!domRange || domRange.toString() !== original) return false;
      const replacementNode = replaceDomRange(domRange, replacement);
      setContentEditableSelectionAfter(replacementNode);
      dispatchReplacementInputEvent(editor, replacement);
      return true;
    }

    return false;
  }

  function replaceAt(text, index, length, replacement) {
    return `${text.slice(0, index)}${replacement}${text.slice(index + length)}`;
  }

  function isContentEditableElement(element) {
    return element instanceof HTMLElement && hasEditableContentEditableValue(element);
  }

  function contentEditableElementForTarget(target) {
    let element = target;
    while (element instanceof HTMLElement) {
      if (element.hasAttribute("contenteditable")) {
        if (isAriaUnavailableEditable(element)) return null;
        if (hasDisabledContentEditableValue(element)) return null;
        if (hasSensitiveEditableContext(element)) return null;
        if (hasEditableContentEditableValue(element)) return element;
      }
      element = element.parentElement;
    }
    return null;
  }

  function hasEditableContentEditableValue(element) {
    if (!element.hasAttribute("contenteditable")) return false;
    const value = contentEditableValue(element);
    return value === "" || value === "true" || value === "plaintext-only";
  }

  function hasDisabledContentEditableValue(element) {
    if (!element.hasAttribute("contenteditable")) return false;
    return contentEditableValue(element) === "false";
  }

  function isIgnoredRichEditorIsland(element) {
    if (element.matches(IGNORED_RICH_EDITOR_SENTINEL_SELECTOR)) return true;
    if (hasDisabledContentEditableValue(element)) return true;
    if (element.hidden) return true;
    if (element.getAttribute("aria-hidden")?.trim().toLowerCase() === "true") {
      return true;
    }

    const style = window.getComputedStyle(element);
    return style.display === "none" || style.visibility === "hidden";
  }

  function contentEditableValue(element) {
    return (element.getAttribute("contenteditable") ?? "").trim().toLowerCase();
  }

  function clearSuggestionPanel(editor) {
    const panel = panelByEditor.get(editor);
    if (panel) {
      panel.remove();
      editorByPanel.delete(panel);
      panelByEditor.delete(editor);
    }
    untrackEditorIfNoUi(editor);
  }

  function clearSuggestionMarks(editor) {
    const scrollHandler = plainMarkScrollHandlers.get(editor);
    if (scrollHandler) {
      editor.removeEventListener("scroll", scrollHandler);
      plainMarkScrollHandlers.delete(editor);
    }

    const marks = marksByEditor.get(editor);
    if (marks) {
      if (typeof marks.remove === "function") {
        marks.remove();
      }
      marksByEditor.delete(editor);
    }
    if (cssHighlightEditor === editor) {
      clearCssHighlight();
    }
    untrackEditorIfNoUi(editor);
  }

  function renderStatusPanel(editor, message) {
    clearSuggestionPanel(editor);
    const panel = basePanel(editor);
    panel.classList.add("alfaraheedi-extension-panel--muted");
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-label", "Alfaraheedi status");
    panel.textContent = message;
    document.body.append(panel);
    positionPanel(panel, editor);
    panelByEditor.set(editor, panel);
    trackEditorLayout(editor);
    trackEditorForRemoval(editor);
  }

  function renderSuggestionPanel(editor, analysis) {
    clearSuggestionPanel(editor);
    const suggestions = Array.isArray(analysis?.suggestions)
      ? analysis.suggestions
      : [];
    if (suggestions.length === 0) return;
    const applicableSuggestions = applicableSuggestionSetForEditor(editor, analysis);

    const panel = basePanel(editor);
    const heading = document.createElement("strong");
    heading.textContent =
      suggestions.length === 1
        ? "Alfaraheedi suggestion"
        : `Alfaraheedi suggestions (${suggestions.length})`;
    panel.append(heading);

    const list = document.createElement("ul");
    for (const suggestion of suggestions.slice(0, 5)) {
      const item = document.createElement("li");
      const source = document.createElement("code");
      source.dir = "auto";
      source.textContent = suggestion.source ?? "suggestion";
      const replacement = document.createElement("span");
      replacement.dir = "auto";
      replacement.textContent = displayReplacementForSuggestion(suggestion);
      replacement.id = nextElementId("replacement");
      item.append(source, replacement);
      if (applicableSuggestions.has(suggestion)) {
        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.textContent = "Apply";
        applyButton.setAttribute("aria-label", applyLabelForSuggestion(suggestion));
        applyButton.setAttribute("aria-describedby", replacement.id);
        applyButton.addEventListener("mousedown", (event) => event.preventDefault());
        applyButton.addEventListener("click", () => {
          if (applySuggestionToEditor(editor, suggestion)) {
            clearSuggestionPanel(editor);
            clearSuggestionMarks(editor);
            clearInjectedSuggestionUi();
          } else {
            clearSuggestionMarks(editor);
            renderApplyFailureStatus(item, applyButton);
          }
        });
        item.append(applyButton);
      }
      list.append(item);
    }
    panel.append(list);

    document.body.append(panel);
    positionPanel(panel, editor);
    panelByEditor.set(editor, panel);
    trackEditorLayout(editor);
    trackEditorForRemoval(editor);
  }

  function renderApplyFailureStatus(item, applyButton) {
    item.querySelector("[data-alfaraheedi-apply-status]")?.remove();
    const status = document.createElement("span");
    status.setAttribute("data-alfaraheedi-apply-status", "true");
    status.setAttribute("role", "status");
    status.textContent = "Suggestion no longer matches current text.";
    applyButton.disabled = true;
    item.append(status);
  }

  function renderSuggestionMarks(editor, analysis) {
    clearSuggestionMarks(editor);
    if (cssHighlightEditor && cssHighlightEditor !== editor) {
      clearCssHighlight();
    }

    if (isContentEditableElement(editor)) {
      renderContentEditableSuggestionMarks(editor, analysis);
      return;
    }

    if (!(editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement)) {
      return;
    }

    renderPlainTextSuggestionMarks(editor, analysis);
  }

  function renderPlainTextSuggestionMarks(editor, analysis) {
    const text = editor.value;
    const ranges = markRangesForText(text, analysis);
    if (ranges.length === 0) return;

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
    plainMarkScrollHandlers.set(editor, scrollHandler);
    marksByEditor.set(editor, marks);
    trackEditorLayout(editor);
    trackEditorForRemoval(editor);
  }

  function renderContentEditableSuggestionMarks(editor, analysis) {
    if (!supportsCssHighlights()) return;

    const text = textFromContentEditable(editor);
    const ranges = markRangesForText(text, analysis)
      .map((range) => textRangeToDomRange(editor, range.start, range.end))
      .filter(Boolean);
    if (ranges.length === 0) return;

    const highlight = new Highlight(...ranges);
    CSS.highlights.set(HIGHLIGHT_NAME, highlight);
    cssHighlightEditor = editor;
    marksByEditor.set(editor, { kind: "css-highlight" });
    trackEditorForRemoval(editor);
  }

  function basePanel(editor) {
    const panel = document.createElement("aside");
    panel.setAttribute("data-alfaraheedi-panel", "true");
    panel.className = "alfaraheedi-extension-panel";
    panel.dir = "auto";
    panel.setAttribute("role", "region");
    panel.setAttribute("aria-label", "Alfaraheedi suggestions");
    editorByPanel.set(panel, editor);
    panel.addEventListener("focusout", (event) => {
      if (shouldKeepSuggestionUiForFocusMove(editor, panel, event.relatedTarget)) {
        return;
      }
      clearSuggestionPanel(editor);
      clearSuggestionMarks(editor);
      clearInjectedSuggestionUi();
    });
    return panel;
  }

  function shouldKeepSuggestionUiForFocusMove(editor, panel, nextTarget) {
    if (!(nextTarget instanceof Node)) return false;
    return nextTarget === editor || editor.contains(nextTarget) || panel.contains(nextTarget);
  }

  function isSuggestionPanelFocusTarget(target) {
    return (
      target instanceof Element &&
      target.closest("[data-alfaraheedi-panel]") !== null
    );
  }

  function editorForDismissTarget(target) {
    const editor = editableElementForTarget(target);
    if (editor) return editor;
    if (!(target instanceof Element)) return null;

    const panel = target.closest("[data-alfaraheedi-panel]");
    if (!panel) return null;
    return editorByPanel.get(panel) ?? activeEditor;
  }

  function editorForDismissEvent(event) {
    const editor = editableElementForEvent(event);
    if (editor) return editor;
    return editorForDismissTarget(event.target);
  }

  function focusEditor(editor) {
    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }
  }

  function nextElementId(kind) {
    elementIdSeq += 1;
    return `alfaraheedi-extension-${kind}-${elementIdSeq}`;
  }

  function positionPanel(panel, editor) {
    const rect = editor.getBoundingClientRect();
    const maxWidth = Math.min(PANEL_MAX_WIDTH_PX, Math.max(0, window.innerWidth - VIEWPORT_MARGIN_PX * 2));
    const maxHeight = Math.max(0, window.innerHeight - VIEWPORT_MARGIN_PX * 2);
    const minLeft = window.scrollX + VIEWPORT_MARGIN_PX;
    const maxLeft = window.scrollX + window.innerWidth - VIEWPORT_MARGIN_PX - maxWidth;
    const preferredLeft = rect.left + window.scrollX;
    const minTop = window.scrollY + VIEWPORT_MARGIN_PX;
    const maxTop = window.scrollY + window.innerHeight - VIEWPORT_MARGIN_PX - Math.min(panel.offsetHeight, maxHeight);
    const preferredTop = rect.bottom + window.scrollY + 6;
    panel.style.maxWidth = `${maxWidth}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.overflowY = "auto";
    panel.style.insetInlineStart = `${Math.max(minLeft, Math.min(preferredLeft, maxLeft))}px`;
    panel.style.top = `${Math.max(minTop, Math.min(preferredTop, maxTop))}px`;
  }

  function markRangesForText(text, analysis) {
    return suggestionRangesForText(text, analysis).map((entry) => entry.range);
  }

  function applicableSuggestionSetForEditor(editor, analysis) {
    return new Set(
      suggestionRangesForText(textFromEditor(editor), analysis).map(
        (entry) => entry.suggestion,
      ),
    );
  }

  function suggestionRangesForText(text, analysis) {
    const suggestions = Array.isArray(analysis?.suggestions) ? analysis.suggestions : [];
    return suggestions
      .map((suggestion) => {
        const range = rangeForSuggestion(text, suggestion);
        return range ? { suggestion, range } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.range.start - b.range.start)
      .filter(
        (entry, index, entries) => index === 0 || entry.range.start >= entries[index - 1].range.end,
      );
  }

  function rangeForSuggestion(text, suggestion) {
    const span = suggestion?.span;
    if (
      span &&
      Number.isInteger(span.start_utf16) &&
      Number.isInteger(span.end_utf16) &&
      span.start_utf16 >= 0 &&
      span.end_utf16 > span.start_utf16 &&
      span.end_utf16 <= text.length
    ) {
      const current = text.slice(span.start_utf16, span.end_utf16);
      if (!suggestion.original || current === suggestion.original) {
        return { start: span.start_utf16, end: span.end_utf16 };
      }
    }

    if (!suggestion?.original) return null;
    const index = text.indexOf(suggestion.original);
    if (index === -1) return null;
    return { start: index, end: index + suggestion.original.length };
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
    cssHighlightEditor = null;
  }

  function clearInjectedSuggestionUi() {
    for (const editor of [...trackedEditors]) {
      clearSuggestionPanel(editor);
      clearSuggestionMarks(editor);
    }
    document
      .querySelectorAll("[data-alfaraheedi-panel], [data-alfaraheedi-marks]")
      .forEach((element) => element.remove());
    clearCssHighlight();
  }

  function textRangeToDomRange(root, start, end) {
    const segments = textSegmentsForContentEditable(root);
    let startPoint = null;
    let endPoint = null;

    for (const segment of segments) {
      if (!startPoint && start >= segment.start && start <= segment.end) {
        startPoint = domPointForSegmentOffset(segment, start - segment.start, "start");
      }

      if (end >= segment.start && end <= segment.end) {
        endPoint = domPointForSegmentOffset(segment, end - segment.start, "end");
        if (endPoint) break;
      }
    }

    if (!startPoint || !endPoint) return null;

    const range = document.createRange();
    range.setStart(startPoint.node, startPoint.offset);
    range.setEnd(endPoint.node, endPoint.offset);
    return range;
  }

  function textSegmentsForContentEditable(root) {
    const segments = [];
    let cursor = 0;

    function appendBreak(beforePoint, afterPoint, options = {}) {
      if (cursor === 0) return;
      if (!options.force && segments.at(-1)?.kind === "break") return;
      segments.push({
        kind: "break",
        start: cursor,
        end: cursor + 1,
        beforePoint,
        afterPoint,
      });
      cursor += 1;
    }

    function appendNode(node) {
      if (node !== root && node instanceof HTMLElement && isIgnoredRichEditorIsland(node)) {
        return;
      }

      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.nodeValue?.length ?? 0;
        if (length === 0) return;
        segments.push({ kind: "text", node, start: cursor, end: cursor + length });
        cursor += length;
        return;
      }

      if (node instanceof HTMLBRElement) {
        appendBreak(domPointBefore(node), domPointAfter(node), { force: true });
        return;
      }

      const isBlockLine = node !== root && isBlockLineElement(node);
      if (isBlockLine) appendBreak(domPointBefore(node), domPointBefore(node));

      for (const child of node.childNodes) {
        appendNode(child);
      }

      if (isBlockLine) appendBreak(domPointAfter(node), domPointAfter(node));
    }

    appendNode(root);
    return segments;
  }

  function domPointForSegmentOffset(segment, offset, boundary) {
    if (segment.kind === "break") {
      if (boundary === "start" && offset === 1) return null;
      return offset === 0 ? segment.beforePoint : segment.afterPoint;
    }

    return { node: segment.node, offset };
  }

  function domPointBefore(node) {
    return { node: node.parentNode, offset: childNodeIndex(node) };
  }

  function domPointAfter(node) {
    return { node: node.parentNode, offset: childNodeIndex(node) + 1 };
  }

  function childNodeIndex(node) {
    let index = 0;
    let current = node;
    while ((current = current.previousSibling)) {
      index += 1;
    }
    return index;
  }

  function replaceDomRange(range, replacement) {
    const replacementNode = document.createTextNode(replacement);
    range.deleteContents();
    range.insertNode(replacementNode);
    range.detach();
    return replacementNode;
  }

  function setPlainTextSelection(editor, offset) {
    if (typeof editor.setSelectionRange !== "function") return;
    editor.setSelectionRange(offset, offset);
  }

  function setContentEditableSelectionAfter(node) {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    range.setStart(node, node.nodeValue?.length ?? 0);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function trackEditorForRemoval(editor) {
    trackedEditors.add(editor);
    if (editorRemovalObserver) return;
    editorRemovalObserver = new MutationObserver(cleanupDetachedEditors);
    editorRemovalObserver.observe(document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  function cleanupDetachedEditors() {
    for (const editor of [...trackedEditors]) {
      if (editor.isConnected) continue;
      clearSuggestionPanel(editor);
      clearSuggestionMarks(editor);
      if (activeEditor === editor) activeEditor = null;
      trackedEditors.delete(editor);
    }
    disconnectEditorRemovalObserverIfIdle();
  }

  function untrackEditorIfNoUi(editor) {
    if (panelByEditor.has(editor) || marksByEditor.has(editor)) return;
    untrackEditorLayout(editor);
    trackedEditors.delete(editor);
    disconnectEditorRemovalObserverIfIdle();
  }

  function disconnectEditorRemovalObserverIfIdle() {
    if (trackedEditors.size > 0 || !editorRemovalObserver) return;
    editorRemovalObserver.disconnect();
    editorRemovalObserver = null;
  }

  function trackEditorLayout(editor) {
    if (layoutSyncHandlers.has(editor)) return;
    const syncLayout = () => syncInjectedUiLayout(editor);
    window.addEventListener("scroll", syncLayout, true);
    window.addEventListener("resize", syncLayout);
    layoutSyncHandlers.set(editor, syncLayout);
  }

  function untrackEditorLayout(editor) {
    const syncLayout = layoutSyncHandlers.get(editor);
    if (!syncLayout) return;
    window.removeEventListener("scroll", syncLayout, true);
    window.removeEventListener("resize", syncLayout);
    layoutSyncHandlers.delete(editor);
  }

  function syncInjectedUiLayout(editor) {
    const panel = panelByEditor.get(editor);
    if (panel) {
      positionPanel(panel, editor);
    }

    const marks = marksByEditor.get(editor);
    if (marks instanceof HTMLElement) {
      positionMarks(marks, editor);
      syncPlainTextMarksToEditor(marks, editor);
    }
  }

  function dispatchReplacementInputEvent(editor, replacement) {
    if (typeof InputEvent === "function") {
      editor.dispatchEvent(
        new InputEvent("input", {
          bubbles: true,
          composed: true,
          inputType: "insertReplacementText",
          data: replacement,
        }),
      );
      return;
    }

    editor.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
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
})();
