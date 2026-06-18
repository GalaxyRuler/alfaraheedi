import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { installFetch, jsonRoute, okHealth, SAMPLE_ANALYSIS } from "../test/mockApi";

describe("analyze flow", () => {
  it("renders grouped suggestions returned by /v1/analyze", async () => {
    installFetch({
      "GET /v1/health": okHealth,
      "POST /v1/analyze": jsonRoute(SAMPLE_ANALYSIS),
    });
    const user = userEvent.setup();
    render(<App />);

    // Seed text without typing into CodeMirror, then analyze.
    await user.click(screen.getByRole("button", { name: /مثال/ }));
    await user.click(screen.getByRole("button", { name: /تحليل/ }));

    await waitFor(() => {
      expect(screen.getByTestId("suggestion-count")).toBeInTheDocument();
    });

    const cards = screen.getAllByTestId("suggestion");
    expect(cards).toHaveLength(2);
    expect(screen.getByText("arabic:tatweel")).toBeInTheDocument();
    expect(screen.getByText("arabic:latin-comma")).toBeInTheDocument();
    // Safe vs suggest-only are visually distinguished by badge.
    expect(screen.getByText("إصلاح آمن")).toBeInTheDocument();
    expect(screen.getByText("اقتراح فقط")).toBeInTheDocument();
  });
});
