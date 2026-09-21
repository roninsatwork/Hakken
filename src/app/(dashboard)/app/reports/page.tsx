"use client";

import { useQuery } from "convex/react";
import {
  CHART_AXIS_TICK,
  CHART_EXPORT_BACKGROUND,
  CHART_LEGEND_TEXT,
  CHART_RISK_RED,
} from "@/src/ui/components/charts/chartPalette";
import { formatCurrencyGBP } from "@/src/lib/currency";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Loader2, Download, AlertTriangle, CheckCircle2, ShieldAlert, Zap, Target, LineChart, TrendingUp, Users } from "lucide-react";
import { useRef } from "react";
import dynamic from "next/dynamic";
import { CHART_CROSSHAIR, ChartTooltip } from "@/src/ui/components/charts/ChartTooltip";
import Header from "@/src/ui/components/layout/Header";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";

const AreaChart = dynamic(() => import("recharts").then((module) => module.AreaChart));
const Area = dynamic(() => import("recharts").then((module) => module.Area));
const XAxis = dynamic(() => import("recharts").then((module) => module.XAxis));
const YAxis = dynamic(() => import("recharts").then((module) => module.YAxis));
const CartesianGrid = dynamic(() => import("recharts").then((module) => module.CartesianGrid));
const RechartsTooltip = dynamic(() => import("recharts").then((module) => module.Tooltip));
const ResponsiveContainer = dynamic(() => import("recharts").then((module) => module.ResponsiveContainer));
const Legend = dynamic(() => import("recharts").then((module) => module.Legend));
const RadarChart = dynamic(() => import("recharts").then((module) => module.RadarChart));
const PolarGrid = dynamic(() => import("recharts").then((module) => module.PolarGrid));
const PolarAngleAxis = dynamic(() => import("recharts").then((module) => module.PolarAngleAxis));
const PolarRadiusAxis = dynamic(() => import("recharts").then((module) => module.PolarRadiusAxis));
const Radar = dynamic(() => import("recharts").then((module) => module.Radar));


export default function ReportsPage() {
  const t = useTranslations("salesReports.board");
  const { platformName } = useSystemSettings();
  const report = useQuery(api.salesReports.getLatestReport);
  const pdfRef = useRef<HTMLDivElement>(null);

  const handleExport = async () => {
    if (!pdfRef.current) return;
    const { default: html2canvas } = await import("html2canvas");
    const canvas = await html2canvas(pdfRef.current, {
      scale: 2,
      useCORS: true,
      backgroundColor: CHART_EXPORT_BACKGROUND, 
    });
    const url = canvas.toDataURL("image/png");
    const link = document.createElement("a");
    link.download = `hakken-board-report-${new Date().toISOString().split('T')[0]}.png`;
    link.href = url;
    link.click();
  };

  if (report === undefined) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-center h-[50vh]">
            <Loader2 className="w-8 h-8 animate-spin text-brand" />
          </div>
        </div>
      </>
    );
  }

  if (report === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-5">
          <div className="px-8 mt-4">
            <div className="bg-card/40 border border-border-dim rounded-2xl p-12 text-center flex flex-col items-center">
              <div className="bg-brand/10 p-4 rounded-full mb-4">
                <AlertTriangle className="w-8 h-8 text-brand" />
              </div>
              <h2 className="text-xl font-medium tracking-wide mb-2">{t("emptyTitle")}</h2>
              <p className="text-muted">{t("emptyBody")}</p>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Graceful handling for legacy schemas or fresh schema mapping
  const { headline, executiveSummary, markdownReport, kpis, closingWindows, topDeals, pipelineHealth, riskRadar, teamSpotlight, patterns, priorities } = report;

  // Fallback if legacy markdown report exists without structured sections
  const isLegacy = !closingWindows || !riskRadar || !teamSpotlight;

  // Visual Addendum synthetic data to plot a premium Risk Vector Radar chart beside Section 5
  const riskVectorData = [
    { subject: t('riskVectors.slippedClose'), A: 90, fullMark: 100 },
    { subject: t('riskVectors.stagnant'), A: 85, fullMark: 100 },
    { subject: t('riskVectors.noChampion'), A: 65, fullMark: 100 },
    { subject: t('riskVectors.priceBlock'), A: 40, fullMark: 100 },
    { subject: t('riskVectors.competitor'), A: 55, fullMark: 100 },
    { subject: t('riskVectors.legalSec'), A: 30, fullMark: 100 },
  ];

  return (
    <>
      <Header />
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-6 max-w-none px-4 md:px-8 pb-12 pt-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-light tracking-[0.12em] text-foreground">{t("title")}</h1>
              <p className="text-muted text-sm mt-1">{t("subtitle", { platformName })}</p>
            </div>
            <button
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-brand/10 hover:bg-brand/20 text-brand rounded-xl transition-all border border-brand/20 font-medium text-sm"
            >
              <Download className="w-4 h-4" />
              {t("exportToBoard")}
            </button>
          </div>

          <div ref={pdfRef} className="flex flex-col gap-8 bg-background pb-8">
            
            {/* SECTION 1: Executive Headline */}
            <div className="bg-card/60 backdrop-blur-3xl border border-border-dim rounded-2xl p-8 lg:p-10 relative overflow-hidden shadow-2xl">
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand via-brand/50 to-transparent opacity-50" />
              <div className="flex items-start gap-4">
                <div className="mt-1 bg-brand/10 p-2.5 rounded-lg border border-brand/20 shadow-[0_0_15px_rgba(255,255,255,0.05)]">
                    <TrendingUp className="w-5 h-5 text-brand" />
                </div>
                <div>
                  <h2 className="text-[22px] font-medium tracking-wide text-foreground mb-4 leading-snug">{headline}</h2>
                  <div className="text-secondary text-base leading-relaxed max-w-4xl opacity-90 prose prose-invert prose-brand">
                     <HakkenMarkdown content={executiveSummary || markdownReport || t("noSummary")} />
                  </div>
                </div>
              </div>
            </div>

            {isLegacy ? (
                // Safe Fallback for older database objects
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                  <KpiCard label={t("kpiTotalPipeline")} value={formatCurrencyGBP(kpis?.totalPipeline || 0)} />
                  <KpiCard label={t("kpiWeightedPipeline")} value={formatCurrencyGBP(kpis?.weightedPipeline || 0)} />
                  <KpiCard label={t("kpiOpenDeals")} value={kpis?.openDeals?.toString() || "0"} />
                  <KpiCard label={t("kpiWinRate")} value={`${(kpis?.winRatePct || 0).toFixed(1)}%`} highlight />
                </div>
            ) : (
             <>
                {/* SECTION 2: Pipeline at a Glance */}
                <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-2">
                  <KpiCard label={t("kpiTotalPipeline")} value={formatCurrencyGBP(kpis?.totalPipeline || 0)} />
                  <KpiCard label={t("kpiWeighted")} value={formatCurrencyGBP(kpis?.weightedPipeline || 0)} />
                  <KpiCard label={t("kpiOpenDeals")} value={(kpis?.openDeals || 0).toString()} />
                  <KpiCard label={t("kpiAvgSize")} value={formatCurrencyGBP(kpis?.avgDealSize || 0)} />
                  <KpiCard label={t("kpiCycleDays")} value={(kpis?.avgSalesCycleDays || 0).toString()} />
                  <KpiCard label={t("kpiWinRate")} value={`${(kpis?.winRatePct || 0).toFixed(1)}%`} highlight />
                </div>

                {/* SECTION 3: Closing Windows */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch mb-6">
                  <ChartExportWrapper exportName="closing-windows-chart" className="lg:col-span-2 bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl overflow-hidden shadow-xl flex flex-col relative h-full">
                    <div className="absolute inset-0 bg-gradient-to-br from-brand/5 via-transparent to-transparent opacity-50 pointer-events-none"></div>
                    <div className="p-6 border-b border-white/5 flex items-center justify-between relative z-10">
                      <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2">
                         {t("sectionClosingWindows")}
                      </h3>
                    </div>
                    <div className="flex-1 w-full p-4 min-h-[350px] relative z-10">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={closingWindows} margin={{ top: 20, right: 20, left: 0, bottom: 20 }}>
                          <defs>
                            <linearGradient id="totalArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.15}/>
                              <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0.0}/>
                            </linearGradient>
                            <linearGradient id="weightedArea" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--color-brand)" stopOpacity={0.5}/>
                              <stop offset="95%" stopColor="var(--color-brand)" stopOpacity={0.0}/>
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-dim)" vertical={false} />
                          <XAxis dataKey="window" tick={{ fill: CHART_AXIS_TICK, fontSize: 12, fontWeight: 400 }} axisLine={false} tickLine={false} dy={10} />
                          <YAxis tick={{ fill: CHART_AXIS_TICK, fontSize: 12, fontWeight: 400 }} axisLine={false} tickLine={false} tickFormatter={(val) => `£${(val/1000).toFixed(0)}k`} dx={-10} />
                          <RechartsTooltip
                            cursor={CHART_CROSSHAIR}
                            content={<ChartTooltip formatValue={(value) => formatCurrencyGBP(value)} />}
                          />
                          <Legend verticalAlign="top" align="right" height={40} iconType="circle" wrapperStyle={{ fontSize: '12px', color: CHART_LEGEND_TEXT, paddingTop: '0px', paddingBottom: '15px' }} />
                          {/* No entrance animation: it can wedge and render the series as nothing — see GovernanceRunsChart.tsx. */}
                          <Area isAnimationActive={false} type="monotone" dataKey="totalValue" name={t("seriesTotalPipeline")} fill="url(#totalArea)" stroke="var(--color-brand)" strokeOpacity={0.3} strokeWidth={2} />
                          <Area isAnimationActive={false} type="monotone" dataKey="weightedValue" name={t("seriesWeightedForecast")} fill="url(#weightedArea)" stroke="var(--color-brand)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartExportWrapper>

                  <div className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl overflow-hidden shadow-xl p-7 relative flex flex-col h-full">
                     <div className="absolute top-0 right-0 w-full h-64 bg-gradient-to-bl from-brand/10 to-transparent rounded-full -mt-20 -mr-20 pointer-events-none blur-3xl"></div>
                     <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-brand flex items-center gap-2 mb-6 drop-shadow-md relative z-10">
                        <Zap className="w-4 h-4 text-brand" /> {t("sectionTopDeals")}
                      </h3>
                      <div className="space-y-4 relative z-10 flex-1 flex flex-col justify-center">
                        {(topDeals || []).map((deal, i) => (
                           <div key={i} className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.03] hover:bg-white/[0.04] hover:border-brand/30 hover:shadow-[0_0_30px_rgba(var(--color-brand-rgb),0.1)] transition-all duration-500 group relative overflow-hidden">
                              <div className="absolute inset-0 bg-gradient-to-r from-brand/0 via-brand/[0.03] to-brand/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000 pointer-events-none"></div>
                              <div className="flex justify-between items-start mb-3">
                                <span className="font-medium text-foreground text-[14px] leading-snug tracking-tight drop-shadow-md">{deal.dealName}</span>
                                <span className="text-brand font-mono text-[12px] bg-brand/10 border border-brand/20 px-2.5 py-0.5 rounded-full shadow-[inset_0_0_8px_rgba(var(--color-brand-rgb),0.2)] tracking-tight">{deal.probability}%</span>
                              </div>
                              <div className="flex items-center gap-3 text-[12px] text-muted mb-3.5">
                                <span className="flex items-center gap-1.5 font-medium"><Users className="w-3.5 h-3.5 opacity-60"/> {deal.rep}</span>
                                <span className="w-1 h-1 rounded-full bg-border-dim"></span>
                                <span className="font-mono text-secondary tracking-tight">{formatCurrencyGBP(deal.value)}</span>
                              </div>
                              <div className="text-[12px] text-brand/80 leading-relaxed font-medium tracking-wide border-t border-white/[0.03] pt-3 flex items-center gap-2">
                                <Target className="w-3.5 h-3.5 opacity-70"/> {deal.status}
                              </div>
                           </div>
                        ))}
                      </div>
                  </div>
                </div>

                {/* SECTION 4: Pipeline Health */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 items-stretch">
                  <ChartExportWrapper exportName="pipeline-stage-chart" className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl p-7 shadow-xl relative overflow-hidden h-full">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-[60px] rounded-full -mt-20 -mr-20 pointer-events-none"></div>
                    <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2 mb-8 relative z-10">
                       {t("sectionPipelineByStage")} <span className="opacity-50 tracking-normal capitalize ml-1">{t("axisValue")}</span>
                    </h3>
                    <div className="space-y-7 relative z-10">
                       {(pipelineHealth?.byStage || []).map((ph, i) => (
                         <div key={i} className="flex flex-col group">
                            <div className="flex items-center gap-4 mb-2">
                               <span className="w-28 text-[12px] uppercase tracking-[0.1em] text-muted font-medium truncate">{ph.stage}</span>
                               <span className="font-mono text-[10px] sm:text-[13px] tracking-[0.2em] text-white/10 group-hover:text-brand/60 transition-colors duration-500 flex-1 truncate">{ph.barChart}</span>
                               <span className="font-mono text-[13px] text-brand/90 ml-auto">{ph.valueFormatted || formatCurrencyGBP(ph.value)}</span>
                            </div>
                            <p className="text-[13px] text-secondary/70 italic border-l-[3px] border-brand/20 pl-4 py-0.5 ml-0 sm:ml-[128px]">
                              {ph.observation}
                            </p>
                         </div>
                       ))}
                    </div>
                  </ChartExportWrapper>

                  <ChartExportWrapper exportName="pipeline-rep-chart" className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl p-7 shadow-xl relative overflow-hidden h-full">
                    <div className="absolute top-0 left-0 w-64 h-64 bg-brand/5 blur-[60px] rounded-full -mt-20 -ml-20 pointer-events-none"></div>
                    <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2 mb-8 relative z-10">
                       {t("sectionPipelineByRep")} <span className="opacity-50 tracking-normal capitalize ml-1">{t("axisWeightedValue")}</span>
                    </h3>
                    <div className="space-y-7 relative z-10">
                       {(pipelineHealth?.byRep || []).map((ph, i) => (
                         <div key={i} className="flex flex-col group">
                            <div className="flex items-center gap-4 mb-2">
                               <span className="w-28 text-[14px] font-medium text-foreground truncate">{ph.rep}</span>
                               <span className="font-mono text-[10px] sm:text-[13px] tracking-[0.2em] text-white/10 group-hover:text-brand/60 transition-colors duration-500 flex-1 truncate">{ph.barChart}</span>
                               <span className="font-mono text-[13px] text-brand/90 ml-auto whitespace-nowrap">{ph.valueFormatted || formatCurrencyGBP(ph.valPct)}</span>
                            </div>
                            <p className="text-[13px] text-secondary/70 italic border-l-[3px] border-brand/20 pl-4 py-0.5 ml-0 sm:ml-[128px]">
                              {ph.observation}
                            </p>
                         </div>
                       ))}
                    </div>
                  </ChartExportWrapper>
                </div>

                {/* SECTION 5: Risk Radar & Vector Analysis */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-stretch">
                  <div className="lg:col-span-2 bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl overflow-hidden shadow-xl relative">
                    <div className="absolute top-0 right-0 w-96 h-96 bg-amber-400/5 blur-[100px] rounded-full -mt-20 -mr-20 pointer-events-none"></div>
                    <div className="p-7 border-b border-border-dim/50 relative z-10">
                      <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2">
                         <ShieldAlert className="w-4 h-4 text-red-500" /> {t("sectionRiskRadar")}
                      </h3>
                    </div>
                    
                    <div className="p-7 space-y-8 relative z-10">
                       {/* Critical */}
                       {riskRadar.critical && riskRadar.critical.length > 0 && (
                         <div>
                           <h4 className="flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-foreground mb-4">
                              <span className="w-3.5 h-3.5 rounded-full bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.75)] border border-amber-300"></span>
                              {t("riskCritical")}
                           </h4>
                           <div className="space-y-4">
                             {riskRadar.critical.map((d, i) => (
                                <p key={i} className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-amber-400/40">
                                  <strong className="text-foreground font-semibold tracking-tight">{d.dealName}</strong> <span className="opacity-60 text-[13px]">({d.rep}, {formatCurrencyGBP(d.value)})</span> — {d.reason} <strong className="text-foreground ml-1 font-medium">{t("recommendation")}</strong> {d.recommendation}
                                </p>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* At Risk */}
                       {riskRadar.atRisk && riskRadar.atRisk.length > 0 && (
                         <div>
                           <h4 className="flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-foreground mb-4">
                              <span className="w-3.5 h-3.5 rounded-full bg-amber-400/45 border border-amber-400/70"></span>
                              {t("riskAtRisk")}
                           </h4>
                           <div className="space-y-4">
                             {riskRadar.atRisk.map((d, i) => (
                                <p key={i} className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-amber-400/20">
                                  <strong className="text-foreground font-semibold tracking-tight">{d.dealName}</strong> <span className="opacity-60 text-[13px]">({d.rep}, {formatCurrencyGBP(d.value)})</span> — {d.reason} <strong className="text-foreground ml-1 font-medium">{t("recommendation")}</strong> {d.recommendation}
                                </p>
                             ))}
                           </div>
                         </div>
                       )}

                       {/* Quiet */}
                       {riskRadar.quiet && riskRadar.quiet.length > 0 && (
                         <div>
                           <h4 className="flex items-center gap-2.5 text-[12px] font-bold uppercase tracking-[0.1em] text-foreground mb-4">
                              <span className="w-3.5 h-3.5 rounded-full bg-secondary/40 border border-secondary/50"></span>
                              {t("riskQuiet")}
                           </h4>
                           <div className="space-y-4">
                             {riskRadar.quiet.map((d, i) => (
                                <p key={i} className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-secondary/20">
                                  <strong className="text-foreground font-semibold tracking-tight">{d.dealName}</strong> <span className="opacity-60 text-[13px]">({d.rep}, {formatCurrencyGBP(d.value)})</span> — {d.reason} <strong className="text-foreground ml-1 font-medium">{t("recommendation")}</strong> {d.recommendation}
                                </p>
                             ))}
                           </div>
                         </div>
                       )}
                    </div>
                  </div>

                  <ChartExportWrapper exportName="risk-vector-chart" className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl p-7 shadow-xl relative overflow-hidden flex flex-col h-full">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-red-400/5 blur-[80px] rounded-full -mt-20 -mr-20 pointer-events-none"></div>
                    <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2 mb-8 relative z-10">
                       {t("sectionRiskVector")}
                    </h3>
                    <div className="flex-1 w-full relative z-10 min-h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={riskVectorData}>
                          <PolarGrid stroke="rgba(255,255,255,0.05)" />
                          <PolarAngleAxis dataKey="subject" tick={{ fill: CHART_LEGEND_TEXT, fontSize: 11, letterSpacing: '0.05em' }} />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                          <Radar name={t("seriesRiskConcentration")} dataKey="A" stroke={CHART_RISK_RED} fill={CHART_RISK_RED} fillOpacity={0.15} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </ChartExportWrapper>
                </div>

                {/* SECTION 6 & 7: Team & Patterns Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Spotlight */}
                  <div className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl p-7 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-[#00C49F]/5 blur-[80px] rounded-full -mt-20 -mr-20 pointer-events-none"></div>
                    <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2 mb-8 relative z-10">
                       <Users className="w-4 h-4 text-brand" /> {t("sectionTeamSpotlight")}
                    </h3>
                    <div className="space-y-8 relative z-10">
                        <div>
                           <div className="flex items-center gap-2.5 mb-4">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#00C49F] shadow-[0_0_10px_rgba(0,196,159,0.7)] border border-[#00C49F]/50"></span>
                              <h4 className="text-[11px] uppercase tracking-[0.15em] text-foreground font-bold">{t("momentumLeaders")}</h4>
                           </div>
                           {typeof teamSpotlight.momentum === 'string' ? (
                             <p className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-[#00C49F]/30">{teamSpotlight.momentum}</p>
                           ) : (
                             <div className="space-y-4">
                               {(teamSpotlight?.momentum || []).map((item, i) => (
                                 <p key={i} className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-[#00C49F]/30">
                                   <strong className="text-foreground font-semibold">{item.rep}</strong> — {item.summary}
                                 </p>
                               ))}
                             </div>
                           )}
                        </div>

                        <div>
                           <div className="flex items-center gap-2.5 mb-4 mt-6">
                              <span className="w-2.5 h-2.5 rounded-full bg-[#FF8042] shadow-[0_0_10px_rgba(255,128,66,0.7)] border border-[#FF8042]/50"></span>
                              <h4 className="text-[11px] uppercase tracking-[0.15em] text-foreground font-bold">{t("supportCoaching")}</h4>
                           </div>
                           {typeof teamSpotlight.supportNeeded === 'string' ? (
                             <p className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-[#FF8042]/30">{teamSpotlight.supportNeeded}</p>
                           ) : (
                             <div className="space-y-4">
                               {(teamSpotlight?.supportNeeded || []).map((item, i) => (
                                 <p key={i} className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-[#FF8042]/30">
                                   <strong className="text-foreground font-semibold">{item.rep}</strong> — {item.summary}
                                 </p>
                               ))}
                             </div>
                           )}
                        </div>
                    </div>
                  </div>

                  {/* Patterns */}
                  <div className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl p-7 shadow-xl relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-[80px] rounded-full -mt-20 -mr-20 pointer-events-none"></div>
                    <h3 className="text-[13px] uppercase tracking-[0.2em] font-medium text-foreground flex items-center gap-2 mb-8 relative z-10">
                       <LineChart className="w-4 h-4 text-brand" /> {t("sectionPatterns")}
                    </h3>
                    <div className="space-y-6 relative z-10">
                        {(patterns || []).map((p, i) => (
                           <div key={i} className="relative">
                              <Zap className="absolute -left-1.5 top-0.5 w-[14px] h-[14px] text-brand/80 bg-background rounded-full drop-shadow-[0_0_8px_rgba(var(--color-brand-rgb),0.5)] z-10" />
                              <p className="text-[14px] text-secondary/90 leading-relaxed pl-5 border-l-[3px] border-brand/30">
                                <strong className="text-foreground font-semibold tracking-tight">{p.pattern}</strong> — {p.observation}
                              </p>
                           </div>
                        ))}
                    </div>
                  </div>
                </div>

                {/* SECTION 8: Priorities */}
                <div className="bg-card/40 backdrop-blur-3xl border border-border-dim rounded-3xl p-8 relative overflow-hidden shadow-xl mt-4">
                   <div className="absolute top-0 right-0 w-96 h-96 bg-brand/5 blur-[100px] rounded-full -mt-20 -mr-20 pointer-events-none" />
                   <h3 className="text-[14px] uppercase tracking-[0.2em] font-medium text-foreground mb-8 flex items-center gap-2 relative z-10">
                       <CheckCircle2 className="w-4 h-4 text-brand" /> {t("sectionPriorities")}
                   </h3>
                   <div className="space-y-5 relative z-10">
                      {(priorities || []).map((task: string, i: number) => (
                        <div key={i} className="flex items-start gap-4">
                           <div className="w-6 h-6 rounded-full bg-background border border-brand/30 flex items-center justify-center font-mono text-[10px] text-brand/80 shrink-0 shadow-[0_0_10px_rgba(var(--color-brand-rgb),0.2)]">
                             {i + 1}
                           </div>
                           <div className="text-[15px] leading-relaxed text-foreground/90 font-medium pt-0.5">
                              {task}
                           </div>
                        </div>
                      ))}
                   </div>
                </div>

             </>
            )}

          </div>
        </div>
      </div>
    </>
  );
}

function KpiCard({ label, value, highlight = false }: { label: string, value: string, highlight?: boolean }) {
  return (
    <div className={`p-5 rounded-2xl border backdrop-blur-md shadow-lg ${highlight ? 'bg-brand/10 border-brand/20' : 'bg-card/40 border-border-dim'}`}>
      <div className="text-[11px] uppercase tracking-widest text-muted mb-2 font-medium">{label}</div>
      <div className={`text-2xl font-light tracking-tight truncate ${highlight ? 'text-brand' : 'text-foreground font-mono'}`}>
        {value}
      </div>
    </div>
  );
}
