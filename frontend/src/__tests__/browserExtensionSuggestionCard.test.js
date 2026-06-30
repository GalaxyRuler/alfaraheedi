import { fireEvent, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../browser-extension/src/editorSurface.js";

const runtime = globalThis.NahouExtensionRuntime;

const suggestion = {
  id: "s1",
  source: "english:common-typo",
  original: "helo",
  span: { start_utf16: 0, end_utf16: 4 },
  replacements: ["hello"],
  explanation: "Fixes a common typo.",
};

function analysis() {
  return { suggestions: [suggestion] };
}

function setRect(element, rect) {
  element.getBoundingClientRect = vi.fn(() => ({
    bottom: rect.top + rect.height,
    height: rect.height,
    left: rect.left,
    right: rect.left + rect.width,
    top: rect.top,
    width: rect.width,
    x: rect.left,
    y: rect.top,
    toJSON: () => ({}),
  }));
}

afterEach(() => {
  runtime.clearInjectedSuggestionUi?.();
  document.body.innerHTML = "";
});

describe("browser extension suggestion card", () => {
  it("applies a suggestion, clears UI, and returns focus to the editor", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    setRect(editor, { left: 10, top: 20, width: 240, height: 80 });
    editor.focus();

    runtime.renderSuggestionMarks(editor, analysis());
    runtime.renderFieldBadge(editor, analysis(), { statusLabel: "Local" });
    runtime.renderSuggestionPanel(editor, analysis());

    fireEvent.click(screen.getByRole("button", { name: "Apply suggestion: hello" }));

    expect(editor).toHaveValue("hello");
    expect(document.activeElement).toBe(editor);
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-badge]")).toBeNull();
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
  });

  it("dismisses the card without changing text and returns focus", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    setRect(editor, { left: 10, top: 20, width: 240, height: 80 });
    editor.focus();

    runtime.renderSuggestionPanel(editor, analysis());
    fireEvent.click(screen.getByRole("button", { name: "Dismiss suggestion" }));

    expect(editor).toHaveValue("helo");
    expect(document.activeElement).toBe(editor);
    expect(document.querySelector("[data-alfaraheedi-panel]")).toBeNull();
  });

  it("clamps the card inside the viewport near bottom and inline-end edges", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    setRect(editor, { left: 780, top: 580, width: 80, height: 40 });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 800,
    });
    Object.defineProperty(window, "innerHeight", {
      configurable: true,
      value: 600,
    });
    const previous = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      get: () => 140,
    });

    runtime.renderSuggestionPanel(editor, analysis());

    const panel = screen.getByRole("dialog", { name: "Nahou suggestions" });
    expect(Number.parseFloat(panel.style.insetInlineStart)).toBeLessThanOrEqual(432);
    expect(Number.parseFloat(panel.style.top)).toBeLessThanOrEqual(452);

    if (previous) {
      Object.defineProperty(HTMLElement.prototype, "offsetHeight", previous);
    } else {
      delete HTMLElement.prototype.offsetHeight;
    }
  });

  it("keeps unsupported contenteditable cards review-only after CSS Highlight fallback", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true"><span>helo</span></div>`;
    const editor = document.querySelector("#draft");
    const originalHtml = editor.innerHTML;
    setRect(editor, { left: 10, top: 20, width: 240, height: 80 });

    expect(runtime.renderSuggestionMarks(editor, analysis())).toBeNull();
    runtime.renderSuggestionPanel(editor, analysis());

    expect(screen.getByRole("dialog", { name: "Nahou suggestions" })).toHaveTextContent(
      "hello",
    );
    expect(screen.queryByRole("button", { name: "Apply suggestion: hello" })).toBeNull();
    expect(editor.innerHTML).toBe(originalHtml);
  });
});
