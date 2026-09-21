import { describe, expect, test } from "vitest";
import {
  AGENT_LIMIT_OVERRIDE_FIELDS,
  AGENT_OBJECTIVE_LIMIT_CEILINGS,
  DEFAULT_AGENT_OBJECTIVE_LIMITS,
  UNPRICED_MODEL_OBJECTIVE_LIMITS,
  buildModelStepRecord,
  buildRunUsagePayload,
  buildToolDispatchLogEntry,
  clampAgentLimitOverride,
  classifyExecutedToolResult,
  estimateStablePrefixTokens,
  isConfirmationRequiredDenial,
  isModelCostMeasurable,
  parseAgentOutputSchema,
  resolveAgentObjectiveLimits,
  resolveToolCallWithoutExecution,
  shouldRequestToolApproval,
  shouldRetryTurnWithoutPromptCache,
  buildToolInteractionTurns,
  getAgentStepStatusFromToolStatus,
  getCostBudgetStopMessage,
  getRuntimeBudgetStopMessage,
  getTokenBudgetStopMessage,
  getToolBudgetStopMessage,
  shouldStopForCostBudget,
  shouldStopForRuntimeBudget,
  shouldStopForTokenBudget,
  shouldStopForToolBudget,
} from "./agentRuntimeService";
import {
  AGENT_RUN_MAX_SEGMENTS,
  AGENT_RUN_SEGMENT_BUDGET_MS,
} from "./agentRunContinuationService";
import { estimatePromptTokens } from "./promptCacheService";

/** The exact sentence `canExecuteTool` uses for "ask a person first". */
const CONFIRMATION_DENIAL = "Tool execution requires explicit user confirmation.";

/** A tool call with every gate open: nothing refused, valid args, access granted. */
const cleanToolCall = {
  toolName: "knowledge.search",
  wasRefused: false,
  schemaValidation: { ok: true, errors: [] as string[] },
  isRehearsalRun: false,
  toolMetadata: { sideEffectLevel: "READ" as const },
  accessDecision: { allowed: true },
};

describe("agentRuntimeService", () => {
  test("exposes default loop budgets with room for real work", () => {
    expect(DEFAULT_AGENT_OBJECTIVE_LIMITS).toEqual({
      maxSteps: 25,
      maxToolCalls: 25,
      maxRuntimeMs: 30 * 60 * 1000,
      maxInputTokens: 1000000,
      maxOutputTokens: 100000,
      maxCostGBP: 10,
    });
  });

  test("falls back to a tighter budget when spend cannot be measured", () => {
    // With no pricing on the model, cost always computes to zero and the cost
    // ceiling never fires — so step and tool counts are the only backstop and
    // must stay conservative.
    expect(isModelCostMeasurable(undefined)).toBe(false);
    expect(isModelCostMeasurable({})).toBe(false);
    expect(isModelCostMeasurable({ standardInputCostBelow200k: 0, outputResponseCost: 0 })).toBe(false);
    expect(isModelCostMeasurable({ standardInputCostBelow200k: 0.5 })).toBe(true);
    expect(isModelCostMeasurable({ outputResponseCost: 1.5 })).toBe(true);

    const unpriced = resolveAgentObjectiveLimits({ maxSteps: 24, maxToolCalls: 20 }, { costMeasurable: false });
    expect(unpriced.maxSteps).toBe(UNPRICED_MODEL_OBJECTIVE_LIMITS.maxSteps);
    expect(unpriced.maxToolCalls).toBe(UNPRICED_MODEL_OBJECTIVE_LIMITS.maxToolCalls);

    // A deliberately smaller budget is still respected.
    expect(resolveAgentObjectiveLimits({ maxSteps: 2 }, { costMeasurable: false }).maxSteps).toBe(2);
  });

  /**
   * The ceiling that actually stops a research run.
   *
   * Every page an agent reads is fed back into the model and re-sent on each
   * turn after it, so half a dozen pages exhaust this while steps, tool calls,
   * minutes and spend are all still far from theirs. It was a platform constant
   * with no way to raise it, and it was absent from the screen headed "What
   * bounds it" — so a run that stopped on it looked like a run that stopped for
   * no reason.
   */
  test("an agent can be given more room to read, up to the platform ceiling", () => {
    expect(resolveAgentObjectiveLimits(null).maxInputTokens).toBe(
      DEFAULT_AGENT_OBJECTIVE_LIMITS.maxInputTokens
    );

    expect(resolveAgentObjectiveLimits({ maxInputTokens: 600000 }).maxInputTokens).toBe(600000);

    // Clamped rather than rejected, as every other limit is.
    expect(resolveAgentObjectiveLimits({ maxInputTokens: 90_000_000 }).maxInputTokens).toBe(
      AGENT_OBJECTIVE_LIMIT_CEILINGS.maxInputTokens
    );

    // A cleared box means "use the platform default", not "no reading at all".
    expect(resolveAgentObjectiveLimits({ maxInputTokens: 0 }).maxInputTokens).toBe(
      DEFAULT_AGENT_OBJECTIVE_LIMITS.maxInputTokens
    );
  });

  test("maps tool execution outcomes onto persisted step status", () => {
    expect(getAgentStepStatusFromToolStatus("SUCCESS")).toBe("SUCCESS");
    expect(getAgentStepStatusFromToolStatus("FAILED")).toBe("FAILED");
    expect(getAgentStepStatusFromToolStatus("DENIED")).toBe("FAILED");
    expect(getAgentStepStatusFromToolStatus("CANCELLED")).toBe("FAILED");
  });

  test("stops only when the model requests another tool after budget is spent", () => {
    expect(shouldStopForToolBudget({ requestedToolCalls: 0, completedToolCalls: 3, maxToolCalls: 3 })).toBe(false);
    expect(shouldStopForToolBudget({ requestedToolCalls: 1, completedToolCalls: 2, maxToolCalls: 3 })).toBe(false);
    expect(shouldStopForToolBudget({ requestedToolCalls: 1, completedToolCalls: 3, maxToolCalls: 3 })).toBe(true);
  });

  test("returns a deterministic tool budget stop message", () => {
    expect(getToolBudgetStopMessage(3)).toBe("Agent stopped after reaching the maximum tool-call limit of 3.");
  });

  test("stops when runtime, token, or cost budgets are reached", () => {
    expect(shouldStopForRuntimeBudget({ elapsedMs: 119999, maxRuntimeMs: 120000 })).toBe(false);
    expect(shouldStopForRuntimeBudget({ elapsedMs: 120000, maxRuntimeMs: 120000 })).toBe(true);

    expect(
      shouldStopForTokenBudget({
        inputTokens: 199999,
        outputTokens: 19999,
        maxInputTokens: 200000,
        maxOutputTokens: 20000,
      })
    ).toBe(false);
    expect(
      shouldStopForTokenBudget({
        inputTokens: 200000,
        outputTokens: 19999,
        maxInputTokens: 200000,
        maxOutputTokens: 20000,
      })
    ).toBe(true);
    expect(
      shouldStopForTokenBudget({
        inputTokens: 199999,
        outputTokens: 20000,
        maxInputTokens: 200000,
        maxOutputTokens: 20000,
      })
    ).toBe(true);

    expect(shouldStopForCostBudget({ costGBP: 0.99, maxCostGBP: 1 })).toBe(false);
    expect(shouldStopForCostBudget({ costGBP: 1, maxCostGBP: 1 })).toBe(true);
  });

  test("returns deterministic runtime, token, and cost budget messages", () => {
    expect(getRuntimeBudgetStopMessage(120000)).toBe("Agent stopped after reaching the maximum runtime limit of 120 seconds.");
    expect(getTokenBudgetStopMessage()).toBe("Agent stopped after reaching the configured token budget.");
    expect(getCostBudgetStopMessage(1)).toBe("Agent stopped after reaching the maximum cost limit of GBP 1.00.");
  });

  describe("tool interaction turns", () => {
    test("answers every call in a parallel batch, in order", () => {
      // The regression: the runtime executed functionCalls[0] only and appended
      // one response, so the transcript no longer matched what the model asked
      // for and the dropped calls failed silently.
      const turns = buildToolInteractionTurns([
        { name: "knowledge.search", args: { query: "pricing" }, responsePayload: { status: "success" } },
        { name: "company.overview.update", args: { overview: "new" }, responsePayload: { status: "error" } },
      ]);

      expect(turns).toHaveLength(2);
      expect(turns[0].role).toBe("model");
      expect(turns[1].role).toBe("function");

      // One model turn carrying every call...
      expect(turns[0].parts).toEqual([
        { functionCall: { name: "knowledge.search", args: { query: "pricing" } } },
        { functionCall: { name: "company.overview.update", args: { overview: "new" } } },
      ]);

      // ...answered by one function turn with the matching responses in order.
      expect(turns[1].parts).toEqual([
        {
          functionResponse: {
            name: "knowledge.search",
            response: { name: "knowledge.search", content: { status: "success" } },
          },
        },
        {
          functionResponse: {
            name: "company.overview.update",
            response: { name: "company.overview.update", content: { status: "error" } },
          },
        },
      ]);
    });

    test("pairs a single call the same way", () => {
      const turns = buildToolInteractionTurns([
        { name: "knowledge.search", args: {}, responsePayload: { status: "success" } },
      ]);

      expect(turns).toHaveLength(2);
      expect(turns[0].parts).toHaveLength(1);
      expect(turns[1].parts).toHaveLength(1);
    });

    test("emits nothing when no call executed, leaving no dangling model turn", () => {
      expect(buildToolInteractionTurns([])).toEqual([]);
    });

    test("puts each call's thought signature back on its part", () => {
      // The model requires the signature it issued to come back with the call.
      // This turn is rebuilt rather than replayed, so dropping it here failed
      // the next turn with "missing a thought_signature in functionCall parts".
      const turns = buildToolInteractionTurns([
        {
          name: "run_scraper_job",
          args: { actorId: "research" },
          responsePayload: { status: "success" },
          thoughtSignature: "signature-one",
        },
        {
          name: "knowledge.search",
          args: { query: "louth" },
          responsePayload: { status: "success" },
          thoughtSignature: "signature-two",
        },
      ]);

      expect(turns[0].parts).toEqual([
        {
          functionCall: { name: "run_scraper_job", args: { actorId: "research" } },
          thoughtSignature: "signature-one",
        },
        {
          functionCall: { name: "knowledge.search", args: { query: "louth" } },
          thoughtSignature: "signature-two",
        },
      ]);
    });

    test("omits the signature entirely for providers that issue none", () => {
      // An explicit `thoughtSignature: undefined` is not the same as an absent
      // key once the turn is serialised into a checkpoint and sent back.
      const turns = buildToolInteractionTurns([
        { name: "knowledge.search", args: {}, responsePayload: { status: "success" } },
      ]);

      expect(turns[0].parts).toEqual([
        { functionCall: { name: "knowledge.search", args: {} } },
      ]);
    });

    test("keeps the call and response counts equal for any batch size", () => {
      const calls = Array.from({ length: 5 }, (_, index) => ({
        name: `tool.${index}`,
        args: { index },
        responsePayload: { index },
      }));

      const turns = buildToolInteractionTurns(calls);
      expect(turns[0].parts).toHaveLength(turns[1].parts.length);
      expect(turns[0].parts).toHaveLength(5);
    });
  });

  describe("per-agent limits", () => {
    test("falls back to the platform defaults when an agent sets nothing", () => {
      expect(resolveAgentObjectiveLimits(undefined)).toMatchObject({
        maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
        maxToolCalls: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls,
        maxCostGBP: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxCostGBP,
      });
      expect(resolveAgentObjectiveLimits({})).toMatchObject({
        maxSteps: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
      });
    });

    test("uses an agent's own budget when it sets one", () => {
      // The whole point: a deep research agent should be able to take more
      // steps than a trivial classifier.
      expect(resolveAgentObjectiveLimits({ maxSteps: 12, maxToolCalls: 10 })).toMatchObject({
        maxSteps: 12,
        maxToolCalls: 10,
      });
    });

    test("clamps to the platform ceiling instead of trusting the record", () => {
      const resolved = resolveAgentObjectiveLimits({
        maxSteps: 10_000,
        maxToolCalls: 10_000,
        maxRuntimeMs: 24 * 60 * 60 * 1000,
        maxCostGBP: 5_000,
      });

      expect(resolved.maxSteps).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxSteps);
      expect(resolved.maxToolCalls).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxToolCalls);
      expect(resolved.maxCostGBP).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxCostGBP);
      expect(resolved.maxRuntimeMs).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxRuntimeMs);
    });

    /**
     * The runtime ceiling used to be held under the Convex action window
     * because a run was one action. It no longer is — it checkpoints and hands
     * over — so the constraint moved: the longest permitted run has to fit
     * inside the segment backstop, or a run configured for the full hour dies
     * as a failure ("exceeded the maximum number of continuation segments")
     * instead of stopping cleanly on the limit its owner set.
     */
    test("the longest permitted run fits inside the continuation backstop", () => {
      const segmentsNeeded =
        AGENT_OBJECTIVE_LIMIT_CEILINGS.maxRuntimeMs / AGENT_RUN_SEGMENT_BUDGET_MS;

      expect(segmentsNeeded).toBeLessThan(AGENT_RUN_MAX_SEGMENTS);
    });

    test("ignores unusable values rather than failing the run", () => {
      // Older records, hand-edited data, or a bad form submission must degrade
      // to the default instead of producing a zero-step agent.
      for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
        expect(resolveAgentObjectiveLimits({ maxSteps: bad }).maxSteps).toBe(
          DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps,
        );
      }
    });

    test("floors fractional values so a limit is always a whole count", () => {
      expect(resolveAgentObjectiveLimits({ maxSteps: 7.9 }).maxSteps).toBe(7);
    });

    test("does not floor the cost limit, because money is not a count", () => {
      // Flooring turned every budget under £1 into £0 — a budget no run can start
      // under, since the first cost check would already have met it. Harmless
      // while these fields were unreachable, a foot-gun the moment they appear on
      // a screen.
      expect(resolveAgentObjectiveLimits({ maxCostGBP: 0.5 }).maxCostGBP).toBe(0.5);
      expect(resolveAgentObjectiveLimits({ maxCostGBP: 2.75 }).maxCostGBP).toBe(2.75);
    });

    describe("clamping an override on the way in", () => {
      test("keeps a usable value, flooring counts and preserving pennies", () => {
        expect(clampAgentLimitOverride("maxSteps", 12)).toBe(12);
        expect(clampAgentLimitOverride("maxSteps", 12.7)).toBe(12);
        expect(clampAgentLimitOverride("maxCostGBP", 0.5)).toBe(0.5);
      });

      test("clamps above the ceiling rather than storing a number the runtime will override", () => {
        // Without this the record could hold 500 while the run used 24, so the
        // settings screen would be showing a figure that never applies.
        expect(clampAgentLimitOverride("maxSteps", 500)).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxSteps);
        expect(clampAgentLimitOverride("maxCostGBP", 5_000)).toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxCostGBP);
        expect(clampAgentLimitOverride("maxRuntimeMs", 60 * 60 * 1000))
          .toBe(AGENT_OBJECTIVE_LIMIT_CEILINGS.maxRuntimeMs);
      });

      test("treats a cleared box and a nonsense number alike as inherit", () => {
        // The screen sends 0 for an empty field, and undefined is patched as a
        // removal, so the platform default comes back.
        for (const bad of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, undefined]) {
          expect(clampAgentLimitOverride("maxSteps", bad)).toBeUndefined();
          expect(clampAgentLimitOverride("maxCostGBP", bad)).toBeUndefined();
        }
      });

      test("every override field is covered", () => {
        // A new budget field added to the schema and forgotten here would be
        // stored unclamped.
        expect([...AGENT_LIMIT_OVERRIDE_FIELDS]).toEqual([
          "maxSteps",
          "maxToolCalls",
          "maxRuntimeMs",
          "maxInputTokens",
          "maxCostGBP",
        ]);
      });
    });
  });

  describe("asking a person before a tool runs", () => {
    test("only the confirmation sentence reads as an invitation", () => {
      // A substring match would one day catch a differently worded hard denial
      // and park a run nobody is coming to approve.
      expect(isConfirmationRequiredDenial(CONFIRMATION_DENIAL)).toBe(true);
      expect(isConfirmationRequiredDenial("Tool requires a higher role.")).toBe(false);
      expect(isConfirmationRequiredDenial(undefined)).toBe(false);
    });

    test("a sound call blocked only by confirmation parks the run", () => {
      expect(shouldRequestToolApproval({
        isRehearsalRun: false,
        wasRefused: false,
        schemaValidationOk: true,
        accessDecision: { allowed: false, reason: CONFIRMATION_DENIAL },
      })).toBe(true);
    });

    test("a call that would be answered some other way never asks", () => {
      const base = {
        isRehearsalRun: false,
        wasRefused: false,
        schemaValidationOk: true,
        accessDecision: { allowed: false, reason: CONFIRMATION_DENIAL },
      };

      // A rehearsal records the write instead of asking anyone.
      expect(shouldRequestToolApproval({ ...base, isRehearsalRun: true })).toBe(false);
      // A person already refused this exact call; asking again burns their
      // attention on a decision they have made.
      expect(shouldRequestToolApproval({ ...base, wasRefused: true })).toBe(false);
      // Invalid arguments are answered with the validation errors.
      expect(shouldRequestToolApproval({ ...base, schemaValidationOk: false })).toBe(false);
      // An allowed call just runs.
      expect(shouldRequestToolApproval({ ...base, accessDecision: { allowed: true } })).toBe(false);
      // A hard denial is a "no", not a "not yet".
      expect(shouldRequestToolApproval({
        ...base,
        accessDecision: { allowed: false, reason: "Tool requires a higher role." },
      })).toBe(false);
    });
  });

  describe("deciding a tool call without running it", () => {
    test("a call with every gate open must actually execute", () => {
      // undefined is the classifier saying "this is the caller's job now" —
      // execution has side effects, and the pure layer never performs them.
      expect(resolveToolCallWithoutExecution(cleanToolCall)).toBeUndefined();
    });

    test("a refused call is answered with the standing refusal", () => {
      const outcome = resolveToolCallWithoutExecution({ ...cleanToolCall, wasRefused: true });

      expect(outcome?.status).toBe("DENIED");
      expect(outcome?.error).toContain("Do not call knowledge.search with these arguments again.");
      // The model is told the same thing the records say.
      expect(outcome?.responsePayload).toEqual({ status: "error", error: outcome?.error });
    });

    test("the refusal wins over every other gate", () => {
      // The person's decision stands even when the arguments are also invalid
      // and the tool is unknown — the reviewer must not be asked to re-litigate
      // a call they already refused because it was also malformed.
      const outcome = resolveToolCallWithoutExecution({
        ...cleanToolCall,
        wasRefused: true,
        schemaValidation: { ok: false, errors: ["Missing required tool argument 'query'."] },
        toolMetadata: undefined,
      });

      expect(outcome?.status).toBe("DENIED");
      expect(outcome?.error).toContain("A person reviewed this request and refused it.");
    });

    test("invalid arguments are answered with the validation errors, joined", () => {
      const outcome = resolveToolCallWithoutExecution({
        ...cleanToolCall,
        schemaValidation: {
          ok: false,
          errors: ["Missing required tool argument 'query'.", "Tool argument 'limit' must be an integer."],
        },
      });

      expect(outcome?.status).toBe("FAILED");
      expect(outcome?.error).toBe(
        "Missing required tool argument 'query'. Tool argument 'limit' must be an integer."
      );
      expect(outcome?.responsePayload).toEqual({ status: "error", error: outcome?.error });
    });

    test("a rehearsal records a write instead of performing it", () => {
      const outcome = resolveToolCallWithoutExecution({
        ...cleanToolCall,
        isRehearsalRun: true,
        toolMetadata: { sideEffectLevel: "WRITE" },
      });

      expect(outcome?.status).toBe("REHEARSED");
      // No error: the drill going to plan is not a failure.
      expect(outcome?.error).toBeUndefined();
      expect(outcome?.responsePayload).toEqual({
        status: "success",
        data: {
          rehearsed: true,
          note: "Rehearsal run: this action was recorded as would-execute and NOT performed. Continue as if it succeeded.",
        },
      });
    });

    test("a rehearsal still reads for real", () => {
      // Recording reads as would-execute would leave the drill grounded in
      // nothing; only side effects are held back.
      expect(resolveToolCallWithoutExecution({
        ...cleanToolCall,
        isRehearsalRun: true,
        toolMetadata: { sideEffectLevel: "READ" },
      })).toBeUndefined();
    });

    test("a rehearsal covers writes that would otherwise ask for approval", () => {
      const outcome = resolveToolCallWithoutExecution({
        ...cleanToolCall,
        isRehearsalRun: true,
        toolMetadata: { sideEffectLevel: "WRITE" },
        accessDecision: { allowed: false, reason: CONFIRMATION_DENIAL },
      });

      expect(outcome?.status).toBe("REHEARSED");
    });

    test("a rehearsal does not waive a hard denial", () => {
      // Autonomy and rehearsals remove the human, not the permissions: a call
      // the role or tenant boundary forbids stays forbidden in a drill.
      const outcome = resolveToolCallWithoutExecution({
        ...cleanToolCall,
        isRehearsalRun: true,
        toolMetadata: { sideEffectLevel: "WRITE" },
        accessDecision: { allowed: false, reason: "Tool requires a higher role." },
      });

      expect(outcome?.status).toBe("DENIED");
      expect(outcome?.error).toBe("Tool requires a higher role.");
      expect(outcome?.responsePayload).toEqual({
        status: "error",
        error: "Tool requires a higher role.",
      });
    });

    test("a tool the platform has never heard of cannot run", () => {
      const outcome = resolveToolCallWithoutExecution({
        ...cleanToolCall,
        toolMetadata: undefined,
      });

      expect(outcome?.status).toBe("FAILED");
      expect(outcome?.error).toBe("Unknown tool requested by model.");
    });
  });

  describe("classifying what an executed tool came back with", () => {
    test("a real result is a success carrying the data", () => {
      const classified = classifyExecutedToolResult({
        toolName: "knowledge.search",
        result: { hits: 3 },
      });

      expect(classified.status).toBe("SUCCESS");
      expect(classified.error).toBeUndefined();
      expect(classified.responsePayload).toEqual({ status: "success", data: { hits: 3 } });
    });

    test("a declared-but-empty connector is not a green tick", () => {
      // The regression: a connector with nothing behind it returns normally, so
      // the run log recorded a success against a call that did nothing at all.
      const classified = classifyExecutedToolResult({
        toolName: "hubspot.contacts.sync",
        result: { status: "not_implemented", message: "nothing implements it" },
      });

      expect(classified.status).toBe("NOT_IMPLEMENTED");
      expect(classified.error).toBe("Connector is declared but has no implementation.");
      // The model is told plainly, so it stops trying and says so rather than
      // reporting the job done.
      expect(classified.responsePayload).toEqual({
        status: "error",
        error: "The hubspot.contacts.sync tool is not available on this platform. Do not retry it; tell the user this capability is not connected.",
      });
    });
  });

  describe("what a model turn writes into the timeline", () => {
    test("a narrated turn stores the model's own words", () => {
      const record = buildModelStepRecord({
        loopIndex: 2,
        completedToolCalls: 3,
        responseText: "Here is the answer.",
        toolCallNames: [],
      });

      expect(record.input).toBe(JSON.stringify({ loopIndex: 2, completedToolCalls: 3 }));
      expect(record.output).toBe("Here is the answer.");
    });

    test("a silent tool-request turn stores the calls it made", () => {
      // Without this the timeline showed a blank step wherever the model went
      // straight to its tools without narrating first.
      const record = buildModelStepRecord({
        loopIndex: 0,
        completedToolCalls: 0,
        responseText: "",
        toolCallNames: ["knowledge.search", "web.fetch"],
      });

      expect(record.output).toBe(JSON.stringify({
        functionCalls: [{ name: "knowledge.search" }, { name: "web.fetch" }],
      }));
    });
  });

  describe("the raw log entry for a resolved tool call", () => {
    test("a success stores the request and logs SUCCESS", () => {
      const entry = buildToolDispatchLogEntry({
        toolName: "knowledge.search",
        toolStatus: "SUCCESS",
        toolError: undefined,
        redactedArgsJson: "{\"query\":\"pricing\"}",
      });

      expect(entry.interactionType).toBe("TOOL DISPATCH: knowledge.search");
      expect(entry.responseContent).toBe(
        "{\"functionCall\": {\"name\": \"knowledge.search\", \"args\": {\"query\":\"pricing\"}}}"
      );
      expect(entry.outcome).toBe("SUCCESS");
    });

    test("a failure stores the error, because that is what the failure key reads", () => {
      // Storing the request instead would key every failure on the arguments
      // and group nothing with anything.
      const entry = buildToolDispatchLogEntry({
        toolName: "web.fetch",
        toolStatus: "FAILED",
        toolError: "Connection refused.",
        redactedArgsJson: "{}",
      });

      expect(entry.responseContent).toBe("Connection refused.");
      expect(entry.outcome).toBe("FAILED");
    });

    test("only a real success logs SUCCESS", () => {
      // A denied or rehearsed call did not do the work, and the log must not
      // say it did.
      for (const status of ["DENIED", "REHEARSED", "NOT_IMPLEMENTED", "CANCELLED"]) {
        expect(buildToolDispatchLogEntry({
          toolName: "any.tool",
          toolStatus: status,
          toolError: undefined,
          redactedArgsJson: "{}",
        }).outcome).toBe("FAILED");
      }
    });
  });

  describe("reading an agent's answer schema", () => {
    test("no stored schema means an unconstrained run, with nothing to report", () => {
      expect(parseAgentOutputSchema(undefined)).toEqual({ schema: undefined, invalidJson: false });
      expect(parseAgentOutputSchema(null)).toEqual({ schema: undefined, invalidJson: false });
      expect(parseAgentOutputSchema("")).toEqual({ schema: undefined, invalidJson: false });
    });

    test("a valid schema comes back as an object", () => {
      const stored = JSON.stringify({ type: "object", properties: { score: { type: "number" } } });
      expect(parseAgentOutputSchema(stored)).toEqual({
        schema: { type: "object", properties: { score: { type: "number" } } },
        invalidJson: false,
      });
    });

    test("JSON that is not an object is ignored without complaint", () => {
      // "42" parses fine; it just is not a schema. There is nothing to warn
      // the operator about.
      expect(parseAgentOutputSchema("42")).toEqual({ schema: undefined, invalidJson: false });
      expect(parseAgentOutputSchema("\"text\"")).toEqual({ schema: undefined, invalidJson: false });
    });

    test("unparseable JSON is reported rather than thrown", () => {
      // A configuration mistake on a screen must not fail the run; the caller
      // warns and the agent runs unconstrained.
      expect(parseAgentOutputSchema("{not json")).toEqual({ schema: undefined, invalidJson: true });
    });
  });

  describe("sizing the cacheable prompt prefix", () => {
    const turns = [
      { role: "user", parts: [{ text: "First question" }] },
      { role: "model", parts: [{ text: "First answer" }] },
      { role: "user", parts: [{ text: "Second question" }] },
    ];

    test("no stable turns means nothing to cache, whatever else the prompt carries", () => {
      expect(estimateStablePrefixTokens({
        turns,
        stablePrefixTurns: 0,
        systemInstruction: "You are an agent.",
        providerTools: [{ name: "knowledge.search" }],
      })).toBe(0);
    });

    test("counts exactly the stable turns plus the parts re-sent every turn", () => {
      const estimate = estimateStablePrefixTokens({
        turns,
        stablePrefixTurns: 2,
        systemInstruction: "You are an agent.",
        providerTools: [{ name: "knowledge.search" }],
      });

      expect(estimate).toBe(estimatePromptTokens(
        JSON.stringify(turns.slice(0, 2))
          + JSON.stringify("You are an agent.")
          + JSON.stringify([{ name: "knowledge.search" }]),
      ));
      expect(estimate).toBeGreaterThan(0);
    });

    test("a provider with no tool declarations counts as an empty list", () => {
      expect(estimateStablePrefixTokens({
        turns,
        stablePrefixTurns: 2,
        systemInstruction: "You are an agent.",
        providerTools: undefined,
      })).toBe(estimateStablePrefixTokens({
        turns,
        stablePrefixTurns: 2,
        systemInstruction: "You are an agent.",
        providerTools: [],
      }));
    });
  });

  describe("retrying a rejected turn without the cache", () => {
    test("retries only when the cache could be the culprit and nothing was shown", () => {
      expect(shouldRetryTurnWithoutPromptCache({ usedPromptCache: true, streamedChars: 0 })).toBe(true);

      // No cache referenced: the rejection is something else's fault, and a
      // blind retry would repeat it.
      expect(shouldRetryTurnWithoutPromptCache({ usedPromptCache: false, streamedChars: 0 })).toBe(false);

      // Text already reached the reader: a retry would replay the answer from
      // the start.
      expect(shouldRetryTurnWithoutPromptCache({ usedPromptCache: true, streamedChars: 1 })).toBe(false);
    });
  });

  describe("the usage record a run writes about itself", () => {
    const model = { modelId: "vertex-test-model", providerKey: "google", providerModelId: "models/vertex-test-model" };

    test("carries the model identity and the computed spend", () => {
      // Rates are quoted per million tokens: a million input at £1 plus half a
      // million output at £2 is £2 all told.
      expect(buildRunUsagePayload({
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        cachedInputTokens: 0,
        rates: { standardInputCostBelow200k: 1, outputResponseCost: 2 },
        model,
      })).toEqual({
        inputTokens: 1_000_000,
        outputTokens: 500_000,
        costGBP: 2,
        modelId: "vertex-test-model",
        providerKey: "google",
        providerModelId: "models/vertex-test-model",
      });
    });

    test("prices the cached share of input at the cached rate", () => {
      // Kept under the 200k tier boundary, where these rates apply.
      expect(buildRunUsagePayload({
        inputTokens: 100_000,
        outputTokens: 0,
        cachedInputTokens: 100_000,
        rates: { standardInputCostBelow200k: 1, cachedInputCostBelow200k: 0.1 },
        model,
      }).costGBP).toBeCloseTo(0.01, 10);
    });

    test("no rates means spend cannot be measured, so the cost is zero", () => {
      expect(buildRunUsagePayload({
        inputTokens: 1_000_000,
        outputTokens: 1_000_000,
        cachedInputTokens: 0,
        rates: undefined,
        model,
      }).costGBP).toBe(0);
    });
  });
});
