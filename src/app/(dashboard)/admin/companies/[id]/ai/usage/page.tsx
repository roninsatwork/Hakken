"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  Building2,
  Users,
  Activity,
  TrendingUp,
  Loader2,
  BrainCircuit,
  Layers,
  Network
} from "lucide-react";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import { motion } from "framer-motion";
import { CHART_CROSSHAIR, ChartTooltip } from "@/src/ui/components/charts/ChartTooltip";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import TimeframeDropdown from "@/src/ui/components/TimeframeDropdown";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Leaderboard } from "@/src/ui/components/screens/Leaderboard";
import type { LucideIcon } from "lucide-react";

const AreaChart = dynamic(() => import("recharts").then((module) => module.AreaChart));
const Area = dynamic(() => import("recharts").then((module) => module.Area));
const XAxis = dynamic(() => import("recharts").then((module) => module.XAxis));
const YAxis = dynamic(() => import("recharts").then((module) => module.YAxis));
const CartesianGrid = dynamic(() => import("recharts").then((module) => module.CartesianGrid));
const Tooltip = dynamic(() => import("recharts").then((module) => module.Tooltip));
const ResponsiveContainer = dynamic(() => import("recharts").then((module) => module.ResponsiveContainer));

type TimeframeOption = "today" | "yesterday" | "7d" | "14d" | "30d" | "60d" | "90d" | "180d" | "365d" | "ytd" | "custom";

type MetricBlockProps = {
  title: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  delay?: number;
};

type ProviderDistributionRow = {
  providerKey: string;
  calls: number;
  cost: number;
};

/** Provider names are brands; only the unknown bucket is copy and comes from the caller. */
function formatProviderName(providerKey: string, unknownLabel: string) {
  if (providerKey === "google") return "Google Vertex AI";
  if (providerKey === "openai") return "OpenAI";
  if (providerKey === "anthropic") return "Anthropic";
  if (providerKey === "openrouter") return "OpenRouter";
  if (providerKey === "unknown") return unknownLabel;
  return providerKey;
}

const MetricBlock = ({ title, value, sub, icon: Icon, delay = 0 }: MetricBlockProps) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className="flex flex-col gap-3 p-6 rounded-[20px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm relative overflow-hidden group hover:border-brand/30 transition-colors"
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-[40px] rounded-full pointer-events-none -translate-y-10 translate-x-10 group-hover:bg-brand/10 transition-colors" />
    <div className="flex items-center gap-3 text-secondary">
      <Icon className="w-5 h-5 opacity-70 text-brand" />
      <span className="text-[13px] font-medium tracking-wide">{title}</span>
    </div>
    <div className="flex flex-col gap-1 z-10">
      <span className="text-3xl font-bold tracking-tight text-foreground">{value}</span>
      <span className="text-[11px] font-mono tracking-widest uppercase text-muted/80">{sub}</span>
    </div>
  </motion.div>
);

const ProviderUsageList = ({ providers }: { providers?: ProviderDistributionRow[] }) => {
  const t = useTranslations("admin.companyDetails.providerUsage");
  return (
    <motion.section
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.45 }}
      className="bg-foreground/[0.02] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
    >
      <div className="px-6 py-5 border-b border-border-dim bg-foreground/[0.03] flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <Network className="w-4 h-4 text-brand opacity-80" />
          <h2 className="text-[14px] font-bold text-foreground">{t("title")}</h2>
        </div>
        <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">{t("subtitle")}</span>
      </div>
      <div className="flex flex-col p-4">
        {/* Unranked: this is every provider there is, not the leaders of a
            longer list, and numbering it would imply a race it is not in. */}
        <Leaderboard<ProviderDistributionRow>
          rows={providers ?? []}
          rowKey={(provider) => provider.providerKey}
          ranked={false}
          nameHeader={t("providerColumn")}
          name={(provider) => formatProviderName(provider.providerKey, t("unknownProvider"))}
          sub={(provider) => t("calls", { count: (provider.calls ?? 0).toLocaleString() })}
          empty={t("noData")}
          stats={[
            {
              key: "cost",
              header: t("costColumn"),
              cell: (provider) =>
                `$${(provider.cost ?? 0).toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
            },
          ]}
        />
      </div>
    </motion.section>
  );
};

export default function CompanyAiUsagePage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const t = useTranslations('admin.companyDetails');

  const [timeframe, setTimeframe] = useState<TimeframeOption>("30d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const data = useQuery(api.analytics.getCompanyMetrics, {
    companyId,
    timeframe,
    customStart: (timeframe === "custom" && customStart) ? new Date(customStart).getTime() : undefined,
    customEnd: (timeframe === "custom" && customEnd) ? new Date(customEnd).getTime() + 86399999 : undefined
  });

  const planStatus = useQuery(api.plans.getCompanyPlanStatus, { companyId });

  const getAggregationLabel = (agg: string) => {
    if (agg === "month") return t('aggregation.month');
    if (agg === "week") return t('aggregation.week');
    return t('aggregation.day');
  };

  return (
    <div className="flex flex-col gap-8 w-full pb-12 antialiased">
      <PageHeader
        icon={<Building2 className="w-6 h-6 text-[#10b981]" />}
        title={t('aiUsageTitle')}
        description={t('aiUsageSubtitle')}
        action={
          <div className="flex flex-col items-end gap-3 z-20">
            <TimeframeDropdown
              timeframe={timeframe}
              setTimeframe={setTimeframe}
              customStart={customStart}
              setCustomStart={setCustomStart}
              customEnd={customEnd}
              setCustomEnd={setCustomEnd}
            />
          </div>
        }
      />

      {/* Synchronized Loader */}
      {data === undefined ? (
        <div className="w-full h-[400px] flex items-center justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-8 w-full"
        >
          {/* SaaS Core Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <MetricBlock
              icon={Activity}
              title={t('metrics.tokenVolume')}
              value={(data.aggregates.totalTokens ?? 0).toLocaleString()}
              sub={`${(data.aggregates.totalInputTokens ?? 0).toLocaleString()} IN • ${(data.aggregates.totalOutputTokens ?? 0).toLocaleString()} OUT`}
              delay={0.1}
            />
            <MetricBlock
              icon={Layers}
              title={"Monthly Quota"}
              value={(planStatus?.messagesUsed ?? 0).toLocaleString()}
              sub={planStatus ? `Limit: ${planStatus.messageLimit === -1 ? 'Unlimited' : (planStatus.messageLimit ?? 0).toLocaleString()}` : "Fetching..."}
              delay={0.2}
            />
            <MetricBlock
              icon={BrainCircuit}
              title={"Knowledge Assets"}
              value={(data.aggregates.knowledgeDocuments ?? 0).toLocaleString()}
              sub={"PROPRIETARY RAG VECTORS"}
              delay={0.3}
            />
            <MetricBlock
              icon={Users}
              title={t('metrics.activeIndividuals')}
              value={(data.aggregates.activeUsers ?? 0).toLocaleString()}
              sub={t('metrics.loginsDesc')}
              delay={0.4}
            />
          </div>

          {/* Main Analytical Dynamic Recharts Span */}
          <div className="flex flex-col gap-6 mt-[-12px]">
            <ChartExportWrapper exportName={`company-${companyId}-daily`} className="w-full flex">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              className="w-full flex flex-col p-6 rounded-[24px] bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim shadow-lg min-h-[400px]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-brand" />
                  <h3 className="text-[15px] font-bold tracking-wide">{getAggregationLabel(data.aggregates.aggregationType)}</h3>
                </div>
              </div>

              <div className="w-full h-[300px] min-h-[300px]">
                {data.timeline && data.timeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300} debounce={50}>
                    <AreaChart data={data.timeline}>
                      <defs>
                        <linearGradient id="colorInternal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorExternal" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#10b981" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#888888' }}
                        dy={10}
                      />
                      <YAxis
                        yAxisId="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#888888' }}
                        width={40}
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                      <Tooltip
                        cursor={CHART_CROSSHAIR}
                        content={
                          <ChartTooltip
                            seriesLabel={(entry) =>
                              entry.dataKey === "internalMessages" ? "Internal Executions" : "External Widget Traffic"
                            }
                          />
                        }
                      />

                      {/* No entrance animation: it can wedge and render the series as nothing — see GovernanceRunsChart.tsx. */}
                      <Area isAnimationActive={false}
                        yAxisId="left"
                        type="monotone"
                        dataKey="internalMessages"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorInternal)"
                      />
                      <Area isAnimationActive={false}
                        yAxisId="left"
                        type="monotone"
                        dataKey="externalMessages"
                        stroke="#10b981"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorExternal)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted opacity-50 relative z-10 bottom-8">
                    <AreaChart className="w-12 h-12 mb-3" />
                    <span className="text-[12px] uppercase font-mono tracking-widest">{t('chart.noData')}</span>
                  </div>
                )}
              </div>
            </motion.div>
            </ChartExportWrapper>
          </div>

          <ProviderUsageList providers={data.providerDistribution} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="bg-foreground/[0.02] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-foreground/[0.03] flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboard.title')}</h2>
                </div>
              </div>
              <div className="flex flex-col p-4">
                <Leaderboard
                  rows={data.topUsers}
                  rowKey={(user) => user.id}
                  nameHeader={t('leaderboard.personColumn')}
                  name={(user) => user.name}
                  sub={(user) => user.email}
                  avatar={{ src: (user) => user.image, shape: "circle" }}
                  empty={t('leaderboard.empty')}
                  stats={[
                    {
                      key: "actions",
                      header: t('leaderboard.actions'),
                      cell: (user) => (user.messages ?? 0).toLocaleString(),
                    },
                  ]}
                />
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="bg-foreground/[0.02] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-foreground/[0.03] flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <BrainCircuit className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboard.orchestratorsTitle')}</h2>
                </div>
              </div>
              <div className="flex flex-col p-4">
                <Leaderboard
                  rows={data.topAgents}
                  rowKey={(agent) => agent.id}
                  nameHeader={t('leaderboard.agentColumn')}
                  name={(agent) => agent.name}
                  sub={() => t('leaderboard.agentType')}
                  avatar={{ src: (agent) => agent.avatar, shape: "rounded" }}
                  empty={t('leaderboard.empty')}
                  stats={[
                    {
                      key: "actions",
                      header: t('leaderboard.actions'),
                      cell: (agent) => (agent.interactions ?? 0).toLocaleString(),
                    },
                  ]}
                />
              </div>
            </motion.section>
          </div>

        </motion.div>
      )}
    </div>
  );
}
