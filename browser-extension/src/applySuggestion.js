(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});

  function applySuggestionToEditor(editor, suggestion) {
    const original = suggestion?.original;
    const replacement = runtime.replacementForSuggestion(suggestion);
    if (!original || !replacement) return false;

    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const textRange = runtime.rangeForSuggestion(editor.value, suggestion);
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

    if (runtime.isContentEditableElement(editor)) {
      const text = runtime.textFromContentEditable(editor);
      const textRange = runtime.rangeForSuggestion(text, suggestion);
      if (!textRange) return false;
      const domRange = runtime.textRangeToDomRange(editor, textRange.start, textRange.end);
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
