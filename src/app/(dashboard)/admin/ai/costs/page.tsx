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
  Calendar
} from "lucide-react";
import { motion } from "framer-motion";
import { useTranslations } from "next-intl";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from "recharts";

type TimeframeOption = "today" | "7d" | "30d" | "ytd" | "custom";

export default function AICostsDashboard() {
  const [timeframe, setTimeframe] = useState<TimeframeOption>("today");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const t = useTranslations("ai.costs");
  const adminOverview = useTranslations("admin.overview");

  const analytics = useQuery(api.analytics.getGlobalAICosts, {
    timeframe,
    customStart: (timeframe === "custom" && customStart) ? new Date(customStart).getTime() : undefined,
    customEnd: (timeframe === "custom" && customEnd) ? new Date(customEnd).getTime() + 86399999 : undefined // end of day 
  });

  const getAggregationLabel = (agg: string) => {
    if (agg === "month") return t("aggregation.month");
    if (agg === "week") return t("aggregation.week");
    return t("aggregation.day");
  };

  // Reusable Animated Component mapping standard integers
  const MetricBlock = ({ title, value, sub, icon: Icon, delay = 0 }: any) => (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="flex flex-col gap-3 p-6 rounded-[20px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm relative overflow-hidden group"
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
        <div className="flex flex-col gap-3 items-end">
          <div className="flex items-center bg-card/40 backdrop-blur-lg border border-border-dim p-1.5 rounded-[12px] shadow-sm">
            <Calendar className="w-4 h-4 text-muted ml-3 mr-2" />
            <select
              className="bg-transparent border-none outline-none text-[13px] font-medium text-foreground pr-4 pl-2 py-1 user-select-none appearance-none cursor-pointer"
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
          {timeframe === "custom" && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-3 bg-card/20 p-2 rounded-[12px] border border-border-dim"
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
        </div>
      </header>

      {/* Synchronized Loader */}
      {analytics === undefined ? (
        <div className="w-full h-[400px] flex items-center justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-8 w-full"
        >
          {/* Hero Metrics Row */}
          <div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <MetricBlock
                icon={PoundSterling}
                title={t("metrics.periodCost")}
                value={`£${(analytics.periodCostGBP ?? 0) < 0.00001 && (analytics.periodCostGBP ?? 0) > 0 ? "< 0.00001" : (analytics.periodCostGBP ?? 0).toFixed(5)}`}
                sub={t("metrics.exchangeSub")}
                delay={0}
              />
              <MetricBlock
                icon={Cpu}
                title={t("metrics.tokensProcessed")}
                value={(analytics.periodTokens ?? 0).toLocaleString()}
                sub={t("metrics.tokenSub", { input: (analytics.periodInputTokens ?? 0).toLocaleString(), output: (analytics.periodOutputTokens ?? 0).toLocaleString() })}
                delay={0.1}
              />
              <MetricBlock
                icon={Bot}
                title={t("metrics.interactions")}
                value={(analytics.periodProcessed ?? 0).toLocaleString()}
                sub={t("metrics.interactionsSub")}
                delay={0.2}
              />
            </div>
          </div>

          {/* Average Analysis Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-[-12px]">
            <MetricBlock
              icon={Users}
              title={t("metrics.avgCostUser")}
              value={`£${(analytics.avgCostPerUser ?? 0) < 0.00001 && (analytics.avgCostPerUser ?? 0) > 0 ? "< 0.00001" : (analytics.avgCostPerUser ?? 0).toFixed(5)}`}
              sub={t("metrics.avgCostUserSub")}
              delay={0.3}
            />
            <MetricBlock
              icon={MessageSquare}
              title={t("metrics.avgCostConv")}
              value={`£${(analytics.avgCostPerThread ?? 0) < 0.00001 && (analytics.avgCostPerThread ?? 0) > 0 ? "< 0.00001" : (analytics.avgCostPerThread ?? 0).toFixed(5)}`}
              sub={t("metrics.avgCostConvSub")}
              delay={0.4}
            />
          </div>

          {/* Main Analytical Dynamic Recharts Span */}
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
                  <h3 className="text-[15px] font-bold tracking-wide">{getAggregationLabel(analytics.aggregationType)} (£ GBP)</h3>
                </div>
              </div>

              <div className="w-full flex-1 min-h-[300px]">
                {analytics.timeline && analytics.timeline.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={analytics.timeline}>
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
                        tickFormatter={(val) => `£${Number(val || 0).toFixed(4)}`}
                        width={80}
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        labelStyle={{ color: '#888888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em' }}
                        formatter={(value: any) => [`£${Number(value || 0).toFixed(4)}`, t("chart.tooltipLabel")]}
                      />
                      <Area
                        type="monotone"
                        dataKey="costGBP"
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
          </div>
        </motion.div>
      )}
    </div>
  );
}
