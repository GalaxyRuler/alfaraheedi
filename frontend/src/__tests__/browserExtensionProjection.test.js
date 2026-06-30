import { screen } from "@testing-library/dom";
import { afterEach, describe, expect, it } from "vitest";

import {
  applySuggestionToEditor,
  discoverEditorSurface,
  renderSuggestionPanel,
} from "../../../browser-extension/src/editorSurface.js";

const runtime = globalThis.NahouExtensionRuntime;

afterEach(() => {
  runtime.clearInjectedSuggestionUi?.();
  document.body.innerHTML = "";
});

describe("browser extension text projection matrix", () => {
  it("maps emoji-adjacent trusted UTF-16 spans without splitting surrogate pairs", () => {
    document.body.innerHTML = `<textarea id="draft">Say 👋 to helo</textarea>`;
    const editor = document.querySelector("#draft");
    const originalText = editor.value;
    const start = originalText.indexOf("helo");
    const suggestion = {
      source: "english:common-typo",
      original: "helo",
      span: { start_utf16: start, end_utf16: start + "helo".length },
      replacements: ["hello"],
    };

    expect(runtime.projectionForEditor(editor, suggestion)).toMatchObject({
      status: "applyable",
      kind: "plain-text",
      range: { start, end: start + "helo".length },
    });

    expect(applySuggestionToEditor(editor, suggestion)).toBe(true);
    expect(editor.value).toBe("Say 👋 to hello");
  });

  it("maps RTL and Arabic/Latin mixed contenteditable ranges to the intended DOM text", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true">
        <span dir="rtl">مرحبا </span><span id="target">helo</span><span dir="rtl"> بالعالم</span>
      </div>
    `;
    const editor = document.querySelector("#draft");
    const text = discoverEditorSurface(editor).text;
    const start = text.indexOf("helo");
    const suggestion = {
      source: "english:common-typo",
      original: "helo",
      span: { start_utf16: start, end_utf16: start + "helo".length },
      replacements: ["hello"],
    };

    const projection = runtime.projectionForEditor(editor, suggestion);

    expect(projection).toMatchObject({
      status: "applyable",
      kind: "contenteditable",
      range: { start, end: start + "helo".length },
    });
    expect(projection.domRange.toString()).toBe("helo");
    expect(applySuggestionToEditor(editor, suggestion)).toBe(true);
    expect(discoverEditorSurface(editor).text).toContain("مرحبا hello بالعالم");
  });

  it("returns review-only projection for repeated original text without a trusted span", () => {
    document.body.innerHTML = `<textarea id="draft">helo then helo</textarea>`;
    const editor = document.querySelector("#draft");
    const suggestion = {
      source: "english:common-typo",
      original: "helo",
      replacements: ["hello"],
    };

    expect(runtime.projectionForEditor(editor, suggestion)).toMatchObject({
      status: "review-only",
      reason: "ambiguous-original",
      applyable: false,
      range: null,
    });
    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor.value).toBe("helo then helo");
  });

  it("keeps span-only suggestions review-only because apply needs original text", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    const suggestion = {
      source: "english:common-typo",
      span: { start_utf16: 0, end_utf16: 4 },
      replacements: ["hello"],
    };

    expect(runtime.projectionForEditor(editor, suggestion)).toMatchObject({
      status: "review-only",
      reason: "missing-original",
      applyable: false,
      range: null,
    });

    renderSuggestionPanel(editor, { suggestions: [suggestion] });

    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "english:common-typo",
    );
    expect(screen.queryByRole("button", { name: /Apply suggestion:/u })).toBeNull();
    expect(applySuggestionToEditor(editor, suggestion)).toBe(false);
    expect(editor.value).toBe("helo");
  });

  it("returns unavailable projection without an applyable DOM range for synthetic line-break spans", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><span>wat</span></div>
    `;
    const editor = document.querySelector("#draft");
    const text = discoverEditorSurface(editor).text;
    const start = text.indexOf("\n");
    const suggestion = {
      source: "layout:line-break",
      original: "\n",
      span: { start_utf16: start, end_utf16: start + 1 },
      replacements: [" "],
    };

    const projection = runtime.projectionForEditor(editor, suggestion);

    expect(projection).toMatchObject({
      status: "unavailable",
      reason: "dom-range-unavailable",
      applyable: false,
      range: { start, end: start + 1 },
      domRange: null,
    });

    expect(projection.domRange).toBeNull();
  });

  it("renders unavailable contenteditable line-break projections without Apply controls", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><span>wat</span></div>
    `;
    const editor = document.querySelector("#draft");
    const text = discoverEditorSurface(editor).text;
    const start = text.indexOf("\n");
    const suggestion = {
      source: "layout:line-break",
      original: "\n",
      span: { start_utf16: start, end_utf16: start + 1 },
      replacements: [" "],
    };

    renderSuggestionPanel(editor, { suggestions: [suggestion] });

    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "layout:line-break",
    );
    expect(screen.queryByRole("button", { name: /Apply suggestion:/u })).toBeNull();
  });

  it("projects after block boundaries, hidden decoration, non-editable islands, and editor sentinels", () => {
    document.body.innerHTML = `
      <style>.hidden-decoration { display: none; }</style>
      <div id="draft" contenteditable="true" role="textbox" aria-label="Message Body">
        <div><span>مرحبا</span><span contenteditable="false">@Ali</span></div>
        <div>
          <span class="hidden-decoration">HIDDEN</span>
          <span data-slate-zero-width="z">\uFEFF<br></span>
          <span id="target">helo</span><br class="ProseMirror-trailingBreak">
        </div>
      </div>
    `;
    const editor = document.querySelector("#draft");
    const text = discoverEditorSurface(editor).text;
    const start = text.indexOf("helo");
    const suggestion = {
      source: "english:common-typo",
      original: "helo",
      span: { start_utf16: start, end_utf16: start + "helo".length },
      replacements: ["hello"],
    };

    const projection = runtime.projectionForEditor(editor, suggestion);

    expect(projection).toMatchObject({
      status: "applyable",
      kind: "contenteditable",
    });
    expect(projection.domRange.toString()).toBe("helo");
    expect(applySuggestionToEditor(editor, suggestion)).toBe(true);
    expect(discoverEditorSurface(editor).text).toContain("hello");
    expect(discoverEditorSurface(editor).text).not.toContain("HIDDEN");
  });
});
