import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import {
  installFetch,
  jsonRoute,
  okHealth,
  SAMPLE_LLM,
  SAMPLE_LLM_SUGGESTION,
} from "../test/mockApi";

describe("local LLM status panel", () => {
  it("renders the suggestion-only / no-bundled-weights policy", async () => {
    installFetch({
      "GET /v1/health": okHealth,
      "GET /v1/llm/status": jsonRoute(SAMPLE_LLM),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /النموذج المحلي/ }));

    await waitFor(() => {
      expect(screen.getByTestId("llm-panel")).toBeInTheDocument();
    });
    // The policy token and default model come straight from the engine catalog.
    expect(screen.getAllByText("suggestion_only").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("qwen3-1.7b-q4_k_m").length).toBeGreaterThanOrEqual(1);
    // The human-readable policy is Arabic.
    expect(screen.getByText(/اقتراحية فقط ولا تُطبَّق تلقائيًا/)).toBeInTheDocument();
    // Not configured and no bundled weights are both surfaced as "لا".
    expect(screen.getAllByText("لا", { exact: true }).length).toBeGreaterThanOrEqual(2);
  });

  it("requests and manually applies a local LLM rewrite", async () => {
    installFetch({
      "GET /v1/health": okHealth,
      "POST /v1/llm/suggest": jsonRoute(SAMPLE_LLM_SUGGESTION),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /مثال/ }));
    await user.click(screen.getByRole("button", { name: /اقتراح النموذج/ }));

    await waitFor(() => {
      expect(screen.getByTestId("llm-suggestion")).toBeInTheDocument();
    });

    expect(screen.getByText("llm:local · qwen3-1.7b-q4_k_m")).toBeInTheDocument();
    expect(screen.getByText(SAMPLE_LLM_SUGGESTION.replacement)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /تطبيق يدوي/ }));

    expect(screen.getByText(/طُبّق اقتراح النموذج المحلي يدويًا/)).toBeInTheDocument();
  });
});
