"use client";

import { useState } from "react";
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
  Target
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { NameType, ValueType } from "recharts/types/component/DefaultTooltipContent";
import { useTranslations } from "next-intl";
import TimeframeDropdown from "@/src/ui/components/TimeframeDropdown";
import Image from "next/image";

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
        No organization linked to this account.
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
            Organization Dashboard
          </h1>
          <p className="text-[13px] text-secondary tracking-wide max-w-xl">
            Monitor your team&apos;s AI logistics, message consumption, and live costs.
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
              value={`£${(data.aggregates.totalCostGBP ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}`}
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

              <div className="w-full flex-1 min-h-[300px]">
                {data.timeline && data.timeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data.timeline}>
                      <defs>
                        <linearGradient id="colorCostOrg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorMsgOrg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888888' }} dy={10} />
                      <YAxis yAxisId="left" orientation="left" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888888' }} tickFormatter={(val) => `£${Number(val || 0).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`} width={80} />
                      <YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888888' }} tickFormatter={(val) => val.toLocaleString()} width={40} />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        labelStyle={{ color: '#888888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}
                        formatter={(value: ValueType | undefined, name: NameType | undefined) => [
                          name === 'cost' ? `£${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : value,
                          name === 'cost' ? t('charts.estimatedCost') : t('charts.globalMessages')
                        ]}
                      />
                      <Area yAxisId="left" type="monotone" dataKey="cost" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorCostOrg)" />
                      <Area yAxisId="right" type="monotone" dataKey="messages" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorMsgOrg)" />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted opacity-50 relative z-10 bottom-8">
                    <AreaChart className="w-12 h-12 mb-3" />
                    <span className="text-[12px] uppercase font-mono tracking-widest">{t('charts.noData')}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Leaderboards for Org */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="bg-card/20 border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-background/30 flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">Top Team Members</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {data.topUsers.length === 0 ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{t('leaderboards.empty')}</div>
                ) : (
                  data.topUsers.map((u, i) => (
                    <div key={u.id} className="flex justify-between items-center px-6 py-4 border-b border-border-dim/50 last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                        <Image src={u.image} alt={u.name} width={32} height={32} unoptimized className="w-8 h-8 rounded-full object-cover bg-foreground/10 border border-border-dim/50 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{u.name}</span>
                          <span className="text-[10px] text-secondary/70 tracking-wide truncate">{u.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 pr-2">
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">{u.messages.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">£{u.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.section>

            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className="bg-card/20 border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-background/30 flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">Top Active Agents</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {(!data.topAgents || data.topAgents.length === 0) ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{t('leaderboards.empty')}</div>
                ) : (
                  data.topAgents.map((a, i) => (
                    <div key={a.id} className="flex justify-between items-center px-6 py-4 border-b border-border-dim/50 last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                        <Image src={a.avatar} alt={a.name} width={32} height={32} unoptimized className="w-8 h-8 rounded-[6px] object-cover bg-foreground/10 border border-border-dim/50 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{a.name}</span>
                          <span className="text-[10px] text-secondary/70 tracking-wide truncate">Autonomous Process</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 pr-2">
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">{a.interactions.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">£{a.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.section>
          </div>

        </motion.div>
      )}
    </div>
  );
}
