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
    rangeForSuggestion,
    suggestionRangesForText,
    textRangeToDomRange,
  });
})();
