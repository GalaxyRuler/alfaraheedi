import { fireEvent, screen } from "@testing-library/dom";
import { afterEach, describe, expect, it, vi } from "vitest";

import "../../../browser-extension/src/editorSurface.js";

const runtime = globalThis.NahouExtensionRuntime;

function analysisWithSuggestions(count = 1) {
  return {
    suggestions: Array.from({ length: count }, (_, index) => ({
      id: `s${index + 1}`,
      source: "english:common-typo",
      original: "helo",
      span: { start_utf16: 0, end_utf16: 4 },
      replacements: ["hello"],
    })),
  };
}

function setEditorRect(editor, rect) {
  editor.getBoundingClientRect = vi.fn(() => ({
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

describe("browser extension overlay badge and underlines", () => {
  it("shows a lower inline-end badge for an active editor with issue count and status", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    setEditorRect(editor, { left: 20, top: 30, width: 240, height: 80 });

    runtime.renderFieldBadge(editor, analysisWithSuggestions(2), {
      statusLabel: "Local",
    });

    const badge = screen.getByRole("button", {
      name: "Nahou suggestions: 2 issues, Local",
    });
    expect(badge).toHaveAttribute("data-alfaraheedi-badge", "true");
    expect(badge).toHaveTextContent("2");
    expect(badge).toHaveTextContent("Local");
    expect(Number.parseFloat(badge.style.left)).toBeGreaterThan(20);
    expect(Number.parseFloat(badge.style.top)).toBeGreaterThan(30);
  });

  it("updates and clears the badge without mutating textarea text", () => {
    document.body.innerHTML = `<textarea id="draft">helo</textarea>`;
    const editor = document.querySelector("#draft");
    setEditorRect(editor, { left: 20, top: 30, width: 240, height: 80 });

    runtime.renderFieldBadge(editor, analysisWithSuggestions(1), {
      statusLabel: "Local",
    });
    runtime.renderFieldBadge(editor, analysisWithSuggestions(3), {
      statusLabel: "API unavailable",
    });

    expect(screen.getByRole("button")).toHaveAccessibleName(
      "Nahou suggestions: 3 issues, API unavailable",
    );
    expect(editor).toHaveValue("helo");

    runtime.clearFieldBadge(editor);

    expect(document.querySelector("[data-alfaraheedi-badge]")).toBeNull();
    expect(editor).toHaveValue("helo");
  });

  it("positions the badge on the lower inline-end for RTL fields", () => {
    document.body.innerHTML = `<textarea id="draft" dir="rtl">مرحبا helo</textarea>`;
    const editor = document.querySelector("#draft");
    setEditorRect(editor, { left: 100, top: 40, width: 260, height: 90 });

    runtime.renderFieldBadge(editor, analysisWithSuggestions(1), {
      statusLabel: "Local",
    });

    const badge = screen.getByRole("button", {
      name: "Nahou suggestions: 1 issue, Local",
    });
    expect(badge).toHaveAttribute("dir", "rtl");
    expect(Number.parseFloat(badge.style.left)).toBeLessThan(160);
    expect(Number.parseFloat(badge.style.top)).toBeGreaterThan(40);
  });

  it("opens the suggestion card from badge and underline clicks", () => {
    document.body.innerHTML = `<textarea id="draft">helo wat</textarea>`;
    const editor = document.querySelector("#draft");
    setEditorRect(editor, { left: 20, top: 30, width: 240, height: 80 });
    const analysis = analysisWithSuggestions(1);

    runtime.renderSuggestionMarks(editor, analysis);
    runtime.renderFieldBadge(editor, analysis, { statusLabel: "Local" });
    fireEvent.click(screen.getByRole("button", { name: /1 issue, Local/u }));

    expect(screen.getByRole("dialog", { name: "Nahou suggestions" })).toHaveTextContent(
      "hello",
    );

    runtime.clearSuggestionPanel(editor);
    fireEvent.click(document.querySelector("[data-alfaraheedi-suggestion-index='0']"));

    expect(screen.getByRole("dialog", { name: "Nahou suggestions" })).toHaveTextContent(
      "hello",
    );
  });

  it("opens the clicked underline suggestion even when it is beyond the first five issues", () => {
    document.body.innerHTML = `<textarea id="draft">one two three four five six</textarea>`;
    const editor = document.querySelector("#draft");
    setEditorRect(editor, { left: 20, top: 30, width: 320, height: 80 });
    const terms = ["one", "two", "three", "four", "five", "six"];
    const analysis = {
      suggestions: terms.map((term, index) => {
        const start = editor.value.indexOf(term);
        return {
          id: `s${index + 1}`,
          source: `english:${term}`,
          original: term,
          span: { start_utf16: start, end_utf16: start + term.length },
          replacements: [term.toUpperCase()],
        };
      }),
    };

    runtime.renderSuggestionMarks(editor, analysis);
    fireEvent.click(document.querySelector("[data-alfaraheedi-suggestion-index='5']"));

    const card = screen.getByRole("dialog", { name: "Nahou suggestions" });
    expect(card).toHaveTextContent("english:six");
    expect(card).toHaveTextContent("SIX");
  });

  it("uses CSS highlights for contenteditable and does not mutate DOM when highlights are unavailable", () => {
    document.body.innerHTML = `<div id="draft" contenteditable="true"><span>helo</span></div>`;
    const editor = document.querySelector("#draft");
    const originalHtml = editor.innerHTML;

    const marks = runtime.renderSuggestionMarks(editor, analysisWithSuggestions(1));

    expect(marks).toBeNull();
    expect(editor.innerHTML).toBe(originalHtml);
    expect(document.querySelector("[data-alfaraheedi-marks]")).toBeNull();
  });
});
