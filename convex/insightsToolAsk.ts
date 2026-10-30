"use node";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import { getAgentProviderAdapter } from "./agentProviderRegistry";
import type { AgentToolDeclaration, RuntimeTurn } from "./agentProviderTypes";
import { buildToolInteractionTurns, type ExecutedAgentToolCall } from "./agentRuntimeService";
import { ASK_LIMIT_MS, modelFor, readJson, within, type AskRun } from "./insightsAsk";
import type { TeamMember } from "./insightsTeam";
import { failureSummary } from "./roleRuns";
import type { KeyedRead } from "./utils/agentTools";
import { appError } from "./utils/appError";
import type { Fact } from "./utils/insightFacts";

/**
 * An Insights agent that reads the saved data for itself
 * (stronger-agents-plan-2026-10-30.md A1; Anthony, 2026-10-30: "you said the
 * agent would talk directly to the data"). The agent is given its brief and the
 * page's facts, and tools that read a section's screens through the screens'
 * own functions — saved data only, never Google, never a fetch (AGENTS.md:
 * Insights draws only on what the sections downloaded). It reads as many times
 * as it needs, up to `MOST_TURNS`, then writes. Every number a read hands back
 * carries its own key (`keyedRead`), so the Editor checks what it wrote exactly
 * as it checks the page's own figures. When the Editor sends the words back,
 * the agent is told why and writes once more, in the same conversation, with
 * everything it read still in front of it.
 *
 * Each turn is a model call on the run, with its cost, held by the run's spend
 * limit — one way for every agent, as `ask` does for a single question.
 */

/** A read an agent may make: its declaration, and the read itself, keyed. */
export type AgentTool = {
  declaration: AgentToolDeclaration;
  /** The screen's answer with its figures keyed under `prefix`; or why it could not be read, for the agent to work round. */
  read: (ctx: ActionCtx, args: Record<string, unknown>, prefix: string) => Promise<KeyedRead | { problem: string }>;
};

/** One read the agent made, for the run's log. */
export type AgentRead = { tool: string; args: Record<string, unknown>; figures: number; problem?: string };

/** Turns an agent has at most, its last for writing: enough to read four or five screens, never a crawl. */
export const MOST_TURNS = 6;
/** Times the Editor sends the words back before they stand as sent back. */
const MOST_SENT_BACK = 1;
/** Letters of a turn kept in the run's record of the call. */
const RECORDED = 20_000;

/** What came back: the answer, the figures the agent read, its reads, and why the Editor still sent it back (null when it passed). */
export type ToolAnswer = { answer: unknown; found: Fact[]; reads: AgentRead[]; sentBack: string | null; turns: number };

/** The reads an agent is handed before it starts, as if it had made them: the page's own screen, so it never starts blind. */
export type FirstRead = { tool: string; args: Record<string, unknown> };

export async function askWithTools(
  ctx: ActionCtx,
  run: AskRun,
  member: TeamMember | undefined,
  what: string,
  system: string,
  prompt: string,
  tools: readonly AgentTool[],
  options: {
    /** The Editor's check: why the answer goes back, or null when it stands. Given every figure read so far. */
    check?: (answer: unknown, found: ReadonlyMap<string, Fact>) => string | null;
    /** Reads made for the agent before its first turn. */
    firstReads?: readonly FirstRead[];
    /** What its reads' keys start with, then the read's number: `r` unless agents reading side by side need their own. */
    prefix?: string;
    limitMs?: number;
  } = {},
): Promise<ToolAnswer> {
  const model = await modelFor(ctx, run, member);
  const adapter = getAgentProviderAdapter(model.providerKey);
  const byName = new Map(tools.map((tool) => [tool.declaration.name, tool]));
  const found = new Map<string, Fact>();
  const reads: AgentRead[] = [];
  const deadline = Date.now() + (options.limitMs ?? ASK_LIMIT_MS);
  let readCount = 0;

  /** One read, its figures added to what the agent holds; a refusal goes back to the agent as words. */
  const readOne = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const tool = byName.get(name);
    if (!tool) {
      reads.push({ tool: name, args, figures: 0, problem: "No such read." });
      return { problem: `There is no read called ${name}. The reads are: ${[...byName.keys()].join(", ")}.` };
    }
    readCount += 1;
    try {
      const result = await tool.read(ctx, args, `${options.prefix ?? "r"}${readCount}`);
      if ("problem" in result) {
        reads.push({ tool: name, args, figures: 0, problem: result.problem });
        return { problem: result.problem };
      }
      for (const fact of result.facts) found.set(fact.key, fact);
      reads.push({ tool: name, args, figures: result.facts.length });
      return result.shown;
    } catch (error) {
      const problem = failureSummary(error);
      reads.push({ tool: name, args, figures: 0, problem });
      return { problem };
    }
  };

  // The page's own screen read for the agent first, handed over with its brief.
  const first: Array<{ read: FirstRead; shown: unknown }> = [];
  for (const read of options.firstReads ?? []) first.push({ read, shown: await readOne(read.tool, read.args) });
  const opening = first.length > 0
    ? `${prompt}\n\nRead for you already, with every figure's key:\n${JSON.stringify(first.map((one) => ({ read: one.read.tool, asked: one.read.args, answer: one.shown })))}`
    : prompt;
  const turns: RuntimeTurn[] = [{ role: "user", parts: [{ text: opening }] }];
  let sentBackTimes = 0;
  let lastWhy: string | null = null;
  let lastAnswer: unknown = null;

  for (let turn = 0; turn < MOST_TURNS; turn += 1) {
    const spend = await ctx.runQuery(internal.roleRuns.runSpendLeft, { runId: run.runId });
    if (spend.limitReached) throw appError("CONFLICT", `The run reached its spend limit ($${spend.spentUsd.toFixed(2)}), so ${what} stopped.`);
    const left = deadline - Date.now();
    if (left <= 5_000) break;
    let response;
    let failed = false;
    let failure = "";
    try {
      response = await within(adapter.streamTurn({
        model,
        systemInstruction: system,
        turns,
        tools: tools.map((tool) => tool.declaration),
        temperature: 0.2,
      }, { operation: what }), left);
    } catch (error) {
      failed = true;
      failure = failureSummary(error);
    }
    const asked = turns[turns.length - 1];
    await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
      runId: run.runId,
      companyId: run.companyId,
      actionContext: `Insights: ${what} for ${run.host}${turn > 0 ? ` (turn ${turn + 1})` : ""}`,
      modelId: model.modelId,
      providerKey: model.providerKey,
      providerModelId: model.providerModelId,
      inputTokens: response?.inputTokens ?? 0,
      outputTokens: response?.outputTokens ?? 0,
      promptContent: (turn === 0 ? `${system}\n\n${opening}` : JSON.stringify(asked.parts ?? [])).slice(0, RECORDED),
      responseContent: (failed ? failure : response!.toolCalls.length > 0 ? JSON.stringify(response!.toolCalls) : response!.text).slice(0, RECORDED),
      failed,
    });
    if (failed || !response) throw appError("UPSTREAM_FAILURE", failure || `${what} gave no answer.`);
    if (response.outcome === "REFUSED") throw appError("UPSTREAM_FAILURE", `The model refused ${what}.`);

    if (response.toolCalls.length > 0) {
      const lastRead = turn >= MOST_TURNS - 2;
      const executed: ExecutedAgentToolCall[] = [];
      for (const call of response.toolCalls) {
        const shown = await readOne(call.name, call.args ?? {});
        executed.push({
          name: call.name,
          args: call.args ?? {},
          // The last read says so, inside the read itself: every provider accepts it there.
          responsePayload: lastRead ? { answer: shown, note: "That was your last read. Write your answer now, from what you have read." } : shown,
          ...(call.thoughtSignature ? { thoughtSignature: call.thoughtSignature } : {}),
        });
      }
      turns.push(...buildToolInteractionTurns(executed));
      continue;
    }

    const parsed = readJson(response.text);
    lastAnswer = parsed;
    lastWhy = parsed === null ? "It did not reply with the JSON asked for." : options.check?.(parsed, found) ?? null;
    if (lastWhy === null) return { answer: parsed, found: [...found.values()], reads, sentBack: null, turns: turn + 1 };
    if (sentBackTimes >= MOST_SENT_BACK || turn >= MOST_TURNS - 1) break;
    sentBackTimes += 1;
    turns.push(
      { role: "model", parts: [{ text: response.text }] },
      { role: "user", parts: [{ text: `The Editor sent it back: ${lastWhy} Write it again, to the same rules, as only the JSON asked for. You may read more first.` }] },
    );
  }
  return { answer: lastAnswer, found: [...found.values()], reads, sentBack: lastWhy ?? "It kept reading and never wrote its answer.", turns: turns.length };
}
