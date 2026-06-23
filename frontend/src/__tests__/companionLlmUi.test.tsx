import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { DEFAULT_COMPANION_SETTINGS } from "../api/companion";
import { SAMPLE_LLM, SAMPLE_LLM_SUGGESTION } from "../test/mockApi";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

describe("companion local LLM setup", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    Object.defineProperty(window, "__TAURI_INTERNALS__", {
      configurable: true,
      value: {},
    });
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "get_companion_settings") {
        return Promise.resolve({
          ...DEFAULT_COMPANION_SETTINGS,
          ui_language: "en",
        });
      }
      if (command === "save_companion_settings") {
        return Promise.resolve((args as { settings: unknown }).settings);
      }
      if (command === "capture_selected_text") {
        return Promise.resolve({
          captured_text: "helo wat you are do?",
          current_text: "helo wat you are do?",
          source_app: "Notepad",
          capture_method: "windows_uia_text_pattern",
          writing_mode: "english",
          analysis: {
            text_len_bytes: 20,
            text_len_utf16: 20,
            text_len_graphemes: 20,
            suggestions: [],
          },
          safe_count: 0,
          restore_warning: null,
        });
      }
      if (command === "suggest_with_local_llm_for_session") {
        return Promise.resolve({
          ...SAMPLE_LLM_SUGGESTION,
          replacement: "hello what are you doing?",
          explanation: "Rewrites the selected text as a clear English question.",
        });
      }
      if (command === "get_companion_llm_status") {
        return Promise.resolve(SAMPLE_LLM);
      }
      if (command === "run_companion_llm_doctor") {
        return Promise.resolve({
          ok: true,
          available: false,
          summary:
            "local LLM runtime is not configured; doctor skipped live runtime checks",
          runtime: null,
          catalog: SAMPLE_LLM.catalog,
          checks: [
            {
              name: "policy",
              outcome: "pass",
              message: "suggestion-only local-first policy is intact",
            },
            {
              name: "runtime_config",
              outcome: "skip",
              message:
                "optional local LLM runtime is not configured; set ALFARAHEEDI_LLM_BASE_URL to run live checks",
            },
          ],
        });
      }
      return Promise.resolve(null);
    });
  });

  it("persists local LLM runtime settings from the companion surface", async () => {
    const user = userEvent.setup();
    render(<App />);

    const runtimeUrl = await screen.findByLabelText("Local runtime URL");
    expect(runtimeUrl).toHaveValue("");
    expect(screen.getByLabelText("Model id")).toHaveValue("qwen3-1.7b-q4_k_m");
    expect(screen.getByLabelText("Timeout milliseconds")).toHaveValue(30_000);

    await user.type(runtimeUrl, "http://127.0.0.1:8000");

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "save_companion_settings",
        expect.objectContaining({
          settings: expect.objectContaining({
            llm_base_url: "http://127.0.0.1:8000",
          }),
        }),
      );
    });
  });

  it("checks local LLM runtime status from the companion surface", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Check runtime/ }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("get_companion_llm_status");
    });
    expect(screen.getByText(/local LLM runtime is not configured/)).toBeInTheDocument();
  });

  it("runs the local LLM doctor from the companion surface", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Run doctor/ }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("run_companion_llm_doctor");
    });
    expect(
      screen.getByText(/doctor skipped live runtime checks/),
    ).toBeInTheDocument();
    expect(screen.getByText("runtime_config")).toBeInTheDocument();
    expect(screen.getByText(/ALFARAHEEDI_LLM_BASE_URL/)).toBeInTheDocument();
  });

  it("requests a selected-text local LLM suggestion and applies it manually", async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Check selected text/ }));
    await screen.findByText(/Review selection/);
    expect(screen.getByText(/Windows UI Automation capture/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /LLM suggestion/ }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith(
        "suggest_with_local_llm_for_session",
      );
    });
    expect(await screen.findByTestId("companion-llm-suggestion")).toHaveTextContent(
      "hello what are you doing?",
    );

    await user.click(screen.getByRole("button", { name: /Apply manually/ }));

    expect(screen.getByLabelText("Corrected text preview")).toHaveValue(
      "hello what are you doing?",
    );
  });

  it("cancels an in-flight selected-text local LLM suggestion", async () => {
    const user = userEvent.setup();
    let resolveSuggestion: (value: unknown) => void = () => undefined;
    invokeMock.mockImplementation((command: string, args?: unknown) => {
      if (command === "get_companion_settings") {
        return Promise.resolve({
          ...DEFAULT_COMPANION_SETTINGS,
          ui_language: "en",
        });
      }
      if (command === "save_companion_settings") {
        return Promise.resolve((args as { settings: unknown }).settings);
      }
      if (command === "capture_selected_text") {
        return Promise.resolve({
          captured_text: "helo wat you are do?",
          current_text: "helo wat you are do?",
          source_app: "Notepad",
          capture_method: "clipboard_shortcut",
          writing_mode: "english",
          analysis: {
            text_len_bytes: 20,
            text_len_utf16: 20,
            text_len_graphemes: 20,
            suggestions: [],
          },
          safe_count: 0,
          restore_warning: null,
        });
      }
      if (command === "suggest_with_local_llm_for_session") {
        return new Promise((resolve) => {
          resolveSuggestion = resolve;
        });
      }
      if (command === "cancel_companion_llm_suggestion") {
        return Promise.resolve(true);
      }
      return Promise.resolve(null);
    });

    render(<App />);

    await user.click(await screen.findByRole("button", { name: /Check selected text/ }));
    await screen.findByText(/Review selection/);
    expect(screen.getByText(/Clipboard capture/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /LLM suggestion/ }));

    expect(await screen.findByRole("button", { name: /Cancel LLM suggestion/ }))
      .toBeVisible();
    await user.click(screen.getByRole("button", { name: /Cancel LLM suggestion/ }));

    await waitFor(() => {
      expect(invokeMock).toHaveBeenCalledWith("cancel_companion_llm_suggestion");
    });
    expect(screen.getByText(/Cancelled the local LLM suggestion/)).toBeInTheDocument();

    resolveSuggestion({
      ...SAMPLE_LLM_SUGGESTION,
      replacement: "late stale suggestion",
    });

    await waitFor(() => {
      expect(screen.queryByText("late stale suggestion")).not.toBeInTheDocument();
    });
  });
});
