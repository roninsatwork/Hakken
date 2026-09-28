import { defineTable } from "convex/server";
import { v } from "convex/values";
import { fanOutSourceValidator } from "./seoAiEngines";

/**
 * The fan-out searches of a company's own website, as angles
 * (docs/plans/active/fan-out-angles-plan.md). The searches come from the
 * answers to the company's own questions, so every row here is filed against
 * its owned hold and read only through it — never by website or by search,
 * which would let another company watching the same host read what this one
 * asks (docs/plans/active/private-tracking-lists-plan.md).
 */

/** Where a position came from. Our checks and Google's own average are never shown as if they were the same. */
export const anglePositionFromValidator = v.union(
  /** The searches the site ranks for, from the newest ranked-keywords answer. */
  v.literal("RANKED"),
  /** One of the company's tracked searches, checked on Google. */
  v.literal("CHECKED"),
  /** Search Console's average position over the last 28 days. */
  v.literal("SEARCH_CONSOLE"),
);

/** What the judge said of the site's pages for one angle (FA4). */
export const pageVerdictValidator = v.union(
  /** A page on the site answers it. */
  v.literal("ANSWERED"),
  /** None does: the missing angle. */
  v.literal("NONE"),
  /** The search is not about this business at all, so it is no angle of its. */
  v.literal("OFF_TOPIC"),
  /** The judge could not tell from what it was shown. Never counted as missing. */
  v.literal("UNSURE"),
);

export const angleWordingValidator = v.object({
  /** Lowercased and space-collapsed, the shape `seoKeywordIntents` and the tracked searches hold. */
  query: v.string(),
  /** As the engine wrote it. */
  queryText: v.string(),
  /** The engines that ran it, and Google's AI Overviews where Google did (FA8). */
  engines: v.array(fanOutSourceValidator),
  timesSeen: v.number(),
  lastSeenDay: v.string(),
});

/** A limit left unset follows the company, and the company's follows Hakken's own default. */
const maybeLimit = v.optional(v.number());

export const fanOutTables = {
  /**
   * How much of the fan-out searches is read, kept and judged (`fanOutLimits.ts`):
   * a company's own choices, and a website's where it overrides them. Anthony,
   * 2026-09-28: "i think we need configs in the UI for test".
   */
  fanOutLimits: defineTable({
    companyId: v.id("companies"),
    /** Absent on the company's own row; a website's override otherwise. */
    companyWebsiteId: v.optional(v.id("companyWebsites")),
    promptsPerSite: maybeLimit,
    trackedPerSite: maybeLimit,
    fanOutTrackedPerSite: maybeLimit,
    purchasesPerCollection: maybeLimit,
    searchesPerEngine: maybeLimit,
    wordingsPerAngle: maybeLimit,
    anglesShown: maybeLimit,
    consoleDays: maybeLimit,
    anglesJudgedPerRun: maybeLimit,
    anglesJudgedPerCollection: maybeLimit,
    pagesOffered: maybeLimit,
    auditPagesRead: maybeLimit,
    rankedPagesRead: maybeLimit,
    missingAnglesSuggested: maybeLimit,
    companyRowsRead: maybeLimit,
    googleSearchesRead: maybeLimit,
    competitorsPerSite: maybeLimit,
    updatedAt: v.number(),
  })
    .index("by_company_hold", ["companyId", "companyWebsiteId"])
    .index("by_hold", ["companyWebsiteId"]),

  /**
   * One angle of one question: the wordings the engines searched that say the
   * same thing, most seen first, and where the site stands for it. Rebuilt
   * after each collection from `promptFanOutQueries` (`fanOutAngles.ts`); a
   * rebuild stamps every row it writes, and the rows it did not write are the
   * ones to clear.
   */
  fanOutAngles: defineTable({
    holdId: v.id("companyWebsites"),
    /** The question as sent. */
    prompt: v.string(),
    /** Its wordings' words that matter (`utils/fanOutAngle.ts`). */
    angle: v.string(),
    /** Most seen first: the first is the one the screens show. */
    wordings: v.array(angleWordingValidator),
    engines: v.array(fanOutSourceValidator),
    timesSeen: v.number(),
    lastSeenDay: v.string(),
    /**
     * The best any wording holds, our own check before the ranked list and the
     * ranked list before Search Console. A check that did not find the site in
     * the top 100 is a position of null.
     */
    position: v.optional(v.object({
      value: v.union(v.number(), v.null()),
      from: anglePositionFromValidator,
      day: v.string(),
      query: v.string(),
    })),
    rebuiltAt: v.number(),
  })
    .index("by_hold_prompt_angle", ["holdId", "prompt", "angle"])
    .index("by_hold_angle", ["holdId", "angle"])
    .index("by_hold_seen", ["holdId", "timesSeen"])
    .index("by_hold_rebuilt", ["holdId", "rebuiltAt"]),

  /**
   * The searches Google's AI Overviews ran, for Google's own searches on one
   * question topic (FA8, `aiOverviewFanOuts.ts`), bought from DataForSEO's LLM
   * Mentions at most once every 30 days and shared by every company whose
   * question has that topic, as an answer is. Keyed on the topic and the
   * country it was bought for, never on a company or a website; a company's
   * angles read its own questions' topics.
   */
  aiOverviewFanOuts: defineTable({
    /** The question's words that matter, in its own order (`googleTopicOf`). */
    topic: v.string(),
    /** The country it was bought for: `GB`. */
    place: v.string(),
    /** Lowercased and space-collapsed, as `promptFanOutQueries` holds a search. */
    query: v.string(),
    /** As Google wrote it. */
    queryText: v.string(),
    /** How many of Google's AI Overviews ran it, over every purchase. */
    timesSeen: v.number(),
    firstSeenDay: v.string(),
    lastSeenDay: v.string(),
    /** The last purchase counted, so filing one answer twice counts it once. */
    lastPullId: v.id("seoDataPulls"),
  })
    .index("by_topic_place_seen", ["topic", "place", "timesSeen"])
    .index("by_topic_place_query", ["topic", "place", "query"]),

  /** What each rebuild of a hold's angles read and found: the counts the screens show, and whether it stopped short. */
  fanOutAngleLists: defineTable({
    holdId: v.id("companyWebsites"),
    rebuiltAt: v.number(),
    /** Set while a rebuild is under way, cleared when its last pass has run. */
    building: v.optional(v.number()),
    angles: v.number(),
    wordings: v.number(),
    /** A question and engine had more searches than were read. */
    cut: v.boolean(),
  }).index("by_hold", ["holdId"]),

  /**
   * Which of the site's pages answers an angle, judged once per angle and
   * site, and again when the site's pages change (FA4). Kept apart from the
   * angles, so a rebuild never loses what was paid to judge.
   */
  fanOutPageJudgments: defineTable({
    holdId: v.id("companyWebsites"),
    angle: v.string(),
    verdict: pageVerdictValidator,
    /** The page's address as the tables show it, and in full: present when a page answers it. */
    page: v.optional(v.string()),
    url: v.optional(v.string()),
    certainty: v.optional(v.union(v.literal("SURE"), v.literal("FAIRLY_SURE"), v.literal("NOT_SURE"))),
    /** The site's pages as they were judged against (`fanOutPageJudge.ts`); a newer set judges again. */
    pagesStamp: v.string(),
    judgedAt: v.number(),
  }).index("by_hold_angle", ["holdId", "angle"]),

  /**
   * What the company chose for one fan-out query of one of its prompts
   * (docs/plans/active/prompt-fan-out-queries-plan.md): one it added itself,
   * or one it deleted — never listed, counted or checked again, whatever the
   * AI runs. Whether it is checked every run is not kept here: it is ticked
   * when it is running on the website's tracked searches
   * (docs/plans/active/fan-out-opt-in-plan.md).
   */
  fanOutQueryChoices: defineTable({
    holdId: v.id("companyWebsites"),
    /** The question as sent. */
    prompt: v.string(),
    /** Lowercased and space-collapsed, the shape the tracked searches hold. */
    query: v.string(),
    /** As written: the company's own words, or the AI's. */
    queryText: v.string(),
    /** Added by hand on the question's screen: no AI ran it. */
    own: v.boolean(),
    /** Deleted: off the list and no longer checked; only an undo brings it back. */
    removed: v.boolean(),
    updatedAt: v.number(),
  })
    .index("by_hold_prompt", ["holdId", "prompt"])
    .index("by_hold_prompt_query", ["holdId", "prompt", "query"]),

  /**
   * The one Google check each fan-out query of a company's own website is
   * given before anyone ticks it (docs/plans/active/fan-out-opt-in-plan.md;
   * Anthony, 2026-09-28: opt-in for "anything beyond the first check"). One
   * row per website and query, whichever prompts list it, kept once the check
   * is filed so it is never bought twice. It is the company's own record that
   * it asked, and so what lets the company read the result (`holdLists.ts`):
   * the check itself is shared, filed against the website for everyone.
   */
  fanOutFirstChecks: defineTable({
    holdId: v.id("companyWebsites"),
    /** The hold's website: the check is filed against it even when it is not on the page. */
    websiteId: v.id("websites"),
    /** Lowercased and space-collapsed, the shape the tracked searches hold. */
    query: v.string(),
    /** The place it is checked from: the website's own. */
    locationCode: v.number(),
    /** The Google check bought or reused for it; absent until a collection plans it. */
    pullId: v.optional(v.id("seoDataPulls")),
    /** The day its check was filed, or the day the website's check already on file was made; absent until then. */
    checkedDay: v.optional(v.string()),
    createdAt: v.number(),
  })
    .index("by_hold_query", ["holdId", "query"])
    .index("by_hold_checked", ["holdId", "checkedDay"])
    .index("by_pull", ["pullId"]),

  /** One prompt's last "Generate fan-out queries now", for its screen to report. */
  fanOutQuestionSettings: defineTable({
    holdId: v.id("companyWebsites"),
    prompt: v.string(),
    generatedAt: v.optional(v.number()),
    /** The answers that press bought or reused, one per assistant. */
    generatedPulls: v.optional(v.array(v.id("seoDataPulls"))),
    updatedAt: v.number(),
  }).index("by_hold_prompt", ["holdId", "prompt"]),
};
