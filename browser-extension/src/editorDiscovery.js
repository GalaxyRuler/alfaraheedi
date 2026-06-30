(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});
  const MAX_DISCOVERY_TEXT_CHARS = 6_000;
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
    "cc-additional-name",
    "cc-csc",
    "cc-exp",
    "cc-exp-month",
    "cc-exp-year",
    "cc-family-name",
    "cc-given-name",
    "cc-name",
    "cc-number",
    "cc-type",
    "current-password",
    "new-password",
    "one-time-code",
  ]);
  const SENSITIVE_EXPLICIT_EDITABLE_HINT_RE =
    /(?:^|[-_\s])(?:2fa|api[-_\s]*key|apikey|auth|card|credit|csc|cvc|cvv|mfa|otp|passcode|password|secret|ssn|token)(?:$|[-_\s])/iu;
  const SENSITIVE_CARD_ABBREVIATION_RE =
    /(?:^|[-_\s])(?:cc|csc|cvc|cvv)(?:$|[-_\s])/iu;
  const PAYMENT_CONTEXT_RE =
    /(?:^|[-_\s])(?:billing|card|credit|debit|payment|payments)(?:$|[-_\s])/iu;
  const POSSIBLE_EDITOR_EVENT_TYPES = new Set([
    "beforeinput",
    "compositionend",
    "compositionstart",
    "compositionupdate",
    "input",
  ]);
  const SENSITIVE_CONTEXT_SELECTOR =
    'form,fieldset,[role="group"],[role="region"],[aria-label],[aria-labelledby]';
  const IGNORED_RICH_EDITOR_SENTINEL_SELECTOR =
    '[data-slate-zero-width],[data-slate-placeholder="true"],[data-lexical-placeholder="true"],.ProseMirror-trailingBreak';
  const UNSUPPORTED_COMPLEX_RICH_EDITOR_SELECTOR =
    '[data-nahou-unsupported-editor],.monaco-editor,.cm-editor,[data-codemirror]';

  function discoverEditorSurface(target) {
    const classification = classifyEditorSurface(target);
    if (!classification.supported) return null;
    return {
      element: classification.element,
      kind: classification.kind,
      text: classification.text,
    };
  }

  function classifyEditorSurface(targetOrEvent) {
    if (isEventLike(targetOrEvent)) {
      return classifyEditorSurfaceForEvent(targetOrEvent);
    }
    return classifyEditorTarget(targetOrEvent, { enforceTextLimit: true });
  }

  function editableElementForTarget(target) {
    const classification = classifyEditorTarget(target, { enforceTextLimit: false });
    return classification.supported ? classification.element : null;
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

  function classifyEditorSurfaceForEvent(event) {
    let firstUnsupported = null;
    let sawElementBoundary = false;

    if (typeof event.composedPath === "function") {
      for (const target of event.composedPath()) {
        if (!(target instanceof Element)) continue;
        sawElementBoundary = true;
        const classification = classifyEditorTarget(target, {
          enforceTextLimit: true,
        });
        if (classification.supported) return classification;
        if (classification.reason !== "no-editable-target" && !firstUnsupported) {
          firstUnsupported = classification;
        }
      }

      if (firstUnsupported) return firstUnsupported;
      if (
        sawElementBoundary &&
        event.target instanceof Element &&
        isPossibleClosedShadowEditorEvent(event)
      ) {
        return unsupportedEditor(
          "closed-shadow-or-composed-path-boundary",
          event.target,
        );
      }
    }

    return classifyEditorTarget(event.target, { enforceTextLimit: true });
  }

  function classifyEditorTarget(target, options = {}) {
    if (!(target instanceof Element)) return unsupportedEditor("no-editable-target");

    const textControl = target.closest("textarea,input");
    if (textControl) {
      return classifyTextControl(textControl, options);
    }

    return classifyContentEditableTarget(target, options);
  }

  function classifyTextControl(element, options = {}) {
    if (isInsideClosedShadowRoot(element)) {
      return unsupportedEditor("closed-shadow-root", element);
    }

    if (isAriaReadonlyEditable(element)) return unsupportedEditor("aria-readonly", element);
    if (isAriaDisabledEditable(element)) return unsupportedEditor("aria-disabled", element);
    if (element.disabled) return unsupportedEditor("disabled", element);
    if (element.readOnly) return unsupportedEditor("readonly", element);

    if (element instanceof HTMLInputElement && !TEXT_LIKE_INPUT_TYPES.has(element.type)) {
      return unsupportedEditor("unsupported-input-type", element);
    }

    if (!(element instanceof HTMLTextAreaElement) && !(element instanceof HTMLInputElement)) {
      return unsupportedEditor("no-editable-target");
    }

    const sensitivity = sensitiveEditableReason(element);
    if (sensitivity) return unsupportedEditor(sensitivity, element);

    const text = element.value;
    if (options.enforceTextLimit && text.length > MAX_DISCOVERY_TEXT_CHARS) {
      return unsupportedEditor("oversized-text", element, { textLength: text.length });
    }

    return supportedEditor(element, element instanceof HTMLTextAreaElement ? "textarea" : "input", text);
  }

  function classifyContentEditableTarget(target, options = {}) {
    let element = target;
    while (element instanceof HTMLElement) {
      if (element.hasAttribute("contenteditable")) {
        if (isInsideClosedShadowRoot(element)) {
          return unsupportedEditor("closed-shadow-root", element);
        }
        if (isAriaReadonlyEditable(element)) {
          return unsupportedEditor("aria-readonly", element);
        }
        if (isAriaDisabledEditable(element)) {
          return unsupportedEditor("aria-disabled", element);
        }
        if (hasDisabledContentEditableValue(element)) {
          return unsupportedEditor("contenteditable-disabled", element);
        }
        if (!hasEditableContentEditableValue(element)) {
          return unsupportedEditor("unsupported-contenteditable", element);
        }
        if (hasEditableContentEditableAncestor(element)) {
          return unsupportedEditor("unsupported-rich-editor-island", element);
        }

        const sensitivity = sensitiveEditableReason(element);
        if (sensitivity) return unsupportedEditor(sensitivity, element);

        if (hasUnsupportedComplexRichEditorIsland(element)) {
          return unsupportedEditor("unsupported-rich-editor-island", element);
        }

        const text = textFromContentEditable(element);
        if (options.enforceTextLimit && text.length > MAX_DISCOVERY_TEXT_CHARS) {
          return unsupportedEditor("oversized-text", element, { textLength: text.length });
        }

        return supportedEditor(element, "contenteditable", text);
      }
      element = element.parentElement;
    }
    return unsupportedEditor("no-editable-target");
  }

  function supportedEditor(element, kind, text) {
    return {
      supported: true,
      element,
      kind,
      text,
    };
  }

  function unsupportedEditor(reason, element = null, extra = {}) {
    return {
      supported: false,
      reason,
      element,
      ...extra,
    };
  }

  function isEventLike(value) {
    return (
      value !== null &&
      typeof value === "object" &&
      !(value instanceof Element) &&
      ("target" in value || typeof value.composedPath === "function")
    );
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

  function isInsideClosedShadowRoot(element) {
    const root = element.getRootNode?.();
    return root instanceof ShadowRoot && root.mode === "closed";
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

  function hasUnsupportedComplexRichEditorIsland(element) {
    if (element.matches(UNSUPPORTED_COMPLEX_RICH_EDITOR_SELECTOR)) return true;
    return Array.from(element.querySelectorAll("[contenteditable]")).some(
      (child) => child !== element && hasEditableContentEditableValue(child),
    );
  }

  function hasEditableContentEditableAncestor(element) {
    let current = element.parentElement;
    while (current instanceof HTMLElement) {
      if (
        current.hasAttribute("contenteditable") &&
        hasEditableContentEditableValue(current)
      ) {
        return true;
      }
      current = current.parentElement;
    }
    return false;
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

  function sensitiveEditableReason(element) {
    if (hasSensitiveEditableHint(element)) return "sensitive-field";
    return sensitiveAncestorElementFor(element) ? "sensitive-ancestor" : null;
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
    return hasSensitiveDirectHintText(hintText);
  }

  function hasSensitiveEditableContext(element) {
    return hasSensitiveEditableHint(element) || sensitiveAncestorElementFor(element) !== null;
  }

  function sensitiveAncestorElementFor(element) {
    let current = element.parentElement;
    while (current && current !== document.body) {
      if (isSensitiveEditableContextElement(current)) return current;
      current = current.parentElement;
    }
    return null;
  }

  function isSensitiveEditableContextElement(element) {
    if (!(element instanceof HTMLElement)) return false;
    if (!element.matches(SENSITIVE_CONTEXT_SELECTOR)) return false;

    if (hasSensitiveElementIdentityHint(element)) return true;

    const labelText = [
      element.getAttribute("aria-label"),
      labelledByText(element),
    ]
      .filter(Boolean)
      .join(" ");
    if (hasSensitiveAncestorLabelText(labelText)) return true;

    if (element instanceof HTMLFieldSetElement) {
      const legend = Array.from(element.children).find(
        (child) => child instanceof HTMLLegendElement,
      );
      return hasSensitiveAncestorLabelText(legend?.textContent ?? "");
    }

    return false;
  }

  function hasSensitiveDirectHintText(text) {
    if (!text) return false;
    return (
      SENSITIVE_EXPLICIT_EDITABLE_HINT_RE.test(text) ||
      SENSITIVE_CARD_ABBREVIATION_RE.test(text)
    );
  }

  function hasSensitiveElementIdentityHint(element) {
    const hintText = [
      element.id,
      element.getAttribute("name"),
      element.getAttribute("title"),
    ]
      .filter(Boolean)
      .join(" ");
    return hasSensitiveDirectHintText(hintText);
  }

  function hasSensitiveAncestorLabelText(text) {
    if (!text) return false;
    if (SENSITIVE_EXPLICIT_EDITABLE_HINT_RE.test(text)) return true;
    return PAYMENT_CONTEXT_RE.test(text);
  }

  function isPossibleClosedShadowEditorEvent(event) {
    return POSSIBLE_EDITOR_EVENT_TYPES.has(event.type ?? "");
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
      (isAriaReadonlyEditable(element) || isAriaDisabledEditable(element))
    );
  }

  function isAriaReadonlyEditable(element) {
    return (
      element instanceof Element &&
      element.getAttribute("aria-readonly")?.trim().toLowerCase() === "true"
    );
  }

  function isAriaDisabledEditable(element) {
    return (
      element instanceof Element &&
      element.getAttribute("aria-disabled")?.trim().toLowerCase() === "true"
    );
  }

  Object.assign(runtime, {
    classifyEditorSurface,
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
