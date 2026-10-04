import { v } from "convex/values";

/**
 * What Keyword research's reads return (docs/plans/active/keyword-research-
 * plan.md), declared so a screen and the server cannot drift apart unseen
 * (`src/return-shape-drift.test.ts`). One shape per read, beside each other.
 */

const num = v.union(v.number(), v.null());
const str = v.union(v.string(), v.null());
const partState = v.union(v.literal("WAITING"), v.literal("READY"), v.literal("FAILED"));
const who = v.union(v.literal("YOU"), v.literal("RIVAL"), v.null());
const verdict = v.union(v.literal("WINNING"), v.literal("IMPROVE"), v.literal("NEW_PAGE"), v.literal("TOO_HARD"), v.null());

export const researchSetupShape = v.union(v.null(), v.object({
  canLookUp: v.boolean(),
  countries: v.array(v.object({ code: v.number(), label: v.string() })),
  websites: v.array(v.object({ siteId: v.id("companyWebsites"), host: v.string(), homeCountry: v.number() })),
  limits: v.object({ keywordsPerLookup: v.number(), ideasPerKind: v.number(), reuseDays: v.number() }),
  agent: v.union(v.null(), v.object({ active: v.boolean(), test: v.boolean() })),
}));

export const pastLookupsShape = v.array(v.object({
  lookupId: v.id("keywordLookups"),
  keyword: v.string(),
  locationCode: v.number(),
  country: v.string(),
  host: str,
  state: partState,
  openedAt: v.number(),
  volume: num,
  difficulty: num,
  intent: str,
  position: num,
  notInTop100: v.boolean(),
  sample: v.boolean(),
}));

const topPage = v.object({
  position: v.number(),
  url: v.string(),
  domain: v.string(),
  title: v.string(),
  kind: str,
  strength: num,
  linkingSites: num,
  visits: num,
  keywords: num,
  topKeyword: str,
});

export const lookupOverviewShape = v.union(v.null(), v.object({
  lookupId: v.id("keywordLookups"),
  keyword: v.string(),
  locationCode: v.number(),
  country: v.string(),
  state: partState,
  problem: str,
  openedAt: v.number(),
  boughtAt: num,
  costUsd: num,
  sample: v.boolean(),
  overview: v.union(v.null(), v.object({
    volume: num,
    cpc: num,
    competitionLevel: str,
    difficulty: num,
    intent: str,
    monthly: v.array(v.object({ month: v.string(), volume: v.number() })),
    serpKinds: v.array(v.string()),
    resultsCount: num,
    topTenLinkingSites: num,
  })),
  top: v.union(v.null(), v.array(topPage)),
  topResult: v.union(v.null(), topPage),
  resultsCount: num,
  results: v.union(partState, v.null()),
  serpBoughtAt: num,
  forWebsite: v.union(v.null(), v.object({
    siteId: v.id("companyWebsites"),
    host: v.string(),
    position: num,
    url: str,
    notInTop100: v.boolean(),
    visits: num,
    checkedDay: str,
    linkingSites: num,
    tracked: v.boolean(),
    verdict,
    competitors: v.array(v.object({ host: v.string(), position: num })),
  })),
  countries: v.array(v.object({
    code: v.number(),
    label: v.string(),
    state: v.union(v.literal("HOME"), partState, v.null()),
    volume: num,
  })),
  lists: v.array(v.object({ listId: v.id("researchLists"), name: v.string() })),
  canLookUp: v.boolean(),
}));

export const lookupResultsShape = v.union(v.null(), v.object({
  lookupId: v.id("keywordLookups"),
  keyword: v.string(),
  country: v.string(),
  state: v.union(partState, v.null()),
  problem: str,
  checkedAt: num,
  detailsAt: num,
  sample: v.boolean(),
  rows: v.array(v.object({
    position: v.number(),
    url: v.string(),
    domain: v.string(),
    title: v.string(),
    kind: str,
    strength: num,
    linkingSites: num,
    visits: num,
    keywords: num,
    topKeyword: str,
    who,
  })),
  beyond: v.array(v.object({ domain: v.string(), who, position: num, url: str })),
}));

export const researchListsShape = v.array(v.object({
  listId: v.id("researchLists"),
  name: v.string(),
  keywords: v.number(),
  volume: v.number(),
  host: str,
  updatedAt: v.number(),
}));

export const researchListShape = v.union(v.null(), v.object({
  listId: v.id("researchLists"),
  name: v.string(),
  siteId: v.union(v.id("companyWebsites"), v.null()),
  host: str,
  createdBy: str,
  createdAt: v.number(),
  rows: v.array(v.object({
    keyword: v.string(),
    text: v.string(),
    locationCode: v.number(),
    volume: num,
    difficulty: num,
    intent: str,
    position: num,
    url: str,
    verdict,
    tracked: v.boolean(),
    addedAt: v.number(),
  })),
  canChange: v.boolean(),
}));

const ideaKind = v.union(v.literal("TERMS"), v.literal("QUESTIONS"), v.literal("ALSO_RANK"));

export const lookupIdeasShape = v.union(v.null(), v.object({
  lookupId: v.id("keywordLookups"),
  keyword: v.string(),
  country: v.string(),
  host: str,
  siteId: v.union(v.id("companyWebsites"), v.null()),
  kind: ideaKind,
  state: v.union(partState, v.null()),
  problem: str,
  boughtAt: num,
  sample: v.boolean(),
  counts: v.object({ TERMS: num, QUESTIONS: num, ALSO_RANK: num }),
  rows: v.array(v.object({ keyword: v.string(), volume: num, difficulty: num, intent: str, cpc: num, position: num, page: str })),
}));

export const lookupAnswersShape = v.union(v.null(), v.object({
  lookupId: v.id("keywordLookups"),
  keyword: v.string(),
  country: v.string(),
  host: str,
  state: v.union(partState, v.null()),
  problem: str,
  askedAt: num,
  sample: v.boolean(),
  question: str,
  figures: v.union(v.null(), v.object({
    answered: v.number(),
    nameYou: v.number(),
    nameARival: v.number(),
    rivalMost: str,
    businessesNamed: v.number(),
    pagesCited: v.number(),
    pagesCitedYours: v.number(),
  })),
  engines: v.array(v.object({
    engine: v.string(),
    answered: v.boolean(),
    answer: v.string(),
    named: v.array(v.object({ host: v.string(), who })),
    yourPlace: num,
    rivalsNamed: v.array(v.string()),
    cited: v.array(v.object({ url: v.string(), host: v.string() })),
    citedYours: v.number(),
  })),
  mostNamed: v.array(v.object({ host: v.string(), who, count: v.number() })),
  searches: v.array(v.object({ query: v.string(), times: v.number(), page: str })),
  canAsk: v.boolean(),
}));

export const competitorStartsShape = v.object({
  preparing: v.boolean(),
  rivals: v.array(v.object({ rivalSiteId: v.id("companyWebsites"), host: v.string(), gap: num })),
});

export const competitorGapShape = v.union(v.null(), v.object({
  host: v.string(),
  rivalHost: v.string(),
  locationCode: v.number(),
  preparing: v.boolean(),
  ranksFor: num,
  visits: num,
  rows: v.array(v.object({ keyword: v.string(), position: v.number(), volume: num, difficulty: num, intent: v.string(), traffic: num })),
}));
