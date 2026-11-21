import { v } from "convex/values";
import { moduleQuery } from "./tenantFunctions";
import { MENU_FEATURES } from "./utils/coreModules";
import { groupOwner, requireMySite } from "./siteAccess";
import { assetsOf } from "./assetSummaries";
import { assetRowValidator } from "./radarSchema";

/**
 * Visibility → Site → Your assets (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 5, D18; drawn as "Site · Your assets"): a
 * website's every asset as worked out after its last collection
 * (`assetSummaries.ts`) — one small record read.
 */
export const yourAssets = moduleQuery({
  module: MENU_FEATURES.visibility,
  args: { siteId: v.id("companyWebsites") },
  returns: v.object({ rows: v.array(assetRowValidator), workedOutAt: v.union(v.number(), v.null()) }),
  handler: async (ctx, args) => {
    const site = await requireMySite(ctx, args.siteId);
    const hold = groupOwner(site);
    const summary = hold ? await assetsOf(ctx, hold._id) : null;
    return { rows: summary?.rows ?? [], workedOutAt: summary?.updatedAt ?? null };
  },
});
