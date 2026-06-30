(() => {
  const runtime =
    globalThis.NahouExtensionRuntime || (globalThis.NahouExtensionRuntime = {});
  const state = runtime.state || (runtime.state = {});
  const PANEL_MAX_WIDTH_PX = 360;
  const VIEWPORT_MARGIN_PX = 8;

  if (!state.panelByEditor) state.panelByEditor = new WeakMap();
  if (!state.editorByPanel) state.editorByPanel = new WeakMap();
  if (!state.panelAnchorByEditor) state.panelAnchorByEditor = new WeakMap();
  if (!Object.prototype.hasOwnProperty.call(state, "elementIdSeq")) {
    state.elementIdSeq = 0;
  }

  function clearSuggestionPanel(editor, options = {}) {
    const panel = state.panelByEditor.get(editor);
    if (panel) {
      panel.remove();
      state.editorByPanel.delete(panel);
      state.panelByEditor.delete(editor);
      state.panelAnchorByEditor.delete(editor);
    }
    if (options.returnFocus) {
      focusEditor(editor);
    }
    runtime.untrackEditorIfNoUi(editor);
  }

  function renderStatusPanel(editor, message) {
    clearSuggestionPanel(editor);
    const panel = basePanel(editor);
    panel.classList.add("alfaraheedi-extension-panel--muted");
    panel.setAttribute("role", "status");
    panel.setAttribute("aria-live", "polite");
    panel.setAttribute("aria-label", "Nahou status");
    panel.textContent = message;
    document.body.append(panel);
    positionPanel(panel, editor);
    state.panelByEditor.set(editor, panel);
    runtime.trackEditorLayout(editor);
    runtime.trackEditorForRemoval(editor);
    return panel;
  }

  function renderSuggestionPanel(editor, analysis, options = {}) {
    clearSuggestionPanel(editor);
    const suggestions = Array.isArray(analysis?.suggestions)
      ? analysis.suggestions
      : [];
    if (suggestions.length === 0) return null;
    const applicableSuggestions = runtime.applicableSuggestionSetForEditor(
      editor,
      analysis,
    );

    const panel = basePanel(editor);
    const heading = document.createElement("strong");
    heading.id = nextElementId("heading");
    heading.textContent =
      suggestions.length === 1
        ? "Nahou suggestion"
        : `Nahou suggestions (${suggestions.length})`;
    panel.append(heading);

    const list = document.createElement("ul");
    const orderedSuggestions = orderSuggestionsForCard(
      suggestions,
      options.selectedIndex,
    ).slice(0, 5);
    for (const suggestion of orderedSuggestions) {
      const item = document.createElement("li");
      const source = document.createElement("code");
      source.dir = "auto";
      source.textContent = suggestion.source ?? "suggestion";
      const explanation = document.createElement("span");
      explanation.className = "alfaraheedi-extension-card__explanation";
      explanation.textContent = suggestion.explanation ?? "Review this text.";
      const replacement = document.createElement("span");
      replacement.className = "alfaraheedi-extension-card__replacement";
      replacement.dir = "auto";
      replacement.textContent = runtime.displayReplacementForSuggestion(suggestion);
      replacement.id = nextElementId("replacement");
      item.append(source, explanation, replacement);
      if (isSuggestionApplyableInCard(editor, suggestion, applicableSuggestions)) {
        const applyButton = document.createElement("button");
        applyButton.type = "button";
        applyButton.textContent = "Apply";
        applyButton.setAttribute("aria-label", runtime.applyLabelForSuggestion(suggestion));
        applyButton.setAttribute("aria-describedby", replacement.id);
        applyButton.addEventListener("mousedown", (event) => event.preventDefault());
        applyButton.addEventListener("click", () => {
          if (runtime.applySuggestionToEditor(editor, suggestion)) {
            clearSuggestionPanel(editor, { returnFocus: true });
            runtime.clearFieldBadge?.(editor);
            runtime.clearSuggestionMarks(editor);
            runtime.clearInjectedSuggestionUi();
          } else {
            runtime.clearSuggestionMarks(editor);
            renderApplyFailureStatus(item, applyButton);
          }
        });
        item.append(applyButton);
      }
      const dismissButton = document.createElement("button");
      dismissButton.type = "button";
      dismissButton.className = "alfaraheedi-extension-button-secondary";
      dismissButton.textContent = "Dismiss";
      dismissButton.setAttribute("aria-label", "Dismiss suggestion");
      dismissButton.addEventListener("mousedown", (event) => event.preventDefault());
      dismissButton.addEventListener("click", () => {
        clearSuggestionPanel(editor, { returnFocus: true });
      });
      item.append(dismissButton);
      list.append(item);
    }
    panel.append(list);

    document.body.append(panel);
    positionPanel(panel, editor, options.anchor);
    state.panelByEditor.set(editor, panel);
    runtime.trackEditorLayout(editor);
    runtime.trackEditorForRemoval(editor);
    return panel;
  }

  function orderSuggestionsForCard(suggestions, selectedIndex) {
    if (
      !Number.isInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex >= suggestions.length
    ) {
      return suggestions;
    }
    return [
      suggestions[selectedIndex],
      ...suggestions.slice(0, selectedIndex),
      ...suggestions.slice(selectedIndex + 1),
    ];
  }

  function isSuggestionApplyableInCard(editor, suggestion, applicableSuggestions) {
    if (
      runtime.isContentEditableElement(editor) &&
      state.contentEditableInlineApply?.get(editor) === false
    ) {
      return false;
    }
    return applicableSuggestions.has(suggestion);
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

  function basePanel(editor) {
    const panel = document.createElement("aside");
    panel.setAttribute("data-alfaraheedi-panel", "true");
    panel.className = "alfaraheedi-extension-panel";
    panel.dir = "auto";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Nahou suggestions");
    state.editorByPanel.set(panel, editor);
    panel.addEventListener("focusout", (event) => {
      if (shouldKeepSuggestionUiForFocusMove(editor, panel, event.relatedTarget)) {
        return;
      }
      clearSuggestionPanel(editor);
      runtime.clearSuggestionMarks(editor);
      runtime.clearInjectedSuggestionUi();
    });
    return panel;
  }

  function shouldKeepSuggestionUiForFocusMove(editor, panel, nextTarget) {
    if (!(nextTarget instanceof Node)) return false;
    return (
      nextTarget === editor ||
      editor.contains(nextTarget) ||
      panel.contains(nextTarget) ||
      runtime.isFieldBadgeFocusTarget?.(nextTarget)
    );
  }

  function isSuggestionPanelFocusTarget(target) {
    return (
      target instanceof Element &&
      target.closest("[data-alfaraheedi-panel]") !== null
    );
  }

  function suggestionPanelForEditor(editor) {
    return state.panelByEditor.get(editor) ?? null;
  }

  function editorForSuggestionPanelTarget(target, fallbackEditor = null) {
    if (!(target instanceof Element)) return null;

    const panel = target.closest("[data-alfaraheedi-panel]");
    if (!panel) return null;
    return state.editorByPanel.get(panel) ?? fallbackEditor;
  }

  function focusEditor(editor) {
    try {
      editor.focus({ preventScroll: true });
    } catch {
      editor.focus();
    }
  }

  function nextElementId(kind) {
    state.elementIdSeq += 1;
    return `alfaraheedi-extension-${kind}-${state.elementIdSeq}`;
  }

  function positionPanel(panel, editor, anchor = null) {
    if (anchor instanceof Element) {
      state.panelAnchorByEditor.set(editor, anchor);
    }
    const currentAnchor = state.panelAnchorByEditor.get(editor);
    const rect =
      currentAnchor instanceof Element
        ? currentAnchor.getBoundingClientRect()
        : editor.getBoundingClientRect();
    const maxWidth = Math.min(
      PANEL_MAX_WIDTH_PX,
      Math.max(0, window.innerWidth - VIEWPORT_MARGIN_PX * 2),
    );
    const maxHeight = Math.max(0, window.innerHeight - VIEWPORT_MARGIN_PX * 2);
    const minLeft = window.scrollX + VIEWPORT_MARGIN_PX;
    const maxLeft = window.scrollX + window.innerWidth - VIEWPORT_MARGIN_PX - maxWidth;
    const preferredLeft = rect.left + window.scrollX;
    const minTop = window.scrollY + VIEWPORT_MARGIN_PX;
    const maxTop =
      window.scrollY +
      window.innerHeight -
      VIEWPORT_MARGIN_PX -
      Math.min(panel.offsetHeight, maxHeight);
    const preferredTop = rect.bottom + window.scrollY + 6;
    panel.style.maxWidth = `${maxWidth}px`;
    panel.style.maxHeight = `${maxHeight}px`;
    panel.style.overflowY = "auto";
    panel.style.insetInlineStart = `${Math.max(minLeft, Math.min(preferredLeft, maxLeft))}px`;
    panel.style.top = `${Math.max(minTop, Math.min(preferredTop, maxTop))}px`;
  }

  Object.assign(runtime, {
    clearSuggestionPanel,
    editorForSuggestionPanelTarget,
    isSuggestionPanelFocusTarget,
    positionPanel,
    renderStatusPanel,
    renderSuggestionPanel,
    shouldKeepSuggestionUiForFocusMove,
    suggestionPanelForEditor,
  });
})();
