(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});

  function markRangesForText(text, analysis) {
    return suggestionRangesForText(text, analysis).map((entry) => entry.range);
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
    const resolution = resolveSuggestionRange(text, suggestion);
    return resolution.range;
  }

  function projectionForEditor(editor, suggestion) {
    if (editor instanceof HTMLTextAreaElement || editor instanceof HTMLInputElement) {
      const resolution = resolveSuggestionRange(editor.value, suggestion);
      if (!resolution.range) {
        return reviewOnlyProjection(resolution.reason, editor, suggestion);
      }
      if (!suggestion?.original) {
        return reviewOnlyProjection("missing-original", editor, suggestion);
      }
      return applyableProjection("plain-text", editor, suggestion, resolution.range);
    }

    if (runtime.isContentEditableElement(editor)) {
      const text = runtime.textFromContentEditable(editor);
      const resolution = resolveSuggestionRange(text, suggestion);
      if (!resolution.range) {
        return reviewOnlyProjection(resolution.reason, editor, suggestion);
      }
      if (!suggestion?.original) {
        return reviewOnlyProjection("missing-original", editor, suggestion);
      }

      const domRange = textRangeToDomRange(
        editor,
        resolution.range.start,
        resolution.range.end,
      );
      if (!domRange || !domRangeMatchesSuggestion(domRange, suggestion)) {
        domRange?.detach();
        return unavailableProjection(
          "dom-range-unavailable",
          editor,
          suggestion,
          resolution.range,
        );
      }

      return applyableProjection(
        "contenteditable",
        editor,
        suggestion,
        resolution.range,
        domRange,
      );
    }

    return unavailableProjection("unsupported-editor", editor, suggestion, null);
  }

  function resolveSuggestionRange(text, suggestion) {
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
        return {
          range: { start: span.start_utf16, end: span.end_utf16 },
          reason: null,
        };
      }
      return { range: null, reason: "span-original-mismatch" };
    }

    if (!suggestion?.original) return { range: null, reason: "missing-original" };
    const index = text.indexOf(suggestion.original);
    if (index === -1) return { range: null, reason: "original-not-found" };
    if (text.indexOf(suggestion.original, index + 1) !== -1) {
      return { range: null, reason: "ambiguous-original" };
    }
    return {
      range: { start: index, end: index + suggestion.original.length },
      reason: null,
    };
  }

  function applyableProjection(kind, editor, suggestion, range, domRange = null) {
    return {
      status: "applyable",
      applyable: true,
      kind,
      editor,
      suggestion,
      range,
      domRange,
    };
  }

  function reviewOnlyProjection(reason, editor, suggestion) {
    return {
      status: "review-only",
      applyable: false,
      reason,
      editor,
      suggestion,
      range: null,
      domRange: null,
    };
  }

  function unavailableProjection(reason, editor, suggestion, range) {
    return {
      status: "unavailable",
      applyable: false,
      reason,
      editor,
      suggestion,
      range,
      domRange: null,
    };
  }

  function domRangeMatchesSuggestion(domRange, suggestion) {
    return !suggestion?.original || domRange.toString() === suggestion.original;
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
      if (node !== root && node instanceof HTMLElement && runtime.isIgnoredRichEditorIsland(node)) {
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

      const isBlockLine = node !== root && runtime.isBlockLineElement(node);
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

  Object.assign(runtime, {
    markRangesForText,
    projectSuggestionToEditor: projectionForEditor,
    projectionForEditor,
    rangeForSuggestion,
    resolveSuggestionRange,
    suggestionRangesForText,
    textRangeToDomRange,
  });
})();
