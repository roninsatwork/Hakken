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

type ToolCallStatus = "SUCCESS" | "NOT_IMPLEMENTED" | "FAILED" | "DENIED" | "CANCELLED";

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
  return status === "SUCCESS" ? "SUCCESS" : "FAILED";
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
