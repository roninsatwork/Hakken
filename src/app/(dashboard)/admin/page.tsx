"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  ShieldCheck,
  PieChart as PieChartIcon,
  BarChart3,
  Wallet,
  Users,
  Activity,
  MessageSquare,
  TrendingUp,
  Loader2,
  PoundSterling,
  Building2,
  CreditCard,
  Target,
  Network
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { motion } from "framer-motion";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, BarChart, Bar, Legend } from 'recharts';
import { useTranslations } from "next-intl";
import TimeframeDropdown from "@/src/ui/components/TimeframeDropdown";

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

const PROVIDER_COLORS = ['#14b8a6', '#3b82f6', '#f97316', '#94a3b8', '#8b5cf6', '#f43f5e'];

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

export default function AdminDashboard() {
  const t = useTranslations('admin.overview');
  const [timeframe, setTimeframe] = useState<TimeframeOption>("30d");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");

  const data = useQuery(api.analytics.getGlobalAnalytics, {
    timeframe,
    customStart: (timeframe === "custom" && customStart) ? new Date(customStart).getTime() : undefined,
    customEnd: (timeframe === "custom" && customEnd) ? new Date(customEnd).getTime() + 86399999 : undefined
  });
  const inventoryData = useQuery(api.analytics.getGlobalInventoryMetrics);

  const getAggregationLabel = (agg: string) => {
    if (agg === "month") return t('charts.monthly');
    if (agg === "week") return t('charts.weekly');
    return t('charts.daily');
  };

  const providerDistribution = data?.providerDistribution?.map((provider) => ({
    ...provider,
    name: formatProviderName(provider.providerKey),
  }));

  return (
    <div className="flex flex-col gap-8 w-full pb-12 antialiased">
      {/* Central Header & Navigational Date Scrubber */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] text-secondary tracking-wide max-w-xl">
            {t('subtitle')}
          </p>
        </div>

        {/* Date Filters native block */}
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

      {/* Synchronized Loader */}
      {data === undefined || inventoryData === undefined ? (
        <div className="w-full h-[400px] flex items-center justify-center p-20">
          <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
        </div>
      ) : (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="flex flex-col gap-8 w-full"
        >
          {/* Main Analytical Dynamic Recharts Span */}
          <div className="flex flex-col gap-6">
            <ChartExportWrapper exportName="admin-daily-activity" className="w-full flex">
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
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
                        orientation="left"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#888888' }}
                        tickFormatter={(val) => `£${Number(val || 0).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}
                        width={80}
                      />
                      <YAxis
                        yAxisId="right"
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 11, fill: '#888888' }}
                        tickFormatter={(val) => val.toLocaleString()}
                        width={40}
                      />
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        labelStyle={{ color: '#888888', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '8px' }}
                        formatter={(value, name) => [
                          name === 'cost' ? `£${Number(value || 0).toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}` : value,
                          name === 'cost' ? t('charts.estimatedCost') : t('charts.globalMessages')
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
                        yAxisId="right"
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
                    <span className="text-[12px] uppercase font-mono tracking-widest">{t('charts.noData')}</span>
                  </div>
                )}
              </div>
            </motion.div>
            </ChartExportWrapper>
          </div>

          {/* Bento UI Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {/* Main Hero Metric (MRR) */}
            <MetricBlock
              className="md:col-span-2 lg:col-span-2 md:row-span-2 flex flex-col justify-center min-h-[220px]"
              largeText={true}
              icon={CreditCard}
              title={t('metrics.mrr')}
              value={`£${(inventoryData.aggregates.mrr || 0).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sub={t('metrics.mrrSub')}
              delay={0}
            />

            {/* Standard Metrics flowing around it */}
            <MetricBlock
              icon={Building2}
              title="Registered Companies"
              value={(inventoryData.systemIntegrity?.totalProvisionedCompanies ?? 0).toLocaleString()}
              sub="TOTAL ORGANIZATIONS"
              delay={0.1}
            />
            <MetricBlock
              icon={Target}
              title={t('metrics.mau')}
              value={(data.aggregates.mau ?? 0).toLocaleString()}
              sub={t('metrics.mauSub')}
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
              icon={Users}
              title={t('metrics.activeContext')}
              value={(data.aggregates.activeUsers ?? 0).toLocaleString()}
              sub={t('metrics.activeSub')}
              delay={0.25}
            />

            {/* Bottom Spans */}
            <MetricBlock
              className="md:col-span-2 lg:col-span-2"
              icon={Activity}
              title={t('metrics.compute')}
              value={(data.aggregates.totalTokens ?? 0).toLocaleString()}
              sub={t('metrics.computeSub', { 
                input: (data.aggregates.totalInputTokens ?? 0).toLocaleString(), 
                output: (data.aggregates.totalOutputTokens ?? 0).toLocaleString() 
              })}
              delay={0.3}
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

          {/* Advanced Analytics Grid */}
          <div className="flex flex-col gap-6 mt-2">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              {/* Model Distribution (Donut) */}
              <ChartExportWrapper exportName="admin-model-logistics" className="lg:col-span-1 flex flex-col h-full w-full">
              <motion.section
                initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.55 }}
                className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
              >
                <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
                  <div className="flex items-center gap-3">
                    <PieChartIcon className="w-4 h-4 text-[#8b5cf6] opacity-80" />
                    <h2 className="text-[14px] font-bold text-foreground">Model Logistics</h2>
                  </div>
                  <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">Invocations by LLM</span>
                </div>
                <div className="h-[260px] min-h-[260px] w-full flex items-center justify-center p-4">
                  {(!data.modelDistribution || data.modelDistribution.length === 0) ? (
                    <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">No Data</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={260} debounce={50}>
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
                        {data.modelDistribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={['#8b5cf6', '#10b981', '#f43f5e', '#3b82f6', '#f59e0b', '#14b8a6'][index % 6]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        formatter={(value) => `${Number(value).toLocaleString()} Calls`}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.section>
            </ChartExportWrapper>

            {/* Provider Distribution (Donut) */}
            <ChartExportWrapper exportName="admin-provider-distribution" className="lg:col-span-1 flex flex-col h-full w-full">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}
              className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
                <div className="flex items-center gap-3">
                  <Network className="w-4 h-4 text-[#14b8a6] opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">Provider Distribution</h2>
                </div>
                <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">Cost drivers by provider</span>
              </div>
              <div className="h-[260px] min-h-[260px] w-full flex items-center justify-center p-4">
                {(!providerDistribution || providerDistribution.length === 0) ? (
                  <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">No Data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260} debounce={50}>
                    <PieChart>
                      <Pie
                        data={providerDistribution}
                        cx="50%"
                        cy="45%"
                        innerRadius={65}
                        outerRadius={85}
                        paddingAngle={5}
                        dataKey="cost"
                        nameKey="name"
                        stroke="none"
                      >
                        {providerDistribution.map((_, index) => (
                          <Cell key={`provider-cell-${index}`} fill={PROVIDER_COLORS[index % PROVIDER_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        itemStyle={{ color: '#ffffff', fontSize: '13px', fontWeight: 600 }}
                        formatter={(value) => `£${Number(value).toFixed(4)}`}
                      />
                      <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#888' }} />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.section>
            </ChartExportWrapper>

            {/* Token Flux (Stacked Bar) */}
            <ChartExportWrapper exportName="admin-token-flux" className="lg:col-span-1 flex flex-col h-full w-full">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
              className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px] w-full"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-t-[24px]">
                <div className="flex items-center gap-3">
                  <BarChart3 className="w-4 h-4 text-[#10b981] opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">Token Flux</h2>
                </div>
                <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">Input vs Output</span>
              </div>
              <div className="h-[260px] min-h-[260px] w-full flex items-center justify-center p-4">
                {(!data.timeline || data.timeline.length === 0) ? (
                  <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">No Data</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260} debounce={50}>
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
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboards.tenants')}</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {data.topCompanies.length === 0 ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{t('leaderboards.empty')}</div>
                ) : (
                  data.topCompanies.map((c, i) => (
                    <div key={c.id} className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5">#{i + 1}</span>
                        {c.logo ? (
                          <Image
                            src={c.logo}
                            alt={c.name}
                            width={32}
                            height={32}
                            unoptimized
                            className="w-8 h-8 rounded-[8px] object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d]"
                          />
                        ) : (
                          <div className="w-8 h-8 rounded-[8px] bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] flex items-center justify-center text-[10px] text-foreground font-bold">
                            {c.name.substring(0, 2).toUpperCase()}
                          </div>
                        )}
                        <span className="text-[13px] font-semibold tracking-wide text-foreground">{c.name}</span>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 pr-2">
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">{c.messages.toLocaleString()}</span>
                        </div>
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Cost</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">£{c.cost.toLocaleString('en-GB', { minimumFractionDigits: 4, maximumFractionDigits: 4 })}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </motion.section>

            {/* Middle: Top Users */}
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.7 }}
              className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">{t('leaderboards.initiators')}</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {data.topUsers.length === 0 ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{t('leaderboards.empty')}</div>
                ) : (
                  data.topUsers.map((u, i) => (
                    <div key={u.id} className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                        <Image
                          src={u.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${u.name ?? u.id}`}
                          alt={u.name}
                          width={32}
                          height={32}
                          unoptimized
                          className="w-8 h-8 rounded-full object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{u.name}</span>
                          <span className="text-[10px] text-secondary/70 tracking-wide truncate">{u.companyName}</span>
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
            </div>

            {/* Plan MRR Distribution (Bar Chart) */}
            <ChartExportWrapper exportName="admin-mrr-spread" className="w-full flex">
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.65 }}
              className="w-full bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] shadow-lg backdrop-blur-xl flex flex-col min-h-[350px]"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5 rounded-[24px]">
                <div className="flex items-center gap-3">
                  <Wallet className="w-4 h-4 text-[#f43f5e] opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">MRR Spread</h2>
                </div>
                <span className="text-[11px] font-mono tracking-widest text-muted opacity-60 uppercase">Revenue by Tier</span>
              </div>
              <div className="h-[260px] min-h-[260px] w-full flex items-center justify-center p-4">
                {(!inventoryData.planDistribution || inventoryData.planDistribution.length === 0) ? (
                  <div className="text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">No Packages Active</div>
                ) : (
                  <ResponsiveContainer width="100%" height={260} debounce={50}>
                    <BarChart data={inventoryData.planDistribution} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#ffffff10" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#888' }} />
                      <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#ccc', fontWeight: 600 }} width={80} />
                      <Tooltip
                        cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                        contentStyle={{ backgroundColor: 'rgba(0,0,0,0.8)', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.1)' }}
                        formatter={(value) => `£${Number(value).toLocaleString('en-GB')}`}
                      />
                      <Bar dataKey="mrr" name="MRR" fill="#f43f5e" radius={[0, 4, 4, 0]} barSize={40} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </motion.section>
            </ChartExportWrapper>

            {/* Bottom: Top Agents (Full Width) */}
            <motion.section
              initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}
              className="bg-[#00000005] dark:bg-[#ffffff05] border border-border-dim rounded-[24px] overflow-hidden flex flex-col shadow-lg backdrop-blur-xl w-full"
            >
              <div className="px-6 py-5 border-b border-border-dim bg-[#00000008] dark:bg-[#ffffff08] flex flex-col gap-1.5">
                <div className="flex items-center gap-3">
                  <Activity className="w-4 h-4 text-brand opacity-80" />
                  <h2 className="text-[14px] font-bold text-foreground">Top Agents</h2>
                </div>
              </div>
              <div className="flex flex-col">
                {(!data.topAgents || data.topAgents.length === 0) ? (
                  <div className="p-8 text-center text-secondary text-sm font-mono tracking-widest uppercase opacity-50">{t('leaderboards.empty')}</div>
                ) : (
                  data.topAgents.map((a, i) => (
                    <div key={a.id} className="flex justify-between items-center px-6 py-4 border-b border-[#0000000d] dark:border-[#ffffff0d] last:border-0 hover:bg-foreground/[0.03] transition-colors">
                      <div className="flex items-center gap-4 w-[70%] overflow-hidden pr-2">
                        <span className="text-[14px] font-mono font-bold text-muted/40 w-5 shrink-0">#{i + 1}</span>
                        <Image
                          src={a.avatar || `https://api.dicebear.com/7.x/notionists/svg?seed=${a.name ?? a.id}`}
                          alt={a.name}
                          width={32}
                          height={32}
                          unoptimized
                          className="w-8 h-8 rounded-[6px] object-cover bg-foreground/10 border border-[#0000000d] dark:border-[#ffffff0d] shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <span className="text-[13px] font-semibold tracking-wide text-foreground leading-tight truncate">{a.name}</span>
                          <span className="text-[10px] text-secondary/70 tracking-wide truncate">Autonomous Process</span>
                        </div>
                      </div>
                      <div className="flex items-center gap-6 shrink-0 pr-2">
                        <div className="flex flex-col items-end w-[65px]">
                          <span className="text-[10px] text-secondary/60 font-mono tracking-widest uppercase mb-1">Messages</span>
                          <span className="text-[13px] font-bold text-foreground tracking-tight">{(a.interactions || 0).toLocaleString()}</span>
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
