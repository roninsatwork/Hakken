import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import { rowShape } from "./rowShape";

/**
 * What the website surfaces hand back.
 *
 * Two rows are joined in every case, because neither is useful alone: a
 * company's website row without its host is a pair of ids, and a host without
 * its watchers cannot say how often it is fetched. The joins are declared here
 * so a column added to either table has to be let through deliberately.
 */

/**
 * Where a website's schedule came from. `NONE` means nothing is scheduled;
 * `PAIR` means a tracked site is collected on the day of the site it is
 * watched against, and has no schedule of its own to show.
 */
const scheduleSource = v.union(
  v.literal("WEBSITE"),
  v.literal("COMPANY"),
  v.literal("NONE"),
  v.literal("PAIR"),
);

/** One of a company's own websites, with its host and how many rivals it has. */
export const companyWebsiteRow = v.object({
  ...rowShape.companyWebsites.fields,
  _id: v.id("companyWebsites"),
  host: v.string(),
  displayHost: v.string(),
  /** For a paired tracked site, the company's own site it is watched against. */
  againstHost: v.union(v.string(), v.null()),
  competitorCount: v.number(),
  competitorCountIsCapped: v.boolean(),
  /** Open moves on its Brief, counted to twenty-one so "20+" can be said. */
  movesWaiting: v.number(),
  /** Whether anything is pulled for this website, once inheritance is applied. */
  collecting: v.boolean(),
  scheduleSource,
  nextRunAt: v.union(v.number(), v.null()),
});

export const companyWebsitePageShape = paginationResultValidator(companyWebsiteRow);

/**
 * One of a company's websites in full, with its settings resolved.
 *
 * The screen gets both the stored values (where absence means "follow the
 * company") and the effective ones, because it has to show what this website
 * actually runs at *and* let someone clear an override back to inheriting.
 * Resolving in the browser would put the inheritance rule in two places.
 */
export const companyWebsiteDetailShape = v.union(v.null(), v.object({
  ...rowShape.companyWebsites.fields,
  _id: v.id("companyWebsites"),
  host: v.string(),
  displayHost: v.string(),
  companyName: v.union(v.string(), v.null()),
  /**
   * For a tracked site, the company's own site it is collected with — whose
   * day and place are this one's. Null for an owned site, and for a tracked
   * one that is collected on its own.
   */
  pairedWith: v.union(v.null(), v.object({
    companyWebsiteId: v.id("companyWebsites"),
    websiteId: v.id("websites"),
    displayHost: v.string(),
    locationLabel: v.union(v.string(), v.null()),
  })),
  /** The company's own schedule, so a screen can show what is being inherited. */
  companyIntervalStr: v.union(v.string(), v.null()),
  companyScheduleActive: v.boolean(),
  effective: v.object({
    active: v.boolean(),
    intervalStr: v.union(v.string(), v.null()),
    source: scheduleSource,
    nextRunAt: v.union(v.number(), v.null()),
  }),
}));


/**
 * One website in the global list.
 *
 * `nextPullAt` is derived, never stored: the soonest next run among every
 * switched-on company watching this host, whether as their own site or as a
 * competitor. `fetchedFor` names whose schedule is driving it, which is the
 * first thing anyone will want when the DataForSEO bill is higher than
 * expected.
 */
export const globalWebsiteRow = v.object({
  ...rowShape.websites.fields,
  _id: v.id("websites"),
  watcherCount: v.number(),
  companyCount: v.number(),
  ownedCount: v.number(),
  trackedCount: v.number(),
  /** When this host is next pulled, across everyone watching it. */
  nextPullAt: v.union(v.number(), v.null()),
  fetchedFor: v.union(v.null(), v.object({
    companyName: v.string(),
    context: v.string(),
  })),
});

export const globalWebsitePageShape = paginationResultValidator(globalWebsiteRow);

/**
 * Every company holding or watching one host. Super admin only, by design:
 * this is the one view that crosses company boundaries.
 */
export const websiteWatcherShape = v.array(v.object({
  key: v.string(),
  companyId: v.id("companies"),
  companyName: v.string(),
  /** OWNED when this is the company's own site; TRACKED when it is a rival. */
  relationship: v.union(v.literal("OWNED"), v.literal("TRACKED")),
  /** For a competitor, the company website it is measured against. */
  againstHost: v.union(v.string(), v.null()),
  companyWebsiteId: v.id("companyWebsites"),
  intervalStr: v.union(v.string(), v.null()),
  collecting: v.boolean(),
  nextRunAt: v.union(v.number(), v.null()),
}));

export const websiteDetailShape = v.union(v.null(), v.object({
  ...rowShape.websites.fields,
  _id: v.id("websites"),
  nextPullAt: v.union(v.number(), v.null()),
  watchers: websiteWatcherShape,
}));

/** What an add form is told before it saves, so a person sees the key first. */
export const websitePreviewShape = v.union(
  v.object({
    ok: v.literal(true),
    host: v.string(),
    displayHost: v.string(),
    alreadyKnown: v.boolean(),
    /**
     * What a company attaching to a known host inherits on the day it does.
     *
     * The whole argument for putting the lists on the host: a client attached
     * to a site Hakken already tracks sees its history, its searches and its
     * questions immediately, rather than waiting a month for anything worth
     * showing. Absent when the host is new, because there is nothing to inherit.
     */
    inherits: v.optional(v.object({
      keywords: v.number(),
      questions: v.number(),
      rivals: v.number(),
      weeksOfHistory: v.number(),
    })),
  }),
  v.object({ ok: v.literal(false), problem: v.string(), message: v.string() }),
);
