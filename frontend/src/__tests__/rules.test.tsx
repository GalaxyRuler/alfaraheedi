import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { installFetch, jsonRoute, okHealth, SAMPLE_RULES } from "../test/mockApi";

describe("rules panel", () => {
  it("renders the rule catalog from /v1/rules", async () => {
    installFetch({
      "GET /v1/health": okHealth,
      "GET /v1/rules": jsonRoute({ rules: SAMPLE_RULES }),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /القواعد/ }));

    await waitFor(() => {
      expect(screen.getByTestId("rule-list")).toBeInTheDocument();
    });
    expect(screen.getByText("arabic:tatweel")).toBeInTheDocument();
    expect(screen.getByText("arabic:latin-comma")).toBeInTheDocument();
    // Safe vs suggest distinction is shown per rule (exact text avoids matching
    // "الآمنة" inside the intro paragraph).
    expect(screen.getByText("آمن")).toBeInTheDocument();
    expect(screen.getByText("اقتراح")).toBeInTheDocument();
  });
});
