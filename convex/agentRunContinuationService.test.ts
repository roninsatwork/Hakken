import { describe, expect, test } from "vitest";
import {
  AGENT_RUN_MAX_ACTION_LIFETIME_MS,
  AGENT_RUN_MAX_RESUME_ATTEMPTS,
  AGENT_RUN_SEGMENT_BUDGET_MS,
  AGENT_RUN_STALL_MS,
  decideStalledRunAction,
  getCancelledRunMessage,
  isCheckpointStorable,
  isRunStopRequested,
  shouldCheckpointSegment,
  trimConversationForCheckpoint,
} from "./agentRunContinuationService";

describe("run stop detection", () => {
  test("treats a cancelled run as a request to stop", () => {
    expect(isRunStopRequested("CANCELLED")).toBe(true);
  });

  test("stops on any status that has already concluded the run", () => {
    // Continuing against a concluded run would execute tools for an answer
    // nobody is waiting for, and could post over a decision already recorded.
    expect(isRunStopRequested("SUCCESS")).toBe(true);
    expect(isRunStopRequested("FAILED")).toBe(true);
  });

  test("keeps going while the run is live or waiting to start", () => {
    expect(isRunStopRequested("RUNNING")).toBe(false);
    expect(isRunStopRequested("QUEUED")).toBe(false);
    expect(isRunStopRequested("PENDING_APPROVAL")).toBe(false);
    expect(isRunStopRequested(undefined)).toBe(false);
  });

  test("prefers the operator's stated reason over a generic notice", () => {
    expect(getCancelledRunMessage("Agent run cancelled: spending too much")).toBe(
      "Agent run cancelled: spending too much",
    );
    expect(getCancelledRunMessage("   ")).toBe("Agent run cancelled.");
    expect(getCancelledRunMessage(undefined)).toBe("Agent run cancelled.");
  });
});

describe("segment handover", () => {
  test("keeps working while there is comfortably time left", () => {
    expect(shouldCheckpointSegment({ segmentElapsedMs: 1000 })).toBe(false);
  });

  test("hands over once the segment budget is spent", () => {
    expect(shouldCheckpointSegment({ segmentElapsedMs: AGENT_RUN_SEGMENT_BUDGET_MS })).toBe(true);
  });

  test("hands over well before an action would be killed", () => {
    // The whole point of the handover is that it happens by choice. If the
    // budget ever crept up to the action ceiling, a segment would be killed
    // mid-turn and the checkpoint would never be written.
    expect(AGENT_RUN_SEGMENT_BUDGET_MS).toBeLessThan(AGENT_RUN_MAX_ACTION_LIFETIME_MS / 2);
  });
});

describe("stalled run recovery", () => {
  const base = {
    now: 1_000_000_000,
    resumeAttempts: 0,
    hasTranscript: true,
  };

  test("leaves a run alone while its checkpoint is still moving", () => {
    expect(decideStalledRunAction({
      ...base,
      checkpointUpdatedAt: base.now - 1000,
    })).toBe("WAIT");
  });

  test("never declares a run stalled while an action could still be alive", () => {
    // This is the property that stops the sweeper double-running tool calls: a
    // live action holds no lock the sweeper can see, so the only protection is
    // that the stall window outlasts any possible action.
    expect(AGENT_RUN_STALL_MS).toBeGreaterThan(AGENT_RUN_MAX_ACTION_LIFETIME_MS);

    expect(decideStalledRunAction({
      ...base,
      checkpointUpdatedAt: base.now - AGENT_RUN_MAX_ACTION_LIFETIME_MS,
    })).toBe("WAIT");
  });

  test("resumes a run that has gone quiet past the stall window", () => {
    expect(decideStalledRunAction({
      ...base,
      checkpointUpdatedAt: base.now - AGENT_RUN_STALL_MS - 1,
    })).toBe("RESUME");
  });

  test("fails a run that has already been revived too many times", () => {
    // Repeated death at the same step is deterministic, not bad luck.
    expect(decideStalledRunAction({
      ...base,
      checkpointUpdatedAt: base.now - AGENT_RUN_STALL_MS - 1,
      resumeAttempts: AGENT_RUN_MAX_RESUME_ATTEMPTS,
    })).toBe("FAIL");
  });

  test("fails a stalled run that has nothing to resume from", () => {
    expect(decideStalledRunAction({
      ...base,
      checkpointUpdatedAt: base.now - AGENT_RUN_STALL_MS - 1,
      hasTranscript: false,
    })).toBe("FAIL");
  });
});

describe("checkpoint transcript trimming", () => {
  test("stores a small transcript untouched", () => {
    const turns = [
      { role: "user", parts: [{ text: "hello" }] },
      { role: "model", parts: [{ text: "hi" }] },
    ];
    const result = trimConversationForCheckpoint(turns, 10_000);
    expect(result.trimmed).toBe(false);
    expect(result.turns).toHaveLength(2);
    expect(isCheckpointStorable(result.serialized, 10_000)).toBe(true);
  });

  test("drops the oldest turns to fit the budget", () => {
    const turns = Array.from({ length: 40 }, (_, index) => ({
      role: index % 2 === 0 ? "user" : "model",
      parts: [{ text: "x".repeat(200) }],
    }));
    const result = trimConversationForCheckpoint(turns, 2000);
    expect(result.trimmed).toBe(true);
    expect(result.turns.length).toBeLessThan(40);
    expect(result.serialized.length).toBeLessThanOrEqual(2000);
    // The recent end of the conversation is what the model needs, so trimming
    // must take from the front.
    expect(result.turns.at(-1)).toEqual(turns.at(-1));
  });

  test("never leaves a tool result without the call that produced it", () => {
    // A `function` turn answers the `model` turn before it. Trimming away only
    // the model turn leaves an orphan response the provider rejects, which
    // would make the resumed run fail immediately.
    const turns = [
      { role: "user", parts: [{ text: "p".repeat(400) }] },
      { role: "model", parts: [{ functionCall: { name: "search", args: {} } }] },
      { role: "function", parts: [{ functionResponse: { name: "search" } }] },
      { role: "model", parts: [{ text: "a".repeat(400) }] },
    ];

    const result = trimConversationForCheckpoint(turns, 500);
    expect(result.trimmed).toBe(true);
    expect(result.turns[0]?.role).not.toBe("function");
  });

  test("reports a single turn that cannot be trimmed to fit", () => {
    // Nothing can be dropped without losing the objective itself, so the caller
    // must be told rather than being handed something that will fail to write.
    const turns = [{ role: "user", parts: [{ text: "x".repeat(5000) }] }];
    const result = trimConversationForCheckpoint(turns, 500);
    expect(result.turns).toHaveLength(1);
    expect(isCheckpointStorable(result.serialized, 500)).toBe(false);
  });
});
