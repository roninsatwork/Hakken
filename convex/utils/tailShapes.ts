import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

import schema, { opportunityHeadlineValidator } from "../schema";
import { rowShape } from "./rowShape";

const reportFields = schema.tables.salesOpportunityReports.validator.fields;
const gapProductFields = schema.tables.salesOpportunityReportGapProducts.validator.fields;
const typeBasketFields = schema.tables.salesOpportunityReportTypeBaskets.validator.fields;

/** Shapes for the surfaces that come one or two to a file. */

export const agentTransactionPageShape = paginationResultValidator(rowShape.agentTransactions);

export const agentTransactionStatsShape = v.object({
  totalGenerations: v.number(),
  totalTokensIngested: v.number(),
  totalInputTokens: v.number(),
  totalOutputTokens: v.number(),
  totalOpexCost: v.number(),
});

export const spokenAudioShape = v.object({
  audioBase64: v.string(),
  mimeType: v.string(),
});

export const voiceSessionShape = v.union(
  v.object({
    transport: v.literal("google-relay"),
    relayUrl: v.string(),
    ticket: v.string(),
    model: v.string(),
    expiresAt: v.number(),
  }),
  v.object({
    transport: v.literal("openai-webrtc"),
    clientSecret: v.string(),
    model: v.string(),
    expiresAt: v.union(v.number(), v.null()),
  }),
);

export const leaderboardPageShape = paginationResultValidator(v.object({
  ...rowShape.arcadeScores.fields,
  userName: v.string(),
  userAvatar: v.union(v.string(), v.null()),
}));

export const evalRunOutcomeShape = v.object({
  status: v.union(v.literal("PASSED"), v.literal("FAILED"), v.literal("NEEDS_REVIEW")),
  score: v.number(),
});

export const evalBatchShape = v.object({ scheduled: v.number() });

export const companyReadinessShape = v.object({
  companyName: v.string(),
  state: v.union(v.literal("NEEDS_ATTENTION"), v.literal("READY")),
  needsAttentionCount: v.number(),
  configuredCount: v.number(),
  areas: v.array(v.object({
    key: v.string(),
    label: v.string(),
    state: v.union(
      v.literal("NEEDS_ATTENTION"),
      v.literal("SET_HERE"),
      v.literal("NOT_CONFIGURED"),
    ),
    summary: v.string(),
    action: v.optional(v.string()),
    href: v.string(),
  })),
});

export const driftResolutionShape = v.object({ resolvedCount: v.number() });

export const migrationStatusShape = v.union(rowShape.dataMigrations, v.null());

export const migrationStatusListShape = v.array(v.object({
  name: v.string(),
  status: v.string(),
  processed: v.number(),
  updated: v.number(),
  completedAt: v.optional(v.number()),
  error: v.optional(v.string()),
}));

export const ownerCandidateListShape = v.array(v.object({
  id: v.id("users"),
  name: v.string(),
}));

const aiSystemEntryShape = v.object({
  id: v.string(),
  kind: v.union(v.literal("ASSISTANT"), v.literal("WIDGET"), v.literal("WORKFLOW")),
  name: v.string(),
  purpose: v.string(),
  ownerName: v.string(),
  risk: v.union(v.literal("LOW"), v.literal("MEDIUM"), v.literal("HIGH"), v.literal("UNRATED")),
  humanApproves: v.boolean(),
  facesPublic: v.boolean(),
  model: v.optional(v.string()),
  lastActiveAt: v.optional(v.number()),
  activity: v.optional(v.number()),
  missing: v.array(v.string()),
});

export const aiRegisterShape = v.object({
  entries: v.array(aiSystemEntryShape),
  summary: v.object({
    total: v.number(),
    incomplete: v.number(),
    publicFacing: v.number(),
    unattended: v.number(),
    highRisk: v.number(),
    unrated: v.number(),
  }),
});

/** A message-level rating, as the surface that asked for it reads it back. */
export const messageRatingsShape = v.object({
  enabled: v.boolean(),
  ratings: v.array(v.object({
    messageId: v.id("messages"),
    rating: v.union(v.literal("POSITIVE"), v.literal("NEGATIVE")),
    labels: v.array(v.string()),
    hasCorrection: v.boolean(),
  })),
});

export const moneyViewShape = v.object({
  answered: v.number(),
  calls: v.number(),
  widgetConversations: v.number(),
  unanswered: v.number(),
  minutesPerConversation: v.number(),
  minutesPerCall: v.number(),
  hours: v.number(),
  partial: v.boolean(),
});

export const workbookInspectionShape = v.object({
  worksheets: v.array(v.object({
    index: v.number(),
    name: v.string(),
    rowCount: v.number(),
    columnCount: v.number(),
    headings: v.array(v.string()),
  })),
});

export const workbookImportShape = v.object({
  importId: v.id("salesDataImports"),
  salesRowCount: v.number(),
  categoryRowCount: v.number(),
  areasOfInterestRowCount: v.number(),
  frequencyRowCount: v.number(),
  skippedRowCount: v.number(),
  periodLabels: v.array(v.string()),
});

export const salesDataResetShape = v.object({ deleted: v.number() });

export const selfImprovementConfigShape = v.object({
  autoReflection: v.boolean(),
  outcomeWeightedRanking: v.boolean(),
  endUserFeedback: v.boolean(),
  retrievalPriors: v.boolean(),
  autonomousMemory: v.boolean(),
});

export const serverToolListShape = v.array(v.object({
  name: v.string(),
  title: v.optional(v.string()),
  description: v.optional(v.string()),
}));

export const toolDiscoveryShape = v.object({
  ok: v.boolean(),
  message: v.string(),
  toolCount: v.number(),
});

export const opportunityReportStartShape = v.object({
  started: v.boolean(),
  alreadyRunning: v.boolean(),
});

/**
 * The opportunity report as its screen reads it.
 *
 * Every field the report itself stores is taken from the schema; the handler
 * only turns "absent" into `null` or an empty list, so the shape says required
 * where the handler always answers.
 */
export const opportunityReportShape = v.union(v.null(), v.object({
  status: reportFields.status,
  phase: reportFields.phase,
  startedAt: reportFields.startedAt,
  completedAt: v.union(v.number(), v.null()),
  failureReason: v.union(v.string(), v.null()),
  headline: v.union(v.null(), opportunityHeadlineValidator),
  prospects: reportFields.prospects,
  gaps: reportFields.gaps,
  gapProducts: v.array(v.object({
    accountNameKey: gapProductFields.accountNameKey,
    categoryKey: gapProductFields.categoryKey,
    products: gapProductFields.products,
  })),
  typeBaskets: v.array(v.object({
    customerTypeKey: typeBasketFields.customerTypeKey,
    customerType: typeBasketFields.customerType,
    totalSpendGBP: typeBasketFields.totalSpendGBP,
    customerCount: typeBasketFields.customerCount,
    categories: typeBasketFields.categories,
  })),
  summary: v.union(v.null(), v.string()),
  exceptions: reportFields.exceptions,
  importFileName: v.union(v.string(), v.null()),
  importPeriodLabels: v.array(v.string()),
  describesCurrentImport: v.boolean(),
}));

/** The wiki's admin-side doors: the same reads as the module doors, behind different walls. */

export const wikiAnswerShape = v.object({
  answer: v.string(),
  pages: v.array(v.object({
    title: v.string(),
    pageId: v.string(),
    isPlatform: v.boolean(),
  })),
});

export const wikiDiaryPageShape = paginationResultValidator(v.object({
  at: v.number(),
  action: v.string(),
  pageId: v.union(v.string(), v.null()),
  pageTitle: v.union(v.string(), v.null()),
  detail: v.union(v.string(), v.null()),
  byPerson: v.boolean(),
}));

export const wikiDistillProgressShape = v.object({
  totalDocuments: v.number(),
  remainingDocuments: v.number(),
  documentsRead: v.number(),
  pagesWritten: v.number(),
  pagesImproved: v.number(),
  lastDocumentTitle: v.union(v.string(), v.null()),
  isReading: v.boolean(),
});

export const wikiWeeklyReportShape = v.object({
  pagesNew: v.number(),
  pagesImproved: v.number(),
  answered: v.number(),
  unanswered: v.number(),
  openUnanswered: v.number(),
  staffRuns: v.number(),
  waitingReviews: v.number(),
  waitingQuestions: v.number(),
  quiet: v.boolean(),
});

export const wikiProposedCaseListShape = v.array(v.object({
  caseId: v.id("companyEvalCases"),
  name: v.string(),
  prompt: v.string(),
  expectedBehavior: v.string(),
  createdAt: v.number(),
}));
