import { calculateModelCostGBP, type ModelCostRates } from "./aiCostService";
import { estimatePromptTokens } from "./promptCacheService";
import {
  buildToolFailureResult,
  buildToolResultPayload,
  isNotImplementedToolResult,
  type ToolSideEffectLevel,
} from "./aiToolExecutionService";

/**
 * Default budget for a run.
 *
 * Four steps and three tool calls was too tight for real work: an agent that
 * looks something up, checks a second source and then answers had no room left.
 * Ten was better and still short — a research agent that reads a handful of
 * pages and writes them up spends its whole budget on the reading. Raised to
 * twenty-five steps, twenty-five tool calls and thirty minutes at Anthony's
 * instruction, 2026-08-02.
 *
 * Spend is what actually bounds a run, not the step count: the $10 cost ceiling
 * stops a runaway long before a hundred steps could. The counts are there to
 * catch a loop that is cheap and going nowhere.
 */
export const DEFAULT_AGENT_OBJECTIVE_LIMITS = {
  maxSteps: 25,
  maxToolCalls: 25,
  maxRuntimeMs: 30 * 60 * 1000,
  /**
   * A million, at Anthony's instruction, 2026-08-02.
   *
   * It was 200,000, which sounds generous and is not: every page an agent reads
   * is re-sent on every turn after it, so half a dozen pages exhaust it while
   * steps, tool calls, minutes and spend are all still far from theirs. Runs
   * were stopping on a ceiling nobody could see or raise.
   *
   * This is the same number as the platform ceiling, so an agent gets the full
   * room unless it is deliberately given less. What still bounds a runaway is
   * spend, steps, tool calls and minutes — the four that were doing the work
   * all along.
   */
  maxInputTokens: 1000000,
  /**
   * Cumulative across the whole run, not per reply.
   *
   * Twenty thousand was the same trap as the old input budget: eight or nine
   * substantial replies exhaust it, so a long run stopped on a number that
   * appears on no screen and can be set by nobody. Held at a tenth of the input
   * budget, which is the shape these runs actually have — they read far more
   * than they write.
   */
  maxOutputTokens: 100000,
  maxCostGBP: 10,
} as const;

/**
 * Budget used when the model has no pricing configured.
 *
 * Cost is computed from rates on the model record; with none set it always
 * evaluates to zero and the cost ceiling never fires. Step and tool counts are
 * then the only thing bounding spend, so they stay at the original conservative
 * values. Configure pricing on the model to unlock the fuller budget.
 */
export const UNPRICED_MODEL_OBJECTIVE_LIMITS = {
  maxSteps: 4,
  maxToolCalls: 3,
  maxRuntimeMs: 120000,
  maxInputTokens: 200000,
  maxOutputTokens: 20000,
  maxCostGBP: 1,
} as const;

/**
 * Hard platform ceilings.
 *
 * Per-agent limits let an agent be given more room than the default, but not
 * unbounded room: a misconfigured agent must not be able to spend without
 * limit or hold a Convex action open past its execution window. Anything above
 * these is clamped down rather than rejected, so a bad number degrades to the
 * maximum instead of failing the run.
 */
export const AGENT_OBJECTIVE_LIMIT_CEILINGS = {
  /**
   * Five hundred, at Anthony's instruction, 2026-08-03.
   *
   * A hundred was set when a run meant one customer or one chain. A research
   * run works a queue of them, and the count is what would end it first: the
   * one clean chain measured used thirteen tool calls for nine sites, so ten
   * customers or a large estate is already most of a hundred.
   *
   * Raising these does not raise what a run may spend. Cost, minutes and the
   * token budget are untouched, and on current pricing the $50 spend ceiling
   * is reached long before five hundred calls — which is the intended order:
   * spend bounds a runaway, the counts catch a loop that is cheap and going
   * nowhere.
   */
  maxSteps: 500,
  maxToolCalls: 500,
  // A single Convex action is capped at about ten minutes, but a run is no
  // longer one action: it checkpoints every three minutes and resumes in a
  // fresh one (`agentRunContinuationService.ts`), so the hour below is spent
  // across roughly twenty handovers rather than in one window. The segment
  // backstop there has to stay above that count or it, not this, ends the run.
  maxRuntimeMs: 60 * 60 * 1000,
  maxInputTokens: 10000000,
  maxOutputTokens: 1000000,
  maxCostGBP: 50,
} as const;

export type AgentObjectiveLimits = {
  maxSteps: number;
  maxToolCalls: number;
  maxRuntimeMs: number;
  maxInputTokens: number;
  maxOutputTokens: number;
  maxCostGBP: number;
};

/** Per-agent overrides, as stored on the agent record. All optional. */
export type AgentLimitOverrides = {
  maxSteps?: number;
  maxToolCalls?: number;
  maxRuntimeMs?: number;
  maxInputTokens?: number;
  maxCostGBP?: number;
};

function clampLimit(
  value: number | undefined,
  fallback: number,
  ceiling: number,
  options: { integer?: boolean } = {},
) {
  // Ignore anything that is not a usable positive number, including NaN and
  // values arriving from older records.
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return fallback;
  const bounded = Math.min(value, ceiling);
  // Counts and milliseconds are whole numbers; money is not. Flooring a cost
  // limit turned every budget under $1 into $0, which is a budget no run can
  // start under. Harmless while these fields were unreachable; a foot-gun the
  // moment they appear on a screen.
  return options.integer === false ? bounded : Math.floor(bounded);
}

/** The per-agent limits an admin may override, and the ceiling for each. */
export const AGENT_LIMIT_OVERRIDE_FIELDS = [
  "maxSteps",
  "maxToolCalls",
  "maxRuntimeMs",
  // The ceiling that actually stops a research run, and the one nobody could
  // see. Every page an agent reads is fed back into the model and re-sent on
  // every turn after it, so reading half a dozen pages exhausts the input
  // budget long before steps, tool calls, minutes or spend come near theirs.
  // It was fixed in the platform, absent from the agent record, and absent
  // from the screen headed "What bounds it" — so a run that stopped on it
  // looked, to anyone reading that screen, as though it had stopped for no
  // reason at all.
  "maxInputTokens",
  "maxCostGBP",
] as const;

export type AgentLimitOverrideField = (typeof AGENT_LIMIT_OVERRIDE_FIELDS)[number];

/**
 * Clamp one override on the way in, so the stored record says what will run.
 *
 * Read-time clamping in `resolveAgentObjectiveLimits` already protects the run,
 * but a record holding 500 while the run uses 24 makes the settings screen lie.
 *
 * `undefined` means inherit the platform default, and anything unusable — zero,
 * negative, NaN — resolves to that rather than being rejected. A cleared box and
 * a nonsense number should both mean "use the default", which is what read-time
 * clamping already does with them.
 */
export function clampAgentLimitOverride(
  field: AgentLimitOverrideField,
  value: number | undefined,
): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return undefined;
  const ceiling = AGENT_OBJECTIVE_LIMIT_CEILINGS[field];
  const bounded = Math.min(value, ceiling);
  return field === "maxCostGBP" ? bounded : Math.floor(bounded);
}

/**
 * Whether spend can actually be measured for a model.
 *
 * `calculateModelCostGBP` multiplies token counts by the rates on the model
 * record. When those rates are absent it returns 0, so the cost budget can
 * never trigger — the run is effectively uncapped on spend, silently.
 *
 * This matters because the cost ceiling is what makes a generous step budget
 * safe. Without it, step and tool counts are the only thing bounding spend.
 */
export function isModelCostMeasurable(
  model: { standardInputCostBelow200k?: number; outputResponseCost?: number } | null | undefined,
) {
  const input = model?.standardInputCostBelow200k ?? 0;
  const output = model?.outputResponseCost ?? 0;
  return input > 0 || output > 0;
}

/**
 * Resolve the limits a run should use.
 *
 * These were module constants, so every agent on the platform shared one
 * budget — a trivial classifier and a deep research task got the same four
 * steps. This takes the agent's own settings where present, falls back to the
 * platform defaults, and clamps to the ceilings above.
 *
 * When the model has no pricing configured, spend cannot be measured, so the
 * cost ceiling is not protecting anything. In that case the step and tool
 * budgets are held at the conservative defaults however the agent is
 * configured: they become the only backstop, so they must stay tight.
 */
export function resolveAgentObjectiveLimits(
  overrides: AgentLimitOverrides | null | undefined,
  options: { costMeasurable?: boolean } = {},
): AgentObjectiveLimits {
  if (options.costMeasurable === false) {
    const capped = UNPRICED_MODEL_OBJECTIVE_LIMITS;
    return {
      ...capped,
      // Honour a *lower* configured budget; never a higher one.
      maxSteps: Math.min(clampLimit(overrides?.maxSteps, capped.maxSteps, capped.maxSteps), capped.maxSteps),
      maxToolCalls: Math.min(clampLimit(overrides?.maxToolCalls, capped.maxToolCalls, capped.maxToolCalls), capped.maxToolCalls),
      maxRuntimeMs: Math.min(clampLimit(overrides?.maxRuntimeMs, capped.maxRuntimeMs, capped.maxRuntimeMs), capped.maxRuntimeMs),
    };
  }

  return {
    maxSteps: clampLimit(overrides?.maxSteps, DEFAULT_AGENT_OBJECTIVE_LIMITS.maxSteps, AGENT_OBJECTIVE_LIMIT_CEILINGS.maxSteps),
    maxToolCalls: clampLimit(overrides?.maxToolCalls, DEFAULT_AGENT_OBJECTIVE_LIMITS.maxToolCalls, AGENT_OBJECTIVE_LIMIT_CEILINGS.maxToolCalls),
    maxRuntimeMs: clampLimit(overrides?.maxRuntimeMs, DEFAULT_AGENT_OBJECTIVE_LIMITS.maxRuntimeMs, AGENT_OBJECTIVE_LIMIT_CEILINGS.maxRuntimeMs),
    maxInputTokens: clampLimit(
      overrides?.maxInputTokens,
      DEFAULT_AGENT_OBJECTIVE_LIMITS.maxInputTokens,
      AGENT_OBJECTIVE_LIMIT_CEILINGS.maxInputTokens,
    ),
    maxOutputTokens: DEFAULT_AGENT_OBJECTIVE_LIMITS.maxOutputTokens,
    maxCostGBP: clampLimit(
      overrides?.maxCostGBP,
      DEFAULT_AGENT_OBJECTIVE_LIMITS.maxCostGBP,
      AGENT_OBJECTIVE_LIMIT_CEILINGS.maxCostGBP,
      { integer: false },
    ),
  };
}

type ToolCallStatus = "SUCCESS" | "NOT_IMPLEMENTED" | "FAILED" | "DENIED" | "CANCELLED" | "REHEARSED";

/**
 * How a tool outcome appears in the run's step timeline.
 *
 * `NOT_IMPLEMENTED` maps to FAILED rather than SKIPPED. SKIPPED would read as a
 * deliberate decision not to run the tool, when in fact the agent asked for
 * something the platform cannot do and the objective is that much further from
 * being met. Recording that as anything softer than a failure is the same
 * flattery as recording it as a success — the run genuinely did not do what it
 * set out to. The precise reason stays on the tool call itself.
 */
export function getAgentStepStatusFromToolStatus(status: ToolCallStatus) {
  // A rehearsed call is the drill going to plan, not a failure: the agent
  // asked for the right write and the platform recorded it as intended.
  return status === "SUCCESS" || status === "REHEARSED" ? "SUCCESS" : "FAILED";
}

export function shouldStopForToolBudget(args: {
  requestedToolCalls: number;
  completedToolCalls: number;
  maxToolCalls: number;
}) {
  return args.requestedToolCalls > 0 && args.completedToolCalls >= args.maxToolCalls;
}

export function shouldStopForRuntimeBudget(args: { elapsedMs: number; maxRuntimeMs: number }) {
  return args.elapsedMs >= args.maxRuntimeMs;
}

export function shouldStopForTokenBudget(args: {
  inputTokens: number;
  outputTokens: number;
  maxInputTokens: number;
  maxOutputTokens: number;
}) {
  return args.inputTokens >= args.maxInputTokens || args.outputTokens >= args.maxOutputTokens;
}

export function shouldStopForCostBudget(args: { costGBP: number; maxCostGBP: number }) {
  return args.costGBP >= args.maxCostGBP;
}

export function getToolBudgetStopMessage(maxToolCalls: number) {
  return `Agent stopped after reaching the maximum tool-call limit of ${maxToolCalls}.`;
}

/**
 * Why a run that used every step it had ended.
 *
 * The step loop is the one budget with no explicit stop: it simply runs out of
 * iterations. That left the run with no reason recorded, and the fallback said
 * it had hit the tool-call limit — a bound it may not have touched. Someone
 * raising tool calls to fix it would see no change, because the tool calls were
 * never the problem.
 */
export function getStepBudgetStopMessage(maxSteps: number) {
  return `Agent stopped after reaching the maximum step limit of ${maxSteps}.`;
}

export function getRuntimeBudgetStopMessage(maxRuntimeMs: number) {
  return `Agent stopped after reaching the maximum runtime limit of ${Math.round(maxRuntimeMs / 1000)} seconds.`;
}

export function getTokenBudgetStopMessage() {
  return "Agent stopped after reaching the configured token budget.";
}

export function getCostBudgetStopMessage(maxCostGBP: number) {
  return `Agent stopped after reaching the maximum cost limit of GBP ${maxCostGBP.toFixed(2)}.`;
}

/**
 * A stable identity for "this tool with these arguments".
 *
 * Used to recognise a call a person has already refused. Object keys are sorted
 * because two requests for the same thing must produce the same key — otherwise a
 * model that re-serialises its arguments differently would slip past the check and
 * the reviewer would be asked again.
 */
export function buildRefusedToolCallKey(toolName: string, argumentsJson: string) {
  const stable = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(stable);
    if (value !== null && typeof value === "object") {
      return Object.keys(value as Record<string, unknown>)
        .sort()
        .reduce<Record<string, unknown>>((acc, key) => {
          acc[key] = stable((value as Record<string, unknown>)[key]);
          return acc;
        }, {});
    }
    return value;
  };

  let normalizedArgs: string;
  try {
    normalizedArgs = JSON.stringify(stable(JSON.parse(argumentsJson) as unknown));
  } catch {
    // Unreadable arguments still get a key, so an identical unreadable retry is
    // still recognised rather than being waved through.
    normalizedArgs = argumentsJson;
  }

  return `${toolName}:${normalizedArgs}`;
}

export function parseRefusedToolCalls(refusedToolCallsJson: string | undefined): string[] {
  if (!refusedToolCallsJson) return [];
  try {
    const parsed = JSON.parse(refusedToolCallsJson) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

/** Capped, because the list rides along on the run document. */
const REFUSED_TOOL_CALL_LIMIT = 50;

export function appendRefusedToolCall(refusedToolCallsJson: string | undefined, key: string) {
  const existing = parseRefusedToolCalls(refusedToolCallsJson);
  if (existing.includes(key)) return JSON.stringify(existing);
  return JSON.stringify([...existing, key].slice(-REFUSED_TOOL_CALL_LIMIT));
}

/**
 * What the model is told when a person refuses a call.
 *
 * A rejection used to end the run outright with the model told nothing, so from
 * the agent's side the conversation stopped mid-thought and the objective — often
 * most of the way done — was thrown away. Telling it plainly lets it find another
 * route, and carrying the reviewer's own words through is the most useful thing
 * that can reach it. That reason was stored and read by nothing.
 */
export function getRefusedToolCallMessage(toolName: string, reason?: string) {
  const base = `A person reviewed this request and refused it. Do not call ${toolName} with these arguments again.`;
  const explanation = reason?.trim()
    ? ` Reason given: ${reason.trim()}`
    : "";
  return `${base}${explanation} Find another way to complete the objective, or explain to the user what you cannot do.`;
}

export type ExecutedAgentToolCall = {
  name: string;
  args: Record<string, unknown>;
  responsePayload: unknown;
  /** See `AgentTurnToolCall.thoughtSignature`. Absent for providers that issue none. */
  thoughtSignature?: string;
};

/**
 * Build the conversation turns recording a batch of tool calls and their results.
 *
 * A model turn may request several tool calls at once. The provider contract is
 * that one model turn carrying N `functionCall` parts is answered by one
 * function turn carrying the matching N `functionResponse` parts, in the same
 * order.
 *
 * The runtime previously executed only `functionCalls[0]` and appended a single
 * response, so whenever a model requested parallel calls the remaining ones
 * were silently dropped and the transcript no longer matched what the model had
 * asked for — a wrong answer rather than an error.
 *
 * The model turn is rebuilt here rather than kept as the provider returned it,
 * which is why a thought signature has to be carried on the call and put back on
 * the part. A model that issued one requires it back and fails the whole run
 * without it, and a rebuilt turn is precisely where it goes missing.
 */
export function buildToolInteractionTurns(calls: ExecutedAgentToolCall[]) {
  if (calls.length === 0) return [];

  return [
    {
      role: "model",
      parts: calls.map((call) => ({
        functionCall: { name: call.name, args: call.args },
        ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
      })),
    },
    {
      role: "function",
      parts: calls.map((call) => ({
        functionResponse: {
          name: call.name,
          response: { name: call.name, content: call.responsePayload },
        },
      })),
    },
  ];
}

/**
 * Does denying this tool call mean "ask a person", rather than "no"?
 *
 * `canExecuteTool` refuses for several reasons — wrong role, wrong tenant, or
 * simply that the tool wants a human to confirm before it runs. Only the last
 * one is an invitation: the run parks and waits for an approval instead of
 * failing the call. The sentence is matched in full because it is the contract
 * with `canExecuteTool`; a substring match would one day catch a differently
 * worded hard denial and park a run nobody is coming to approve.
 */
export function isConfirmationRequiredDenial(reason?: string) {
  return reason === "Tool execution requires explicit user confirmation.";
}

/**
 * Should this tool call park the run and wait for a person?
 *
 * Only a call that is otherwise sound gets to ask: a refused call is answered
 * with the standing refusal, invalid arguments are answered with the validation
 * errors, and a rehearsal records the write instead of asking anyone. What is
 * left is a well-formed call whose only obstacle is that the tool wants a human
 * to confirm — the one denial that means "not yet" rather than "no".
 */
export function shouldRequestToolApproval(args: {
  isRehearsalRun: boolean;
  wasRefused: boolean;
  schemaValidationOk: boolean;
  accessDecision: { allowed: boolean; reason?: string };
}) {
  return (
    !args.isRehearsalRun &&
    !args.wasRefused &&
    args.schemaValidationOk &&
    !args.accessDecision.allowed &&
    isConfirmationRequiredDenial(args.accessDecision.reason)
  );
}

/**
 * A tool outcome that was decided without running anything.
 *
 * `responsePayload` is what the model is told, `error` is what the run's own
 * records say, and `status` is how the call appears on the timeline. All three
 * are decided together so a branch cannot tell the model one thing and the
 * operator another.
 */
export type ResolvedToolCallOutcome = {
  status: "DENIED" | "FAILED" | "REHEARSED";
  error?: string;
  responsePayload: unknown;
};

/**
 * Decide a tool call's outcome without executing it, where that is possible.
 *
 * Most of what happens to a requested tool call is decided before any tool
 * runs: a call a person already refused is answered with that refusal, bad
 * arguments are answered with the validation errors, a rehearsal records a
 * write instead of performing it, a denial is a denial, and a tool the
 * platform has never heard of cannot run at all. Returns undefined only when
 * every one of those gates has passed — the call must actually execute, and
 * execution is the caller's job because it has side effects.
 *
 * The order of the checks is part of the behaviour. A refusal wins over
 * everything — the person's decision stands even when the arguments are also
 * invalid — and the unknown-tool check comes last so a refused or denied call
 * is reported as refused or denied, not as unknown.
 */
export function resolveToolCallWithoutExecution(args: {
  toolName: string;
  wasRefused: boolean;
  schemaValidation: { ok: boolean; errors: string[] };
  isRehearsalRun: boolean;
  toolMetadata: { sideEffectLevel: ToolSideEffectLevel } | undefined;
  accessDecision: { allowed: boolean; reason?: string };
}): ResolvedToolCallOutcome | undefined {
  if (args.wasRefused) {
    const error = getRefusedToolCallMessage(args.toolName);
    return {
      status: "DENIED",
      error,
      responsePayload: buildToolResultPayload({ status: "error", error }),
    };
  }

  if (!args.schemaValidation.ok) {
    const error = args.schemaValidation.errors.join(" ");
    return {
      status: "FAILED",
      error,
      responsePayload: buildToolResultPayload({ status: "error", error }),
    };
  }

  if (
    args.isRehearsalRun &&
    args.toolMetadata &&
    args.toolMetadata.sideEffectLevel !== "READ" &&
    (args.accessDecision.allowed || isConfirmationRequiredDenial(args.accessDecision.reason))
  ) {
    // Rehearsal: the write is recorded with its arguments, not performed —
    // including writes an autonomous agent would have been allowed to make
    // without asking. Reads execute for real; hard denials (role, tenant)
    // still deny below.
    return {
      status: "REHEARSED",
      responsePayload: buildToolResultPayload({
        status: "success",
        data: {
          rehearsed: true,
          note: "Rehearsal run: this action was recorded as would-execute and NOT performed. Continue as if it succeeded.",
        },
      }),
    };
  }

  if (!args.accessDecision.allowed) {
    return {
      status: "DENIED",
      error: args.accessDecision.reason,
      responsePayload: buildToolFailureResult(new Error(args.accessDecision.reason)),
    };
  }

  if (!args.toolMetadata) {
    const error = "Unknown tool requested by model.";
    return {
      status: "FAILED",
      error,
      responsePayload: buildToolResultPayload({ status: "error", error }),
    };
  }

  return undefined;
}

/**
 * Classify what a tool that actually ran came back with.
 *
 * A declared connector with nothing behind it returns normally, so without the
 * not-implemented check the run log recorded a green tick against a call that
 * did nothing at all. The model is told plainly, so it stops trying and says so
 * rather than reporting the job done.
 */
export function classifyExecutedToolResult(args: { toolName: string; result: unknown }): {
  status: "SUCCESS" | "NOT_IMPLEMENTED";
  error?: string;
  responsePayload: unknown;
} {
  const notImplemented = isNotImplementedToolResult(args.result);
  return {
    status: notImplemented ? "NOT_IMPLEMENTED" : "SUCCESS",
    error: notImplemented ? "Connector is declared but has no implementation." : undefined,
    responsePayload: buildToolResultPayload({
      status: notImplemented ? "error" : "success",
      data: notImplemented ? undefined : args.result,
      error: notImplemented
        ? `The ${args.toolName} tool is not available on this platform. Do not retry it; tell the user this capability is not connected.`
        : undefined,
    }),
  };
}

/**
 * What the MODEL step row records for one completed model turn.
 *
 * The input says where in the loop the turn happened; the output is the model's
 * own words, or — when the turn was pure tool requests with no narration — the
 * list of calls it made, so the timeline never shows a blank step.
 */
export function buildModelStepRecord(args: {
  loopIndex: number;
  completedToolCalls: number;
  responseText: string | undefined;
  toolCallNames: string[];
}) {
  return {
    input: JSON.stringify({ loopIndex: args.loopIndex, completedToolCalls: args.completedToolCalls }),
    output: args.responseText || JSON.stringify({
      functionCalls: args.toolCallNames.map((name) => ({ name })),
    }),
  };
}

/**
 * The raw-log entry for a tool call that has resolved, whichever way.
 *
 * On failure the error is what gets stored, because that is what the failure
 * key is derived from — storing the request instead would key every failure on
 * the arguments and group nothing with anything. The outcome is SUCCESS only
 * for an actual success: a rehearsed or denied call did not do the work, and
 * the log must not say it did.
 */
export function buildToolDispatchLogEntry(args: {
  toolName: string;
  toolStatus: string;
  toolError: string | undefined;
  redactedArgsJson: string;
}) {
  return {
    interactionType: `TOOL DISPATCH: ${args.toolName}`,
    responseContent: args.toolError
      ?? `{"functionCall": {"name": "${args.toolName}", "args": ${args.redactedArgsJson}}}`,
    outcome: args.toolStatus === "SUCCESS" ? ("SUCCESS" as const) : ("FAILED" as const),
  };
}

/**
 * Read the fixed answer shape an agent asks for, if it asks for one.
 *
 * An unparseable schema is reported rather than thrown: it is a configuration
 * mistake on a screen, and refusing to run the agent at all would be a worse
 * answer than running it unconstrained. The caller decides what to do with
 * `invalidJson` — today, a warning in the run's log. JSON that parses to
 * something other than an object is simply ignored: there is nothing to warn
 * about, it just is not a schema.
 */
export function parseAgentOutputSchema(stored: string | null | undefined): {
  schema: Record<string, unknown> | undefined;
  invalidJson: boolean;
} {
  if (!stored) return { schema: undefined, invalidJson: false };
  try {
    const parsed = JSON.parse(stored) as unknown;
    return {
      schema: parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined,
      invalidJson: false,
    };
  } catch {
    return { schema: undefined, invalidJson: true };
  }
}

/**
 * How big the never-changing head of the prompt is, in estimated tokens.
 *
 * This is the number that decides whether an explicit provider-side cache is
 * worth paying for: the stable turns plus the system instruction plus the tool
 * declarations, because all three are re-sent on every turn of the run. Zero
 * stable turns means zero — there is nothing to cache, whatever else the
 * prompt carries.
 */
export function estimateStablePrefixTokens(args: {
  turns: unknown[];
  stablePrefixTurns: number;
  systemInstruction: unknown;
  providerTools: unknown;
}) {
  if (args.stablePrefixTurns <= 0) return 0;
  return estimatePromptTokens(
    JSON.stringify(args.turns.slice(0, args.stablePrefixTurns))
      + JSON.stringify(args.systemInstruction)
      + JSON.stringify(args.providerTools ?? []),
  );
}

/**
 * Is a rejected model call worth retrying without the prompt cache?
 *
 * Only when the cache could be the culprit — the request actually referenced
 * one — and only while nothing has been shown to the reader. After that a
 * retry would replay the answer from the start, which is the same rule the
 * streaming retry policy follows.
 */
export function shouldRetryTurnWithoutPromptCache(args: {
  usedPromptCache: boolean;
  streamedChars: number;
}) {
  return args.usedPromptCache && args.streamedChars === 0;
}

/**
 * Assemble the usage record a run writes about itself.
 *
 * Every terminal path — success, budget stop, cancellation, parking for an
 * approval — records the same shape, and the cost figure inside it must be
 * computed the same way each time or two screens would disagree about what one
 * run spent. Built here once so a path cannot drift.
 */
export function buildRunUsagePayload(args: {
  inputTokens: number;
  outputTokens: number;
  /** The share of `inputTokens` the provider served from cache, priced separately. */
  cachedInputTokens: number;
  rates: ModelCostRates | null | undefined;
  model: { modelId: string; providerKey: string; providerModelId?: string };
}) {
  return {
    inputTokens: args.inputTokens,
    outputTokens: args.outputTokens,
    costGBP: calculateModelCostGBP({
      inputTokens: args.inputTokens,
      outputTokens: args.outputTokens,
      cachedInputTokens: args.cachedInputTokens,
      rates: args.rates,
    }),
    modelId: args.model.modelId,
    providerKey: args.model.providerKey,
    providerModelId: args.model.providerModelId,
  };
}
