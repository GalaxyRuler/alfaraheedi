import { beforeEach, describe, expect, it, vi } from "vitest";
import { companionClient } from "../api/companion";

const invokeMock = vi.hoisted(() => vi.fn());

vi.mock("@tauri-apps/api/core", () => ({
  invoke: invokeMock,
}));

describe("companion client commands", () => {
  beforeEach(() => {
    invokeMock.mockReset();
  });

  it("probes desktop overlay capability without sending text", async () => {
    invokeMock.mockResolvedValue({
      available: true,
      platform: "windows",
      method: "windows_uia_overlay_probe",
      support: "fallback",
      reason: "Focused control is detectable, but overlay rectangles are unavailable.",
      focused_control: true,
      text_pattern_supported: true,
      visible_range_rect_count: 0,
      visible_range_rects: [],
      value_pattern_supported: true,
      replacement_supported: false,
      control_class: "Edit",
      monitor_present: true,
    });

    const probe = await companionClient.probeDesktopOverlay();

    expect(invokeMock).toHaveBeenCalledWith("probe_desktop_overlay");
    expect(probe.method).toBe("windows_uia_overlay_probe");
    expect(probe.replacement_supported).toBe(false);
    expect(JSON.stringify(probe)).not.toContain("raw_text");
  });
});
