import { describe, expect, it } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import App from "../App";
import { installFetch, jsonRoute, okHealth, SAMPLE_ANALYSIS } from "../test/mockApi";

describe("feedback report UI", () => {
  it("opens a local report without calling the API again and keeps raw text opt-in", async () => {
    const fetchMock = installFetch({
      "GET /v1/health": okHealth,
      "POST /v1/analyze": jsonRoute(SAMPLE_ANALYSIS),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /مثال/ }));
    await user.click(screen.getByRole("button", { name: /تحليل/ }));

    await waitFor(() => {
      expect(screen.getByTestId("suggestion-count")).toBeInTheDocument();
    });
    const callsAfterAnalyze = fetchMock.mock.calls.length;

    await user.click(screen.getByRole("button", { name: /تقرير التحليل/ }));

    expect(
      screen.getByRole("dialog", { name: "تقرير ملاحظات" }),
    ).toBeInTheDocument();

    const output = screen.getByLabelText("نص التقرير");
    expect(output).toHaveValue();
    expect((output as HTMLTextAreaElement).value).toContain(
      "Raw text was not included.",
    );
    expect((output as HTMLTextAreaElement).value).not.toContain("مرحبــا  بالعالم");
    expect(
      screen.getByRole("link", { name: "فتح مسألة GitHub" }),
    ).toHaveAttribute("href", expect.stringContaining("github.com/GalaxyRuler/alfaraheedi"));
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterAnalyze);

    await user.click(screen.getByRole("radio", { name: "النص الكامل" }));

    expect((output as HTMLTextAreaElement).value).toContain("مرحبــا  بالعالم");
    expect(fetchMock).toHaveBeenCalledTimes(callsAfterAnalyze);
  });

  it("opens a suggestion-scoped report with the reported span available", async () => {
    installFetch({
      "GET /v1/health": okHealth,
      "POST /v1/analyze": jsonRoute(SAMPLE_ANALYSIS),
    });
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole("button", { name: /مثال/ }));
    await user.click(screen.getByRole("button", { name: /تحليل/ }));
    await waitFor(() => expect(screen.getAllByTestId("suggestion")).toHaveLength(2));

    await user.click(screen.getAllByRole("button", { name: /تقرير الاقتراح/ })[0]);
    const output = screen.getByLabelText("نص التقرير");

    expect(output).toHaveValue();
    expect((output as HTMLTextAreaElement).value).toContain("arabic:tatweel");

    await user.click(screen.getByRole("radio", { name: "المقطع المحدد فقط" }));

    expect((output as HTMLTextAreaElement).value).toContain(
      "Raw text mode: `selected`",
    );
    expect((output as HTMLTextAreaElement).value).toContain("start_utf16");
  });
});
