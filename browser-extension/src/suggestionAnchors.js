(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});

  function applicableSuggestionSetForEditor(editor, analysis) {
    const suggestions = Array.isArray(analysis?.suggestions) ? analysis.suggestions : [];
    return new Set(
      suggestions.filter((suggestion) => {
        const anchor = createSuggestionAnchor(editor, suggestion);
        if (!anchor) return false;
        suggestion.anchor = anchor;
        return true;
      }),
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

  const editorIds = new WeakMap();
  let nextEditorId = 0;

  function createSuggestionAnchor(editor, suggestion) {
    const original = suggestion?.original;
    const replacement = replacementForSuggestion(suggestion);
    if (!original || replacement === null) return null;

    const text = runtime.textFromEditor(editor);
    if (suggestion?.span && !validTrustedSpanForText(suggestion.span, text)) {
      return null;
    }

    const projection = runtime.projectionForEditor(editor, suggestion);
    if (!projection.applyable || !projection.range) return null;
    if (text.slice(projection.range.start, projection.range.end) !== original) {
      projection.domRange?.detach?.();
      return null;
    }

    const anchor = {
      editorId: editorIdentityFor(editor),
      projectionHash: projectionHashForText(text),
      source: suggestion.source ?? null,
      original,
      replacement,
      span: trustedSpanForSuggestion(suggestion, text),
      range: {
        start: projection.range.start,
        end: projection.range.end,
      },
      kind: projection.kind,
      domRangeDetails: null,
    };

    if (projection.domRange) {
      anchor.domRangeDetails = domRangeDetailsForEditor(editor, projection.domRange);
      projection.domRange.detach?.();
      if (!anchor.domRangeDetails) return null;
    }

    return anchor;
  }

  function resolveAnchoredSuggestionForApply(editor, suggestion) {
    const anchor = suggestion?.anchor ?? createSuggestionAnchor(editor, suggestion);
    if (!anchor) return staleApplyResult("missing-anchor");

    const replacement = replacementForSuggestion(suggestion);
    if (replacement === null || replacement !== anchor.replacement) {
      return staleApplyResult("replacement-mismatch");
    }
    if ((suggestion.source ?? null) !== anchor.source) {
      return staleApplyResult("source-mismatch");
    }
    if (suggestion.original !== anchor.original) {
      return staleApplyResult("original-mismatch");
    }
    if (editorIdentityFor(editor) !== anchor.editorId) {
      return staleApplyResult("editor-mismatch");
    }

    const currentText = runtime.textFromEditor(editor);
    if (projectionHashForText(currentText) !== anchor.projectionHash) {
      return staleApplyResult("projection-hash-mismatch");
    }
    if (currentText.slice(anchor.range.start, anchor.range.end) !== anchor.original) {
      return staleApplyResult("span-original-mismatch");
    }
    if (!trustedSpanMatchesAnchor(suggestion, anchor)) {
      return staleApplyResult("trusted-span-mismatch");
    }

    const projection = runtime.projectionForEditor(editor, {
      ...suggestion,
      span: {
        start_utf16: anchor.range.start,
        end_utf16: anchor.range.end,
      },
      original: anchor.original,
      replacement: anchor.replacement,
    });
    if (!projection.applyable || !projection.range) {
      return staleApplyResult(projection.reason ?? "projection-unavailable");
    }
    if (
      projection.range.start !== anchor.range.start ||
      projection.range.end !== anchor.range.end
    ) {
      projection.domRange?.detach?.();
      return staleApplyResult("range-mismatch");
    }

    if (runtime.isContentEditableElement(editor)) {
      if (!projection.domRange || projection.domRange.toString() !== anchor.original) {
        projection.domRange?.detach?.();
        return staleApplyResult("dom-range-mismatch");
      }
      const currentDetails = domRangeDetailsForEditor(editor, projection.domRange);
      if (!sameDomRangeDetails(currentDetails, anchor.domRangeDetails)) {
        projection.domRange.detach?.();
        return staleApplyResult("dom-range-details-mismatch");
      }
    }

    return {
      ok: true,
      anchor,
      replacement: anchor.replacement,
      range: projection.range,
      domRange: projection.domRange ?? null,
    };
  }

  function editorIdentityFor(editor) {
    if (!editorIds.has(editor)) {
      nextEditorId += 1;
      editorIds.set(editor, `editor-${nextEditorId}`);
    }
    return editorIds.get(editor);
  }

  function projectionHashForText(text) {
    let hash = 2166136261;
    for (let index = 0; index < text.length; index += 1) {
      hash ^= text.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
    return `fnv1a32:${(hash >>> 0).toString(16)}`;
  }

  function trustedSpanForSuggestion(suggestion, text = null) {
    const span = suggestion?.span;
    if (!span) return null;
    if (
      Number.isInteger(span.start_utf16) &&
      Number.isInteger(span.end_utf16) &&
      (text === null || validTrustedSpanForText(span, text))
    ) {
      return {
        start_utf16: span.start_utf16,
        end_utf16: span.end_utf16,
      };
    }
    return null;
  }

  function validTrustedSpanForText(span, text) {
    return (
      Number.isInteger(span.start_utf16) &&
      Number.isInteger(span.end_utf16) &&
      span.start_utf16 >= 0 &&
      span.end_utf16 > span.start_utf16 &&
      span.end_utf16 <= text.length
    );
  }

  function trustedSpanMatchesAnchor(suggestion, anchor) {
    const span = trustedSpanForSuggestion(suggestion);
    if (!span && !anchor.span) return true;
    if (!span || !anchor.span) return false;
    return (
      span.start_utf16 === anchor.span.start_utf16 &&
      span.end_utf16 === anchor.span.end_utf16
    );
  }

  function domRangeDetailsForEditor(editor, range) {
    const startPath = domPathFromEditor(editor, range.startContainer);
    const endPath = domPathFromEditor(editor, range.endContainer);
    if (!startPath || !endPath) return null;
    return {
      startPath,
      startOffset: range.startOffset,
      endPath,
      endOffset: range.endOffset,
      text: range.toString(),
    };
  }

  function domPathFromEditor(editor, node) {
    const path = [];
    let current = node;
    while (current && current !== editor) {
      const parent = current.parentNode;
      if (!parent) return null;
      path.unshift({
        index: childNodeIndex(current),
        signature: domNodeSignature(current),
      });
      current = parent;
    }
    return current === editor ? path : null;
  }

  function domNodeSignature(node) {
    if (node.nodeType === Node.TEXT_NODE) return "#text";
    if (!(node instanceof Element)) return `node:${node.nodeType}`;
    const id = node.id ? `#${node.id}` : "";
    return `${node.tagName}${id}`;
  }

  function childNodeIndex(node) {
    let index = 0;
    let current = node;
    while ((current = current.previousSibling)) {
      index += 1;
    }
    return index;
  }

  function sameDomRangeDetails(left, right) {
    if (!left || !right) return left === right;
    return (
      left.startOffset === right.startOffset &&
      left.endOffset === right.endOffset &&
      left.text === right.text &&
      sameDomPath(left.startPath, right.startPath) &&
      sameDomPath(left.endPath, right.endPath)
    );
  }

  function sameDomPath(left, right) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every(
        (value, index) =>
          value.index === right[index].index &&
          value.signature === right[index].signature,
      )
    );
  }

  function staleApplyResult(reason) {
    return { ok: false, reason };
  }

  Object.assign(runtime, {
    applicableSuggestionSetForEditor,
    applyLabelForSuggestion,
    createSuggestionAnchor,
    displayReplacementForSuggestion,
    editorIdentityFor,
    projectionHashForText,
    resolveAnchoredSuggestionForApply,
    replacementForSuggestion,
  });
})();
