"use client";

import { useState } from "react";
import { formatPreciseGBP } from "@/src/lib/currency";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Building2,
  Activity,
  MessageSquare,
  TrendingUp,
  Loader2,
  PoundSterling,
  CreditCard,
  Target,
  Network
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useTranslations } from "next-intl";
import TimeframeDropdown from "@/src/ui/components/TimeframeDropdown";
import { Leaderboard } from "@/src/ui/components/screens/Leaderboard";

const OrganizationUsagePlot = dynamic(() =>
  import("./_components/OrganizationUsagePlot").then((module) => module.OrganizationUsagePlot),
);

type TimeframeOption = "today" | "yesterday" | "7d" | "14d" | "30d" | "60d" | "90d" | "180d" | "365d" | "ytd" | "custom";

type MetricBlockProps = {
  title: string;
  value: string;
  sub: string;
  icon: LucideIcon;
  delay?: number;
  className?: string;
  largeText?: boolean;
};

type CompanyMetricsData = {
  timeline: Array<{ date: string; cost: number; messages: number }>;
  providerDistribution?: Array<{
    providerKey: string;
    calls: number;
    cost: number;
  }>;
  aggregates: {
    mrr?: number;
    activeUsers?: number;
    totalCostGBP?: number;
    totalMessages?: number;
    aggregationType: string;
  };
  topUsers: Array<{
    id: string;
    name: string;
    image: string;
    email?: string;
    messages: number;
    cost: number;
  }>;
  topAgents: Array<{
    id: string;
    name: string;
    avatar: string;
    interactions: number;
    cost: number;
  }>;
};

function formatProviderName(providerKey: string) {
  if (providerKey === "google") return "Google Vertex AI";
  if (providerKey === "openai") return "OpenAI";
  if (providerKey === "anthropic") return "Anthropic";
  if (providerKey === "openrouter") return "OpenRouter";
  if (providerKey === "unknown") return "Unknown / Legacy";
  return providerKey;
}

const MetricBlock = ({ title, value, sub, icon: Icon, delay = 0, className = "", largeText = false }: MetricBlockProps) => (
  <motion.div
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ delay }}
    className={`flex flex-col gap-3 p-6 rounded-[20px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm relative overflow-hidden group hover:border-brand/30 transition-colors ${className}`}
  >
    <div className="absolute top-0 right-0 w-32 h-32 bg-brand/5 blur-[40px] rounded-full pointer-events-none -translate-y-10 translate-x-10 group-hover:bg-brand/10 transition-colors" />
    <div className="flex items-center gap-3 text-secondary">
      <Icon className="w-5 h-5 opacity-70 text-brand" />
      <span className="text-[13px] font-medium tracking-wide">{title}</span>
    </div>
    <div className="flex flex-col gap-1 z-10">
      <span className={`${largeText ? 'text-5xl lg:text-7xl mb-2 mt-4' : 'text-3xl'} font-bold tracking-tight text-foreground`}>{value}</span>
      <span className="text-[11px] font-mono tracking-widest uppercase text-muted/80">{sub}</span>
    </div>
  </motion.div>
);

const ProviderUsageList = ({ providers }: { providers?: CompanyMetricsData["providerDistribution"] }) => {
  const t = useTranslations("admin.overview");
  return (
    <motion.section
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.55 }}
      className="bg-card/20 border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl"
    >
      <div className="px-6 py-5 border-b border-border-dim bg-background/30 flex flex-col gap-1.5">
        <div className="flex items-center gap-3">
          <Network className="w-4 h-4 text-brand opacity-80" />
          <h2 className="text-[14px] font-bold text-foreground">{t("providers.title")}</h2>
        </div>
        <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">{t("providers.subtitle")}</span>
      </div>
      <div className="flex flex-col p-4">
        {/* Unranked: every provider there is, not the leaders of a longer list. */}
        <Leaderboard
          rows={providers ?? []}
          rowKey={(provider) => provider.providerKey}
          ranked={false}
          nameHeader={t("providers.nameHeader")}
          name={(provider) => formatProviderName(provider.providerKey)}
          sub={(provider) => t("providers.calls", { count: provider.calls.toLocaleString() })}
          empty={t("providers.empty")}
          stats={[
            {
              key: "cost",
              header: t("providers.costHeader"),
              cell: (provider) =>
                `$${provider.cost.toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
            },
          ]}
        />
      </div>
    </motion.section>
  );
};

export default function CompanySettingsDashboard() {
  const t = useTranslations('admin.overview');
  const [timeframe, setTimeframe] = useState<TimeframeOption>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const user = useQuery(api.users.getMe);
  const companyId = user?.companyId;

  const data = useQuery(api.analytics.getCompanyMetrics, companyId ? {
    companyId,
    timeframe,
    customStart: (timeframe === "custom" && customStart) ? new Date(customStart).getTime() : undefined,
    customEnd: (timeframe === "custom" && customEnd) ? new Date(customEnd).getTime() + 86399999 : undefined
  } : "skip") as CompanyMetricsData | undefined;

  const getAggregationLabel = (agg: string) => {
    if (agg === "month") return t('charts.monthly');
    if (agg === "week") return t('charts.weekly');
    return t('charts.daily');
  };

  if (user === undefined) {
    return (
      <div className="flex flex-col gap-8 w-full pb-12 items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }

  if (!companyId) {
    return (
      <div className="flex flex-col gap-8 w-full pb-12 p-8 text-center text-muted font-mono uppercase tracking-widest text-sm">
        {t('noOrganization')}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full pb-12 antialiased">
      {/* Header Area */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Building2 className="w-6 h-6 text-brand" />
            {t('organization.title')}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide max-w-xl">
            {t('organization.description')}
          </p>
        </div>

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
      </header>

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
          {/* Main Analytics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            <MetricBlock
              className="md:col-span-2 lg:col-span-2 md:row-span-2 flex flex-col justify-center min-h-[220px]"
              largeText={true}
              icon={CreditCard}
              title={t('metrics.mrr')}
              value={`£${(data.aggregates.mrr || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={t('metrics.mrrSub')}
              delay={0}
            />

            <MetricBlock
              icon={Target}
              title={t('metrics.activeContext')}
              value={(data.aggregates.activeUsers ?? 0).toLocaleString()}
              sub={t('metrics.activeSub')}
              delay={0.15}
            />
            <MetricBlock
              icon={PoundSterling}
              title={t('metrics.logisticBurn')}
              value={formatPreciseGBP(data.aggregates.totalCostGBP ?? 0)}
              sub={t('metrics.burnSub')}
              delay={0.2}
            />
            
            <MetricBlock
              className="md:col-span-2 lg:col-span-2"
              icon={MessageSquare}
              title={t('metrics.messagesSent')}
              value={(data.aggregates.totalMessages ?? 0).toLocaleString()}
              sub={t('metrics.messagesSub')}
              delay={0.35}
            />
          </div>

          <div className="flex flex-col gap-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="w-full flex flex-col p-6 rounded-[24px] bg-card/20 border border-border-dim shadow-inner min-h-[400px]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-brand" />
                  <h3 className="text-[15px] font-bold tracking-wide">{getAggregationLabel(data.aggregates.aggregationType)}</h3>
                </div>
              </div>

              <div className="w-full h-[300px] min-h-[300px]">
                <OrganizationUsagePlot
                  estimatedCostLabel={t('charts.estimatedCost')}
                  globalMessagesLabel={t('charts.globalMessages')}
                  noDataLabel={t('charts.noData')}
                  timeline={data.timeline}
                />
              </div>
            </motion.div>
          </div>

          <ProviderUsageList providers={data.providerDistribution} />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="bg-card/20 border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-background/30 flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboards.topTeamMembers')}</h2>
                </div>
              </div>
              <div className="flex flex-col p-4">
                <Leaderboard
                  rows={data.topUsers}
                  rowKey={(user) => user.id}
                  nameHeader={t('leaderboards.memberHeader')}
                  name={(user) => user.name}
                  sub={(user) => user.email}
                  avatar={{ src: (user) => user.image, shape: "circle" }}
                  empty={t('leaderboards.empty')}
                  stats={[
                    { key: "messages", header: t('leaderboards.messagesHeader'), cell: (user) => user.messages.toLocaleString() },
                    {
                      key: "cost",
                      header: t('leaderboards.costHeader'),
                      cell: (user) =>
                        `$${user.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
                    },
                  ]}
                />
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className="bg-card/20 border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-background/30 flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboards.topActiveAgents')}</h2>
                </div>
              </div>
              <div className="flex flex-col p-4">
                <Leaderboard
                  rows={data.topAgents ?? []}
                  rowKey={(agent) => agent.id}
                  nameHeader={t('leaderboards.agentHeader')}
                  name={(agent) => agent.name}
                  sub={() => t('leaderboards.autonomousProcess')}
                  avatar={{ src: (agent) => agent.avatar, shape: "rounded" }}
                  empty={t('leaderboards.empty')}
                  stats={[
                    { key: "messages", header: t('leaderboards.messagesHeader'), cell: (agent) => agent.interactions.toLocaleString() },
                    {
                      key: "cost",
                      header: t('leaderboards.costHeader'),
                      cell: (agent) =>
                        `$${agent.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`,
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
