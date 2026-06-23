import { fireEvent, screen } from "@testing-library/dom";
import { describe, expect, it, vi } from "vitest";

import {
  applySuggestionToEditor,
  clearSuggestionMarks,
  clearSuggestionPanel,
  discoverEditorSurface,
  renderSuggestionMarks,
  renderSuggestionPanel,
} from "../../../browser-extension/src/editorSurface.js";
import {
  analyzeTextWithLocalApi,
  buildAnalyzeRequest,
} from "../../../browser-extension/src/localApi.js";

function installCssHighlightMock() {
  const previousCss = globalThis.CSS;
  const previousHighlight = globalThis.Highlight;
  const registry = new Map();
  const highlights = {
    set: vi.fn((name, highlight) => registry.set(name, highlight)),
    delete: vi.fn((name) => registry.delete(name)),
    get: vi.fn((name) => registry.get(name)),
    has: vi.fn((name) => registry.has(name)),
  };

  Object.defineProperty(globalThis, "CSS", {
    configurable: true,
    writable: true,
    value: { highlights },
  });
  Object.defineProperty(globalThis, "Highlight", {
    configurable: true,
    writable: true,
    value: class MockHighlight {
      constructor(...ranges) {
        this.ranges = ranges;
        this.size = ranges.length;
      }

      [Symbol.iterator]() {
        return this.ranges[Symbol.iterator]();
      }
    },
  });

  return {
    highlights,
    registry,
    restore() {
      if (previousCss === undefined) {
        delete globalThis.CSS;
      } else {
        Object.defineProperty(globalThis, "CSS", {
          configurable: true,
          writable: true,
          value: previousCss,
        });
      }

      if (previousHighlight === undefined) {
        delete globalThis.Highlight;
      } else {
        Object.defineProperty(globalThis, "Highlight", {
          configurable: true,
          writable: true,
          value: previousHighlight,
        });
      }
    },
  };
}

function withElementOffsetHeight(height, run) {
  const previous = Object.getOwnPropertyDescriptor(
    HTMLElement.prototype,
    "offsetHeight",
  );
  Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
    configurable: true,
    get: () => height,
  });
  const restore = () => {
    if (previous) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", previous);
    } else {
      delete HTMLElement.prototype.offsetHeight;
    }
  };
  try {
    const result = run();
    if (typeof result?.finally === "function") {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
  }
}

describe("browser extension editor surface", () => {
  it("discovers textarea and contenteditable writing surfaces", () => {
    document.body.innerHTML = `
      <textarea id="draft">helo wat you are do?</textarea>
      <div id="rich" contenteditable="true">مرحبــا  بالعالم</div>
      <input id="hidden" type="password" value="secret">
    `;

    const textarea = discoverEditorSurface(document.querySelector("#draft"));
    const richEditor = discoverEditorSurface(document.querySelector("#rich"));
    const hidden = discoverEditorSurface(document.querySelector("#hidden"));

    expect(textarea).toEqual({
      element: document.querySelector("#draft"),
      kind: "textarea",
      text: "helo wat you are do?",
    });
    expect(richEditor).toEqual({
      element: document.querySelector("#rich"),
      kind: "contenteditable",
      text: "مرحبــا  بالعالم",
    });
    expect(hidden).toBeNull();
  });

  it("ignores read-only and disabled text controls", () => {
    document.body.innerHTML = `
      <textarea id="readonly-textarea" readonly>helo</textarea>
      <textarea id="disabled-textarea" disabled>helo</textarea>
      <input id="readonly-input" type="text" readonly value="helo">
      <input id="disabled-input" type="search" disabled value="helo">
    `;

    expect(discoverEditorSurface(document.querySelector("#readonly-textarea"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#disabled-textarea"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#readonly-input"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#disabled-input"))).toBeNull();
  });

  it("ignores ARIA read-only and disabled editable controls", () => {
    document.body.innerHTML = `
      <textarea id="aria-readonly-textarea" aria-readonly="true">helo</textarea>
      <input id="aria-disabled-input" type="text" aria-disabled="true" value="helo">
      <div id="aria-readonly-rich" contenteditable="true" aria-readonly="true">helo</div>
      <div id="aria-disabled-rich" contenteditable="true" aria-disabled="true">helo</div>
      <div id="editable-rich" contenteditable="true">helo</div>
    `;

    expect(discoverEditorSurface(document.querySelector("#aria-readonly-textarea"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#aria-disabled-input"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#aria-readonly-rich"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#aria-disabled-rich"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#editable-rich"))?.kind).toBe(
      "contenteditable",
    );
  });

  it("discovers safe text-like input types and ignores password inputs", () => {
    document.body.innerHTML = `
      <input id="email" type="email" value="helo@example.com">
      <input id="url" type="url" value="https://example.com/helo">
      <input id="tel" type="tel" value="helo">
      <input id="password" type="password" value="secrethelo">
    `;

    expect(discoverEditorSurface(document.querySelector("#email"))).toEqual({
      element: document.querySelector("#email"),
      kind: "input",
      text: "helo@example.com",
    });
    expect(discoverEditorSurface(document.querySelector("#url"))).toEqual({
      element: document.querySelector("#url"),
      kind: "input",
      text: "https://example.com/helo",
    });
    expect(discoverEditorSurface(document.querySelector("#tel"))).toEqual({
      element: document.querySelector("#tel"),
      kind: "input",
      text: "helo",
    });
    expect(discoverEditorSurface(document.querySelector("#password"))).toBeNull();
  });

  it("ignores sensitive text-like input hints", () => {
    document.body.innerHTML = `
      <input id="otp" type="text" autocomplete="one-time-code" value="123456">
      <input id="card" type="tel" autocomplete="cc-number" value="4111111111111111">
      <input id="secret-token" name="api_token" type="text" value="secrethelo">
      <input id="api-key" name="api_key" type="text" value="keyhelo">
      <input id="normal" type="text" value="helo">
    `;

    expect(discoverEditorSurface(document.querySelector("#otp"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#card"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#secret-token"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#api-key"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#normal"))).toEqual({
      element: document.querySelector("#normal"),
      kind: "input",
      text: "helo",
    });
  });

  it("ignores sensitive textarea and contenteditable hints", () => {
    document.body.innerHTML = `
      <textarea id="secret-notes" name="api_token">secrethelo</textarea>
      <textarea id="normal-textarea">helo</textarea>
      <div id="api-key-editor" contenteditable="true" aria-label="API key">keyhelo</div>
      <div id="normal-rich" contenteditable="true" aria-label="Message">helo</div>
    `;

    expect(discoverEditorSurface(document.querySelector("#secret-notes"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#api-key-editor"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#normal-textarea"))).toEqual({
      element: document.querySelector("#normal-textarea"),
      kind: "textarea",
      text: "helo",
    });
    expect(discoverEditorSurface(document.querySelector("#normal-rich"))).toEqual({
      element: document.querySelector("#normal-rich"),
      kind: "contenteditable",
      text: "helo",
    });
  });

  it("ignores editors inside sensitive ancestor containers", () => {
    document.body.innerHTML = `
      <form id="payment-form" aria-label="Credit card">
        <textarea id="draft-notes">cardhelo</textarea>
      </form>
      <fieldset id="token-fieldset">
        <div id="draft-rich" contenteditable="true">tokenhelo</div>
      </fieldset>
      <form id="message-form" aria-label="Message">
        <textarea id="normal-textarea">helo</textarea>
        <div id="normal-rich" contenteditable="true">wat</div>
      </form>
    `;

    expect(discoverEditorSurface(document.querySelector("#draft-notes"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#draft-rich"))).toBeNull();
    expect(discoverEditorSurface(document.querySelector("#normal-textarea"))).toEqual({
      element: document.querySelector("#normal-textarea"),
      kind: "textarea",
      text: "helo",
    });
    expect(discoverEditorSurface(document.querySelector("#normal-rich"))).toEqual({
      element: document.querySelector("#normal-rich"),
      kind: "contenteditable",
      text: "wat",
    });
  });

  it("discovers contenteditable variants and ignores non-editable islands", () => {
    document.body.innerHTML = `
      <div id="plain" contenteditable="plaintext-only"><span id="plain-child">helo</span></div>
      <div id="empty" contenteditable><span id="empty-child">wat</span></div>
      <div id="rich" contenteditable="true">
        <span id="locked" contenteditable="false">do not touch</span>
      </div>
    `;

    const plaintext = discoverEditorSurface(document.querySelector("#plain-child"));
    const empty = discoverEditorSurface(document.querySelector("#empty-child"));
    const locked = discoverEditorSurface(document.querySelector("#locked"));

    expect(plaintext).toEqual({
      element: document.querySelector("#plain"),
      kind: "contenteditable",
      text: "helo",
    });
    expect(empty).toEqual({
      element: document.querySelector("#empty"),
      kind: "contenteditable",
      text: "wat",
    });
    expect(locked).toBeNull();
  });

  it("omits non-editable contenteditable islands from discovered rich-editor text", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true"><span>helo</span><span contenteditable="false">LOCKED</span><span> wat you are do?</span></div>`;

    const editor = document.querySelector("#draft");
    const surface = discoverEditorSurface(editor);

    expect(surface).toEqual({
      element: editor,
      kind: "contenteditable",
      text: "helo wat you are do?",
    });
  });

  it("omits hidden contenteditable decoration text from discovered rich-editor text", () => {
    document.body.innerHTML = `
      <style>.decor-display { display: none; } .decor-visibility { visibility: hidden; }</style>
      <div id="draft" contenteditable="true"><span aria-hidden="true">Placeholder</span><span class="decor-display">DISPLAY</span><span>helo</span><span hidden>HIDDEN</span><span class="decor-visibility">VISIBILITY</span><span> wat you are do?</span></div>
    `;

    const editor = document.querySelector("#draft");
    const surface = discoverEditorSurface(editor);

    expect(surface).toEqual({
      element: editor,
      kind: "contenteditable",
      text: "helo wat you are do?",
    });
  });

  it("omits production rich-editor sentinel nodes from discovered text", () => {
    document.body.innerHTML =
      '<div id="draft" contenteditable="true" role="textbox" aria-label="Message Body"><span data-slate-string="true">helo</span><span data-slate-zero-width="z">\uFEFF<br></span><span> wat</span><br class="ProseMirror-trailingBreak"></div>';

    expect(discoverEditorSurface(document.querySelector("#draft"))).toEqual({
      element: document.querySelector("#draft"),
      kind: "contenteditable",
      text: "helo wat",
    });
  });

  it("preserves visible br line breaks when discovering contenteditable text", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><span>wat you are do?</span></div>
    `;

    const editor = document.querySelector("#draft");
    const surface = discoverEditorSurface(editor);

    expect(surface).toEqual({
      element: editor,
      kind: "contenteditable",
      text: "helo\nwat you are do?",
    });
  });

  it("preserves visible block line breaks when discovering contenteditable text", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div>helo</div><div>wat you are do?</div></div>
    `;

    const editor = document.querySelector("#draft");
    const surface = discoverEditorSurface(editor);

    expect(surface).toEqual({
      element: editor,
      kind: "contenteditable",
      text: "helo\nwat you are do?",
    });
  });

  it("preserves blank contenteditable block lines when discovering text", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div>helo</div><div><br></div><div>wat you are do?</div></div>
    `;

    const editor = document.querySelector("#draft");
    const surface = discoverEditorSurface(editor);

    expect(surface).toEqual({
      element: editor,
      kind: "contenteditable",
      text: "helo\n\nwat you are do?",
    });
  });

  it("preserves repeated br line breaks when discovering contenteditable text", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><br><span>wat you are do?</span></div>
    `;

    const editor = document.querySelector("#draft");
    const surface = discoverEditorSurface(editor);

    expect(surface).toEqual({
      element: editor,
      kind: "contenteditable",
      text: "helo\n\nwat you are do?",
    });
  });

  it("renders and clears a local suggestion panel without changing editor text", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");

    renderSuggestionPanel(editor, {
      suggestions: [
        {
          id: "s1",
          source: "english:common-typo",
          replacements: ["hello"],
          explanation: "Fixes a common typo.",
          severity: "warning",
        },
      ],
    });

    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "english:common-typo",
    );
    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "hello",
    );
    expect(editor).toHaveValue("helo wat you are do?");

    clearSuggestionPanel(editor);

    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
  });

  it("renders accessible suggestion panel semantics without changing the editor text", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");

    renderSuggestionPanel(editor, {
      suggestions: [
        {
          id: "s1",
          source: "english:common-typo",
          original: "helo",
          replacements: ["hello"],
          explanation: "Fixes a common typo.",
        },
      ],
    });

    const panel = screen.getByRole("region", {
      name: "Alfaraheedi suggestions",
    });
    const applyButton = screen.getByRole("button", {
      name: "Apply suggestion: hello",
    });
    const describedBy = applyButton.getAttribute("aria-describedby");
    const source = panel.querySelector("code");
    const replacement = document.getElementById(describedBy);

    expect(panel).toHaveAttribute("dir", "auto");
    expect(source).toHaveAttribute("dir", "auto");
    expect(replacement).toHaveAttribute("dir", "auto");
    expect(applyButton).toHaveTextContent("Apply");
    expect(describedBy).toBeTruthy();
    expect(replacement).toHaveTextContent("hello");
    expect(editor).toHaveValue("helo wat you are do?");
  });

  it("does not render Apply controls for suggestions that cannot map to current text", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");

    renderSuggestionPanel(editor, {
      suggestions: [
        {
          source: "english:valid",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
        {
          source: "english:stale-span",
          original: "helo",
          span: { start_utf16: 10, end_utf16: 14 },
          replacements: ["hello"],
        },
        {
          source: "english:unanchored",
          replacements: ["review"],
          explanation: "Review this text.",
        },
      ],
    });

    const panel = screen.getByRole("region", {
      name: "Alfaraheedi suggestions",
    });
    expect(screen.getAllByRole("button", { name: /Apply suggestion:/u })).toHaveLength(1);
    expect(panel).toHaveTextContent("english:valid");
    expect(panel).toHaveTextContent("english:stale-span");
    expect(panel).toHaveTextContent("english:unanchored");
  });

  it("lets the user apply one rendered suggestion from the panel", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");

    renderSuggestionPanel(editor, {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          replacements: ["hello"],
          explanation: "Fixes a common typo.",
        },
      ],
    });

    const applyButton = document.querySelector("[data-alfaraheedi-panel] button");
    expect(applyButton).not.toBeNull();
    fireEvent.click(applyButton);

    expect(editor).toHaveValue("hello wat you are do?");
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
  });

  it("clears rendered marks immediately after applying a suggestion", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    const analysis = {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    };

    renderSuggestionMarks(editor, analysis);
    renderSuggestionPanel(editor, analysis);

    expect(document.querySelector("[data-alfaraheedi-marks]")).not.toBeNull();

    const applyButton = document.querySelector("[data-alfaraheedi-panel] button");
    expect(applyButton).not.toBeNull();
    fireEvent.click(applyButton);

    expect(editor).toHaveValue("hello wat you are do?");
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
  });

  it("shows a status and clears marks when an applied suggestion no longer matches", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    const analysis = {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    };

    renderSuggestionMarks(editor, analysis);
    renderSuggestionPanel(editor, analysis);
    editor.value = "already fixed";
    fireEvent.click(screen.getByRole("button", { name: /Apply suggestion:/u }));

    expect(editor).toHaveValue("already fixed");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Suggestion no longer matches current text.",
    );
    expect(document.querySelector("[data-alfaraheedi-panel]")).not.toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
  });

  it("clears rendered panel and marks when the editor is removed from the page", async () => {
    document.body.innerHTML = `<div id="root"><textarea id="draft">helo</textarea></div>`;
    const editor = document.querySelector("#draft");
    const analysis = {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    };

    renderSuggestionMarks(editor, analysis);
    renderSuggestionPanel(editor, analysis);

    expect(document.querySelector("[data-alfaraheedi-panel]")).not.toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).not.toBeNull();

    editor.remove();
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
  });

  it("renders non-mutating underline marks for textarea suggestions", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");

    renderSuggestionMarks(editor, {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    });

    const marks = document.querySelector("[data-alfaraheedi-marks]");
    expect(marks).toHaveTextContent("helo");
    expect(marks.querySelector("mark")).toHaveTextContent("helo");
    expect(editor).toHaveValue("helo wat you are do?");
  });

  it("keeps plain text underline marks aligned with textarea scroll", () => {
    document.body.innerHTML = `<textarea id="draft">helo\n\nwat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    editor.scrollTop = 18;
    editor.scrollLeft = 3;

    renderSuggestionMarks(editor, {
      suggestions: [
        {
          source: "english:phrase",
          original: "wat",
          span: { start_utf16: 6, end_utf16: 9 },
          replacements: ["what"],
        },
      ],
    });

    const marks = document.querySelector("[data-alfaraheedi-marks]");
    expect(marks.scrollTop).toBe(18);
    expect(marks.scrollLeft).toBe(3);

    editor.scrollTop = 42;
    editor.scrollLeft = 7;
    fireEvent.scroll(editor);

    expect(marks.scrollTop).toBe(42);
    expect(marks.scrollLeft).toBe(7);
  });

  it("repositions panel and plain text marks when the editor layout moves", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    let rect = {
      left: 20,
      top: 30,
      bottom: 90,
      width: 320,
      height: 60,
    };
    editor.getBoundingClientRect = vi.fn(() => rect);
    const analysis = {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    };

    renderSuggestionMarks(editor, analysis);
    renderSuggestionPanel(editor, analysis);

    const marks = document.querySelector("[data-alfaraheedi-marks]");
    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(marks.style.top).toBe("30px");
    expect(panel.style.top).toBe("96px");

    rect = {
      left: 44,
      top: 120,
      bottom: 180,
      width: 320,
      height: 60,
    };
    fireEvent.scroll(window);

    expect(marks.style.insetInlineStart).toBe("44px");
    expect(marks.style.top).toBe("120px");
    expect(panel.style.insetInlineStart).toBe("44px");
    expect(panel.style.top).toBe("186px");
  });

  it("repositions a contenteditable panel when the editor layout moves", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true">helo wat you are do?</div>`;
    const editor = document.querySelector("#draft");
    let rect = {
      left: 16,
      top: 24,
      bottom: 72,
      width: 360,
      height: 48,
    };
    editor.getBoundingClientRect = vi.fn(() => rect);
    const analysis = {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    };

    renderSuggestionPanel(editor, analysis);

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel.style.insetInlineStart).toBe("16px");
    expect(panel.style.top).toBe("78px");

    rect = {
      left: 42,
      top: 88,
      bottom: 136,
      width: 360,
      height: 48,
    };
    fireEvent.scroll(window);

    expect(panel.style.insetInlineStart).toBe("42px");
    expect(panel.style.top).toBe("142px");
  });

  it("keeps suggestion panels inside the right viewport edge", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    editor.getBoundingClientRect = vi.fn(() => ({
      left: 360,
      top: 30,
      bottom: 90,
      width: 80,
      height: 60,
    }));

    renderSuggestionPanel(editor, {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    });

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel.style.insetInlineStart).toBe("22px");
    expect(panel.style.maxWidth).toBe("360px");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousInnerWidth,
    });
  });

  it("keeps suggestion panels inside the bottom viewport edge", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    const previousInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 420,
    });
    editor.getBoundingClientRect = vi.fn(() => ({
      left: 24,
      top: 320,
      bottom: 380,
      width: 320,
      height: 60,
    }));

    withElementOffsetHeight(120, () => {
      renderSuggestionPanel(editor, {
        suggestions: [
          {
            source: "english:common-typo",
            original: "helo",
            span: { start_utf16: 0, end_utf16: 4 },
            replacements: ["hello"],
          },
        ],
      });
    });

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel.style.top).toBe("292px");
    expect(panel.style.maxHeight).toBe("404px");
    expect(panel.style.overflowY).toBe("auto");

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: previousInnerHeight,
    });
  });

  it("renders non-mutating CSS Highlight marks for contenteditable suggestions", () => {
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `<div id="draft" contenteditable="true">helo wat you are do?</div>`;
    const editor = document.querySelector("#draft");

    const rendered = renderSuggestionMarks(editor, {
      suggestions: [
        {
          source: "english:common-typo",
          original: "helo",
          span: { start_utf16: 0, end_utf16: 4 },
          replacements: ["hello"],
        },
      ],
    });

    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(rendered).toBe(highlight);
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("helo");
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
    expect(editor.textContent).toBe("helo wat you are do?");

    clearSuggestionMarks(editor);

    expect(cssHighlight.highlights.delete).toHaveBeenCalledWith(
      "alfaraheedi-suggestions",
    );
    cssHighlight.restore();
  });

  it("maps contenteditable CSS Highlight ranges after br line breaks", () => {
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><span>wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");

    renderSuggestionMarks(editor, {
      suggestions: [
        {
          source: "english:phrase",
          original: "wat",
          span: { start_utf16: 5, end_utf16: 8 },
          replacements: ["what"],
        },
      ],
    });

    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    cssHighlight.restore();
  });

  it("maps contenteditable CSS Highlight ranges after block line breaks", () => {
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div>helo</div><div>wat you are do?</div></div>
    `;
    const editor = document.querySelector("#draft");

    renderSuggestionMarks(editor, {
      suggestions: [
        {
          source: "english:phrase",
          original: "wat",
          span: { start_utf16: 5, end_utf16: 8 },
          replacements: ["what"],
        },
      ],
    });

    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    cssHighlight.restore();
  });

  it("applies one suggestion to a textarea when the original text still matches", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat you are do?</textarea>`;
    const editor = document.querySelector("#draft");
    editor.setSelectionRange(0, 0);

    const applied = applySuggestionToEditor(editor, {
      original: "helo",
      replacements: ["hello"],
    });

    expect(applied).toBe(true);
    expect(editor).toHaveValue("hello wat you are do?");
    expect(editor.selectionStart).toBe(5);
    expect(editor.selectionEnd).toBe(5);
  });

  it("dispatches a composed replacement InputEvent after applying inside a shadow textarea", () => {
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.querySelector("#host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = shadow.querySelector("#draft");
    const inputEvents = [];
    document.addEventListener("input", (event) => inputEvents.push(event));

    const applied = applySuggestionToEditor(editor, {
      original: "helo",
      replacements: ["hello"],
    });

    expect(applied).toBe(true);
    expect(editor).toHaveValue("hello");
    expect(inputEvents).toHaveLength(1);
    expect(inputEvents[0]).toBeInstanceOf(InputEvent);
    expect(inputEvents[0].bubbles).toBe(true);
    expect(inputEvents[0].composed).toBe(true);
    expect(inputEvents[0].inputType).toBe("insertReplacementText");
    expect(inputEvents[0].data).toBe("hello");
  });

  it("applies textarea suggestions at the matching span when the original text repeats", () => {
    document.body.innerHTML = `<textarea id="draft">helo then helo</textarea>`;
    const editor = document.querySelector("#draft");
    editor.setSelectionRange(0, 0);

    const applied = applySuggestionToEditor(editor, {
      original: "helo",
      span: { start_utf16: 10, end_utf16: 14 },
      replacements: ["hello"],
    });

    expect(applied).toBe(true);
    expect(editor).toHaveValue("helo then hello");
    expect(editor.selectionStart).toBe(15);
    expect(editor.selectionEnd).toBe(15);
  });

  it("applies one suggestion to a contenteditable surface", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true">مرحبــا  بالعالم</div>`;
    const editor = document.querySelector("#draft");

    const applied = applySuggestionToEditor(editor, {
      original: "مرحبــا",
      replacements: ["مرحبا"],
    });

    expect(applied).toBe(true);
    expect(editor.textContent).toBe("مرحبا  بالعالم");
  });

  it("places the caret after an applied contenteditable replacement", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true">helo wat you are do?</div>`;
    const editor = document.querySelector("#draft");

    const applied = applySuggestionToEditor(editor, {
      original: "helo",
      span: { start_utf16: 0, end_utf16: 4 },
      replacements: ["hello"],
    });

    expect(applied).toBe(true);
    expect(editor.textContent).toBe("hello wat you are do?");
    const selection = window.getSelection();
    expect(selection.anchorNode.nodeType).toBe(Node.TEXT_NODE);
    expect(selection.anchorNode.nodeValue).toBe("hello");
    expect(selection.anchorOffset).toBe(5);
    expect(selection.focusNode).toBe(selection.anchorNode);
    expect(selection.focusOffset).toBe(5);
  });

  it("dispatches replacement InputEvent metadata after applying inside contenteditable", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true">helo</div>`;
    const editor = document.querySelector("#draft");
    const inputEvents = [];
    editor.addEventListener("input", (event) => inputEvents.push(event));

    const applied = applySuggestionToEditor(editor, {
      original: "helo",
      replacements: ["hello"],
    });

    expect(applied).toBe(true);
    expect(editor.textContent).toBe("hello");
    expect(inputEvents).toHaveLength(1);
    expect(inputEvents[0]).toBeInstanceOf(InputEvent);
    expect(inputEvents[0].bubbles).toBe(true);
    expect(inputEvents[0].composed).toBe(true);
    expect(inputEvents[0].inputType).toBe("insertReplacementText");
    expect(inputEvents[0].data).toBe("hello");
  });

  it("applies one contenteditable suggestion without flattening inline markup", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true">
        <span>helo</span> <strong>wat</strong> you are do?
      </div>
    `;
    const editor = document.querySelector("#draft");
    const strong = editor.querySelector("strong");

    const applied = applySuggestionToEditor(editor, {
      original: "helo",
      span: { start_utf16: 9, end_utf16: 13 },
      replacements: ["hello"],
    });

    expect(applied).toBe(true);
    expect(editor.textContent).toContain("hello wat you are do?");
    expect(editor.querySelector("strong")).toBe(strong);
    expect(editor.querySelector("strong")).toHaveTextContent("wat");
  });

  it("applies contenteditable suggestions after non-editable islands using visible text offsets", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><span id="chip" contenteditable="false">LOCKED</span><span id="tail"> wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    const chip = document.querySelector("#chip");
    const tail = document.querySelector("#tail");

    const applied = applySuggestionToEditor(editor, {
      original: "wat",
      span: { start_utf16: 5, end_utf16: 8 },
      replacements: ["what"],
    });

    expect(applied).toBe(true);
    expect(editor.querySelector("#chip")).toBe(chip);
    expect(editor.querySelector("#chip")).toHaveTextContent("LOCKED");
    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe(" what you are do?");
    expect(editor.textContent).toBe("heloLOCKED what you are do?");
  });

  it("applies contenteditable suggestions after hidden decoration using visible text offsets", () => {
    document.body.innerHTML = `
      <style>.decor-display { display: none; } .decor-visibility { visibility: hidden; }</style>
      <div id="draft" contenteditable="true"><span aria-hidden="true">Placeholder</span><span class="decor-display">DISPLAY</span><span>helo</span><span hidden>HIDDEN</span><span class="decor-visibility">VISIBILITY</span><span id="tail"> wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    const tail = document.querySelector("#tail");

    const applied = applySuggestionToEditor(editor, {
      original: "wat",
      span: { start_utf16: 5, end_utf16: 8 },
      replacements: ["what"],
    });

    expect(applied).toBe(true);
    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe(" what you are do?");
    expect(editor.textContent).toBe(
      "PlaceholderDISPLAYheloHIDDENVISIBILITY what you are do?",
    );
  });

  it("applies contenteditable suggestions after production rich-editor sentinel nodes", () => {
    document.body.innerHTML =
      '<div id="draft" contenteditable="true" role="textbox" aria-label="Message Body"><span data-slate-string="true">helo</span><span data-slate-zero-width="z">\uFEFF<br></span><span id="tail"> wat you are do?</span><br class="ProseMirror-trailingBreak"></div>';
    const editor = document.querySelector("#draft");
    const tail = document.querySelector("#tail");

    const applied = applySuggestionToEditor(editor, {
      original: "wat",
      span: { start_utf16: 5, end_utf16: 8 },
      replacements: ["what"],
    });

    expect(applied).toBe(true);
    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe(" what you are do?");
    expect(discoverEditorSurface(editor)?.text).toBe("helo what you are do?");
  });

  it("applies contenteditable suggestions after blank block lines using visible text offsets", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div>helo</div><div><br></div><div>wat you are do?</div></div>
    `;
    const editor = document.querySelector("#draft");

    const applied = applySuggestionToEditor(editor, {
      original: "wat",
      span: { start_utf16: 6, end_utf16: 9 },
      replacements: ["what"],
    });

    expect(applied).toBe(true);
    expect(editor.textContent).toBe("helowhat you are do?");
    expect(editor.querySelectorAll("div")).toHaveLength(3);
    expect(editor.querySelectorAll("br")).toHaveLength(1);
  });

  it("applies contenteditable suggestions after br without moving replacement outside inline markup", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><span id="second">wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    const second = document.querySelector("#second");

    const applied = applySuggestionToEditor(editor, {
      original: "wat",
      span: { start_utf16: 5, end_utf16: 8 },
      replacements: ["what"],
    });

    expect(applied).toBe(true);
    expect(editor.querySelector("br")).not.toBeNull();
    expect(editor.querySelector("#second")).toBe(second);
    expect(editor.querySelector("#second")).toHaveTextContent("what you are do?");
    expect(editor.innerHTML).toBe(
      '<span>helo</span><br><span id="second">what you are do?</span>',
    );
  });

  it("applies contenteditable suggestions after block boundaries inside the target block", () => {
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div id="first">helo</div><div id="second">wat you are do?</div></div>
    `;
    const editor = document.querySelector("#draft");
    const second = document.querySelector("#second");

    const applied = applySuggestionToEditor(editor, {
      original: "wat",
      span: { start_utf16: 5, end_utf16: 8 },
      replacements: ["what"],
    });

    expect(applied).toBe(true);
    expect(editor.querySelector("#second")).toBe(second);
    expect(editor.querySelector("#second")).toHaveTextContent("what you are do?");
    expect(editor.innerHTML).toBe(
      '<div id="first">helo</div><div id="second">what you are do?</div>',
    );
  });
});

describe("browser extension local API bridge", () => {
  it("builds local analyze requests for selected writing mode", () => {
    expect(buildAnalyzeRequest("helo wat you are do?", "english")).toEqual({
      text: "helo wat you are do?",
      writing_mode: "english",
    });
  });

  it("posts analysis to the loopback API without remote fallback", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({ suggestions: [] }),
    }));

    const analysis = await analyzeTextWithLocalApi({
      apiBaseUrl: "http://127.0.0.1:3000",
      fetchImpl: fetchMock,
      text: "مرحبــا  بالعالم",
      writingMode: "arabic",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://127.0.0.1:3000/v1/analyze",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          text: "مرحبــا  بالعالم",
          writing_mode: "arabic",
        }),
      }),
    );
    expect(analysis).toEqual({ suggestions: [] });
  });
});

describe("browser extension content script", () => {
  it("renders runtime suggestions and applies one suggestion in a textarea", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                replacements: ["hello"],
                explanation: "Fixes a common typo.",
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    const applyButton = screen.getByRole("button", { name: /Apply suggestion:/u });
    const describedBy = applyButton.getAttribute("aria-describedby");
    expect(panel).toHaveAttribute("dir", "auto");
    expect(panel.querySelector("code")).toHaveAttribute("dir", "auto");
    expect(document.getElementById(describedBy)).toHaveAttribute("dir", "auto");

    fireEvent.click(applyButton);

    expect(editor).toHaveValue("hello wat you are do?");
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("renders a runtime status panel when analysis messaging rejects", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => {
          throw new Error("failed to fetch http://127.0.0.1:3000/v1/analyze?text=private");
        }),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-message-rejection-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel).not.toBeNull();
    expect(panel).toHaveTextContent("Alfaraheedi local API is unavailable.");
    expect(panel).not.toHaveTextContent("private");
    expect(panel).not.toHaveTextContent("127.0.0.1");
    expect(panel).toHaveAttribute("role", "status");
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("reports oversized editor text locally without sending it to the runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: { suggestions: [] },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-large-text-test");

    editor.focus();
    editor.value = `helo ${"private ".repeat(858)}`;
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(panel).not.toBeNull();
    expect(panel).toHaveAttribute("role", "status");
    expect(panel).toHaveTextContent("Text is too long for local checking.");
    expect(panel).not.toHaveTextContent("private");
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("replaces a runtime error panel with suggestions when the user moves to another editor", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="first"></textarea>
      <textarea id="second"></textarea>
    `;
    const firstEditor = document.querySelector("#first");
    const secondEditor = document.querySelector("#second");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async (message) => {
          if (message.text === "helo first") {
            throw new Error("failed to fetch http://127.0.0.1:3000/v1/analyze?text=private");
          }
          return {
            ok: true,
            analysis: {
              suggestions: [
                {
                  source: "english:common-typo",
                  original: "helo",
                  span: { start_utf16: 0, end_utf16: 4 },
                  replacements: ["hello"],
                },
              ],
            },
          };
        }),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-editor-switch-after-error-test");

    firstEditor.focus();
    firstEditor.value = "helo first";
    fireEvent.input(firstEditor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "Alfaraheedi local API is unavailable.",
    );

    secondEditor.value = "helo second";
    fireEvent.focusOut(firstEditor, { relatedTarget: secondEditor });
    secondEditor.focus();
    fireEvent.input(secondEditor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panels = document.querySelectorAll("[data-alfaraheedi-panel]");
    expect(panels).toHaveLength(1);
    expect(panels[0]).toHaveTextContent("hello");
    expect(panels[0]).not.toHaveTextContent("Alfaraheedi local API is unavailable.");
    expect(panels[0]).not.toHaveTextContent("private");
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo second",
    });

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("removes stale layout synchronization when global cleanup switches editors", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="first"></textarea>
      <textarea id="second"></textarea>
    `;
    const firstEditor = document.querySelector("#first");
    const secondEditor = document.querySelector("#second");
    const firstRect = vi.fn(() => ({
      left: 10,
      top: 10,
      bottom: 50,
      width: 220,
      height: 40,
    }));
    const secondRect = vi.fn(() => ({
      left: 20,
      top: 80,
      bottom: 120,
      width: 220,
      height: 40,
    }));
    firstEditor.getBoundingClientRect = firstRect;
    secondEditor.getBoundingClientRect = secondRect;
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-global-cleanup-layout-test");

    firstEditor.focus();
    firstEditor.value = "helo first";
    fireEvent.input(firstEditor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "hello",
    );

    secondEditor.focus();
    secondEditor.value = "helo second";
    fireEvent.input(secondEditor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    firstRect.mockClear();
    secondRect.mockClear();
    window.dispatchEvent(new Event("resize"));

    expect(firstRect).not.toHaveBeenCalled();
    expect(secondRect).toHaveBeenCalled();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("does not analyze read-only or disabled text controls at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="readonly" readonly>helo</textarea>
      <input id="disabled" type="text" disabled value="helo">
    `;
    const readonly = document.querySelector("#readonly");
    const disabled = document.querySelector("#disabled");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-readonly-disabled-test");

    fireEvent.focusIn(readonly);
    fireEvent.input(readonly);
    fireEvent.focusIn(disabled);
    fireEvent.input(disabled);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("does not analyze ARIA read-only or disabled editable controls at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="aria-readonly-textarea" aria-readonly="true">helo</textarea>
      <input id="aria-disabled-input" type="text" aria-disabled="true" value="helo">
      <div id="aria-readonly-rich" contenteditable="true" aria-readonly="true">helo</div>
      <div id="aria-disabled-rich" contenteditable="true" aria-disabled="true">helo</div>
    `;
    const ariaReadonlyTextarea = document.querySelector("#aria-readonly-textarea");
    const ariaDisabledInput = document.querySelector("#aria-disabled-input");
    const ariaReadonlyRich = document.querySelector("#aria-readonly-rich");
    const ariaDisabledRich = document.querySelector("#aria-disabled-rich");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-aria-disabled-test");

    fireEvent.focusIn(ariaReadonlyTextarea);
    fireEvent.input(ariaReadonlyTextarea);
    fireEvent.focusIn(ariaDisabledInput);
    fireEvent.input(ariaDisabledInput);
    fireEvent.focusIn(ariaReadonlyRich);
    fireEvent.input(ariaReadonlyRich);
    fireEvent.focusIn(ariaDisabledRich);
    fireEvent.input(ariaDisabledRich);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("analyzes safe text-like input types and ignores password inputs at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <input id="email" type="email">
      <input id="url" type="url">
      <input id="tel" type="tel">
      <input id="password" type="password" value="secrethelo">
    `;
    const email = document.querySelector("#email");
    const url = document.querySelector("#url");
    const tel = document.querySelector("#tel");
    const password = document.querySelector("#password");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-text-like-input-test");

    email.focus();
    email.value = "helo@example.com";
    fireEvent.input(email);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    url.focus();
    url.value = "helo.example";
    fireEvent.input(url);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    tel.focus();
    tel.value = "helo";
    fireEvent.input(tel);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    fireEvent.input(password);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const analyzedTexts = globalThis.chrome.runtime.sendMessage.mock.calls.map(
      ([message]) => message.text,
    );
    expect(analyzedTexts).toContain("helo@example.com");
    expect(analyzedTexts).toContain("helo.example");
    expect(analyzedTexts).toContain("helo");
    expect(analyzedTexts).not.toContain("secrethelo");
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo@example.com",
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo.example",
    });
    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo",
    });

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("ignores sensitive text-like input hints at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <input id="otp" type="text" autocomplete="one-time-code" value="123456">
      <input id="card" type="tel" autocomplete="cc-number" value="4111111111111111">
      <input id="token" name="api_token" type="text" value="secrethelo">
      <input id="normal" type="text" value="helo">
    `;
    const otp = document.querySelector("#otp");
    const card = document.querySelector("#card");
    const token = document.querySelector("#token");
    const normal = document.querySelector("#normal");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: { suggestions: [] },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-sensitive-input-test");

    otp.focus();
    fireEvent.input(otp);
    card.focus();
    fireEvent.input(card);
    token.focus();
    fireEvent.input(token);
    normal.focus();
    fireEvent.input(normal);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const analyzedTexts = globalThis.chrome.runtime.sendMessage.mock.calls.map(
      ([message]) => message.text,
    );
    expect(analyzedTexts).toContain("helo");
    expect(analyzedTexts).not.toContain("123456");
    expect(analyzedTexts).not.toContain("4111111111111111");
    expect(analyzedTexts).not.toContain("secrethelo");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("ignores sensitive textarea and contenteditable hints at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="secret-notes" name="api_token">secrethelo</textarea>
      <textarea id="normal-textarea">helo</textarea>
      <div id="secret-rich" contenteditable="true" aria-label="Secret token">tokenhelo</div>
      <div id="normal-rich" contenteditable="true" aria-label="Message">wat</div>
    `;
    const secretTextarea = document.querySelector("#secret-notes");
    const normalTextarea = document.querySelector("#normal-textarea");
    const secretRich = document.querySelector("#secret-rich");
    const normalRich = document.querySelector("#normal-rich");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: { suggestions: [] },
        })),
      },
    };

    await import(
      "../../../browser-extension/src/content.js?content-script-sensitive-editable-test"
    );

    const fireAndWait = async (editor) => {
      editor.focus();
      fireEvent.input(editor);
      await vi.advanceTimersByTimeAsync(700);
      await Promise.resolve();
    };

    await fireAndWait(secretTextarea);
    await fireAndWait(secretRich);
    await fireAndWait(normalTextarea);
    await fireAndWait(normalRich);

    const analyzedTexts = globalThis.chrome.runtime.sendMessage.mock.calls.map(
      ([message]) => message.text,
    );
    expect(analyzedTexts).toContain("helo");
    expect(analyzedTexts).toContain("wat");
    expect(analyzedTexts).not.toContain("secrethelo");
    expect(analyzedTexts).not.toContain("tokenhelo");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("ignores editors inside sensitive ancestor containers at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <form id="payment-form" aria-label="Credit card">
        <textarea id="draft-notes">cardhelo</textarea>
      </form>
      <fieldset id="token-fieldset">
        <div id="draft-rich" contenteditable="true">tokenhelo</div>
      </fieldset>
      <form id="message-form" aria-label="Message">
        <textarea id="normal-textarea">helo</textarea>
        <div id="normal-rich" contenteditable="true">wat</div>
      </form>
    `;
    const cardTextarea = document.querySelector("#draft-notes");
    const tokenRich = document.querySelector("#draft-rich");
    const normalTextarea = document.querySelector("#normal-textarea");
    const normalRich = document.querySelector("#normal-rich");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: { suggestions: [] },
        })),
      },
    };

    await import(
      "../../../browser-extension/src/content.js?content-script-sensitive-ancestor-test"
    );

    const fireAndWait = async (editor) => {
      editor.focus();
      fireEvent.input(editor);
      await vi.advanceTimersByTimeAsync(700);
      await Promise.resolve();
    };

    await fireAndWait(cardTextarea);
    await fireAndWait(tokenRich);
    await fireAndWait(normalTextarea);
    await fireAndWait(normalRich);

    const analyzedTexts = globalThis.chrome.runtime.sendMessage.mock.calls.map(
      ([message]) => message.text,
    );
    expect(analyzedTexts).toContain("helo");
    expect(analyzedTexts).toContain("wat");
    expect(analyzedTexts).not.toContain("cardhelo");
    expect(analyzedTexts).not.toContain("tokenhelo");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("analyzes editable text controls inside open shadow roots at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="host"></div>`;
    const host = document.querySelector("#host");
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = shadow.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-shadow-textarea-test");

    editor.focus();
    editor.value = "helo";
    editor.dispatchEvent(
      new InputEvent("input", {
        bubbles: true,
        composed: true,
        inputType: "insertText",
        data: "o",
      }),
    );
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo",
    });

    const applyButton = screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1);
    expect(applyButton).toBeTruthy();
    fireEvent.click(applyButton);

    expect(editor).toHaveValue("hello");
    expect(editor.selectionStart).toBe(5);
    expect(editor.selectionEnd).toBe(5);

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("applies runtime textarea suggestions at the clicked suggestion span", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:first",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
              {
                source: "english:second",
                original: "helo",
                span: { start_utf16: 10, end_utf16: 14 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-repeated-textarea-test");

    editor.focus();
    editor.value = "helo then helo";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const applyButtons = screen.getAllByRole("button", { name: /Apply suggestion:/u });
    fireEvent.click(applyButtons.at(-1));

    expect(editor).toHaveValue("helo then hello");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("preserves leading whitespace in runtime analyze requests so spans stay aligned", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:first",
                original: "helo",
                span: { start_utf16: 2, end_utf16: 6 },
                replacements: ["hello"],
              },
              {
                source: "english:second",
                original: "helo",
                span: { start_utf16: 12, end_utf16: 16 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-leading-whitespace-test");

    editor.focus();
    editor.value = "  helo then helo";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "  helo then helo",
    });

    const applyButtons = screen.getAllByRole("button", { name: /Apply suggestion:/u });
    fireEvent.click(applyButtons.at(-1));

    expect(editor).toHaveValue("  helo then hello");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("ignores stale runtime analysis when editor text changes before the response returns", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    let resolveAnalyze;
    const analyzePromise = new Promise((resolve) => {
      resolveAnalyze = resolve;
    });
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(() => analyzePromise),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-stale-analysis-test");

    editor.focus();
    editor.value = "helo";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    editor.value = "already fixed";
    fireEvent.input(editor);
    resolveAnalyze({
      ok: true,
      analysis: {
        suggestions: [
          {
            source: "english:common-typo",
            original: "helo",
            span: { start_utf16: 0, end_utf16: 4 },
            replacements: ["hello"],
          },
        ],
      },
    });
    await Promise.resolve();

    expect(editor).toHaveValue("already fixed");
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("shows runtime status when applying a suggestion that no longer matches", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-apply-stale-status-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-marks]")).not.toBeNull();

    editor.value = "already fixed";
    fireEvent.click(screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1));

    expect(editor).toHaveValue("already fixed");
    expect(screen.getByRole("status")).toHaveTextContent(
      "Suggestion no longer matches current text.",
    );
    expect(document.querySelector("[data-alfaraheedi-panel]")).not.toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("clears rendered runtime suggestions immediately when editor text changes", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-edit-clears-suggestions-test");

    editor.focus();
    editor.value = "helo";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).not.toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).not.toBeNull();

    editor.value = "hello";
    fireEvent.input(editor);

    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("stays quiet when extension checking is paused", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: false,
          skipped: true,
          error: "Alfaraheedi checking is paused.",
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?paused-runtime-test");

    editor.focus();
    editor.value = "helo";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: "ALFARAHEEDI_ANALYZE_TEXT",
      text: "helo",
    });
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("keeps runtime suggestions available when keyboard focus moves from editor to panel", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-keyboard-panel-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const applyButton = screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1);
    expect(applyButton).toBeTruthy();
    fireEvent.focusOut(editor, { relatedTarget: applyButton });
    applyButton.focus();

    expect(applyButton.closest("[data-alfaraheedi-panel]")).not.toBeNull();

    fireEvent.click(applyButton);

    expect(editor).toHaveValue("hello wat you are do?");
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("renders runtime underline marks without changing textarea text", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-marks-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const marks = document.querySelector("[data-alfaraheedi-marks]");
    expect(marks?.querySelector("mark")).toHaveTextContent("helo");
    expect(editor).toHaveValue("helo wat you are do?");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("keeps runtime textarea underline marks aligned after editor scroll", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 6, end_utf16: 9 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-scroll-sync-test");

    editor.focus();
    editor.value = "helo\n\nwat you are do?";
    editor.scrollTop = 12;
    editor.scrollLeft = 2;
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const marks = document.querySelector("[data-alfaraheedi-marks]");
    expect(marks.scrollTop).toBe(12);
    expect(marks.scrollLeft).toBe(2);

    editor.scrollTop = 36;
    editor.scrollLeft = 5;
    fireEvent.scroll(editor);

    expect(marks.scrollTop).toBe(36);
    expect(marks.scrollLeft).toBe(5);

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("repositions runtime panel and plain marks after layout scroll", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="scroller"><textarea id="draft"></textarea></div>`;
    const scroller = document.querySelector("#scroller");
    const editor = document.querySelector("#draft");
    let rect = {
      left: 18,
      top: 40,
      bottom: 100,
      width: 300,
      height: 60,
    };
    editor.getBoundingClientRect = vi.fn(() => rect);
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-layout-sync-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const marks = document.querySelector("[data-alfaraheedi-marks]");
    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(marks.style.top).toBe("40px");
    expect(panel.style.top).toBe("106px");

    rect = {
      left: 33,
      top: 74,
      bottom: 134,
      width: 300,
      height: 60,
    };
    fireEvent.scroll(scroller);

    expect(marks.style.insetInlineStart).toBe("33px");
    expect(marks.style.top).toBe("74px");
    expect(panel.style.insetInlineStart).toBe("33px");
    expect(panel.style.top).toBe("140px");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("repositions runtime contenteditable panel after layout scroll", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="scroller"><div id="draft" contenteditable="true"></div></div>`;
    const scroller = document.querySelector("#scroller");
    const editor = document.querySelector("#draft");
    let rect = {
      left: 22,
      top: 36,
      bottom: 92,
      width: 340,
      height: 56,
    };
    editor.getBoundingClientRect = vi.fn(() => rect);
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-contenteditable-layout-sync-test");

    editor.focus();
    editor.textContent = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel.style.insetInlineStart).toBe("22px");
    expect(panel.style.top).toBe("98px");

    rect = {
      left: 41,
      top: 82,
      bottom: 138,
      width: 340,
      height: 56,
    };
    fireEvent.scroll(scroller);

    expect(panel.style.insetInlineStart).toBe("41px");
    expect(panel.style.top).toBe("144px");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("keeps runtime suggestion panels inside the right viewport edge", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 390,
    });
    const editor = document.querySelector("#draft");
    editor.getBoundingClientRect = vi.fn(() => ({
      left: 360,
      top: 30,
      bottom: 90,
      width: 80,
      height: 60,
    }));
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-panel-clamp-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel.style.insetInlineStart).toBe("22px");
    expect(panel.style.maxWidth).toBe("360px");

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: previousInnerWidth,
    });
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("keeps runtime suggestion panels inside the bottom viewport edge", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const previousInnerHeight = window.innerHeight;
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 420,
    });
    const editor = document.querySelector("#draft");
    editor.getBoundingClientRect = vi.fn(() => ({
      left: 24,
      top: 320,
      bottom: 380,
      width: 320,
      height: 60,
    }));
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-panel-bottom-clamp-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    await withElementOffsetHeight(120, async () => {
      fireEvent.input(editor);
      await vi.advanceTimersByTimeAsync(700);
      await Promise.resolve();
    });

    const panel = document.querySelector("[data-alfaraheedi-panel]");
    expect(panel.style.top).toBe("292px");
    expect(panel.style.maxHeight).toBe("404px");
    expect(panel.style.overflowY).toBe("auto");

    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: previousInnerHeight,
    });
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("clears runtime underline marks immediately after applying a suggestion", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-clear-marks-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-marks] mark")).toHaveTextContent(
      "helo",
    );

    const applyButton = document.querySelector("[data-alfaraheedi-panel] button");
    expect(applyButton).not.toBeNull();
    fireEvent.click(applyButton);

    expect(editor).toHaveValue("hello wat you are do?");
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("clears runtime underline marks when the editor loses focus", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="draft"></textarea>
      <button id="outside" type="button">Outside</button>
    `;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-focusout-clear-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).not.toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks] mark")).toHaveTextContent(
      "helo",
    );

    fireEvent.focusOut(editor);

    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("cancels pending runtime analysis when editor focus leaves before debounce", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <textarea id="draft"></textarea>
      <button id="outside" type="button">Outside</button>
    `;
    const editor = document.querySelector("#draft");
    const outside = document.querySelector("#outside");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-focusout-cancel-test");

    editor.focus();
    editor.value = "helo wat you are do?";
    fireEvent.input(editor);
    fireEvent.focusOut(editor, { relatedTarget: outside });
    outside.focus();
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("clears runtime suggestion UI when the editor is removed from the page", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<div id="root"><textarea id="draft"></textarea></div>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-remove-editor-clear-test");

    editor.focus();
    editor.value = "helo";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).not.toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).not.toBeNull();

    editor.remove();
    await Promise.resolve();

    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("waits until composition ends before analyzing active editor text", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: { suggestions: [] },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-composition-test");

    editor.focus();
    fireEvent.compositionStart(editor);
    editor.value = "كيف حال";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).not.toHaveBeenCalled();

    fireEvent.compositionEnd(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "كيف حال",
      }),
    );

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("dismisses runtime suggestions with Escape from the suggestion panel", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `<textarea id="draft"></textarea>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-escape-dismiss-test");

    editor.focus();
    editor.value = "helo";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const panel = [...document.querySelectorAll("[data-alfaraheedi-panel]")].at(-1);
    const applyButton = panel?.querySelector("button");
    expect(applyButton).toBeTruthy();
    applyButton.focus();
    fireEvent.keyDown(applyButton, { key: "Escape" });

    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
    expect(document.activeElement).toBe(editor);

    vi.clearAllTimers();
    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("renders runtime CSS Highlight marks without changing contenteditable text", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `<div id="draft" contenteditable="true"></div>`;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-marks-test");

    editor.focus();
    editor.textContent = "helo wat you are do?";
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("helo");
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
    expect(editor.textContent).toBe("helo wat you are do?");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("applies runtime contenteditable suggestions without flattening inline markup", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span> <strong>wat</strong> you are do?</div>
    `;
    const editor = document.querySelector("#draft");
    const strong = editor.querySelector("strong");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-apply-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    const applyButton = document.querySelector("[data-alfaraheedi-panel] button");
    fireEvent.click(applyButton);

    expect(editor.textContent).toBe("hello wat you are do?");
    expect(editor.querySelector("strong")).toBe(strong);
    expect(editor.querySelector("strong")).toHaveTextContent("wat");

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("analyzes runtime contenteditable br line breaks and maps highlights after them", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><br><span>wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 5, end_utf16: 8 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-br-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo\nwat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("analyzes runtime contenteditable fields without hidden decoration text", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `
      <style>.decor-display { display: none; } .decor-visibility { visibility: hidden; }</style>
      <div id="draft" contenteditable="true"><span aria-hidden="true">Placeholder</span><span class="decor-display">DISPLAY</span><span>helo</span><span hidden>HIDDEN</span><span class="decor-visibility">VISIBILITY</span><span> wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 5, end_utf16: 8 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-hidden-decoration-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo wat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("analyzes runtime production rich-editor sentinels as invisible text", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML =
      '<div id="draft" contenteditable="true" role="textbox" aria-label="Message Body"><span data-slate-string="true">helo</span><span data-slate-zero-width="z">\uFEFF<br></span><span id="tail"> wat you are do?</span><br class="ProseMirror-trailingBreak"></div>';
    const editor = document.querySelector("#draft");
    const tail = document.querySelector("#tail");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 5, end_utf16: 8 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import(
      "../../../browser-extension/src/content.js?content-script-rich-sentinel-test"
    );

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo wat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    const applyButton = screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1);
    expect(applyButton).toBeTruthy();
    fireEvent.click(applyButton);

    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe(" what you are do?");
    expect(discoverEditorSurface(editor)?.text).toBe("helo what you are do?");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("handles a Gmail-style compose body without quoted or chip text", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML =
      '<div id="gmail-compose" contenteditable="true" role="textbox" aria-label="Message Body"><div><span>helo </span><span id="chip" contenteditable="false">@Ali</span><span id="tail"> wat you are do?</span></div><div class="gmail_quote" contenteditable="false">On Monday, someone wrote private quoted text.</div></div>';
    const editor = document.querySelector("#gmail-compose");
    const chip = document.querySelector("#chip");
    const tail = document.querySelector("#tail");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 6, end_utf16: 9 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import(
      "../../../browser-extension/src/content.js?content-script-gmail-compose-test"
    );

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo  wat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    const applyButton = screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1);
    expect(applyButton).toBeTruthy();
    fireEvent.click(applyButton);

    expect(editor.querySelector("#chip")).toBe(chip);
    expect(editor.querySelector("#chip")).toHaveTextContent("@Ali");
    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe(" what you are do?");
    expect(discoverEditorSurface(editor)?.text).toBe("helo  what you are do?");
    expect(discoverEditorSurface(editor)?.text).not.toContain("private quoted text");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("handles a WhatsApp-style Lexical composer with paragraph line breaks", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML =
      '<div id="whatsapp-compose" contenteditable="true" role="textbox" aria-label="Type a message" data-tab="10"><p class="selectable-text copyable-text"><span data-lexical-text="true">helo</span><br></p><p class="selectable-text copyable-text"><span id="tail" data-lexical-text="true">wat you are do?</span></p></div>';
    const editor = document.querySelector("#whatsapp-compose");
    const tail = document.querySelector("#tail");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 5, end_utf16: 8 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import(
      "../../../browser-extension/src/content.js?content-script-whatsapp-lexical-test"
    );

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo\nwat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    const applyButton = screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1);
    expect(applyButton).toBeTruthy();
    fireEvent.click(applyButton);

    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe("what you are do?");
    expect(discoverEditorSurface(editor)?.text).toBe("helo\nwhat you are do?");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("analyzes runtime contenteditable block line breaks and maps highlights after them", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div>helo</div><div>wat you are do?</div></div>
    `;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 5, end_utf16: 8 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-block-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo\nwat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("analyzes runtime contenteditable blank block lines and maps highlights after them", async () => {
    vi.useFakeTimers();
    const cssHighlight = installCssHighlightMock();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><div>helo</div><div><br></div><div>wat you are do?</div></div>
    `;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 6, end_utf16: 9 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-blank-block-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo\n\nwat you are do?",
      }),
    );
    const highlight = cssHighlight.registry.get("alfaraheedi-suggestions");
    const ranges = [...highlight];
    expect(ranges).toHaveLength(1);
    expect(ranges[0].toString()).toBe("wat");

    vi.useRealTimers();
    delete globalThis.chrome;
    cssHighlight.restore();
  });

  it("analyzes plaintext-only contenteditable fields at runtime", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="draft" contenteditable="plaintext-only"><span>helo wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:common-typo",
                original: "helo",
                span: { start_utf16: 0, end_utf16: 4 },
                replacements: ["hello"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-plaintext-only-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo wat you are do?",
      }),
    );
    expect(document.querySelector("[data-alfaraheedi-panel]")).toHaveTextContent(
      "hello",
    );

    vi.useRealTimers();
    delete globalThis.chrome;
  });

  it("analyzes runtime contenteditable fields without non-editable island text", async () => {
    vi.useFakeTimers();
    document.body.innerHTML = `
      <div id="draft" contenteditable="true"><span>helo</span><span id="chip" contenteditable="false">LOCKED</span><span id="tail"> wat you are do?</span></div>
    `;
    const editor = document.querySelector("#draft");
    const chip = document.querySelector("#chip");
    const tail = document.querySelector("#tail");
    globalThis.chrome = {
      runtime: {
        sendMessage: vi.fn(async () => ({
          ok: true,
          analysis: {
            suggestions: [
              {
                source: "english:phrase",
                original: "wat",
                span: { start_utf16: 5, end_utf16: 8 },
                replacements: ["what"],
              },
            ],
          },
        })),
      },
    };

    await import("../../../browser-extension/src/content.js?content-script-rich-locked-island-test");

    editor.focus();
    fireEvent.input(editor);
    await vi.advanceTimersByTimeAsync(700);
    await Promise.resolve();

    expect(globalThis.chrome.runtime.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        text: "helo wat you are do?",
      }),
    );

    const applyButton = screen.getAllByRole("button", { name: /Apply suggestion:/u }).at(-1);
    expect(applyButton).toBeTruthy();
    fireEvent.click(applyButton);

    expect(editor.querySelector("#chip")).toBe(chip);
    expect(editor.querySelector("#chip")).toHaveTextContent("LOCKED");
    expect(editor.querySelector("#tail")).toBe(tail);
    expect(editor.querySelector("#tail").textContent).toBe(" what you are do?");
    expect(editor.textContent).toBe("heloLOCKED what you are do?");

    vi.useRealTimers();
    delete globalThis.chrome;
  });
});
