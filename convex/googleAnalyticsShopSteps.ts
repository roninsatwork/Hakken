import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { adminMutation } from "./tenantFunctions";
import { requireMySite } from "./siteAccess";
import { connectionOf } from "./googleAnalyticsRows";
import { appError } from "./utils/appError";

/**
 * A shop's steps and its sale (docs/plans/active/products-screen-4-plan-2026-11-02.md, phase 1): the events Products'
 * "Bought or left behind" and its boxes read, picked from the shop's own events, because every shop names them its own
 * way (Anthony, 2026-11-02: "too bespoke to Morehandles - perhaps we add the events to a drop down"). Saved for the
 * website, so the page, the eye and Ask Hakken always read the same.
 */

/** Google's own names for a shop's steps and its sale: what Hakken reads until the company picks. */
export const STANDARD_STEPS = ["add_to_cart", "begin_checkout"] as const;
export const STANDARD_SALE = "purchase";
/** Google's automatic events, on every visit: never a shop's step, and left out of the Steps dropdown. */
export const AUTOMATIC_EVENTS: ReadonlySet<string> = new Set(["session_start", "first_visit", "user_engagement", "page_view"]);
const MOST_STEPS = 8;
const LONGEST_NAME = 100;

export type ShopChoice = { steps: string[]; sale: string | null; saved: boolean };

/** The shop's steps and sale: the company's saved choice, else Google's own names among the events recorded. */
export function shopChoiceOf(connection: Pick<Doc<"googleAnalyticsConnections">, "shopSteps" | "shopSale">, recorded: ReadonlySet<string>): ShopChoice {
  if (connection.shopSteps !== undefined && connection.shopSale !== undefined) return { steps: [...connection.shopSteps], sale: connection.shopSale, saved: true };
  return { steps: STANDARD_STEPS.filter((name) => recorded.has(name)), sale: recorded.has(STANDARD_SALE) ? STANDARD_SALE : null, saved: false };
}

/** Pick the shop's steps and its sale for everyone at the company: Products' two dropdowns. */
export const saveShopSteps = adminMutation({
  args: { siteId: v.id("companyWebsites"), steps: v.array(v.string()), sale: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const connection = await connectionOf(ctx, site.hold._id);
    if (!connection || connection.shop !== true) throw appError("CONFLICT", "Products is only for a website that sells online.");
    const steps = [...new Set(args.steps.map((step) => step.trim()))].filter((step) => step.length > 0);
    const sale = args.sale.trim();
    if (sale.length === 0) throw appError("INVALID_INPUT", "Pick the event that means a sale.");
    if (sale.length > LONGEST_NAME || steps.some((step) => step.length > LONGEST_NAME)) throw appError("INVALID_INPUT", "That event's name is too long to be one Google records.");
    if (steps.length > MOST_STEPS) throw appError("INVALID_INPUT", `Pick ${MOST_STEPS} steps at most.`);
    if (steps.includes(sale)) throw appError("INVALID_INPUT", "The sale can't also be one of the steps.");
    if ([sale, ...steps].some((name) => AUTOMATIC_EVENTS.has(name))) throw appError("INVALID_INPUT", "Google records that event on every visit, so it can't be a shop's step.");
    const now = Date.now();
    await ctx.db.patch(connection._id, { shopSteps: steps, shopSale: sale, updatedAt: now });
    await ctx.db.insert("auditLogs", {
      actorId: ctx.userId,
      actionType: "GOOGLE_ANALYTICS_SHOP_STEPS_CHANGED",
      entityId: connection._id.toString(),
      entityType: "googleAnalyticsConnections",
      companyId: connection.companyId,
      timestamp: now,
      metadata: JSON.stringify({ steps, sale }),
    });
    return null;
  },
});
