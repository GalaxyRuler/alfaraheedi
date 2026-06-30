import { afterEach, describe, expect, it } from "vitest";

import { discoverEditorSurface } from "../../../browser-extension/src/editorSurface.js";

const runtime = globalThis.NahouExtensionRuntime;

afterEach(() => {
  document.body.innerHTML = "";
});

describe("browser extension field discovery matrix", () => {
  it("classifies composed-path boundaries without leaked editors as unsupported", () => {
    document.body.innerHTML = `<div id="closed-host"></div>`;
    const host = document.querySelector("#closed-host");
    const shadow = host.attachShadow({ mode: "closed" });
    const closedEditor = document.createElement("textarea");
    closedEditor.value = "helo from a closed shadow root";
    shadow.append(closedEditor);

    let exposedPath = [];
    let classified = null;
    let editor = "not-run";
    document.body.addEventListener(
      "input",
      (event) => {
        exposedPath = event.composedPath();
        editor = runtime.editableElementForEvent(event);
        classified = runtime.classifyEditorSurface(event);
      },
      { once: true },
    );
    closedEditor.dispatchEvent(new Event("input", { bubbles: true, composed: true }));

    expect(exposedPath[0]).toBe(host);
    expect(exposedPath).not.toContain(closedEditor);
    expect(editor).toBeNull();
    expect(classified).toMatchObject({
      supported: false,
      reason: "closed-shadow-or-composed-path-boundary",
    });
  });

  it("classifies normal composed-path non-editor events as no editable target", () => {
    document.body.innerHTML = `<button id="send" type="button">Send</button>`;
    const button = document.querySelector("#send");
    let exposedPath = [];
    let classified = null;
    let editor = "not-run";
    button.addEventListener(
      "click",
      (event) => {
        exposedPath = event.composedPath();
        editor = runtime.editableElementForEvent(event);
        classified = runtime.classifyEditorSurface(event);
      },
      { once: true },
    );
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, composed: true }));

    expect(exposedPath[0]).toBe(button);
    expect(editor).toBeNull();
    expect(classified).toMatchObject({
      supported: false,
      reason: "no-editable-target",
    });
  });

  it("does not treat Cc recipient labels as sensitive payment labels for normal message fields", () => {
    document.body.innerHTML = `
      <form aria-label="Message composer with Cc recipients">
        <textarea id="message">helo recipient</textarea>
      </form>
    `;
    const editor = document.querySelector("#message");

    expect(runtime.classifyEditorSurface(editor)).toMatchObject({
      supported: true,
      kind: "textarea",
      text: "helo recipient",
    });
    expect(discoverEditorSurface(editor)).toEqual({
      element: editor,
      kind: "textarea",
      text: "helo recipient",
    });
  });

  it("rejects payment and billing ancestor labels without card abbreviations", () => {
    document.body.innerHTML = `
      <form aria-label="Payment details">
        <textarea id="payment-details">helo payment</textarea>
      </form>
      <fieldset aria-label="Billing info">
        <textarea id="billing-info">helo billing</textarea>
      </fieldset>
    `;

    for (const id of ["payment-details", "billing-info"]) {
      expect(runtime.classifyEditorSurface(document.querySelector(`#${id}`))).toMatchObject({
        supported: false,
        reason: "sensitive-ancestor",
      });
    }
  });

  it("rejects credit-card autocomplete text fields including cardholder metadata", () => {
    document.body.innerHTML = `
      <input id="cc-name" type="text" autocomplete="cc-name" value="Ali">
      <input id="cc-given-name" type="text" autocomplete="cc-given-name" value="Ali">
      <input id="cc-family-name" type="text" autocomplete="cc-family-name" value="K">
      <input id="cc-type" type="text" autocomplete="cc-type" value="visa">
    `;

    for (const id of ["cc-name", "cc-given-name", "cc-family-name", "cc-type"]) {
      expect(runtime.classifyEditorSurface(document.querySelector(`#${id}`))).toMatchObject({
        supported: false,
        reason: "sensitive-field",
      });
    }
  });

  it("supports the V2 text control and contenteditable discovery matrix", () => {
    document.body.innerHTML = `
      <textarea id="textarea">helo</textarea>
      <input id="text" type="text" value="helo">
      <input id="search" type="search" value="helo">
      <input id="email" type="email" value="helo@example.com">
      <input id="url" type="url" value="https://example.test/helo">
      <input id="tel" type="tel" value="555-0100">
      <div id="rich" contenteditable="true">helo rich</div>
      <div id="empty" contenteditable>helo empty</div>
      <div id="plain" contenteditable="plaintext-only">helo plain</div>
    `;

    expect(runtime.classifyEditorSurface(document.querySelector("#textarea"))).toMatchObject({
      supported: true,
      kind: "textarea",
    });
    for (const id of ["text", "search", "email", "url", "tel"]) {
      expect(runtime.classifyEditorSurface(document.querySelector(`#${id}`))).toMatchObject({
        supported: true,
        kind: "input",
      });
    }
    for (const id of ["rich", "empty", "plain"]) {
      expect(runtime.classifyEditorSurface(document.querySelector(`#${id}`))).toMatchObject({
        supported: true,
        kind: "contenteditable",
      });
    }
  });

  it("rejects unavailable, sensitive, oversized, and complex unsupported editors", () => {
    const oversizedText = "x".repeat(6001);
    document.body.innerHTML = `
      <input id="password" type="password" value="secret">
      <input id="hidden" type="hidden" value="secret">
      <textarea id="readonly" readonly>helo</textarea>
      <textarea id="disabled" disabled>helo</textarea>
      <textarea id="aria-readonly" aria-readonly="true">helo</textarea>
      <textarea id="aria-disabled" aria-disabled="true">helo</textarea>
      <input id="otp" type="text" autocomplete="one-time-code" value="123456">
      <fieldset aria-label="Credit card">
        <textarea id="payment-notes">helo</textarea>
      </fieldset>
      <textarea id="oversized">${oversizedText}</textarea>
      <div id="complex" contenteditable="true">
        <div id="inner-complex" contenteditable="true">nested editable island</div>
      </div>
    `;

    expect(runtime.classifyEditorSurface(document.querySelector("#password"))).toMatchObject({
      supported: false,
      reason: "unsupported-input-type",
    });
    expect(runtime.classifyEditorSurface(document.querySelector("#hidden"))).toMatchObject({
      supported: false,
      reason: "unsupported-input-type",
    });
    for (const id of ["readonly", "disabled", "aria-readonly", "aria-disabled"]) {
      expect(runtime.classifyEditorSurface(document.querySelector(`#${id}`))).toMatchObject({
        supported: false,
      });
    }
    expect(runtime.classifyEditorSurface(document.querySelector("#otp"))).toMatchObject({
      supported: false,
      reason: "sensitive-field",
    });
    expect(runtime.classifyEditorSurface(document.querySelector("#payment-notes"))).toMatchObject({
      supported: false,
      reason: "sensitive-ancestor",
    });
    expect(runtime.classifyEditorSurface(document.querySelector("#oversized"))).toMatchObject({
      supported: false,
      reason: "oversized-text",
    });
    expect(runtime.classifyEditorSurface(document.querySelector("#complex"))).toMatchObject({
      supported: false,
      reason: "unsupported-rich-editor-island",
    });
    expect(runtime.classifyEditorSurface(document.querySelector("#inner-complex"))).toMatchObject({
      supported: false,
      reason: "unsupported-rich-editor-island",
    });
  });
});
