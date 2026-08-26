import { paginationResultValidator } from "convex/server";
import { v } from "convex/values";

/**
 * What the analytics screens hand back.
 *
 * Every figure here is derived rather than stored, so none of these shapes can
 * come from the schema. `coverage` rides on each one: it is how a capped read
 * says it ran out of room rather than presenting a truncated figure as a total.
 */

const coverageShape = v.object({
  complete: v.boolean(),
  incomplete: v.array(v.string()),
});

const aggregationTypeShape = v.union(v.literal("day"), v.literal("week"), v.literal("month"));

const userLeaderFields = {
  id: v.string(),
  name: v.string(),
  image: v.string(),
  email: v.string(),
  cost: v.number(),
  messages: v.number(),
};

const userLeaderShape = v.object(userLeaderFields);

/** The platform-wide board names the workspace each person belongs to. */
const platformUserLeaderShape = v.object({
  ...userLeaderFields,
  companyName: v.string(),
});

const agentLeaderShape = v.object({
  id: v.string(),
  name: v.string(),
  avatar: v.string(),
  cost: v.number(),
  interactions: v.number(),
});

const companyLeaderShape = v.object({
  id: v.string(),
  name: v.string(),
  logo: v.string(),
  cost: v.number(),
  messages: v.number(),
});

const modelDistributionShape = v.object({
  name: v.string(),
  cost: v.number(),
  calls: v.number(),
});

const providerDistributionShape = v.object({
  providerKey: v.string(),
  cost: v.number(),
  calls: v.number(),
});

const planDistributionShape = v.object({
  planId: v.string(),
  name: v.string(),
  mrr: v.number(),
  companies: v.number(),
});

const timelinePointFields = {
  date: v.string(),
  cost: v.number(),
  messages: v.number(),
  inputTokens: v.number(),
  outputTokens: v.number(),
};

/** One company's timeline splits its own people from everyone outside. */
const companyTimelineShape = v.array(v.object({
  ...timelinePointFields,
  internalMessages: v.number(),
  externalMessages: v.number(),
}));

const globalTimelineShape = v.array(v.object(timelinePointFields));

const metricsAggregatesFields = {
  activeUsers: v.number(),
  totalMessages: v.number(),
  totalTokens: v.number(),
  totalInputTokens: v.number(),
  totalOutputTokens: v.number(),
  totalCostGBP: v.number(),
  costPerActiveUser: v.number(),
  avgCostPerMessage: v.number(),
  aggregationType: aggregationTypeShape,
};

export const globalAiCostsShape = v.object({
  coverage: coverageShape,
  periodInputTokens: v.number(),
  periodOutputTokens: v.number(),
  periodTokens: v.number(),
  periodCostUSD: v.number(),
  avgCostPerUser: v.number(),
  avgCostPerThread: v.number(),
  periodProcessed: v.number(),
  aggregationType: aggregationTypeShape,
  timeline: v.array(v.object({ date: v.string(), costGBP: v.number() })),
});

export const platformOverviewShape = v.object({
  coverage: coverageShape,
  totalUsers: v.number(),
  wauCount: v.number(),
  totalThreads: v.number(),
  avgInteractionDepth: v.number(),
  total30DCostUSD: v.number(),
  costPerActiveUserGBP: v.number(),
  topUsers: v.array(v.object({
    userId: v.string(),
    name: v.string(),
    email: v.string(),
    image: v.string(),
    costGBP: v.number(),
    messageCount: v.number(),
  })),
});

export const userCostOverviewShape = v.object({
  coverage: coverageShape,
  totalCostGBP: v.number(),
  totalTokens: v.number(),
  totalInputTokens: v.number(),
  totalOutputTokens: v.number(),
  /** Always empty: the thread list is a separate, paged read. */
  threads: v.array(v.any()),
});

export const userCostThreadsShape = v.object({
  coverage: coverageShape,
  ...paginationResultValidator(v.object({
    coverage: coverageShape,
    threadId: v.id("threads"),
    title: v.string(),
    createdAt: v.number(),
    messageCount: v.number(),
    threadTokens: v.number(),
    costGBP: v.number(),
  })).fields,
});

export const companyMetricsShape = v.object({
  coverage: coverageShape,
  timeline: companyTimelineShape,
  aggregates: v.object({
    ...metricsAggregatesFields,
    mrr: v.number(),
    knowledgeDocuments: v.number(),
    mau: v.number(),
  }),
  topUsers: v.array(userLeaderShape),
  topAgents: v.array(agentLeaderShape),
  topCompanies: v.array(companyLeaderShape),
  modelDistribution: v.array(modelDistributionShape),
  providerDistribution: v.array(providerDistributionShape),
});

export const globalAnalyticsShape = v.object({
  coverage: coverageShape,
  timeline: globalTimelineShape,
  aggregates: v.object({
    ...metricsAggregatesFields,
    mau: v.number(),
  }),
  topCompanies: v.array(companyLeaderShape),
  topUsers: v.array(platformUserLeaderShape),
  topAgents: v.array(agentLeaderShape),
  modelDistribution: v.array(modelDistributionShape),
  providerDistribution: v.array(providerDistributionShape),
  planDistribution: v.array(planDistributionShape),
  systemIntegrity: v.optional(v.object({
    totalProvisionedUsers: v.number(),
    totalProvisionedCompanies: v.number(),
  })),
});

export const globalInventoryMetricsShape = v.object({
  aggregates: v.object({ mrr: v.number() }),
  planDistribution: v.array(planDistributionShape),
  systemIntegrity: v.object({
    totalProvisionedUsers: v.number(),
    totalProvisionedCompanies: v.number(),
  }),
});
