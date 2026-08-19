import { describe, expect, it } from "vitest";
import {
  canCancel,
  canLearnFrom,
  canReplay,
  formatRunDuration,
  formatSignedCurrencyDelta,
  formatSignedDurationDelta,
  formatSignedNumberDelta,
  getSmokeEvalModeLabel,
  getSmokeEvalTone,
  getStatusTone,
  getStepDiffTone,
  getStepTone,
} from "./runStatusRules";

describe("formatRunDuration", () => {
  it("reads sub-second work in milliseconds and everything else in seconds", () => {
    expect(formatRunDuration(310)).toBe("310ms");
    expect(formatRunDuration(4200)).toBe("4.2s");
    // Never minutes: a run duration on this screen stays in seconds.
    expect(formatRunDuration(80000)).toBe("80.0s");
  });

  it("reads nothing measurable as zero seconds", () => {
    expect(formatRunDuration(0)).toBe("0s");
    expect(formatRunDuration(-500)).toBe("0s");
    expect(formatRunDuration(Number.NaN)).toBe("0s");
  });
});

describe("formatSignedDurationDelta", () => {
  it("says when there is nothing to compare", () => {
    expect(formatSignedDurationDelta(undefined)).toBe("not available");
  });

  it("marks a slower replay with a plus", () => {
    expect(formatSignedDurationDelta(1500)).toBe("+1.5s");
    expect(formatSignedDurationDelta(310)).toBe("+310ms");
  });

  it("reads a faster replay as zero rather than inventing a minus sign", () => {
    expect(formatSignedDurationDelta(-1500)).toBe("0s");
    expect(formatSignedDurationDelta(0)).toBe("0s");
  });
});

describe("formatSignedNumberDelta", () => {
  it("says when there is nothing to compare", () => {
    expect(formatSignedNumberDelta(undefined)).toBe("not available");
  });

  it("marks an increase with a plus and leaves a decrease's own minus", () => {
    expect(formatSignedNumberDelta(5)).toBe("+5");
    expect(formatSignedNumberDelta(-5)).toBe("-5");
    expect(formatSignedNumberDelta(0)).toBe("0");
  });
});

describe("formatSignedCurrencyDelta", () => {
  it("says when there is nothing to compare", () => {
    expect(formatSignedCurrencyDelta(undefined)).toBe("not available");
  });

  it("marks a cost increase with a plus", () => {
    expect(formatSignedCurrencyDelta(0.02)).toBe("+$0.020");
  });

  it("shows no change as plain zero", () => {
    expect(formatSignedCurrencyDelta(0)).toBe("$0.00");
  });
});

describe("getStatusTone", () => {
  it("colours each outcome by what it asks of the reader", () => {
    expect(getStatusTone("SUCCESS")).toBe("success");
    expect(getStatusTone("FAILED")).toBe("danger");
    expect(getStatusTone("CANCELLED")).toBe("warning");
    expect(getStatusTone("PENDING_APPROVAL")).toBe("info");
    expect(getStatusTone("RUNNING")).toBe("info");
    expect(getStatusTone("QUEUED")).toBe("info");
  });

  it("colours a continued failure as working, not failed", () => {
    expect(getStatusTone("FAILED", true)).toBe("info");
    // Continuation only changes a failure's reading, nothing else's.
    expect(getStatusTone("SUCCESS", true)).toBe("success");
  });
});

describe("canReplay", () => {
  it("allows a replay only once the run stopped without succeeding", () => {
    expect(canReplay("FAILED")).toBe(true);
    expect(canReplay("CANCELLED")).toBe(true);
    expect(canReplay("SUCCESS")).toBe(false);
    expect(canReplay("RUNNING")).toBe(false);
    expect(canReplay("QUEUED")).toBe(false);
    expect(canReplay("PENDING_APPROVAL")).toBe(false);
  });
});

describe("canCancel", () => {
  it("allows a cancel only while the run has not finished", () => {
    expect(canCancel("QUEUED")).toBe(true);
    expect(canCancel("RUNNING")).toBe(true);
    expect(canCancel("PENDING_APPROVAL")).toBe(true);
    expect(canCancel("SUCCESS")).toBe(false);
    expect(canCancel("FAILED")).toBe(false);
    expect(canCancel("CANCELLED")).toBe(false);
  });
});

describe("canLearnFrom", () => {
  it("learns from any run that has an outcome to learn from", () => {
    expect(canLearnFrom("SUCCESS")).toBe(true);
    expect(canLearnFrom("FAILED")).toBe(true);
    expect(canLearnFrom("CANCELLED")).toBe(true);
    expect(canLearnFrom("RUNNING")).toBe(false);
    expect(canLearnFrom("QUEUED")).toBe(false);
    expect(canLearnFrom("PENDING_APPROVAL")).toBe(false);
  });
});

describe("getSmokeEvalTone", () => {
  it("colours a smoke eval by its outcome", () => {
    expect(getSmokeEvalTone("SUCCESS")).toBe("success");
    expect(getSmokeEvalTone("FAILED")).toBe("danger");
    expect(getSmokeEvalTone("CANCELLED")).toBe("warning");
    expect(getSmokeEvalTone("RUNNING")).toBe("info");
    expect(getSmokeEvalTone("PENDING_APPROVAL")).toBe("info");
  });
});

describe("getSmokeEvalModeLabel", () => {
  it("names the two grading modes and treats anything unknown as a contract", () => {
    expect(getSmokeEvalModeLabel("MODEL_GRADED")).toBe("Model graded");
    expect(getSmokeEvalModeLabel("CONTRACT")).toBe("Contract");
    expect(getSmokeEvalModeLabel("SOMETHING_NEW")).toBe("Contract");
  });
});

describe("getStepTone", () => {
  it("colours a step by how it ended", () => {
    expect(getStepTone("SUCCESS")).toBe("success");
    expect(getStepTone("FAILED")).toBe("danger");
    expect(getStepTone("SKIPPED")).toBe("warning");
    expect(getStepTone("RUNNING")).toBe("info");
  });
});

describe("getStepDiffTone", () => {
  it("colours a timeline diff by what changed", () => {
    expect(getStepDiffTone("ADDED")).toBe("success");
    expect(getStepDiffTone("REMOVED")).toBe("danger");
    expect(getStepDiffTone("CHANGED")).toBe("warning");
    expect(getStepDiffTone("UNCHANGED")).toBe("neutral");
  });
});
