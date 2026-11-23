import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { holdFor } from "./assistantReads";
import { creditDayOf, sectionOfWork } from "./creditKinds";
import type { CreditRunStart } from "./creditLedger";

/**
 * What a charge saves beside its credits, for Usage to show (Anthony, 2026-11-23, on the Usage canvas: "lets add all
 * the detail to the capture and then we can [pick] what we want for usage - its important we track more than we are"):
 * the website, the section, the screen or page, and what was asked. Every piece already lives on the record behind the
 * charge (the eye's press, the Ask Hakken conversation, the MCP request); these read it, for the charge as it is made
 * and for the charges made before.
 */

type Reader = Pick<QueryCtx, "db">;
export type ChargeDetail = Pick<CreditRunStart, "websiteId" | "screen" | "page" | "app" | "tool" | "period" | "detail">;

/** A company's hold, as the website it holds. */
async function websiteOfHold(ctx: Reader, hold: Id<"companyWebsites"> | undefined): Promise<Id<"websites"> | undefined> {
  if (!hold) return undefined;
  return (await ctx.db.get(hold))?.websiteId;
}

/** A press of the eye: the website it was pressed on and the screen it read. */
export async function seesPressDetail(ctx: Reader, answer: Pick<Doc<"seesAnswers">, "companyWebsiteId" | "screen">): Promise<ChargeDetail> {
  const websiteId = await websiteOfHold(ctx, answer.companyWebsiteId);
  return { ...(websiteId ? { websiteId } : {}), screen: answer.screen };
}

/** An Ask Hakken reply: the conversation's website, the page it was started from, and its title once it has one. */
export async function assistantReplyDetail(ctx: Reader, thread: Pick<Doc<"threads">, "companyWebsiteId" | "startedOn" | "title"> | null): Promise<ChargeDetail> {
  if (!thread) return {};
  const websiteId = await websiteOfHold(ctx, thread.companyWebsiteId);
  return {
    ...(websiteId ? { websiteId } : {}),
    ...(thread.startedOn?.path ? { page: thread.startedOn.path } : {}),
    ...(thread.title ? { detail: thread.title.slice(0, 200) } : {}),
  };
}

/** An MCP question: the app that asked, the tool, the screen it read, its dates and the company's website it named. */
export async function chatAppQuestionDetail(ctx: Reader, request: Doc<"chatAppRequests"> | null, companyId: Id<"companies">): Promise<ChargeDetail> {
  if (!request) return {};
  const found = request.website ? await holdFor(ctx, companyId, request.website) : null;
  const websiteId = found && "held" in found && found.held ? found.held.hold.websiteId : undefined;
  // A tool's `detail` names the screen or list it read (`searchConsole.newLost`): kept as the screen when it is one.
  const screen = request.detail && /^[a-zA-Z]+\.[\w:.-]+$/.test(request.detail) ? request.detail : undefined;
  return {
    ...(websiteId ? { websiteId } : {}),
    ...(request.app ? { app: request.app } : {}),
    ...(request.tool ? { tool: request.tool } : {}),
    ...(screen ? { screen } : {}),
    ...(request.period ? { period: request.period } : {}),
  };
}

/** A record named inside a run key, or null when the key no longer names one. */
async function readById<Table extends "seesAnswers" | "chatAppRequests">(ctx: Reader, id: Id<Table>): Promise<Doc<Table> | null> {
  try {
    return await ctx.db.get(id);
  } catch {
    return null;
  }
}

/** What the record behind an older charge says it was, read the way the charge would be made today. */
async function detailOfOldCharge(ctx: Reader, charge: Doc<"creditCharges">): Promise<ChargeDetail> {
  const key = charge.runKey ?? "";
  if (charge.kind === "sees" && key.startsWith("sees:")) {
    const answer = await readById(ctx, key.split(":")[1] as Id<"seesAnswers">);
    return answer ? await seesPressDetail(ctx, answer) : {};
  }
  if (charge.kind === "assistant" && charge.messageId) {
    const message = await ctx.db.get(charge.messageId);
    return await assistantReplyDetail(ctx, message ? await ctx.db.get(message.threadId) : null);
  }
  if (charge.kind === "chatApps" && key.startsWith("chatApp:")) {
    const request = await readById(ctx, key.slice("chatApp:".length) as Id<"chatAppRequests">);
    return await chatAppQuestionDetail(ctx, request, charge.companyId);
  }
  return {};
}

/**
 * A charge that was counted under no website and now has one: its month's rollup moves from "none" to the website, so
 * Usage's figures by website add up. What it stands at is what it was charged, less anything given back.
 */
async function moveToWebsite(ctx: MutationCtx, charge: Doc<"creditCharges">, websiteId: Id<"websites">, now: number): Promise<void> {
  if (!charge.kind || charge.state !== "charged") return;
  const back = await ctx.db.query("creditCharges").withIndex("by_run_key", (q) => q.eq("runKey", `refund:${charge._id}`)).first();
  const credits = (charge.creditsNow ?? charge.creditsOut) - (back?.creditsIn ?? 0);
  const month = creditDayOf(charge.at).slice(0, 7);
  const kind = charge.kind;
  const rollup = (websiteKey: string) => ctx.db
    .query("creditMonthRollups")
    .withIndex("by_company_month_kind_site", (q) => q.eq("companyId", charge.companyId).eq("month", month).eq("kind", kind).eq("websiteKey", websiteKey))
    .first();
  const from = await rollup("none");
  if (from) {
    await ctx.db.patch(from._id, {
      credits: from.credits - credits,
      runs: Math.max(0, from.runs - 1),
      realCostUsd: Math.max(0, from.realCostUsd - charge.realCostUsd),
      updatedAt: now,
    });
  }
  const to = await rollup(websiteId);
  const person = charge.how === "byHand" && charge.userId ? charge.userId : null;
  if (to) {
    const people = person && !(to.byHandUsers ?? []).includes(person) ? [...(to.byHandUsers ?? []), person].slice(0, 20) : to.byHandUsers;
    await ctx.db.patch(to._id, {
      credits: to.credits + credits,
      runs: to.runs + 1,
      realCostUsd: to.realCostUsd + charge.realCostUsd,
      ...(people ? { byHandUsers: people } : {}),
      updatedAt: now,
    });
  } else {
    await ctx.db.insert("creditMonthRollups", {
      companyId: charge.companyId, month, kind, websiteKey: websiteId, credits, runs: 1, realCostUsd: charge.realCostUsd,
      ...(person ? { byHandUsers: [person] } : {}), updatedAt: now,
    });
  }
  // Its refund line, if it had one, names the website too.
  if (back && !back.websiteId) await ctx.db.patch(back._id, { websiteId });
}

const FILL_PAGE = 100;

/**
 * Fill in the detail on charges made before it was saved: the section on every charge, and the website, screen, page
 * and what was asked where the record behind it still exists. A page at a time, each scheduling the next, so a
 * long history never runs a mutation out of its limits. Safe to run again: a charge with its section is passed over.
 *
 *   npx convex run creditDetail:fillChargeDetail '{}'
 */
export const fillChargeDetail = internalMutation({
  args: { cursor: v.optional(v.union(v.string(), v.null())), filled: v.optional(v.number()), moved: v.optional(v.number()) },
  returns: v.object({ filled: v.number(), moved: v.number(), done: v.boolean() }),
  handler: async (ctx, args) => {
    const now = Date.now();
    const page = await ctx.db.query("creditCharges").order("asc").paginate({ cursor: args.cursor ?? null, numItems: FILL_PAGE });
    let filled = args.filled ?? 0;
    let moved = args.moved ?? 0;
    for (const charge of page.page) {
      if (charge.entry !== "charge" || !charge.kind || charge.section) continue;
      const found = await detailOfOldCharge(ctx, charge);
      const section = sectionOfWork(charge.kind, found.screen);
      const patch: Partial<Doc<"creditCharges">> = { ...(section ? { section } : {}) };
      for (const field of ["screen", "page", "app", "tool", "period"] as const) {
        if (found[field] !== undefined && charge[field] === undefined) Object.assign(patch, { [field]: found[field] });
      }
      if (found.detail && !charge.detail) patch.detail = found.detail;
      if (found.websiteId && !charge.websiteId) {
        patch.websiteId = found.websiteId;
        await moveToWebsite(ctx, charge, found.websiteId, now);
        moved += 1;
      }
      if (Object.keys(patch).length > 0) {
        await ctx.db.patch(charge._id, patch);
        filled += 1;
      }
    }
    if (!page.isDone) {
      await ctx.scheduler.runAfter(0, internal.creditDetail.fillChargeDetail, { cursor: page.continueCursor, filled, moved });
    }
    return { filled, moved, done: page.isDone };
  },
});
