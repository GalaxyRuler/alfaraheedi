import { afterEach, describe, expect, it, vi } from "vitest";

import {
  applySuggestionToEditor,
  createSuggestionAnchor,
  discoverEditorSurface,
} from "../../../browser-extension/src/editorSurface.js";

const runtime = globalThis.NahouExtensionRuntime;

function typoSuggestion(overrides = {}) {
  return {
    source: "english:common-typo",
    original: "helo",
    replacements: ["hello"],
    explanation: "Fixes a common typo.",
    ...overrides,
  };
}

function anchoredSuggestion(editor, suggestion) {
  const anchor = createSuggestionAnchor(editor, suggestion);
  return { ...suggestion, anchor };
}

afterEach(() => {
  runtime.clearInjectedSuggestionUi?.();
  document.body.innerHTML = "";
});

describe("browser extension anchored apply and stale handling", () => {
  it("rejects an anchored suggestion when applied to a different editor identity", () => {
    document.body.innerHTML = `
      <textarea id="first">helo</textarea>
      <textarea id="second">helo</textarea>
    `;
    const first = document.querySelector("#first");
    const second = document.querySelector("#second");
    const suggestion = anchoredSuggestion(
      first,
      typoSuggestion({ span: { start_utf16: 0, end_utf16: 4 } }),
    );

    expect(applySuggestionToEditor(second, suggestion)).toBe(false);
    expect(first).toHaveValue("helo");
    expect(second).toHaveValue("helo");
  });

  it("rejects apply when the editor projection hash changed after anchoring", () => {
    document.body.innerHTML = `<textarea id="draft">helo there</textarea>`;
    const editor = document.querySelector("#draft");
    const suggestion = anchoredSuggestion(
      editor,
      typoSuggestion({ span: { start_utf16: 0, end_utf16: 4 } }),
    );
    editor.value = "helo there!";

    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor).toHaveValue("helo there!");
  });

  it("rejects repeated original text without a trusted span", () => {
    document.body.innerHTML = `<textarea id="draft">helo then helo</textarea>`;
    const editor = document.querySelector("#draft");
    const suggestion = typoSuggestion();

    expect(createSuggestionAnchor(editor, suggestion)).toBeNull();
    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor).toHaveValue("helo then helo");
  });

  it("rejects malformed trusted spans instead of falling back to unique-original search", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    const suggestion = typoSuggestion({
      span: { start_utf16: -1, end_utf16: 999 },
    });

    expect(createSuggestionAnchor(editor, suggestion)).toBeNull();
    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor).toHaveValue("helo");
  });

  it("rejects stale contenteditable DOM ranges when mapped details no longer match", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span id="target">helo</span> there</div>
    `;
    const editor = document.querySelector("#draft");
    const suggestion = anchoredSuggestion(
      editor,
      typoSuggestion({ span: { start_utf16: 0, end_utf16: 4 } }),
    );
    editor.innerHTML = `<em>helo</em> there`;

    expect(discoverEditorSurface(editor).text).toBe("helo there");
    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor.innerHTML).toBe("<em>helo</em> there");
  });

  it("dispatches a composed replacement InputEvent observed by framework listeners", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    const listener = vi.fn();
    document.body.addEventListener("input", listener);
    const suggestion = anchoredSuggestion(
      editor,
      typoSuggestion({ span: { start_utf16: 0, end_utf16: 4 } }),
    );

    expect(applySuggestionToEditor(editor, suggestion)).toBe(true);

    expect(editor).toHaveValue("hello");
    expect(listener).toHaveBeenCalledTimes(1);
    const event = listener.mock.calls[0][0];
    expect(event).toBeInstanceOf(InputEvent);
    expect(event.bubbles).toBe(true);
    expect(event.composed).toBe(true);
    expect(event.inputType).toBe("insertReplacementText");
    expect(event.data).toBe("hello");
  });

  it("does not fall back to the first occurrence when the trusted span is stale", () => {
    document.body.innerHTML = `<textarea id="draft">helo then helo</textarea>`;
    const editor = document.querySelector("#draft");
    const suggestion = anchoredSuggestion(
      editor,
      typoSuggestion({ span: { start_utf16: 10, end_utf16: 14 } }),
    );
    editor.value = "helo then nope";

    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor).toHaveValue("helo then nope");
  });
});
