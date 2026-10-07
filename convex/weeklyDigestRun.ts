"use node";

import { internal } from "./_generated/api";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { generateTextWithResolvedModel } from "./aiProviderRegistry";
import { isoWeekKey } from "./weeklyDigest";

/**
 * The Weekly Digest's job (docs/plans/active/knowledge-news-and-digest-plan.md,
 * phase 9): when its schedule fires, write the week's issue once — a short
 * opening in English from the agent's own instructions and model, over the
 * News items, Google updates, Knowledge articles and Helpful content of the
 * week (insights-helpful-content-plan.md, IH19) — have the
 * Translator write every other language at once, add one outbox row per
 * subscribed reader, and start the Email Sender. It sends nothing itself.
 *
 * In Test (the Role card's mode, Test until set) the issue goes only to super
 * admins, every run, so it can be seen before any customer gets it. In Live
 * it goes to every user who has it on, once a week: a second run in the same
 * week writes and queues nothing.
 */

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The Weekly Digest Email Agent picks the week's stories as well as writing
 * its opening (hakken-tasks-plan.md, item 3.4): the few most useful to a
 * business owner, most useful first, by their place in the list it is given.
 */
const MOST_STORIES = 5;
const OPENING_FORMAT =
  `Reply with only JSON: {"opening": the opening as plain text, with no heading, list or quotation marks, "picked": the numbers of the ${MOST_STORIES} or fewer News items most useful to a business owner this week, most useful first}. `
  + "Every item has its number. Leave out an item that would not change what a business owner does or watches.";

/**
 * The opening and the stories from the model's answer. An answer that is not
 * that JSON is the opening itself, as the agent wrote before it picked, and
 * then every item goes, in the order they came.
 */
export function readDigestAnswer(text: string, itemCount: number): { opening: string; picked: number[] } {
  const every = Array.from({ length: itemCount }, (_, index) => index);
  const trimmed = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const parsed = JSON.parse(trimmed) as { opening?: unknown; picked?: unknown };
    const opening = typeof parsed.opening === "string" ? parsed.opening.trim() : "";
    const picked = Array.isArray(parsed.picked)
      ? [...new Set(parsed.picked.filter((entry): entry is number => Number.isInteger(entry) && entry >= 0 && entry < itemCount))].slice(0, MOST_STORIES)
      : [];
    if (opening) return { opening, picked: picked.length > 0 ? picked : every };
  } catch {
    // Not JSON: the opening alone.
  }
  return { opening: trimmed.replace(/^["“]|["”]$/g, "").trim(), picked: every };
}

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

export async function writeWeeklyDigest(ctx: ActionCtx, runId: Id<"agentRuns">): Promise<string> {
  const now = Date.now();
  const weekKey = isoWeekKey(now);
  const setup = await ctx.runQuery(internal.weeklyDigest.readDigestSetup, { runId });
  if (!setup) return "This run's agent no longer exists, so nothing was written.";
  if (setup.mode === "LIVE" && (await ctx.runQuery(internal.weeklyDigest.liveIssueFor, { weekKey }))) {
    return `The ${weekKey} issue was already written and queued, so nothing was sent twice.`;
  }
  const material = await ctx.runQuery(internal.weeklyDigest.readDigestMaterial, { since: now - WEEK_MS });
  if (material.items.length === 0) return "Nothing was added to News this week, so no issue was written.";
  await ctx.runMutation(internal.roleRuns.recordObservation, {
    runId,
    text: `${plural(material.items.length, "News item", "News items")}, ${plural(material.articles.length, "new Knowledge article", "new Knowledge articles")} and ${plural(material.helpful.length, "new Helpful content article", "new Helpful content articles")} this week. Mode: ${setup.mode === "LIVE" ? "Live, to every subscribed user" : "Test, to super admins only"}.`,
  });

  const spend = await ctx.runQuery(internal.roleRuns.runSpendLeft, { runId });
  if (spend.limitReached) return `It had already reached its spend limit, at $${spend.spentUsd.toFixed(2)}, so nothing was written.`;
  const model = await ctx.runQuery(internal.aiModels.resolveModelConfigForExecution, {
    ...(setup.requestedModelId ? { requestedModelId: setup.requestedModelId } : {}),
    useCase: "agent",
  });
  const prompt = JSON.stringify({
    week: weekKey,
    news: material.items.map((item, number) => ({ number, kind: item.kind, source: item.sourceName, title: item.title, summary: item.summary })),
    newKnowledgeArticles: material.articles,
    newHelpfulContent: material.helpful.map((article) => ({ title: article.title, publication: article.publication, summary: article.summary })),
  });
  const response = await generateTextWithResolvedModel({
    model,
    systemInstruction: `${setup.instructions}\n\n${OPENING_FORMAT}`,
    contents: [{ type: "text", text: prompt }],
  });
  const { opening: intro, picked } = readDigestAnswer(response.text ?? "", material.items.length);
  const stories = picked.map((index) => material.items[index]);
  await ctx.runMutation(internal.roleRuns.recordRunModelCall, {
    runId,
    actionContext: `Picking the stories and writing the opening of the ${weekKey} Weekly News Digest`,
    modelId: model.modelId,
    providerKey: model.providerKey,
    providerModelId: model.providerModelId,
    inputTokens: response.inputTokens ?? 0,
    outputTokens: response.outputTokens ?? 0,
    promptContent: prompt,
    responseContent: response.text ?? "",
    failed: !intro,
  });

  const issueId = await ctx.runMutation(internal.weeklyDigest.saveIssue, {
    weekKey,
    introEn: intro,
    itemIds: stories.map((item) => item._id),
    helpfulIds: material.helpful.map((article) => article._id),
    mode: setup.mode,
    runId,
  });
  // Every other language now, before anything is sent, so no reader gets the English for want of a moment.
  try {
    await ctx.runAction(internal.contentTranslationActions.translateNow, { owner: "weeklyDigestIssues", ownerId: issueId });
  } catch {
    // The Translator could not; the English goes, and its Run button can catch up.
  }

  let queued = 0;
  let skipped = 0;
  for (let cursor: string | null = null; ;) {
    const page: { queued: number; skipped: number; cursor: string | null; isDone: boolean } =
      await ctx.runMutation(internal.weeklyDigest.queueDigestPage, { issueId, runId, cursor });
    queued += page.queued;
    skipped += page.skipped;
    if (page.isDone) break;
    cursor = page.cursor;
  }
  await ctx.runMutation(internal.roleRuns.logRunLine, {
    runId,
    heading: `Queued the ${weekKey} issue`,
    detail: `${plural(queued, "email", "emails")} queued; ${skipped} not, for a reader with no address, or one already queued.`,
    failed: false,
  });

  // Sent on the Outbox Queue Processing Agent's next hourly run (outbox-and-preferences-plan.md, A2).
  const senderLine = queued > 0 ? " They go out on the Outbox's next hourly run." : "";
  const picks = stories.length === material.items.length
    ? `all ${plural(stories.length, "story", "stories")} of the week`
    : `${stories.length} of the week's ${material.items.length} stories`;
  return `Wrote the ${weekKey} issue${setup.mode === "TEST" ? " in Test, for super admins only," : ""} with ${picks}; `
    + `queued ${plural(queued, "email", "emails")}.${senderLine}`;
}
