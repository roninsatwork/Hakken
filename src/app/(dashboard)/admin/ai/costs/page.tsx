"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  PoundSterling,
  Cpu,
  Loader2,
  TrendingUp,
  Activity,
  Bot,
  Users,
  MessageSquare,
  Calendar,
  Building2,
  PieChart as PieChartIcon,
  BarChart3
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar, Legend
} from 'recharts';

type TimeframeOption = "today" | "7d" | "30d" | "ytd" | "custom";

export default function AICostsDashboard() {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const t = useTranslations("ai.costs");
  const adminOverview = useTranslations("admin.overview");

  const data = useQuery(api.analytics.getGlobalAnalytics, {
    timeframe,
    customStart: (timeframe === "custom" && customStart) ? new Date(customStart).getTime() : undefined,
    customEnd: (timeframe === "custom" && customEnd) ? new Date(customEnd).getTime() + 86399999 : undefined // end of day 
  });

  const getAggregationLabel = (agg: string) => {
    if (agg === "month") return adminOverview("charts.monthly") || t("aggregation.month");
    if (agg === "week") return adminOverview("charts.weekly") || t("aggregation.week");
    return adminOverview("charts.daily") || t("aggregation.day");
  };

  // Reusable Animated Component mapping standard integers
  const MetricBlock = ({ title, value, sub, icon: Icon, delay = 0, className = "", largeText = false }: any) => (
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

  return (
    <div className="flex flex-col gap-8 w-full pb-12 antialiased">
      {/* Central Header & Navigational Date Scrubber */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Activity className="w-6 h-6 text-brand" />
            {t("title")}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide max-w-xl">
            {t("subtitle")}
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
              <option value="today">{adminOverview("timeframes.today")}</option>
              <option value="7d">{adminOverview("timeframes.7d")}</option>
              <option value="30d">{adminOverview("timeframes.30d")}</option>
              <option value="ytd">{adminOverview("timeframes.ytd")}</option>
              <option value="custom">{adminOverview("timeframes.custom")}</option>
            </select>
          </div>

          {/* Sonae native Custom Inputs Dropdown */}
          <AnimatePresence>
            {timeframe === "custom" && (
              <motion.div
                initial={{ opacity: 0, height: 0, y: -10 }}
                animate={{ opacity: 1, height: 'auto', y: 0 }}
                exit={{ opacity: 0, height: 0, y: -10 }}
                className="flex items-center gap-3 bg-[#00000005] dark:bg-[#ffffff05] p-2 rounded-[12px] border border-border-dim origin-top"
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
          {/* Main Analytical Chart (Total Cost AreaChart) */}
          <div className="flex flex-col gap-6">
            <ChartExportWrapper exportName="ai-daily-cost" className="w-full flex uppercase">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              className="w-full flex flex-col p-6 rounded-[24px] bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim shadow-lg min-h-[400px]"
            >
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-5 h-5 text-brand" />
                  <h3 className="text-[15px] font-bold tracking-wide">{getAggregationLabel(data.aggregates.aggregationType)} (£ GBP)</h3>
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
                      </defs>
                      <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#888888' }}
                        dy={10}
                      />
                      <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#888888' }}
                        tickFormatter={(val) => `£${Number(val || 0).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
                        width={80}
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        labelStyle={{ color: '#888888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}
                        formatter={(value: any) => [`£${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`, t("chart.tooltipLabel") || "COST"]}
                      />
                      <Area
                        type="monotone"
                        dataKey="cost"
                        stroke="#f43f5e"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorCost)"
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-muted opacity-50 relative z-10 bottom-8">
                    <TrendingUp className="w-12 h-12 mb-3" />
                    <span className="text-[12px] uppercase font-mono tracking-widest">{adminOverview("charts.noData")}</span>
                  </div>
                )}
              </div>
            </motion.div>
            </ChartExportWrapper>
          </div>

          {/* Bento UI Grid Metrics Hero Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Total Cost as massive Hero Metric */}
            <MetricBlock
              className="md:col-span-2 lg:col-span-2 md:row-span-2 flex flex-col justify-center min-h-[220px]"
              largeText={true}
              icon={PoundSterling}
              title={t("metrics.periodCost")}
              value={`£${(data.aggregates.totalCostGBP ?? 0) < 0.00001 && (data.aggregates.totalCostGBP ?? 0) > 0 ? "< 0.00001" : (data.aggregates.totalCostGBP ?? 0).toLocaleString('en-GB', { minimumFractionDigits: 5, maximumFractionDigits: 5 })}`}
              sub={t("metrics.exchangeSub") || "TOTAL GBP BURNED"}
              delay={0}
            />

            {/* Standard Supporting Metrics */}
            <MetricBlock
              icon={MessageSquare}
              title={t("metrics.avgCostConv")}
              value={`£${(data.aggregates.avgCostPerMessage ?? 0) < 0.00001 && (data.aggregates.avgCostPerMessage ?? 0) > 0 ? "< 0.00001" : (data.aggregates.avgCostPerMessage ?? 0).toFixed(5)}`}
              sub={t("metrics.avgCostConvSub") || "COST PER MESSAGE"}
              delay={0.1}
            />
            <MetricBlock
              icon={Users}
              title={t("metrics.avgCostUser")}
              value={`£${(data.aggregates.costPerActiveUser ?? 0) < 0.00001 && (data.aggregates.costPerActiveUser ?? 0) > 0 ? "< 0.00001" : (data.aggregates.costPerActiveUser ?? 0).toFixed(5)}`}
              sub={t("metrics.avgCostUserSub") || "COST PER ACTIVE USER"}
              delay={0.15}
            />
            
            <MetricBlock
              className="md:col-span-2 lg:col-span-2"
              icon={Cpu}
              title={t("metrics.tokensProcessed")}
              value={(data.aggregates.totalTokens ?? 0).toLocaleString()}
              sub={t("metrics.tokenSub", { input: (data.aggregates.totalInputTokens ?? 0).toLocaleString(), output: (data.aggregates.totalOutputTokens ?? 0).toLocaleString() }) || `${(data.aggregates.totalInputTokens ?? 0).toLocaleString()} IN • ${(data.aggregates.totalOutputTokens ?? 0).toLocaleString()} OUT`}
              delay={0.2}
            />
          </div>

          {/* Split Charts: Model Distribution (Donut) & Token Flux (Stacked Bar) */}
          <div className="flex flex-col gap-6 mt-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              <ChartExportWrapper exportName="ai-model-logistics" className="lg:col-span-1 flex flex-col h-full w-full">
              <motion.section
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
              >
                <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
                  <div className="flex items-center gap-3">
                    <PieChartIcon className="w-4 h-4 text-[#8b5cf6] opacity-80" />
                    <h2 className="text-[14px] font-bold text-foreground">Model Invocations</h2>
                  </div>
                  <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">Cost drivers by LLM</span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center p-4">
                  {(!data.modelDistribution || data.modelDistribution.length === 0) ? (
                    <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">No Data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.modelDistribution}
                          cx="50%"
                          cy="45%"
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={5}
                          dataKey="calls"
                          stroke="none"
                        >
                          {data.modelDistribution.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={['#8b5cf6', '#10b981', '#f43f5e', '#3b82f6', '#f59e0b', '#14b8a6'][index % 6]} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                          itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                          formatter={(value: any) => `${Number(value).toLocaleString()} Calls`}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </motion.section>
              </ChartExportWrapper>

              <ChartExportWrapper exportName="ai-token-flux" className="lg:col-span-1 flex flex-col h-full w-full">
              <motion.section
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
              >
                <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
                  <div className="flex items-center gap-3">
                    <BarChart3 className="w-4 h-4 text-[#10b981] opacity-80" />
                    <h2 className="text-[14px] font-bold text-foreground">Token Flux</h2>
                  </div>
                  <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">Input vs Output Volume</span>
                </div>
                <div className="flex-1 w-full flex items-center justify-center p-4">
                  {(!data.timeline || data.timeline.length === 0) ? (
                    <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">No Data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={data.timeline}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} dy={10} hide />
                        <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#888' }} tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} width={40} />
                        <Tooltip
                          cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                          contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                          itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        />
                        <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }} />
                        <Bar dataKey="inputTokens" name="Input (Context)" stackId="a" fill="#10b981" radius={[0, 0, 4, 4]} />
                        <Bar dataKey="outputTokens" name="Output (Gen)" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </motion.section>
              </ChartExportWrapper>
            </div>
          </div>

          {/* Deep Dark Leaderboards */}
          <div className="flex flex-col gap-6 mt-2">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Left: Top Companies */}
              <motion.section
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
                className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
              >
                <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <Building2 className="w-4 h-4 text-[#10b981] opacity-80" />
                    <h2 className="text-[14px] font-bold text-foreground">{adminOverview('leaderboards.tenants')}</h2>
                  </div>
                </div>
                <div className="flex flex-col">
                  {(!data.topCompanies || data.topCompanies.length === 0) ? (
                    <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{adminOverview('leaderboards.empty')}</div>
                  ) : (
                    data.topCompanies.map((c: any, i: number) => (
                      <div key={c.id} className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors">
                        <div className="flex items-center gap-4">
                          <span className="text-[14px] font-mono font-bold text-muted/40 w-5">#{i + 1}</span>
                          {c.logo ? (
                            <img src={c.logo} alt={c.name} className="w-8 h-8 rounded-[8px] object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d]" />
                          ) : (
                            <div className="w-8 h-8 rounded-[8px] bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] flex items-center justify-center text-[10px] text-foreground font-bold">
                              {c.name.substring(0, 2).toUpperCase()}
                            </div>
                          )}
                          <span className="text-[13px] font-semibold tracking-wide text-foreground">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-6 shrink-0 pr-2">
                          <div className="flex flex-col items-end min-w-[65px]">
                            <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                            <span className="text-[13px] font-bold text-foreground tracking-tight">{c.messages.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col items-end min-w-[65px]">
                            <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                            <span className="text-[13px] font-bold text-[#f43f5e] tracking-tight">£{c.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.section>

              {/* Right: Top Users */}
              <motion.section
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
                className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
              >
                <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
                  <div className="flex items-center gap-3">
                    <TrendingUp className="w-4 h-4 text-brand opacity-80" />
                    <h2 className="text-[14px] font-bold text-foreground">{adminOverview('leaderboards.initiators')}</h2>
                  </div>
                </div>
                <div className="flex flex-col">
                  {(!data.topUsers || data.topUsers.length === 0) ? (
                    <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{adminOverview('leaderboards.empty')}</div>
                  ) : (
                    data.topUsers.map((u: any, i: number) => (
                      <div key={u.id} className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors">
                        <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                          <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                          <img src={u.image} alt={u.name} className="w-8 h-8 rounded-full object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] shrink-0" />
                          <div className="flex flex-col min-w-0">
                            <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{u.name}</span>
                            <span className="text-[10px] text-secondary/70 tracking-wide truncate">{u.companyName}</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-6 shrink-0 pr-2">
                          <div className="flex flex-col items-end min-w-[65px]">
                            <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                            <span className="text-[13px] font-bold text-foreground tracking-tight">{u.messages.toLocaleString()}</span>
                          </div>
                          <div className="flex flex-col items-end min-w-[65px]">
                            <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                            <span className="text-[13px] font-bold text-[#f43f5e] tracking-tight">£{u.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </motion.section>
            </div>

            {/* Bottom: Top Agents (Full Width Spread) */}
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
              className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl w-full"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Bot className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">Top Agents By Compute</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {(!data.topAgents || data.topAgents.length === 0) ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{adminOverview('leaderboards.empty')}</div>
                ) : (
                  data.topAgents.map((a: any, i: number) => (
                    <div key={a.id} className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                        <img src={a.avatar} alt={a.name} className="w-8 h-8 rounded-[6px] object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] shrink-0" />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{a.name}</span>
                          <span className="text-[10px] text-secondary/70 tracking-wide truncate">Autonomous Process</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 pr-2">
                        <div className="flex flex-col items-end min-w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">{(a.interactions || a.messages || 0).toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end min-w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                          <span className="text-[13px] font-bold text-[#f43f5e] tracking-tight">£{a.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
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
