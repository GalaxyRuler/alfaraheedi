(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});

  function applySuggestionToEditor(editor, suggestion) {
    const resolution = runtime.resolveAnchoredSuggestionForApply(editor, suggestion);
    if (!resolution.ok) return false;

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      editor.value = replaceAt(
        editor.value,
        resolution.range.start,
        resolution.range.end - resolution.range.start,
        resolution.replacement,
      );
      setPlainTextSelection(editor, resolution.range.start + resolution.replacement.length);
      dispatchReplacementInputEvent(editor, resolution.replacement);
      return true;
    }

    if (runtime.isContentEditableElement(editor)) {
      if (!resolution.domRange) return false;
      const replacementNode = replaceDomRange(resolution.domRange, resolution.replacement);
      setContentEditableSelectionAfter(replacementNode);
      dispatchReplacementInputEvent(editor, resolution.replacement);
      return true;
    }

    return false;
  }

  function replaceAt(text, index, length, replacement) {
    return `${text.slice(0, index)}${replacement}${text.slice(index + length)}`;
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

  Object.assign(runtime, {
    applySuggestionToEditor,
    dispatchReplacementInputEvent,
    replaceAt,
  });
})();
