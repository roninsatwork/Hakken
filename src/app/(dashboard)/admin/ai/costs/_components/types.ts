import type { ReadCoverage } from "@/convex/utils/readCoverage";
export type TimeframeOption =
  | "today"
  | "yesterday"
  | "7d"
  | "14d"
  | "30d"
  | "60d"
  | "90d"
  | "180d"
  | "365d"
  | "ytd"
  | "custom";

export type TimelinePoint = {
  cost?: number;
  date: string;
  inputTokens?: number;
  outputTokens?: number;
};

export type ModelDistributionRow = {
  calls: number;
  cost: number;
  name: string;
};

export type ProviderDistributionRow = {
  calls: number;
  cost: number;
  providerKey: string;
};

export type CompanyLeaderboardRow = {
  cost: number;
  id: string;
  logo: string;
  messages: number;
  name: string;
};

export type UserLeaderboardRow = {
  companyName: string;
  cost: number;
  id: string;
  image: string;
  messages: number;
  name: string;
};

export type AgentLeaderboardRow = {
  avatar: string;
  cost: number;
  id: string;
  interactions?: number;
  messages?: number;
  name: string;
};

export type AnalyticsAggregates = {
  aggregationType: string;
  avgCostPerMessage?: number;
  costPerActiveUser?: number;
  totalCostGBP?: number;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalTokens?: number;
};

export type AICostsData = {
  /** Present when a bounded read ran out of room, so the figures are floors. */
  coverage?: ReadCoverage;
  aggregates: AnalyticsAggregates;
  modelDistribution?: ModelDistributionRow[];
  providerDistribution?: ProviderDistributionRow[];
  timeline?: TimelinePoint[];
  topAgents?: AgentLeaderboardRow[];
  topCompanies?: CompanyLeaderboardRow[];
  topUsers?: UserLeaderboardRow[];
};

export type Translate = (key: string, values?: Record<string, string>) => string;
