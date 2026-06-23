const PANEL_ATTR = "data-alfaraheedi-panel";
const MARKS_ATTR = "data-alfaraheedi-marks";
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
const marksByEditor = new WeakMap();
const plainMarkScrollHandlers = new WeakMap();
const layoutSyncHandlers = new WeakMap();
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
let cssHighlightEditor = null;
let elementIdSeq = 0;
let editorRemovalObserver = null;

export function discoverEditorSurface(target) {
  const element = editableElementForTarget(target);
  if (!element) return null;

  if (element instanceof HTMLTextAreaElement) {
    return {
      element,
      kind: "textarea",
      text: element.value,
    };
  }

  if (element instanceof HTMLInputElement) {
    return {
      element,
      kind: "input",
      text: element.value,
    };
  }

  return {
    element,
    kind: "contenteditable",
    text: textFromContentEditable(element),
  };
}

export function clearSuggestionPanel(editor) {
  const panel = panelByEditor.get(editor);
  if (panel) {
    panel.remove();
    panelByEditor.delete(editor);
  }
  untrackEditorIfNoUi(editor);
}

export function clearSuggestionMarks(editor) {
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

export function renderSuggestionMarks(editor, analysis) {
  clearSuggestionMarks(editor);
  if (cssHighlightEditor && cssHighlightEditor !== editor) {
    clearCssHighlight();
  }

  if (isContentEditableElement(editor)) {
    return renderContentEditableSuggestionMarks(editor, analysis);
  }

  if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
    return renderPlainTextSuggestionMarks(editor, analysis);
  }

  return null;
}

function renderPlainTextSuggestionMarks(editor, analysis) {
  const text = editor.value;
  const ranges = markRangesForText(text, analysis);
  if (ranges.length === 0) return null;

  const marks = document.createElement("div");
  marks.setAttribute(MARKS_ATTR, "true");
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
  return marks;
}

function renderContentEditableSuggestionMarks(editor, analysis) {
  if (!supportsCssHighlights()) return null;

  const text = textFromContentEditable(editor);
  const ranges = markRangesForText(text, analysis)
    .map((range) => textRangeToDomRange(editor, range.start, range.end))
    .filter(Boolean);
  if (ranges.length === 0) return null;

  const highlight = new Highlight(...ranges);
  CSS.highlights.set(HIGHLIGHT_NAME, highlight);
  cssHighlightEditor = editor;
  marksByEditor.set(editor, { kind: "css-highlight" });
  trackEditorForRemoval(editor);
  return highlight;
}

export function renderSuggestionPanel(editor, analysis) {
  clearSuggestionPanel(editor);

  const suggestions = Array.isArray(analysis?.suggestions)
    ? analysis.suggestions
    : [];
  if (suggestions.length === 0) return null;
  const applicableSuggestions = applicableSuggestionSetForEditor(editor, analysis);

  const panel = document.createElement("aside");
  panel.setAttribute(PANEL_ATTR, "true");
  panel.className = "alfaraheedi-extension-panel";
  panel.dir = "auto";
  panel.setAttribute("role", "region");
  panel.setAttribute("aria-label", "Alfaraheedi suggestions");
  panel.addEventListener("focusout", (event) => {
    if (shouldKeepSuggestionUiForFocusMove(editor, panel, event.relatedTarget)) {
      return;
    }
    clearSuggestionPanel(editor);
    clearSuggestionMarks(editor);
  });

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
  return panel;
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

export function applySuggestionToEditor(editor, suggestion) {
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

function editableElementForTarget(target) {
  if (!(target instanceof Element)) return null;
  const textControl = target.closest("textarea,input");
  if (textControl) {
    return isIgnoredEditable(textControl) ? null : textControl;
  }
  if (isAriaUnavailableEditable(target)) return null;
  return contentEditableElementForTarget(target);
}

function markRangesForText(text, analysis) {
  return suggestionRangesForText(text, analysis).map((entry) => entry.range);
}

function applicableSuggestionSetForEditor(editor, analysis) {
  const text =
    editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement
      ? editor.value
      : textFromContentEditable(editor);
  return new Set(suggestionRangesForText(text, analysis).map((entry) => entry.suggestion));
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

function replaceAt(text, index, length, replacement) {
  return `${text.slice(0, index)}${replacement}${text.slice(index + length)}`;
}

function shouldKeepSuggestionUiForFocusMove(editor, panel, nextTarget) {
  if (!(nextTarget instanceof Node)) return false;
  return nextTarget === editor || editor.contains(nextTarget) || panel.contains(nextTarget);
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
  panel.style.position = "absolute";
  panel.style.maxWidth = `${maxWidth}px`;
  panel.style.maxHeight = `${maxHeight}px`;
  panel.style.overflowY = "auto";
  panel.style.insetInlineStart = `${Math.max(minLeft, Math.min(preferredLeft, maxLeft))}px`;
  panel.style.top = `${Math.max(minTop, Math.min(preferredTop, maxTop))}px`;
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
