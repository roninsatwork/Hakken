import { describe, expect, it } from "vitest";
import {
  STATUS_TONE_CLASSES,
  STATUS_TONE_TEXT_CLASSES,
  toneForStatus,
} from "./statusTone";

describe("toneForStatus", () => {
  it("maps the platform's status vocabulary onto the four tones", () => {
    expect(toneForStatus("SUCCESS")).toBe("success");
    expect(toneForStatus("FAILED")).toBe("danger");
    expect(toneForStatus("PENDING_APPROVAL")).toBe("warning");
    expect(toneForStatus("RUNNING")).toBe("info");
    expect(toneForStatus("CANCELLED")).toBe("neutral");
  });

  it("is case-insensitive and trims", () => {
    expect(toneForStatus(" failed ")).toBe("danger");
    expect(toneForStatus("success")).toBe("success");
  });

  it("keeps unknown statuses neutral, never good or bad news by accident", () => {
    expect(toneForStatus("SOMETHING_NEW")).toBe("neutral");
    expect(toneForStatus(undefined)).toBe("neutral");
    expect(toneForStatus("")).toBe("neutral");
  });
});

describe("tone classes", () => {
  it("uses only theme tokens — no raw palette classes, no hex", () => {
    // The whole point: these classes must route through the tokens the
    // Aesthetics screen controls, or its Status Colours stay decorative.
    const banned = /(red|rose|amber|yellow|emerald|green|sky|blue|indigo|orange)-\d|#[0-9a-fA-F]{3}/;
    for (const classes of [
      ...Object.values(STATUS_TONE_CLASSES),
      ...Object.values(STATUS_TONE_TEXT_CLASSES),
    ]) {
      expect(classes).not.toMatch(banned);
    }
  });
});
