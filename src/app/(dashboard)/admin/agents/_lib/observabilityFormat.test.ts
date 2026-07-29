import { describe, expect, it } from "vitest";
import {
  describeInteractionType,
  describeRunStatus,
  describeToolName,
  describeTrigger,
  formatCount,
  formatCountChange,
  formatDayLabel,
  formatDuration,
  formatMoney,
  formatPercent,
  formatRateChange,
  formatRelativeTime,
  summariseLogContent,
} from "./observabilityFormat";

describe("formatDuration", () => {
  it("uses a unit the reader can act on at each scale", () => {
    expect(formatDuration(310)).toBe("310ms");
    expect(formatDuration(4200)).toBe("4.2s");
    expect(formatDuration(31400)).toBe("31.4s");
    expect(formatDuration(80000)).toBe("1m 20s");
    expect(formatDuration(120000)).toBe("2m");
  });

  it("shows a dash rather than a misleading zero when there is no duration", () => {
    expect(formatDuration(undefined)).toBe("—");
    expect(formatDuration(Number.NaN)).toBe("—");
    expect(formatDuration(-1)).toBe("—");
  });
});

describe("formatMoney", () => {
  it("keeps a per-job cost readable without making a weekly total unreadable", () => {
    expect(formatMoney(0.014)).toBe("£0.014");
    expect(formatMoney(0.0001)).toBe("£0.0001");
    expect(formatMoney(17.98)).toBe("£17.98");
    expect(formatMoney(1234.5)).toBe("£1,234.50");
  });

  it("shows nothing spent as zero, not as a dash", () => {
    expect(formatMoney(0)).toBe("£0.00");
  });

  it("shows a dash when there is no figure at all", () => {
    expect(formatMoney(undefined)).toBe("—");
  });
});

describe("formatPercent", () => {
  it("does not round a near-perfect rate up to perfect", () => {
    // 99.6% must not read as 100%: the difference is the whole point of the number.
    expect(formatPercent(0.996)).toBe("99.6%");
    expect(formatPercent(0.9999)).toBe("100.0%");
  });

  it("rounds ordinary rates to whole numbers", () => {
    expect(formatPercent(0.964)).toBe("96%");
    expect(formatPercent(0.5)).toBe("50%");
    expect(formatPercent(1)).toBe("100%");
    expect(formatPercent(0)).toBe("0%");
  });
});

describe("formatCountChange", () => {
  it("says how much more or less, in plain words", () => {
    expect(formatCountChange(112, 100)).toEqual({ label: "12% more", direction: "up" });
    expect(formatCountChange(88, 100)).toEqual({ label: "12% fewer", direction: "down" });
  });

  it("refuses to invent a change when there was nothing before it", () => {
    // A first week of traffic is not an infinite improvement.
    expect(formatCountChange(50, 0)).toEqual({ label: "nothing to compare yet", direction: "unknown" });
    expect(formatCountChange(0, 0)).toEqual({ label: "no change", direction: "flat" });
  });

  it("calls a negligible change what it is", () => {
    expect(formatCountChange(1000, 1002).direction).toBe("flat");
  });
});

describe("formatRateChange", () => {
  it("reports a rate change in points, not as a percentage of a percentage", () => {
    expect(formatRateChange(0.964, 0.976)).toEqual({ label: "1.2 pts lower", direction: "down" });
    expect(formatRateChange(0.976, 0.964)).toEqual({ label: "1.2 pts higher", direction: "up" });
  });

  it("knows that for some measures lower is the improvement", () => {
    const change = formatRateChange(0.02, 0.05, { higherIsBetter: false });
    expect(change.label).toBe("3 pts lower");
    expect(change.direction).toBe("up");
  });

  it("calls an unchanged rate unchanged", () => {
    expect(formatRateChange(0.5, 0.5).direction).toBe("flat");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 6, 29, 12, 0, 0);

  it("uses the roundest true unit", () => {
    expect(formatRelativeTime(now - 30_000, now)).toBe("just now");
    expect(formatRelativeTime(now - 60_000, now)).toBe("1 minute ago");
    expect(formatRelativeTime(now - 600_000, now)).toBe("10 minutes ago");
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe("3 hours ago");
    expect(formatRelativeTime(now - 24 * 3_600_000, now)).toBe("yesterday");
    expect(formatRelativeTime(now - 48 * 3_600_000, now)).toBe("2 days ago");
  });

  it("does not read the future as a negative age", () => {
    expect(formatRelativeTime(now + 5_000, now)).toBe("just now");
  });
});

describe("formatDayLabel", () => {
  it("names the day the bucket actually covers", () => {
    expect(formatDayLabel(Date.UTC(2026, 6, 29))).toBe("Wed");
    expect(formatDayLabel(Date.UTC(2026, 6, 26))).toBe("Sun");
  });
});

describe("plain-language labels", () => {
  it("says what a status means rather than naming the internal state", () => {
    expect(describeRunStatus("PENDING_APPROVAL")).toBe("Needs you");
    expect(describeRunStatus("SUCCESS")).toBe("Done");
    expect(describeRunStatus("CANCELLED")).toBe("Stopped");
  });

  it("passes an unrecognised status through rather than hiding it", () => {
    expect(describeRunStatus("SOMETHING_NEW")).toBe("SOMETHING_NEW");
  });

  it("says how a job was started in ordinary words", () => {
    expect(describeTrigger("SCHEDULE")).toBe("Scheduled");
    expect(describeTrigger("MANUAL")).toBe("Started by hand");
    expect(describeTrigger("WEBHOOK")).toBe("Triggered by another system");
  });

  it("says what a raw log entry was instead of printing the runtime's own label", () => {
    expect(describeInteractionType("LLM SYNTHESIS")).toBe("Worked out what to say");
    expect(describeInteractionType("ERROR")).toBe("Something went wrong");
    expect(describeInteractionType("BATCH_GENERATION_START")).toBe("Started building a report");
  });

  it("names the tool in a dispatch entry, without the underscores", () => {
    expect(describeInteractionType("TOOL DISPATCH: property_search")).toBe("Used property search");
    expect(describeInteractionType("TOOL DISPATCH: rightmove.search")).toBe("Used rightmove search");
    expect(describeInteractionType("TOOL AWAITING APPROVAL: send_email")).toBe("Waiting to use send email");
  });

  it("passes an entry it does not recognise through rather than hiding it", () => {
    expect(describeInteractionType("MCP PROXY: get_inbox")).toBe("MCP PROXY: get_inbox");
  });

  it("falls back to the handler when a tool is no longer in the catalogue", () => {
    const names = new Map([["rightmove.search", "Property search"]]);
    expect(describeToolName("rightmove.search", names)).toBe("Property search");
    expect(describeToolName("removed.connector", names)).toBe("removed.connector");
  });
});

describe("summariseLogContent", () => {
  it("reads a stored argument payload as a sentence rather than as JSON", () => {
    expect(
      summariseLogContent('{"area":"Bristol","bedrooms":3,"maxPrice":400000}')
    ).toBe("area Bristol · bedrooms 3 · max price 400000");
  });

  it("drops nested values rather than truncating an object mid-brace", () => {
    expect(
      summariseLogContent('{"area":"Bath","filters":{"garden":true}}')
    ).toBe("area Bath");
  });

  it("passes plain text through, collapsed onto one line", () => {
    expect(summariseLogContent("User: what is\n  the weather?")).toBe("User: what is the weather?");
  });

  it("leaves malformed JSON alone rather than showing nothing", () => {
    expect(summariseLogContent('{"area":"Bristol"')).toBe('{"area":"Bristol"');
  });

  it("says so when there was nothing recorded, rather than showing a blank row", () => {
    expect(summariseLogContent("")).toBe("Nothing was recorded");
    expect(summariseLogContent(undefined)).toBe("Nothing was recorded");
    expect(summariseLogContent("{}")).toBe("{}");
  });

  it("truncates a long entry so one row cannot push the others off the screen", () => {
    const summary = summariseLogContent("x".repeat(400));
    expect(summary).toHaveLength(120);
    expect(summary.endsWith("…")).toBe(true);
  });
});

describe("formatCount", () => {
  it("groups thousands so a large number stays readable", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(0)).toBe("0");
  });
});
