/**
 * System Settings → Features: the menu features switched off for every company
 * (docs/plans/active/features-switches-plan-2026-11-21.md; Anthony,
 * 2026-11-21). A company's own switches are saved with its other features
 * (`companies.setCompanyModules`). Both lists are rows of `featureSwitches`
 * (`featureSwitchesSchema.ts`). What a company ends up with is read in one
 * place, `effectiveModulesFor`.
 *
 * Switching a feature off also stops its collection for every company: each
 * collector asks `featureOffCheck` before it starts a website's run.
 */
import { v } from "convex/values";

import { internalQuery } from "./_generated/server";
import { superAdminMutation, superAdminQuery } from "./tenantFunctions";
import { MENU_FEATURE_KEYS } from "./utils/coreModules";
import { companyFeaturesOff, everyCompanyFeaturesOff, featuresOffForEveryone, menuFeaturesFor, writeFeaturesOff } from "./utils/featureSwitchReads";

/** As many companies as Manage Companies reads at once (`getCompanies`). */
const COMPANY_READ_LIMIT = 10_000;

/**
 * What the pages show: what is off for everyone, and for each feature how many
 * companies have it ticked on their own page. That count is what each company
 * gets back when a feature is ticked again for everyone. Given a company, its
 * own list too, for its Features tab.
 */
export const getFeatureSwitches = superAdminQuery({
  args: { companyId: v.optional(v.id("companies")) },
  returns: v.object({
    offForEveryone: v.array(v.string()),
    companyOff: v.array(v.string()),
    companies: v.number(),
    ticked: v.array(v.object({ feature: v.string(), companies: v.number() })),
  }),
  handler: async (ctx, args) => {
    const companies = await ctx.db.query("companies").take(COMPANY_READ_LIMIT);
    const known = new Set(companies.map((company) => company._id));
    const ownOff = (await everyCompanyFeaturesOff(ctx)).filter((row) => known.has(row.companyId)).map((row) => new Set(row.featuresOff));
    return {
      offForEveryone: await featuresOffForEveryone(ctx),
      companyOff: args.companyId ? await companyFeaturesOff(ctx, args.companyId) : [],
      companies: companies.length,
      ticked: MENU_FEATURE_KEYS.map((feature) => ({
        feature,
        companies: companies.length - ownOff.filter((off) => off.has(feature)).length,
      })),
    };
  },
});

/** Save what is off for everyone. A company's own ticks are left as they are. */
export const setFeaturesOffForEveryone = superAdminMutation({
  args: { featuresOff: v.array(v.string()) },
  returns: v.array(v.string()),
  handler: async (ctx, args) => {
    const previous = await featuresOffForEveryone(ctx);
    const next = await writeFeaturesOff(ctx, undefined, args.featuresOff);

    await ctx.db.insert("auditLogs", {
      actionType: "UPDATE_FEATURES_OFF_FOR_EVERYONE",
      actorId: ctx.userId,
      entityType: "featureSwitches",
      entityId: "everyone",
      timestamp: Date.now(),
      metadata: JSON.stringify({ previousFeaturesOff: previous, newFeaturesOff: next }),
    });

    return next;
  },
});

/** The menu features a company has, for work that runs without a signed-in person (Ask Hakken's tools, FS9). */
export const menuFeaturesForCompanyInternal = internalQuery({
  args: { companyId: v.id("companies") },
  returns: v.array(v.string()),
  handler: async (ctx, args) => await menuFeaturesFor(ctx, args.companyId),
});
