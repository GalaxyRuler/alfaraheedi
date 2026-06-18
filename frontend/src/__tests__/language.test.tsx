import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { installFetch, okHealth } from "../test/mockApi";

describe("UI language switch", () => {
  it("switches all chrome to English when chosen, independent of editor text", async () => {
    installFetch({ "GET /v1/health": okHealth });
    const user = userEvent.setup();
    render(<App />);

    // Default UI is Arabic.
    expect(screen.getByRole("button", { name: /تحليل/ })).toBeInTheDocument();

    // Open Settings and choose English.
    await user.click(screen.getByRole("button", { name: "الإعدادات" }));
    await user.click(screen.getByRole("radio", { name: "English" }));

    // Chrome is now English.
    expect(screen.getByRole("button", { name: /Analyze/ })).toBeInTheDocument();
    expect(screen.getByText("Suggestions")).toBeInTheDocument();
    expect(screen.getByText("API base URL")).toBeInTheDocument();
    // The Arabic label is gone.
    expect(screen.queryByRole("button", { name: /تحليل/ })).not.toBeInTheDocument();
  });
});
