(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});

  function applicableSuggestionSetForEditor(editor, analysis) {
    return new Set(
      runtime.suggestionRangesForText(runtime.textFromEditor(editor), analysis).map(
        (entry) => entry.suggestion,
      ),
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

  Object.assign(runtime, {
    applicableSuggestionSetForEditor,
    applyLabelForSuggestion,
    displayReplacementForSuggestion,
    replacementForSuggestion,
  });
})();
