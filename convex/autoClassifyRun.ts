"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalAction, type ActionCtx } from "./_generated/server";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { prepareDecisions, runDecisions, type DecisionResult } from "./decisionActions";
import { appErrorMessage } from "./utils/appError";
import { AUTO_CLASSIFY_DECISION, DESCRIPTION_LENGTH, GROUP_LABELS, tidyDescription } from "./utils/autoClassify";
import { ASKS_AT_ONCE, PAGES_PER_STEP } from "./utils/autoClassifyAgent";

/**
 * One step of a website's Auto Classify run
 * (docs/plans/active/auto-classify-plan.md, AC3–AC8, AC10). Groups without a
 * description are described first, by the platform's stored writing model;
 * then the next hundred pages are asked of the "Which group is this page in?"
 * Decision, eight at a time, and the step hands on to the next until nothing
 * is left. Every answer is filed under the run (`links.agentRunId`), every
 * model call is priced on the run and the cost screens
 * (`roleRuns.recordRunModelCall`), and each step is a line on the run's
 * timeline and in its log — so the run reads in Agents and the observatory
 * like any collector's.
 *
 * It stops, saying why, rather than go round: switched off, the spend limit
 * reached, or the model not answering — whatever is left is asked on the next
 * run, which nothing needs to press.
 */

type HoldId = Id<"companyWebsites">;
type RunId = Id<"agentRuns">;

/** The most steps one run takes: every page read, a hundred a step, with room to spare — a guard against going round, never reached. */
const MOST_STEPS = 140;

/** How a group's description is written: for any kind of website, plain, saying what belongs and what doesn't (AC8). */
const DESCRIBE_INSTRUCTION = [
  "You write the description of one group of pages on a business's website.",
  "Another model reads it to decide which of the website's pages belong in this group, so it must say plainly what belongs and what does not.",
  `Write in English, in plain words, in two or three sentences and no more than ${DESCRIPTION_LENGTH} characters.`,
  "Start with the kinds of page that belong, in the words the website itself uses, with a few concrete examples taken from the group's name, its rules and its busiest pages: products, services, topics or places, whatever this business offers.",
  "Then name the nearest thing that does not belong and the other group it goes in instead, when one of the other groups listed fits.",
  "It must work for any kind of website: a shop, a service firm, a brand, a publisher or a charity.",
  "Do not praise the business, do not invent anything the pages do not show, and do not use lists, headings or quotation marks.",
  "Reply with the description only.",
].join(" ");

const count = (n: number) => n.toLocaleString("en-GB");
const names = (all: string[]) => (all.length <= 1 ? all.join("") : `${all.slice(0, -1).join(", ")} and ${all[all.length - 1]}`);

type Job = NonNullable<Awaited<ReturnType<typeof readJob>>>;
async function readJob(ctx: ActionCtx, companyWebsiteId: HoldId, runId: RunId) {
  return await ctx.runQuery(internal.autoClassifySteps.stepWork, { companyWebsiteId, runId });
}

/** One group described by the writing model: saved when it still has none; "LIMIT" when the run's spend limit is reached. */
async function describeGroup(ctx: ActionCtx, job: Job, group: Job["undescribed"][number], runId: RunId): Promise<boolean | "LIMIT"> {
  let model;
  try {
    model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, { useCase: "fast-chat", companyId: job.companyId });
  } catch {
    // No writing model set up: the group is sorted into without a description.
    return false;
  }
  const prompt = JSON.stringify({
    business: job.business,
    group: { name: group.name, type: group.type, rules: group.lines, busiestPages: group.pages },
    otherGroups: job.groups.filter((other) => other.id !== group.id).map((other) => ({ name: other.name, type: other.type })),
  }, null, 1);
  let text = "";
  let usage = { inputTokens: 0, outputTokens: 0 };
  let failed = false;
  try {
    const response = await generateTextWithResolvedModel({ model, systemInstruction: DESCRIBE_INSTRUCTION, contents: [{ type: "text", text: prompt }] });
    text = response.text ?? "";
    usage = { inputTokens: response.inputTokens ?? 0, outputTokens: response.outputTokens ?? 0 };
  } catch (error: unknown) {
    failed = true;
    text = appErrorMessage(error, String(error));
  }
  const cost = await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
    runId,
    companyId: job.companyId,
    actionContext: `Auto Classify: describing the ${group.name} group`,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    ...usage,
    promptContent: prompt,
    responseContent: text,
    ...(failed ? { failed: true } : {}),
  });
  const description = failed ? "" : tidyDescription(text);
  const saved = description ? await ctx.runMutation(internal.autoClassifySteps.saveDescription, { classificationId: group.id, description }) : false;
  return cost.limitReached ? "LIMIT" : saved;
}

/** One page asked of the Decision: its answer as kept, or null when the model did not answer. */
async function askPage(
  ctx: ActionCtx,
  job: Job,
  prepared: Awaited<ReturnType<typeof prepareDecisions>>,
  page: Job["pages"][number],
  companyWebsiteId: HoldId,
  runId: RunId,
): Promise<{ page: string; classificationId: Id<"pageClassifications"> | null; band: "SURE" | "FAIRLY_SURE" | "NOT_SURE" } | null> {
  let result: DecisionResult | undefined;
  try {
    result = (await runDecisions(ctx, {
      prepared,
      companyId: job.companyId,
      subject: { kind: "website-pages", id: companyWebsiteId },
      state: {
        business: job.business,
        page: { address: page.page, ...(page.topSearch ? { topSearch: page.topSearch } : {}) },
        groups: job.groups.map(({ label, name, type, description }) => ({ label, name, type, description })),
      },
      requests: [{ key: AUTO_CLASSIFY_DECISION, subjectId: page.page, fallback: () => ({ kind: "pick-one", choice: "other" }) }],
      links: { agentRunId: runId },
    }))[AUTO_CLASSIFY_DECISION];
  } catch {
    return null;
  }
  // The rule's own answer means no model answered: nothing is kept, so the page is asked again next run.
  if (!result || result.source === "RULES" || result.answer.kind !== "pick-one") return null;
  const group = job.groups[GROUP_LABELS.indexOf(result.answer.choice)];
  if (!group) return { page: page.page, classificationId: null, band: result.answer.choice === "none" ? result.certainty ?? "NOT_SURE" : "NOT_SURE" };
  return { page: page.page, classificationId: group.id, band: result.certainty ?? "NOT_SURE" };
}

export const sortStep = internalAction({
  args: {
    companyWebsiteId: v.id("companyWebsites"),
    runId: v.id("agentRuns"),
    workflowExecutionId: v.optional(v.id("workflowExecutions")),
    /** Set once describing has been tried and failed, so the pages are sorted without the missing descriptions. */
    describingFailed: v.optional(v.boolean()),
    steps: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { companyWebsiteId, runId } = args;
    const finish = (outcome: "DONE" | "STOPPED", failed: boolean, summary: string) =>
      ctx.runMutation(internal.autoClassifySteps.finishSiteRun, {
        companyWebsiteId,
        runId,
        ...(args.workflowExecutionId ? { workflowExecutionId: args.workflowExecutionId } : {}),
        outcome,
        failed,
        summary,
      });
    const note = (heading: string, detail: string, failed = false) =>
      ctx.runMutation(internal.autoClassifySteps.noteStep, { companyWebsiteId, runId, heading, detail, failed });
    const steps = (args.steps ?? 0) + 1;
    const next = (more: { describingFailed?: boolean } = {}) =>
      ctx.scheduler.runAfter(0, internal.autoClassifyRun.sortStep, { ...args, ...more, steps });

    try {
      const job = await readJob(ctx, companyWebsiteId, runId);
      if (!job || job.status !== "SORTING") return null;
      if (job.queued) await ctx.runMutation(internal.roleRuns.markRunStarted, { runId });
      if (job.groups.length === 0) {
        await finish("DONE", false, `${job.host} has no page groups any more, so there is nothing to sort.`);
        return null;
      }
      if (steps > MOST_STEPS) {
        await finish("STOPPED", true, `Stopped after ${MOST_STEPS} steps with ${count(job.remaining)} pages still to ask. The next run carries on.`);
        return null;
      }

      // Descriptions first: Auto Classify reads them, and a new one changes what the pages are asked under.
      if (job.undescribed.length > 0 && !args.describingFailed) {
        const written: string[] = [];
        for (const group of job.undescribed) {
          const outcome = await describeGroup(ctx, job, group, runId);
          if (outcome === "LIMIT") {
            await finish("STOPPED", false, "The Auto Classify agent reached its spend limit, so it stopped. Raise the limit on its Settings, or it carries on in the next run.");
            return null;
          }
          if (outcome) written.push(group.name);
        }
        const missed = job.undescribed.length - written.length;
        await note(
          "Described groups",
          [
            written.length > 0 ? `Wrote a description for ${names(written)}.` : "",
            missed > 0 ? `${missed === 1 ? "1 group" : `${count(missed)} groups`} could not be described this time, and ${missed === 1 ? "is" : "are"} sorted into without one.` : "",
          ].filter(Boolean).join(" "),
          missed > 0 && written.length === 0,
        );
        await next(missed > 0 ? { describingFailed: true } : {});
        return null;
      }

      if (job.pages.length === 0) {
        await finish("DONE", false, job.done === 0
          ? `Nothing was left to sort on ${job.host}.`
          : `Sorted ${job.host}: ${count(job.done)} pages asked, ${count(job.placed)} given a group. The rest stay Unclassified, for a person or a rule.`);
        return null;
      }

      const prepared = await prepareDecisions(ctx, { keys: [AUTO_CLASSIFY_DECISION], companyId: job.companyId });
      if (prepared.modes[AUTO_CLASSIFY_DECISION] === "OFF") {
        await finish("STOPPED", false, "\"Which group is this page in?\" is switched off in Admin → AI → Decisions, so nothing more is sorted. Switch it on and press Auto Classify.");
        return null;
      }

      const since = Date.now();
      const answers: NonNullable<Awaited<ReturnType<typeof askPage>>>[] = [];
      let unanswered = 0;
      const pages = job.pages.slice(0, PAGES_PER_STEP);
      for (let start = 0; start < pages.length; start += ASKS_AT_ONCE) {
        const wave = await Promise.all(pages.slice(start, start + ASKS_AT_ONCE).map((page) => askPage(ctx, job, prepared, page, companyWebsiteId, runId)));
        for (const answer of wave) {
          if (answer) answers.push(answer);
          else unanswered += 1;
        }
      }

      if (answers.length > 0) {
        const sure = answers.filter((answer) => answer.classificationId && answer.band === "SURE").length;
        const fairly = answers.filter((answer) => answer.classificationId && answer.band === "FAIRLY_SURE").length;
        const notSure = answers.filter((answer) => answer.classificationId && answer.band === "NOT_SURE").length;
        const none = answers.filter((answer) => !answer.classificationId).length;
        const kept = await ctx.runMutation(internal.autoClassifySteps.writeAnswers, {
          companyWebsiteId,
          runId,
          stamp: job.stamp,
          since,
          answers,
          line: {
            heading: `Sorted pages ${count(job.done + 1)}–${count(job.done + answers.length)} of ${count(job.total)}`,
            detail: [
              `${count(sure + fairly)} given a group (${count(sure)} sure, ${count(fairly)} fairly sure).`,
              none > 0 ? `${count(none)} fit none of the groups.` : "",
              notSure > 0 ? `${count(notSure)} not sure, left Unclassified.` : "",
            ].filter(Boolean).join(" "),
          },
        });
        // A newer run took over the website: this one stops quietly.
        if (!kept) return null;
      }
      if (unanswered > 0) {
        await finish("STOPPED", true, answers.length === 0
          ? `The model gave no answer for any of the ${count(unanswered)} pages asked, so the run stopped. They are asked again on the next run.`
          : `The model gave no answer for ${count(unanswered)} of the pages asked, so the run stopped. They are asked again on the next run.`);
        return null;
      }
      await next();
    } catch (error: unknown) {
      await finish("STOPPED", true, appErrorMessage(error, String(error)).replace(/\s+/g, " ").trim().slice(0, 400) || "It stopped on an error.");
    }
    return null;
  },
});
