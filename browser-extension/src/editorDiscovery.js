(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});
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

  function discoverEditorSurface(target) {
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

  Object.assign(runtime, {
    discoverEditorSurface,
    editableElementForEvent,
    editableElementForTarget,
    hasDisabledContentEditableValue,
    hasEditableContentEditableValue,
    isAriaUnavailableEditable,
    isBlockLineElement,
    isContentEditableElement,
    isIgnoredRichEditorIsland,
    textFromContentEditable,
    textFromEditor,
  });
})();
