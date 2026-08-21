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
    expect(formatMoney(0.014)).toBe("$0.014");
    expect(formatMoney(0.0001)).toBe("$0.0001");
    expect(formatMoney(17.98)).toBe("$17.98");
    expect(formatMoney(1234.5)).toBe("$1,234.50");
  });

  it("shows nothing spent as zero, not as a dash", () => {
    expect(formatMoney(0)).toBe("$0.00");
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
  it("says how much more or less, as a catalogue key with the percentage", () => {
    expect(formatCountChange(112, 100)).toEqual({
      label: { key: "change.moreCount", params: { percent: 12 } },
      direction: "up",
    });
    expect(formatCountChange(88, 100)).toEqual({
      label: { key: "change.fewerCount", params: { percent: 12 } },
      direction: "down",
    });
  });

  it("refuses to invent a change when there was nothing before it", () => {
    // A first week of traffic is not an infinite improvement.
    expect(formatCountChange(50, 0)).toEqual({ label: { key: "change.nothingToCompare" }, direction: "unknown" });
    expect(formatCountChange(0, 0)).toEqual({ label: { key: "change.noChange" }, direction: "flat" });
  });

  it("calls a negligible change what it is", () => {
    expect(formatCountChange(1000, 1002).direction).toBe("flat");
  });
});

describe("formatRateChange", () => {
  it("reports a rate change in points, not as a percentage of a percentage", () => {
    expect(formatRateChange(0.964, 0.976)).toEqual({
      label: { key: "change.ptsLower", params: { points: 1.2 } },
      direction: "down",
    });
    expect(formatRateChange(0.976, 0.964)).toEqual({
      label: { key: "change.ptsHigher", params: { points: 1.2 } },
      direction: "up",
    });
  });

  it("knows that for some measures lower is the improvement", () => {
    const change = formatRateChange(0.02, 0.05, { higherIsBetter: false });
    expect(change.label).toEqual({ key: "change.ptsLower", params: { points: 3 } });
    expect(change.direction).toBe("up");
  });

  it("calls an unchanged rate unchanged", () => {
    expect(formatRateChange(0.5, 0.5).direction).toBe("flat");
  });
});

describe("formatRelativeTime", () => {
  const now = Date.UTC(2026, 6, 29, 12, 0, 0);

  it("uses the roundest true unit", () => {
    expect(formatRelativeTime(now - 30_000, now)).toEqual({ key: "relative.justNow" });
    expect(formatRelativeTime(now - 60_000, now)).toEqual({ key: "relative.minutesAgo", params: { count: 1 } });
    expect(formatRelativeTime(now - 600_000, now)).toEqual({ key: "relative.minutesAgo", params: { count: 10 } });
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toEqual({ key: "relative.hoursAgo", params: { count: 3 } });
    expect(formatRelativeTime(now - 24 * 3_600_000, now)).toEqual({ key: "relative.yesterday" });
    expect(formatRelativeTime(now - 48 * 3_600_000, now)).toEqual({ key: "relative.daysAgo", params: { count: 2 } });
  });

  it("does not read the future as a negative age", () => {
    expect(formatRelativeTime(now + 5_000, now)).toEqual({ key: "relative.justNow" });
  });
});

describe("formatDayLabel", () => {
  it("names the day the bucket actually covers", () => {
    expect(formatDayLabel(Date.UTC(2026, 6, 29))).toBe("Wed");
    expect(formatDayLabel(Date.UTC(2026, 6, 26))).toBe("Sun");
  });

  it("names the day in the reader's language", () => {
    expect(formatDayLabel(Date.UTC(2026, 6, 29), "it")).toBe("mer");
  });
});

describe("plain-language labels", () => {
  it("maps a status to its catalogue key rather than the internal state", () => {
    expect(describeRunStatus("PENDING_APPROVAL")).toEqual({ key: "runStatus.needsYou" });
    expect(describeRunStatus("SUCCESS")).toEqual({ key: "runStatus.done" });
    expect(describeRunStatus("CANCELLED")).toEqual({ key: "runStatus.stopped" });
  });

  it("reads a continued failure as a handover, not a death", () => {
    expect(describeRunStatus("FAILED", true)).toEqual({ key: "runStatus.handedOver" });
    expect(describeRunStatus("FAILED")).toEqual({ key: "runStatus.failed" });
  });

  it("passes an unrecognised status through rather than hiding it", () => {
    expect(describeRunStatus("SOMETHING_NEW")).toEqual({
      key: "runStatus.unknown",
      params: { status: "SOMETHING_NEW" },
    });
  });

  it("maps how a job was started to its catalogue key", () => {
    expect(describeTrigger("SCHEDULE")).toEqual({ key: "trigger.schedule" });
    expect(describeTrigger("MANUAL")).toEqual({ key: "trigger.manual" });
    expect(describeTrigger("WEBHOOK")).toEqual({ key: "trigger.webhook" });
  });

  it("maps a raw log entry's type to its catalogue key", () => {
    expect(describeInteractionType("LLM SYNTHESIS")).toEqual({ key: "interaction.synthesis" });
    expect(describeInteractionType("ERROR")).toEqual({ key: "interaction.error" });
    expect(describeInteractionType("BATCH_GENERATION_START")).toEqual({ key: "interaction.batchStart" });
  });

  it("names the tool in a dispatch entry, without the underscores", () => {
    expect(describeInteractionType("TOOL DISPATCH: property_search")).toEqual({
      key: "interaction.usedTool",
      params: { tool: "property search" },
    });
    expect(describeInteractionType("TOOL DISPATCH: rightmove.search")).toEqual({
      key: "interaction.usedTool",
      params: { tool: "rightmove search" },
    });
    expect(describeInteractionType("TOOL AWAITING APPROVAL: send_email")).toEqual({
      key: "interaction.waitingTool",
      params: { tool: "send email" },
    });
  });

  it("passes an entry it does not recognise through rather than hiding it", () => {
    expect(describeInteractionType("MCP PROXY: get_inbox")).toEqual({
      key: "interaction.unknown",
      params: { type: "MCP PROXY: get_inbox" },
    });
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

  it("returns nothing when there was nothing recorded, so the screen can say so in the reader's language", () => {
    expect(summariseLogContent("")).toBeUndefined();
    expect(summariseLogContent(undefined)).toBeUndefined();
    expect(summariseLogContent("{}")).toBe("{}");
  });

  it("truncates a long entry so one row cannot push the others off the screen", () => {
    const summary = summariseLogContent("x".repeat(400));
    expect(summary).toHaveLength(120);
    expect(summary?.endsWith("…")).toBe(true);
  });
});

describe("formatCount", () => {
  it("groups thousands so a large number stays readable", () => {
    expect(formatCount(1284)).toBe("1,284");
    expect(formatCount(0)).toBe("0");
  });
});
