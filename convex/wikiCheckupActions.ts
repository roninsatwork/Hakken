"use node";

import { v } from "convex/values";
import { internalAction, type ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { WIKI_CHECKUP_CYCLE_DAYS, WIKI_ROTA_BOUNDS, nextStep, rotaShare, type WikiCheckupStepKey } from "./wikiCheckupRules";
import { countPages, errorLine, followSourceChanges, progress, staffActive, type Scope, type StepState } from "./wikiCheckupSettle";
import { STEP_HANDLERS } from "./wikiCheckupSteps";

/**
 * The daily check-up (wiki-daily-checkup-plan.md): every wiki, every night,
 * taken in, re-linked, gap-filled, re-filed, tagged, checked and corrected,
 * and tidied — in that order, each step its own scheduled action so a large
 * wiki never runs into an action's time limit. A hand-run "Fix this wiki
 * now" is the same steps over every page instead of the night's share.
 *
 * No person is in the loop (Anthony, 2026-11-09). Disputed and out-of-date
 * facts are settled by the plan's rules (`settleDisagreement`), every fix is
 * filed as a revision and audited with the rule that decided it, and nothing
 * is ever written that the wiki's own sources do not say. The one brake is
 * the `autonomousWiki` switch: off, findings become open questions again.
 */

const TOPIC_KINDS: Array<"PRODUCT" | "POLICY" | "ISSUE" | "CLIENT"> = ["PRODUCT", "POLICY", "ISSUE", "CLIENT"];

/** Scheduled the moment a file changes or is removed, so pages follow it at once. */
export const processSourceChanges = internalAction({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args): Promise<{ followed: number }> => {
    const followed = await followSourceChanges({ ctx, companyId: args.companyId }, 10);
    return { followed };
  },
});

/**
 * The run's plan, made once at the start: how much work each step expects,
 * so the bar fills by work done. Nightly, each rota's share is sized so its
 * whole cycle covers every page; a full run plans every page.
 */
async function planRun(ctx: ActionCtx, companyId: Scope, full: boolean): Promise<Record<string, number>> {
  const counts = await countPages(ctx, companyId);
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const topics = TOPIC_KINDS.reduce((sum, kind) => sum + (counts[kind] ?? 0), 0);
  const taggable = topics + (counts.GOAL ?? 0) + (counts.SOURCE ?? 0);
  const share = (eligible: number, cycleDays: number, min: number, max: number) =>
    full ? eligible : rotaShare({ eligible, cycleDays, min, max });
  const bounds = WIKI_ROTA_BOUNDS;
  const plan: Record<string, number> = {
    INTAKE: 1,
    RELINK: share(total, WIKI_CHECKUP_CYCLE_DAYS.links, bounds.links.min, bounds.links.max) + 1,
    GAPS: 1,
    REFILE: share(topics, WIKI_CHECKUP_CYCLE_DAYS.refile, bounds.refile.min, bounds.refile.max),
    TAGS: share(taggable, WIKI_CHECKUP_CYCLE_DAYS.tags, bounds.tags.min, bounds.tags.max),
    CORRECT: share(topics, WIKI_CHECKUP_CYCLE_DAYS.contradictions, bounds.contradictions.min, bounds.contradictions.max) + 1,
    TIDY: 1,
  };
  for (const kind of TOPIC_KINDS) plan[`count_${kind}`] = counts[kind] ?? 0;
  return plan;
}

const STEP_ORDER: WikiCheckupStepKey[] = ["INTAKE", "RELINK", "GAPS", "REFILE", "TAGS", "CORRECT", "TIDY"];

/** Planned work up to and including a step — or all of it. */
function plannedUnits(plan: Record<string, number>, through?: WikiCheckupStepKey): number {
  const last = through ? STEP_ORDER.indexOf(through) : STEP_ORDER.length - 1;
  return STEP_ORDER.slice(0, last + 1).reduce((sum, key) => sum + (plan[key] ?? 0), 0);
}

/** One step of one run; schedules the next step, or itself to continue. */
export const runCheckupStep = internalAction({
  args: {
    runId: v.id("wikiCheckupRuns"),
    stepKey: v.union(
      v.literal("INTAKE"),
      v.literal("RELINK"),
      v.literal("GAPS"),
      v.literal("REFILE"),
      v.literal("TAGS"),
      v.literal("CORRECT"),
      v.literal("TIDY")
    ),
    state: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<void> => {
    const run = await ctx.runQuery(internal.wikiCheckup.getRunInternal, { runId: args.runId });
    if (!run || run.status !== "RUNNING") return;
    const companyId = run.companyId ?? undefined;
    const full = run.mode === "FULL";
    let state: StepState = {};
    try {
      state = args.state ? (JSON.parse(args.state) as StepState) : {};
    } catch {
      state = {};
    }
    try {
      if (args.stepKey === "INTAKE" && !state.plan) {
        await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
        if (!(await staffActive(ctx, "WIKI_CHECKUP"))) {
          await ctx.runMutation(internal.wikiCheckup.finishRunInternal, {
            runId: run._id,
            status: "FAILED",
            error: "The Wiki check-up agent is switched off on the Agents screen.",
          });
          return;
        }
        state.plan = await planRun(ctx, companyId, full);
        await progress({ ctx, run }, { stepKey: "INTAKE", total: plannedUnits(state.plan) });
      } else if (!state.stepDone) {
        await progress({ ctx, run }, { stepKey: args.stepKey });
      }

      const result = await STEP_HANDLERS[args.stepKey]({ ctx, run, companyId, full, state, startedAt: Date.now() });
      if (result.done) await progress({ ctx, run }, { done: result.done });
      if (!result.again && state.plan) {
        // A step that found less to do than planned still counts as done,
        // so the bar reaches the step's mark before the next one starts.
        await ctx.runMutation(internal.wikiCheckup.advanceRunInternal, {
          runId: run._id,
          atLeastDone: plannedUnits(state.plan, args.stepKey),
        });
      }
      if (result.again) {
        await ctx.scheduler.runAfter(0, internal.wikiCheckupActions.runCheckupStep, {
          runId: run._id,
          stepKey: args.stepKey,
          state: JSON.stringify(result.state ?? state),
        });
        return;
      }
      const next = nextStep(args.stepKey);
      if (next) {
        await ctx.scheduler.runAfter(0, internal.wikiCheckupActions.runCheckupStep, {
          runId: run._id,
          stepKey: next,
          state: JSON.stringify({ plan: state.plan }),
        });
        return;
      }
      const finished = await ctx.runMutation(internal.wikiCheckup.finishRunInternal, { runId: run._id, status: "SUCCESS" });
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_CHECKUP",
        companyId,
        trigger: run.trigger === "NIGHTLY" ? "SCHEDULE" : "EVENT",
        objective: full ? "The whole check-up over every page, started by hand." : "The nightly check-up.",
        summary: finished?.summary ?? "Finished.",
        startedAt: run.startedAt,
      });
    } catch (error) {
      console.error("The wiki check-up failed part-way; it stops where it got to", error);
      await ctx.runMutation(internal.wikiCheckup.finishRunInternal, { runId: run._id, status: "FAILED", error: errorLine(error) });
      await ctx.runMutation(internal.wikiStaff.recordStaffRunInternal, {
        systemKey: "WIKI_CHECKUP",
        companyId,
        trigger: run.trigger === "NIGHTLY" ? "SCHEDULE" : "EVENT",
        objective: full ? "The whole check-up over every page, started by hand." : "The nightly check-up.",
        summary: `Stopped at the step "${args.stepKey}": ${errorLine(error)}`,
        startedAt: run.startedAt,
      });
    }
  },
});

/** Start a check-up on every wiki: the nightly job, or "All wikis" from Run. */
async function startEveryWiki(ctx: ActionCtx, trigger: "NIGHTLY" | "MANUAL"): Promise<number> {
  await ctx.runMutation(internal.wikiStaff.ensureWikiStaffAgentsInternal, {});
  if (!(await staffActive(ctx, "WIKI_CHECKUP"))) return 0;
  const scopes = new Set<string>();
  for (const scope of await ctx.runQuery(internal.wikiCheckup.listWikiScopesInternal, {})) scopes.add(scope ?? "");
  // A company with documents waiting but no page yet still needs its intake.
  for (const companyId of await ctx.runQuery(internal.wikiDistill.listCompaniesWithUndistilledInternal, {})) scopes.add(companyId);
  if (await ctx.runQuery(internal.wikiDistill.hasGlobalUndistilledInternal, {})) scopes.add("");
  let started = 0;
  for (const scope of scopes) {
    const companyId = scope ? (scope as Id<"companies">) : undefined;
    const result = await ctx.runMutation(internal.wikiCheckup.beginRunInternal, {
      ...(companyId ? { companyId } : {}),
      trigger,
      mode: trigger === "NIGHTLY" ? "SLICE" : "FULL",
    });
    if (result.alreadyRunning) continue;
    await ctx.scheduler.runAfter(0, internal.wikiCheckupActions.runCheckupStep, { runId: result.runId, stepKey: "INTAKE" });
    started += 1;
  }
  return started;
}

export const dailyCheckupDispatcher = internalAction({
  args: {},
  handler: async (ctx): Promise<{ wikis: number }> => ({ wikis: await startEveryWiki(ctx, "NIGHTLY") }),
});

export const checkupEveryWikiNow = internalAction({
  args: {},
  handler: async (ctx): Promise<{ wikis: number }> => ({ wikis: await startEveryWiki(ctx, "MANUAL") }),
});
