import { StateEffect, StateField } from "@codemirror/state";
import { Decoration, type DecorationSet, EditorView } from "@codemirror/view";
import type { Suggestion } from "../api/types";

// Carries a freshly built decoration set into the editor state. Decorations are
// rebuilt in React (where the suggestion list lives) and pushed in via effect.
export const setSuggestionDecorations = StateEffect.define<DecorationSet>();

export const suggestionDecorationField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update(decorations, tr) {
    let next = decorations.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setSuggestionDecorations)) {
        next = effect.value;
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

function severityClass(suggestion: Suggestion): string {
  switch (suggestion.severity) {
    case "Error":
      return "cm-sg-error";
    case "Warning":
      return "cm-sg-warning";
    default:
      return "cm-sg-info";
  }
}

// Map suggestions onto editor ranges using UTF-16 offsets, which match
// JavaScript string indexing and CodeMirror's document positions exactly.
// Spans are clamped to the current document so a stale analysis can never throw.
export function buildSuggestionDecorations(
  docLength: number,
  suggestions: Suggestion[],
  activeId: string | null,
): DecorationSet {
  const ranges = [];
  for (const suggestion of suggestions) {
    const from = Math.max(0, Math.min(suggestion.span.start_utf16, docLength));
    const to = Math.max(0, Math.min(suggestion.span.end_utf16, docLength));
    if (from >= to) continue;

    const classes = [
      "cm-sg",
      severityClass(suggestion),
      suggestion.safe_auto_apply ? "cm-sg-safe" : "cm-sg-suggest",
    ];
    if (suggestion.id === activeId) classes.push("cm-sg-active");

    ranges.push(
      Decoration.mark({
        class: classes.join(" "),
        attributes: { "data-suggestion-id": suggestion.id },
      }).range(from, to),
    );
  }
  return Decoration.set(ranges, true);
}
