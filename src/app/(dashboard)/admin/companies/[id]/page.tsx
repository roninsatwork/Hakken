"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import {
  Building2,
  Users,
  Activity,
  MessageSquare,
  TrendingUp,
  Loader2,
  PoundSterling,
  CalendarDays,
  BrainCircuit,
  Calendar,
  Layers
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTranslations } from "next-intl";
import { motion, AnimatePresence } from "framer-motion";

type TimeframeOption = "7d" | "30d" | "90d" | "ytd" | "custom";

// Reusable Animated Component mapping standard integers
const MetricBlock = ({ title, value, sub, icon: Icon, delay = 0 }: any) => (
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

export default function CompanyOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const t = useTranslations('admin.companyDetails');
  const tCommon = useTranslations('common');

  const [timeframe, setTimeframe] = useState<TimeframeOption>("today");
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
      {/* Central Header & Navigational Date Scrubber */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Building2 className="w-6 h-6 text-[#10b981]" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide max-w-xl">
            {t('overview')}
          </p>
        </div>

        {/* Date Filters native block */}
        <div className="flex flex-col items-end gap-3 z-20">
          <div className="flex items-center bg-card/40 backdrop-blur-lg border border-border-dim p-1.5 rounded-[12px] shadow-sm transition-all hover:bg-card/60">
            <Calendar className="w-4 h-4 text-muted ml-3 mr-2" />
            <select
              className="bg-transparent border-none outline-none text-[13px] font-medium text-foreground pr-4 pl-2 py-1 appearance-none cursor-pointer"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as TimeframeOption)}
            >
              <option value="today">{t('timeframe.today')}</option>
              <option value="yesterday">{t('timeframe.yesterday')}</option>
              <option value="7d">{t('timeframe.7d')}</option>
              <option value="30d">{t('timeframe.30d')}</option>
              <option value="90d">{t('timeframe.90d')}</option>
              <option value="ytd">{t('timeframe.ytd')}</option>
              <option value="custom">{t('timeframe.custom')}</option>
            </select>
          </div>

          <AnimatePresence>
            {timeframe === "custom" && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className="flex items-center gap-3 bg-card/20 p-2 rounded-[12px] border border-border-dim origin-top"
              >
                <input
                  type="date"
                  className="bg-background/50 border border-border-dim rounded-[8px] text-[12px] px-3 py-1.5 outline-none focus:border-brand text-muted uppercase font-mono tracking-wider"
                  value={customStart}
                  onChange={(e) => setCustomStart(e.target.value)}
                />
                <span className="text-muted/50">-</span>
                <input
                  type="date"
                  className="bg-background/50 border border-border-dim rounded-[8px] text-[12px] px-3 py-1.5 outline-none focus:border-brand text-muted uppercase font-mono tracking-wider"
                  value={customEnd}
                  onChange={(e) => setCustomEnd(e.target.value)}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </header>

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
              icon={PoundSterling}
              title={t('metrics.grossBurn')}
              value={`£${(data.aggregates.totalCostGBP ?? 0).toFixed(4)}`}
              sub={t('metrics.tenantAiCost')}
              delay={0}
            />
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
              value={planStatus ? planStatus.messagesUsed.toLocaleString() : "0"}
              sub={planStatus ? `Limit: ${planStatus.messageLimit === -1 ? 'Unlimited' : planStatus.messageLimit.toLocaleString()}` : "Fetching..."}
              delay={0.2}
            />
            <MetricBlock
              icon={Users}
              title={t('metrics.activeIndividuals')}
              value={(data.aggregates.activeUsers ?? 0).toLocaleString()}
              sub={t('metrics.loginsDesc')}
              delay={0.3}
            />
          </div>

          {/* Main Analytical Dynamic Recharts Span */}
          <div className="flex flex-col gap-6 mt-[-12px]">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
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
                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.2} />
                          <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorMsg" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                          <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
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
                        tickFormatter={(val) => `£${Number(val || 0).toFixed(4)}`}
                        width={80}
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        labelStyle={{ color: '#888888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}
                        formatter={(value: any, name: any) => [
                          name === 'cost' ? `£${Number(value || 0).toFixed(4)}` : value,
                          name === 'cost' ? t('chart.estimatedAiCost') : t('chart.workspaceActions')
                        ]}
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="cost"
                        stroke="#f43f5e"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorCost)"
                      />
                      <Area
                        yAxisId="left"
                        type="monotone"
                        dataKey="messages"
                        stroke="#8b5cf6"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorMsg)"
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
          </div>

          {/* Deep Dark Leaderboards (Full Width Top Users) */}
          <div className="w-full mt-2">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}
              className="bg-card/20 border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-inner backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-background/30 flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Users className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboard.title')}</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {data.topUsers.length === 0 ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{t('leaderboard.empty')}</div>
                ) : (
                  data.topUsers.map((u, i) => (
                    <div key={u.id} className="flex justify-between items-center px-6 py-4 border-b border-border-dim/50 last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                        <img src={u.image} alt={u.name} className="w-8 h-8 rounded-full object-cover bg-foreground/10 border border-border-dim/50 shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{u.name}</span>
                          <span className="text-[10px] text-secondary/70 tracking-wide truncate">{u.email}</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-8 shrink-0 pr-2">
                        <div className="flex flex-col items-end w-[70px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">{u.messages.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end w-[70px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">£{u.cost.toFixed(4)}</span>
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
