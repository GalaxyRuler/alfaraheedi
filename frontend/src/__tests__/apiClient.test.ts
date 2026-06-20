import { afterEach, describe, expect, it, vi } from "vitest";
import { createApi } from "../api/client";
import { SAMPLE_LLM_SUGGESTION } from "../test/mockApi";

function delayedJsonRoute(body: unknown, delayMs: number) {
  return (_input: RequestInfo | URL, init?: RequestInit) =>
    new Promise<Response>((resolve, reject) => {
      const signal = init?.signal;

      signal?.addEventListener("abort", () => {
        reject(new DOMException("aborted", "AbortError"));
      });

      setTimeout(() => {
        resolve(
          new Response(JSON.stringify(body), {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
        );
      }, delayMs);
    });
}

afterEach(() => {
  vi.useRealTimers();
});

describe("API client timeouts", () => {
  it("allows local LLM suggestions to run longer than regular API calls", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(delayedJsonRoute(SAMPLE_LLM_SUGGESTION, 20_000)));

    const suggestion = createApi("http://127.0.0.1:3402").llmSuggest(
      "مرحبــا  بالعالم",
    );

    await vi.advanceTimersByTimeAsync(20_000);

    await expect(suggestion).resolves.toEqual(SAMPLE_LLM_SUGGESTION);
  });
});
