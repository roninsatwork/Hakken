import type { TableNames } from "./_generated/dataModel";

/**
 * How every table's rows are kept over time (keep-less-history-plan.md,
 * part 4; Anthony, 2026-10-07: "this is about not saving data we don't need
 * to store and don't access regularly"). One entry a table, so a table added
 * to the schema does not type-check until someone says how it is kept, and
 * `keepRules.test.ts` holds the rest: every table named, every job named
 * real.
 *
 * - RECORD — a row a thing (a company, a website, a setting): grows with
 *   things, not with time, and goes with its owner.
 * - LATEST — written over, or rebuilt whole: does not grow with time.
 * - CLEARED — grows with time, and a job clears it after `after`: a purge
 *   pipeline (`purges/<key>`, `purgeScheduleService.ts`, its retention a
 *   super admin may lengthen on Retention Rules) or a function
 *   (`<file>/<function>`).
 * - THINNED — grows with time, and a job keeps fewer of its rows as they age.
 * - FOREVER — grows with time and is kept, for the reason given: a record
 *   people read back, a cost ledger, a history.
 */
export type KeepRule =
  | { keep: "RECORD" }
  | { keep: "LATEST" }
  | { keep: "CLEARED"; after: string; by: string }
  | { keep: "THINNED"; how: string; by: string }
  | { keep: "FOREVER"; why: string };

const RECORD: KeepRule = { keep: "RECORD" };
const LATEST: KeepRule = { keep: "LATEST" };
const cleared = (after: string, by: string): KeepRule => ({ keep: "CLEARED", after, by });
const thinned = (how: string, by: string): KeepRule => ({ keep: "THINNED", how, by });
const forever = (why: string): KeepRule => ({ keep: "FOREVER", why });

/** Deleted with its owner, which a job clears: the owner's rule is the row's. */
const withRun = cleared("180 days, with its run", "purges/agentRunHistory");
const withThread = cleared("180 days, with its thread", "purges/chatHistory");
const withCycle = cleared("90 days, with its collection", "seoCollectionSweep/purgeExpiredCycles");
const withWorkflow = cleared("90 days, with its run", "purges/workflowLogs");

export const KEEP_RULES: Record<TableNames, KeepRule> = {
  // ── Companies, people and the platform ────────────────────────────────────
  companies: RECORD,
  users: RECORD,
  plans: RECORD,
  invitations: RECORD,
  emailTemplates: RECORD,
  systemSettings: RECORD,
  systemConfig: RECORD,
  apiKeys: RECORD,
  dataMigrations: RECORD,
  widgets: RECORD,
  mockStorageMetadata: RECORD,
  logins: cleared("180 days", "purges/userLogins"),
  auditLogs: cleared("90 days", "purges/auditLogs"),
  authEvents: cleared("180 days", "purges/authEvents"),
  publicApiRequests: cleared("90 days", "purges/publicApiRequests"),
  aiActionRequests: cleared("30 days", "purges/aiActionRequests"),
  webhookDeliveries: cleared("90 days", "purges/webhookDeliveries"),
  analyticsDailySnapshots: cleared("400 days", "purges/analyticsSnapshots"),
  purgeHistory: cleared("365 days, the newest 200 kept", "purges/purgeHistory"),
  phoneCalls: cleared("90 days", "purges/phoneCalls"),
  mailboxMessages: cleared("90 days", "purges/mailboxMessages"),
  decisionRuns: cleared("90 days", "purges/decisionRuns"),
  decisionSettings: RECORD,
  voiceTicketRedemptions: cleared("its ticket's life", "voiceRelay/redeemVoiceTicketInternal"),
  jobRuns: LATEST,
  tasks: forever("each piece of work raised, which people read back"),
  notifications: forever("a person's notifications, which they page back through"),
  arcadeScores: forever("the arcade's leaderboards read every score"),
  arcadeRuns: forever("each game played"),
  maintenanceScriptRuns: forever("each script run by hand, a record of what was done"),
  apifyRuns: forever("each Apify run, read back when one goes wrong"),

  // ── Sign-in (Convex Auth) ───────────────────────────────────────────────────
  authAccounts: RECORD,
  authSessions: forever("ended by sign-out or a new sign-in; the library has no sweep for sessions left to expire"),
  authRefreshTokens: forever("kept with their session, which the library ends"),
  authVerificationCodes: LATEST,
  authVerifiers: forever("one per sign-in started; the library clears it when the sign-in finishes"),
  authRateLimits: LATEST,

  // ── Billing, credits and uploads ──────────────────────────────────────────
  billingSettings: RECORD,
  billingHealth: LATEST,
  billingAccounts: RECORD,
  billingCheckouts: forever("each checkout started, checked against Stripe"),
  creditAccounts: RECORD,
  creditPrices: RECORD,
  creditSettings: RECORD,
  creditBatches: forever("the credit ledger: what each company was given"),
  creditCharges: forever("the credit ledger: each charge, on the Usage statement"),
  creditMonthRollups: forever("the Usage totals by month"),
  creditPlatformMonths: forever("the platform's totals by month"),
  creditDayTotals: forever("the Usage totals by day"),
  uploadReservations: cleared("10 minutes when not attached", "uploadReservations/cleanup"),
  uploadQuotas: cleared("its hour or day", "uploadReservations/cleanup"),
  uploadControl: LATEST,

  // ── Agents, AI and governance ─────────────────────────────────────────────
  aiProviders: RECORD,
  aiModels: RECORD,
  aiModelDefaults: RECORD,
  aiModelRollups: LATEST,
  aiRules: RECORD,
  aiTools: RECORD,
  agents: RECORD,
  agentTools: RECORD,
  agentSkills: RECORD,
  agentSkillBindings: RECORD,
  agentSkillRollups: LATEST,
  agentEvalFixtures: RECORD,
  agentEvalSuitePresets: RECORD,
  agentMemories: RECORD,
  agentRuns: cleared("180 days once finished", "purges/agentRunHistory"),
  agentRunSteps: withRun,
  agentToolCalls: withRun,
  agentRunFeedback: withRun,
  agentRunReflections: withRun,
  agentMemoryUsage: withRun,
  agentRunCheckpoints: LATEST,
  agentLogs: cleared("90 days", "purges/agentLogs"),
  agentTransactions: cleared("90 days", "purges/agentTransactions"),
  agentToolIdempotency: cleared("24 hours", "aiToolWriteTools/purgeExpiredToolIdempotency"),
  agentRunApprovals: forever("evidence of what a person approved"),
  agentMemoryCandidates: forever("proposals, kept with their review"),
  agentImprovementSuggestions: forever("proposals, kept with their review"),
  agentVersions: forever("each change to an agent, to compare and roll back"),
  agentSkillVersions: forever("each change to a skill, to compare and roll back"),
  companySkills: RECORD,
  companySkillBindings: RECORD,
  companyMemories: RECORD,
  companyMemoryCandidates: forever("proposals, kept with their review"),
  companyMemoryUsage: withThread,
  companyMemorySweeps: LATEST,
  companyAiDriftEvents: forever("each change found, resolved in place"),
  companyEvalCases: RECORD,
  companyEvalRuns: forever("each case's history of runs"),
  userMemories: RECORD,
  userMemorySweeps: LATEST,
  governanceDayRollups: forever("the governance timeline by day, built to outlive the runs"),
  governanceEstateRollups: LATEST,
  inventoryRollups: LATEST,
  toolConnectors: RECORD,
  toolConnectorSecretRefs: RECORD,
  toolConnectorTestLogs: forever("each connector test, kept with its connector"),
  toolConnectorOAuthConnections: forever("each Connect started; a pending one stops working after 15 minutes"),
  connectorOAuthTokens: RECORD,
  mcpServers: RECORD,
  mcpServerTools: RECORD,
  workflows: RECORD,
  workflowExecutions: cleared("90 days", "purges/workflowLogs"),
  workflowExecutionSteps: withWorkflow,
  schedules: RECORD,
  threads: cleared("180 days after their last message", "purges/chatHistory"),
  messages: withThread,
  messageFeedback: withThread,
  swarmLogs: withThread,

  // ── Knowledge and the wiki ────────────────────────────────────────────────
  knowledgeDocuments: RECORD,
  knowledgeChunks: RECORD,
  knowledgeChunkStats: LATEST,
  knowledgeImportQuotas: LATEST,
  wikiPages: RECORD,
  wikiPageSources: RECORD,
  wikiDistillState: LATEST,
  wikiReviews: RECORD,
  wikiOpenQuestions: forever("each question raised, kept with its answer"),
  wikiUnansweredQuestions: forever("each question asked and not answered, counted"),
  wikiAnswerTallies: forever("the weekly report's counts by day"),
  wikiPageRevisions: forever("each page's history"),

  // ── Content, news and email ───────────────────────────────────────────────
  contentTranslations: RECORD,
  knowledgeArticles: RECORD,
  libraryArticles: RECORD,
  libraryArticleTexts: RECORD,
  libraryArticleSections: RECORD,
  topics: RECORD,
  insightsCounts: LATEST,
  newsSources: RECORD,
  newsTakenDown: RECORD,
  newsFollows: RECORD,
  xConnections: RECORD,
  googleUpdates: RECORD,
  newsItems: forever("the News feed, which people page back through"),
  weeklyDigestIssues: forever("one a week, each the issue that was sent"),
  readerPreferences: RECORD,
  emailSuppressions: RECORD,
  outboxMessages: cleared("60 days once sent, failed or skipped", "purges/sentEmails"),
  telegramLinks: RECORD,
  telegramLinkCodes: LATEST,
  telegramBots: RECORD,

  // ── Hakken tasks ──────────────────────────────────────────────────────────
  hakkenTasks: RECORD,
  hakkenTaskChecks: cleared("90 days", "purges/hakkenTaskChecks"),

  // ── Websites and their lists ──────────────────────────────────────────────
  websites: RECORD,
  companyWebsites: RECORD,
  websiteQuestions: RECORD,
  websiteKeywords: RECORD,
  websiteMoves: RECORD,
  websiteSearchStats: LATEST,
  websiteQuestionStats: LATEST,
  websiteIcons: RECORD,
  holdProfiles: RECORD,
  companyDataLimits: RECORD,
  platformLimits: RECORD,
  websiteDataLimits: RECORD,

  // ── DataForSEO: what was bought ───────────────────────────────────────────
  seoDataPulls: forever("the cost ledger, checked against DataForSEO's invoice"),
  seoPullAnswers: cleared("7 days", "seoCollectionSweep/purgeExpiredRaw"),
  seoCollectionCycles: cleared("90 days once finished", "seoCollectionSweep/purgeExpiredCycles"),
  seoCycleLines: withCycle,
  seoCycleSpend: withCycle,
  seoRunReports: withCycle,
  seoDayRollups: forever("the collection cost screens' totals by day"),
  seoOperationCosts: LATEST,
  seoKeywordIntents: RECORD,
  seoWebsiteMetrics: forever("each collection's figures, drawn on the Sites charts"),

  // ── DataForSEO: what the Sites screens read ───────────────────────────────
  keywordPositionMonths: thinned("daily 90 days, weekly to a year, monthly to two, then cleared", "positionHistory/coarsenPositions"),
  siteKeywordRanks: LATEST,
  siteKeywordFeatures: LATEST,
  sitePageRanks: LATEST,
  siteSections: LATEST,
  sitePageTypes: RECORD,
  siteDaySummaries: forever("a website's figures by day, drawn on the Sites charts"),
  siteListAiDays: forever("a list's AI answers by day, drawn on the AI charts"),
  siteCitedPages: LATEST,
  siteSerpPages: cleared("90 days", "seoCollectionSweep/purgeExpiredSerpPages"),
  searchVolumes: LATEST,
  siteBacklinks: LATEST,
  siteReferringDomainParts: LATEST,
  siteAnchorParts: LATEST,
  siteLinkWeeks: forever("a website's links gained and lost by week, drawn on New and lost links"),
  siteReferringIpParts: LATEST,
  sitePaidKeywords: LATEST,
  siteCrawls: forever("each crawl, which the Site audit compares"),
  siteCrawlPages: LATEST,
  siteCrawlLinks: LATEST,
  siteListQuestions: LATEST,
  siteListAiSummary: LATEST,
  siteSummaryRequests: LATEST,
  siteListCopies: LATEST,
  siteListCopyParts: LATEST,
  siteSitemaps: LATEST,
  siteSitemapParts: LATEST,
  holdPages: LATEST,
  pageClassifications: RECORD,
  pageClassificationLines: RECORD,
  pageClassificationPicks: RECORD,
  discoveredCompetitors: RECORD,

  // ── AI answers ────────────────────────────────────────────────────────────
  aiAnswers: forever("who an answer named, behind every count of mentions"),
  aiCitations: forever("who an answer cited, behind every count of citations"),
  aiAnswerTexts: cleared("90 days", "siteAnswers/deleteAnswerText"),
  aiAnswerIndex: cleared("90 days, with its answer's words", "siteAnswers/deleteAnswerText"),
  promptFanOutQueries: RECORD,
  promptFanOutDays: cleared("12 months", "seoCollectionSweep/purgeExpiredFanOutDays"),
  aiOverviewFanOuts: RECORD,
  fanOutLimits: RECORD,
  fanOutAngles: LATEST,
  fanOutAngleLists: LATEST,
  fanOutPageJudgments: RECORD,
  fanOutQueryChoices: RECORD,
  fanOutFirstChecks: RECORD,
  fanOutQuestionSettings: LATEST,

  // ── Search Console ────────────────────────────────────────────────────────
  searchConsoleConnections: RECORD,
  searchConsoleTokens: RECORD,
  searchConsolePageAddresses: RECORD,
  searchConsoleTracked: RECORD,
  searchConsoleSeen: RECORD,
  searchConsoleDays: forever("a website's totals by day, drawn on the Search Console charts"),
  searchConsoleLists: cleared("60 days", "searchConsoleRollups/dropOldLines"),
  searchConsoleKeywordBooks: cleared("with its month's lines", "searchConsoleKeywordBooks/dropOldBooks"),
  searchConsolePeriods: LATEST,
  searchConsolePeriodBooks: cleared("once no list is read from its build", "searchConsolePeriodBooks/dropUnusedBooks"),
  searchConsolePeriodUses: LATEST,
  searchConsoleWeeks: LATEST,
  searchConsoleSeenDays: LATEST,
  searchConsoleRuns: forever("each collection, the run log"),

  // ── Keyword research ──────────────────────────────────────────────────────
  keywordLookups: RECORD,
  researchLists: RECORD,
  researchListKeywords: RECORD,
  researchKeywords: forever("each purchase's keywords; screens read the newest"),
  researchSerps: forever("each purchase's results pages; screens read the newest"),
  researchIdeas: forever("each purchase's ideas; screens read the newest"),
  researchAnswers: forever("each purchase's answers; screens read the newest"),
  researchJobs: forever("each part of a lookup bought"),
};
