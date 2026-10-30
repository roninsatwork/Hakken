import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalQuery } from "./_generated/server";
import { resolveModelConfig } from "./aiModels";
import { TYPESAFE_PROVIDER_KEY } from "./aiModelService";
import { readMapView } from "./agentReads";
import type { SiteReader } from "./siteAccess";
import { tenantQuery } from "./tenantFunctions";
import { findingsFrom, type Finding, type FindingView } from "./utils/sees/findings";
import { findingValidator } from "./utils/sees/findingValidator";

/**
 * What the figures show, worked out by code over the Conversions map's four views
 * (docs/plans/active/sees-findings-in-code-plan-2026-10-31.md, phase 1): the panel shows them the moment it opens,
 * and the team is handed them to write up (`seesAskActions.writeBubble`). Saved data only, through the map's own
 * function; nothing is asked of Google.
 */

const COLUMNS = ["channel", "kind", "device", "country"] as const;

export { findingValidator };

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

/** Models in the catalogue read at most: the whole of it. */
const CATALOGUE_LIMIT = 500;

/**
 * The model the eye's Decisions ask: the catalogue's enabled TypeSafe model (Jev), read from stored configuration,
 * never written into code — only these Decisions, so every other Decision keeps the platform's own choice. Null
 * when none is enabled: the Decisions then go to whatever the platform answers Decisions with.
 */
export const seesJudgeModelInternal = internalQuery({
  args: { companyId: v.optional(v.id("companies")) },
  handler: async (ctx, args) => {
    const models = await ctx.db.query("aiModels").take(CATALOGUE_LIMIT);
    const jev = models.filter((model) => model.providerKey === TYPESAFE_PROVIDER_KEY && model.isEnabled).sort((a, b) => Number(b.isDefault ?? false) - Number(a.isDefault ?? false) || a.modelId.localeCompare(b.modelId))[0];
    if (!jev) return null;
    return await resolveModelConfig(ctx, { requestedModelId: jev.modelId, useCase: "decision", ...(args.companyId ? { companyId: args.companyId } : {}) });
  },
});
