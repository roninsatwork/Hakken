import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { readMapView } from "./agentReads";
import type { SiteReader } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { findingsFrom, type Finding, type FindingView } from "./utils/sees/findings";

/**
 * What the figures show, worked out by code over the Conversions map's four views
 * (docs/plans/active/sees-findings-in-code-plan-2026-10-31.md, phase 1): the panel shows them the moment it opens,
 * and the team is handed them to write up (`seesAskActions.writeBubble`). Saved data only, through the map's own
 * function; nothing is asked of Google.
 */

const COLUMNS = ["channel", "kind", "device", "country"] as const;

export const findingValidator = v.object({
  id: v.string(),
  kind: v.union(v.literal("visitsForOne"), v.literal("step"), v.literal("groupAbove"), v.literal("groupBelow"), v.literal("rose"), v.literal("fell"), v.literal("trackingGap")),
  score: v.number(),
  params: v.record(v.string(), v.union(v.string(), v.number())),
  facts: v.array(v.object({ key: v.string(), value: v.number(), unit: v.union(v.literal("count"), v.literal("percent"), v.literal("ratio"), v.literal("score")), label: v.string() })),
});

const findingsArgs = { siteId: v.id("companyWebsites"), period: v.string(), device: v.string(), country: v.optional(v.string()) };

/** The findings for one website's dates, device and country: the four views read, the rules run over them. */
export async function readSeesFindings(reader: SiteReader, args: { siteId: Id<"companyWebsites">; period: string; device: string; country?: string }): Promise<Finding[]> {
  const views: FindingView[] = [];
  for (const columns of COLUMNS) {
    const view = await readMapView(reader, { ...args, columns });
    if (view.ok) views.push(view as unknown as FindingView);
  }
  return findingsFrom(views);
}

/** The panel's first section: shown at once, before any model has written a word. */
export const seesFindings = tenantQuery({
  args: findingsArgs,
  returns: v.array(findingValidator),
  handler: async (ctx, args) => await readSeesFindings(ctx, args),
});

/** The same for the team's writer, as the company that pressed the eye. */
export const seesFindingsInternal = internalQuery({
  args: { companyId: v.id("companies"), ...findingsArgs },
  returns: v.array(findingValidator),
  handler: async (ctx, { companyId, ...args }) => await readSeesFindings({ db: ctx.db, companyId }, args),
});
