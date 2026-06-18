import { useEffect, useRef } from "react";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap, placeholder } from "@codemirror/view";
import { defaultKeymap, history, historyKeymap } from "@codemirror/commands";
import type { Suggestion } from "../api/types";
import type { Direction } from "../state/settings";
import {
  buildSuggestionDecorations,
  setSuggestionDecorations,
  suggestionDecorationField,
} from "../lib/cmDecorations";

interface EditorProps {
  value: string;
  onChange: (value: string) => void;
  direction: Direction;
  placeholderText: string;
  ariaLabel: string;
  suggestions: Suggestion[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
}

export function Editor({
  value,
  onChange,
  direction,
  placeholderText,
  ariaLabel,
  suggestions,
  activeId,
  onActivate,
}: EditorProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Keep the latest onChange/onActivate without re-creating the editor.
  const onChangeRef = useRef(onChange);
  const onActivateRef = useRef(onActivate);
  onChangeRef.current = onChange;
  onActivateRef.current = onActivate;

  // Create the editor exactly once.
  useEffect(() => {
    if (!hostRef.current) return;

    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          placeholder(placeholderText),
          suggestionDecorationField,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": ariaLabel }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString());
            }
          }),
          EditorView.domEventHandlers({
            mousedown: (event) => {
              const target = event.target as HTMLElement | null;
              const marked = target?.closest("[data-suggestion-id]");
              if (marked) {
                onActivateRef.current(
                  marked.getAttribute("data-suggestion-id"),
                );
              }
            },
          }),
        ],
      }),
    });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Intentionally empty: the editor is created once and updated via effects.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Push external value changes (e.g. Apply, Load example, Clear) into the doc.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    }
  }, [value]);

  // Direction is applied to the content element so RTL/LTR/Auto take effect.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.contentDOM.setAttribute("dir", direction);
  }, [direction]);

  // Rebuild decorations whenever suggestions or the active item change.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: setSuggestionDecorations.of(
        buildSuggestionDecorations(view.state.doc.length, suggestions, activeId),
      ),
    });
  }, [suggestions, activeId]);

  // When a suggestion is activated from the panel, select and reveal its span.
  useEffect(() => {
    const view = viewRef.current;
    if (!view || !activeId) return;
    const suggestion = suggestions.find((s) => s.id === activeId);
    if (!suggestion) return;
    const docLength = view.state.doc.length;
    const from = Math.min(suggestion.span.start_utf16, docLength);
    const to = Math.min(suggestion.span.end_utf16, docLength);
    view.dispatch({
      selection: { anchor: from, head: to },
      scrollIntoView: true,
    });
  }, [activeId, suggestions]);

  return <div className="editor-host" ref={hostRef} data-testid="editor" />;
}
