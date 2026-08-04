/**
 * The register coverage rows: written by the check, read by the screen.
 *
 * The action does the fetching; these functions own the tables. Split so the
 * database work stays testable without a network and the action stays a thin
 * client of the register.
 */

import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { tenantQuery } from "./tenantFunctions";
import { getCurrentImport, requireSalesDataCompany } from "./salesData";
import { loadKnownSites } from "./salesDataResearch";
import type { KnownSite } from "./salesDataProspectMatching";

/** Matches the research side's own scan bound. */
const CHAIN_SCAN_LIMIT = 2000;

/** Kept in step with `extraFieldForType`: the care types the CQC registers. */
const CARE_TYPE_KEYS = new Set(["CARE HOMES"]);

export type CoverageChain = {
  groupNameKey: string;
  groupName: string;
  knownSites: KnownSite[];
  /** Register ids confirmed by earlier checks, so no company is ever unlearned. */
  rememberedProviderIds: string[];
};

/**
 * The care groups this workspace supplies, each with everything on file for
 * it. The work list the register check runs down.
 */
export const listCareChainsForCoverage = internalQuery({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args): Promise<CoverageChain[]> => {
    const currentImport = await getCurrentImport(ctx, args.companyId);
    if (!currentImport) return [];

    const accounts = await ctx.db
      .query("salesDataAccounts")
      .withIndex("by_company_import_group_name", (q) =>
        q.eq("companyId", args.companyId).eq("importId", currentImport._id)
      )
      .take(CHAIN_SCAN_LIMIT);

    const groups = new Map<string, string>();
    for (const account of accounts) {
      if (!CARE_TYPE_KEYS.has(account.customerTypeKey)) continue;
      if (!groups.has(account.groupNameKey)) groups.set(account.groupNameKey, account.groupName);
    }

    const chains: CoverageChain[] = [];
    for (const [groupNameKey, groupName] of groups) {
      const existing = await ctx.db
        .query("salesDataChainCoverage")
        .withIndex("by_company_group", (q) =>
          q.eq("companyId", args.companyId).eq("groupNameKey", groupNameKey)
        )
        .unique();
      chains.push({
        groupNameKey,
        groupName,
        knownSites: await loadKnownSites(ctx, {
          companyId: args.companyId,
          importId: currentImport._id,
          groupNameKey,
        }),
        rememberedProviderIds: existing?.providerIds ?? [],
      });
    }
    return chains;
  },
});

const coverageRowValidator = {
  groupNameKey: v.string(),
  groupName: v.string(),
  registerName: v.string(),
  status: v.union(
    v.literal("COVERED"),
    v.literal("GAPS"),
    v.literal("PROVIDER_NOT_FOUND"),
    v.literal("CHECK_FAILED"),
    v.literal("NOT_CONFIGURED")
  ),
  registerCount: v.optional(v.number()),
  accountedFor: v.optional(v.number()),
  missing: v.optional(
    v.array(
      v.object({
        name: v.string(),
        postcode: v.optional(v.string()),
        locationId: v.optional(v.string()),
      })
    )
  ),
  filedFromRegister: v.optional(v.number()),
  providerNames: v.optional(v.array(v.string())),
  providerIds: v.optional(v.array(v.string())),
  error: v.optional(v.string()),
};

/**
 * One check's verdict for one group, replacing the last.
 *
 * A full replace rather than a patch of survivors: yesterday's GAPS row with
 * its missing list must not linger under today's COVERED status.
 */
export const upsertChainCoverage = internalMutation({
  args: {
    companyId: v.id("companies"),
    row: v.object(coverageRowValidator),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("salesDataChainCoverage")
      .withIndex("by_company_group", (q) =>
        q.eq("companyId", args.companyId).eq("groupNameKey", args.row.groupNameKey)
      )
      .unique();

    const document = {
      companyId: args.companyId,
      ...args.row,
      checkedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.replace(existing._id, document);
      return existing._id;
    }
    return await ctx.db.insert("salesDataChainCoverage", document);
  },
});

/**
 * Every group's verdict, for the customers screen.
 *
 * Worst news first: gaps before clean sweeps, failures before both, so the
 * line a person must act on is the line they see.
 */
export const listChainCoverage = tenantQuery({
  args: {},
  handler: async (ctx) => {
    const companyId: Id<"companies"> = await requireSalesDataCompany(ctx);
    const rows = await ctx.db
      .query("salesDataChainCoverage")
      .withIndex("by_company_group", (q) => q.eq("companyId", companyId))
      .take(CHAIN_SCAN_LIMIT);

    const urgency: Record<string, number> = {
      CHECK_FAILED: 0,
      NOT_CONFIGURED: 1,
      PROVIDER_NOT_FOUND: 2,
      GAPS: 3,
      COVERED: 4,
    };

    return rows
      .sort(
        (first, second) =>
          (urgency[first.status] ?? 9) - (urgency[second.status] ?? 9)
          || first.groupName.localeCompare(second.groupName)
      )
      .map((row) => ({
        groupNameKey: row.groupNameKey,
        groupName: row.groupName,
        registerName: row.registerName,
        status: row.status,
        registerCount: row.registerCount ?? null,
        accountedFor: row.accountedFor ?? null,
        missing: row.missing ?? [],
        filedFromRegister: row.filedFromRegister ?? 0,
        providerNames: row.providerNames ?? [],
        error: row.error ?? null,
        checkedAt: row.checkedAt,
      }));
  },
});
