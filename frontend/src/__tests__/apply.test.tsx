import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import {
  installFetch,
  jsonRoute,
  okHealth,
  SAMPLE_ANALYSIS,
  SAMPLE_APPLY,
} from "../test/mockApi";

describe("safe apply flow", () => {
  it("updates the editor text and remaining suggestions via /v1/apply", async () => {
    installFetch({
      "GET /v1/health": okHealth,
      "POST /v1/analyze": jsonRoute(SAMPLE_ANALYSIS),
      "POST /v1/apply": jsonRoute(SAMPLE_APPLY),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /مثال/ }));
    await user.click(screen.getByRole("button", { name: /تحليل/ }));
    await waitFor(() => expect(screen.getAllByTestId("suggestion")).toHaveLength(2));

    await user.click(screen.getByRole("button", { name: /إصلاحات آمنة/ }));

    await waitFor(() => {
      expect(screen.getByTestId("notice")).toHaveTextContent(/طُبّقت\s+1/);
    });

    // Editor reflects the corrected text returned by the server.
    expect(screen.getByTestId("editor")).toHaveTextContent(SAMPLE_APPLY.text);
    // Only the suggest-only item remains.
    expect(screen.getAllByTestId("suggestion")).toHaveLength(1);
    expect(screen.getByText("arabic:latin-comma")).toBeInTheDocument();
  });
});
