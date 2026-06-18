import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { installFetch, rejectRoute } from "../test/mockApi";

describe("API unavailable state", () => {
  it("shows an offline banner and an actionable analyze error", async () => {
    installFetch({
      "GET /v1/health": rejectRoute(),
      "POST /v1/analyze": rejectRoute(),
    });
    const user = userEvent.setup();
    render(<App />);

    // Health poll fails -> offline banner with the configured base URL.
    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent(/تعذّر الوصول|127\.0\.0\.1/);
    });
    expect(screen.getByTestId("health")).toHaveTextContent(/غير متصل/);

    await user.click(screen.getByRole("button", { name: /مثال/ }));
    await user.click(screen.getByRole("button", { name: /تحليل/ }));

    await waitFor(() => {
      expect(screen.getByText(/تعذّر التحليل/)).toBeInTheDocument();
    });
  });
});
