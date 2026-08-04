/**
 * Reading the Care Quality Commission's register, one care group at a time.
 *
 * Runs after every prospect hunt: for each care group the workspace supplies,
 * a web search finds the group's provider pages on cqc.org.uk, the page
 * reader fetches each provider's services page, and the locations named there
 * are counted against what is on file. The verdict lands where the customers
 * screen shows it. The register is the referee the finder cannot argue with —
 * Allegra Care passed every per-site check while a third of its homes were
 * simply never read.
 *
 * Search and reading go through the platform's own web tools (Firecrawl, the
 * key already on this deployment) — no separate feed, no extra signup. A
 * deployment without that key gets NOT_CONFIGURED rows, visible on the
 * screen, rather than a silently absent check.
 */

import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import {
  computeCoverage,
  dedupeRegisterLocations,
  extractProviderIdFromLocationPage,
  extractProviderIds,
  parseProviderPage,
  providerBelongsToGroup,
  unmatchedKnownSites,
  type RegisterLocation,
} from "./salesDataRegisterCoverageService";
import type { CoverageChain } from "./salesDataRegisterCoverage";

const REGISTER_NAME = "CQC";

/**
 * Groups whose homes sit in per-home companies surface several providers —
 * Allegra registers every home as its own, so this is sized for a home per
 * company, not a company per group.
 */
const MAX_PROVIDERS_PER_GROUP = 15;

/**
 * Homes on file whose companies no search surfaced, hunted through their own
 * register pages, this many per check. Bounded because each is a search and
 * two page reads; with the companies remembered, successive checks converge
 * on the full picture rather than re-hunting.
 */
const MAX_SITE_HUNTS_PER_CHECK = 6;

export const checkCareRegisterCoverage = internalAction({
  args: { companyId: v.id("companies") },
  handler: async (ctx, args) => {
    const chains: CoverageChain[] = await ctx.runQuery(
      internal.salesDataRegisterCoverage.listCareChainsForCoverage,
      { companyId: args.companyId }
    );
    if (chains.length === 0) return { checked: 0 };

    if (!process.env.FIRECRAWL_API_KEY) {
      for (const chain of chains) {
        await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
          companyId: args.companyId,
          row: {
            groupNameKey: chain.groupNameKey,
            groupName: chain.groupName,
            registerName: REGISTER_NAME,
            status: "NOT_CONFIGURED" as const,
            error:
              "The web reading service this platform searches with is not set up on this "
              + "deployment, so the register cannot be read.",
          },
        });
      }
      return { checked: 0, notConfigured: chains.length };
    }

    let checked = 0;
    for (const chain of chains) {
      try {
        // Two searches, because one is not enough: Colten Care's homes sit in
        // three registered companies, and the first live run's single search
        // surfaced two of them — Monmouth House's company was the third.
        const queries = [
          `site:cqc.org.uk/provider "${chain.groupName}"`,
          `site:cqc.org.uk/provider "${chain.groupName}" services locations`,
        ];
        const results: { url: string; title: string }[] = [];
        let searchError: string | null = null;
        for (const query of queries) {
          const search = await ctx.runAction(internal.webScrapeActions.searchWeb, { query });
          if (search.status === "success") results.push(...search.results);
          else searchError = search.error;
        }
        if (results.length === 0 && searchError) {
          throw new Error(searchError);
        }

        // Companies confirmed by any earlier check are candidates for ever
        // after — a search that fails to resurface one must not unlearn it.
        const providerIds = [
          ...new Set([...chain.rememberedProviderIds, ...extractProviderIds(results)]),
        ];
        if (providerIds.length === 0) {
          await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
            companyId: args.companyId,
            row: {
              groupNameKey: chain.groupNameKey,
              groupName: chain.groupName,
              registerName: REGISTER_NAME,
              status: "PROVIDER_NOT_FOUND" as const,
              error:
                `A web search found no register page for "${chain.groupName}". `
                + "Groups that have renamed land here; check the register by hand once.",
            },
          });
          continue;
        }

        const providerNames: string[] = [];
        const acceptedIds: string[] = [];
        const locations: RegisterLocation[] = [];
        let pagesRead = 0;
        for (const providerId of providerIds.slice(0, MAX_PROVIDERS_PER_GROUP)) {
          const page = await ctx.runAction(internal.webScrapeActions.scrapeUrl, {
            url: `https://www.cqc.org.uk/provider/${providerId}/services`,
            mainContentOnly: false,
          });
          if (page.status !== "success") continue;
          pagesRead += 1;

          // The page title carries the registered company's name — "Colten
          // Care (1993) Limited - Services - Care Quality Commission". A
          // search can surface a lookalike; the name decides membership.
          const providerName = page.title.split(" - ")[0]?.trim() ?? "";
          if (!providerBelongsToGroup(providerName, chain.groupName)) continue;

          providerNames.push(providerName);
          acceptedIds.push(providerId);
          locations.push(...parseProviderPage(page.content));
        }

        // Homes we hold that the register picture does not explain mean a
        // company no search surfaced — Allegra registers every home as its
        // own. Each such home's register page names its company; read it,
        // claim it, and fold its locations in.
        const toHunt = unmatchedKnownSites(
          chain.groupName,
          dedupeRegisterLocations(locations),
          chain.knownSites
        ).slice(0, MAX_SITE_HUNTS_PER_CHECK);
        for (const site of toHunt) {
          // The postcode is in the query and checked on the page, because care
          // homes share names: England holds several Olive Tree Houses, and
          // only one of them is this group's.
          const hunt = await ctx.runAction(internal.webScrapeActions.searchWeb, {
            query:
              `site:cqc.org.uk/location "${site.name}"`
              + (site.postcode ? ` "${site.postcode}"` : ""),
            limit: 3,
          });
          if (hunt.status !== "success") continue;
          const locationUrls = hunt.results
            .map((result) => result.url)
            .filter((url) => /cqc\.org\.uk\/location\/1-[0-9]+/.test(url))
            .map((url) => url.replace(/(location\/1-[0-9]+).*/, "$1"));

          for (const locationUrl of [...new Set(locationUrls)]) {
            const locationPage = await ctx.runAction(internal.webScrapeActions.scrapeUrl, {
              url: locationUrl,
              mainContentOnly: false,
            });
            if (locationPage.status !== "success") continue;
            // A namesake at another address proves nothing about this home.
            const postcodeVerified = Boolean(
              site.postcode && locationPage.content.includes(site.postcode)
            );
            if (site.postcode && !postcodeVerified) continue;
            const providerId = extractProviderIdFromLocationPage(locationPage.content);
            if (!providerId) continue;
            if (acceptedIds.includes(providerId)) break;

            const providerPage = await ctx.runAction(internal.webScrapeActions.scrapeUrl, {
              url: `https://www.cqc.org.uk/provider/${providerId}/services`,
              mainContentOnly: false,
            });
            if (providerPage.status !== "success") continue;
            pagesRead += 1;
            const providerName = providerPage.title.split(" - ")[0]?.trim() ?? "";
            // Membership is proved one of two ways. By name, as for searched
            // companies — or by the chain of custody that got here: the
            // group's own site listed this home, the finder filed it with its
            // postcode, and the register page for that exact postcode names
            // this company. Allegra's Magdalen House sits in plain "Magdalen
            // House Limited"; the name test alone would refuse the register's
            // own answer.
            if (!postcodeVerified && !providerBelongsToGroup(providerName, chain.groupName)) {
              continue;
            }

            providerNames.push(providerName);
            acceptedIds.push(providerId);
            locations.push(...parseProviderPage(providerPage.content));
            break;
          }
        }

        if (pagesRead === 0) {
          throw new Error("The register's pages could not be read this time.");
        }
        if (providerNames.length === 0) {
          await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
            companyId: args.companyId,
            row: {
              groupNameKey: chain.groupNameKey,
              groupName: chain.groupName,
              registerName: REGISTER_NAME,
              status: "PROVIDER_NOT_FOUND" as const,
              providerIds: chain.rememberedProviderIds,
              error:
                `The register pages a search surfaced for "${chain.groupName}" belong to `
                + "other businesses. Groups that have renamed land here; check the register by hand once.",
            },
          });
          continue;
        }

        const coverage = computeCoverage(
          chain.groupName,
          dedupeRegisterLocations(locations),
          chain.knownSites
        );

        // A registered home that is not a customer is a prospect — Anthony,
        // 2026-08-04: "if they exist and not a customer then they are a
        // prospect". The register names it, places it, and is a better
        // witness than any search, so the gap is filed rather than reported.
        // What cannot be filed (a name clash the matcher refuses, say) stays
        // on the row as missing, for a person.
        const stillMissing: typeof coverage.missing = [];
        let filedFromRegister = 0;
        for (const home of coverage.missing) {
          const filed = await ctx.runMutation(internal.salesDataResearch.recordProspect, {
            companyId: args.companyId,
            groupName: chain.groupName,
            siteName: home.name,
            ...(home.postcode ? { postcode: home.postcode } : {}),
            sourceUrl: home.locationId
              ? `https://www.cqc.org.uk/location/${home.locationId}`
              : `https://www.cqc.org.uk/provider/${acceptedIds[0]}/services`,
            sourceName: "CQC register",
            reasoning:
              "On the official register as this group's, and not on file — filed by the register check.",
          });
          if (filed.recorded) filedFromRegister += 1;
          else if (!("alreadyKnown" in filed && filed.alreadyKnown)) stillMissing.push(home);
        }

        await ctx.runMutation(internal.salesDataRegisterCoverage.upsertChainCoverage, {
          companyId: args.companyId,
          row: {
            groupNameKey: chain.groupNameKey,
            groupName: chain.groupName,
            registerName: REGISTER_NAME,
            status: stillMissing.length === 0 ? ("COVERED" as const) : ("GAPS" as const),
            registerCount: coverage.registerCount,
            accountedFor: coverage.accountedFor + filedFromRegister,
            missing: stillMissing,
            filedFromRegister,
            providerNames,
            // Confirmed this run or any earlier one: a company whose page did
            // not read today stays known for tomorrow's check.
            providerIds: [...new Set([...chain.rememberedProviderIds, ...acceptedIds])],
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
            providerIds: chain.rememberedProviderIds,
            error: caught instanceof Error ? caught.message : String(caught),
          },
        });
      }
    }
    return { checked };
  },
});
