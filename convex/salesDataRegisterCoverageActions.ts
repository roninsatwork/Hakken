/**
 * Reading the Care Quality Commission's register, one care group at a time.
 *
 * Runs after every prospect hunt: for each care group the workspace supplies,
 * it asks the register which locations the group's registered companies run,
 * counts them against what is on file, and writes the verdict where the
 * customers screen shows it. The register is the referee the finder cannot
 * argue with — Allegra Care passed every per-site check while a third of its
 * homes were simply never read.
 *
 * The API wants a subscription key (free, from CQC's developer portal) in
 * `CQC_API_KEY`. A deployment without one gets NOT_CONFIGURED rows, visible on
 * the screen, rather than a silently absent check.
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  computeCoverage,
  parseLocation,
  parseProviderLocationIds,
  parseProviderSearch,
  providerBelongsToGroup,
  type RegisterLocation,
} from "./salesDataRegisterCoverageService";
import type { CoverageChain } from "./salesDataRegisterCoverage";

const CQC_API_BASE = "https://api.service.cqc.org.uk/public/v1";
const REGISTER_NAME = "CQC";

/** One slow register answer must not hang the whole check. */
const FETCH_TIMEOUT_MS = 30_000;

/** No care group in this workbook runs to a hundred registered locations. */
const MAX_LOCATIONS_PER_GROUP = 100;

async function fetchRegister(path: string, apiKey: string): Promise<unknown> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(`${CQC_API_BASE}${path}`, {
      headers: { "Ocp-Apim-Subscription-Key": apiKey },
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`The register answered ${response.status} for ${path}.`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeout);
  }
}

export const checkCareRegisterCoverage = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const chains: CoverageChain[] = await ctx.runQuery(
      internal.salesDataRegisterCoverage.listCareChainsForCoverage,
      { companyId: args.companyId }
    );
    if (chains.length === 0) return { checked: 0 };

    const apiKey = process.env.CQC_API_KEY;
    if (!apiKey) {
      for (const chain of chains) {
        await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
          companyId: args.companyId,
          row: {
            groupNameKey: chain.groupNameKey,
            groupName: chain.groupName,
            registerName: REGISTER_NAME,
            status: "NOT_CONFIGURED" as const,
            error:
              "The register check needs a CQC API key on this deployment (CQC_API_KEY). "
              + "The key is free from the CQC developer portal.",
          },
        });
      }
      return { checked: 0, notConfigured: chains.length };
    }

    let checked = 0;
    for (const chain of chains) {
      try {
        const searchPayload = await fetchRegister(
          `/providers?name=${encodeURIComponent(chain.groupName)}&perPage=100`,
          apiKey
        );
        const candidates = parseProviderSearch(searchPayload);
        if (candidates === null) {
          throw new Error("The register's provider search answered in a shape this check does not know.");
        }

        const providers = candidates.filter((candidate) =>
          providerBelongsToGroup(candidate.providerName, chain.groupName)
        );
        if (providers.length === 0) {
          await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
            companyId: args.companyId,
            row: {
              groupNameKey: chain.groupNameKey,
              groupName: chain.groupName,
              registerName: REGISTER_NAME,
              status: "PROVIDER_NOT_FOUND" as const,
              error:
                `No registered provider reads as "${chain.groupName}". `
                + "Groups that have renamed land here; check the register by hand once.",
            },
          });
          continue;
        }

        const locations: RegisterLocation[] = [];
        for (const provider of providers) {
          const detail = await fetchRegister(`/providers/${provider.providerId}`, apiKey);
          const locationIds = parseProviderLocationIds(detail);
          if (locationIds === null) {
            throw new Error(
              `The register's record for ${provider.providerName} answered in a shape this check does not know.`
            );
          }
          for (const locationId of locationIds.slice(0, MAX_LOCATIONS_PER_GROUP)) {
            const location = parseLocation(await fetchRegister(`/locations/${locationId}`, apiKey));
            if (location) locations.push(location);
            if (locations.length >= MAX_LOCATIONS_PER_GROUP) break;
          }
        }

        const coverage = computeCoverage(chain.groupName, locations, chain.knownSites);
        await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
          companyId: args.companyId,
          row: {
            groupNameKey: chain.groupNameKey,
            groupName: chain.groupName,
            registerName: REGISTER_NAME,
            status: coverage.missing.length === 0 ? ("COVERED" as const) : ("GAPS" as const),
            registerCount: coverage.registerCount,
            accountedFor: coverage.accountedFor,
            missing: coverage.missing,
            providerNames: providers.map((provider) => provider.providerName),
          },
        });
        checked += 1;
      } catch (caught) {
        await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
          companyId: args.companyId,
          row: {
            groupNameKey: chain.groupNameKey,
            groupName: chain.groupName,
            registerName: REGISTER_NAME,
            status: "CHECK_FAILED" as const,
            error: caught instanceof Error ? caught.message : String(caught),
          },
        });
      }
    }
    return { checked };
  },
});
