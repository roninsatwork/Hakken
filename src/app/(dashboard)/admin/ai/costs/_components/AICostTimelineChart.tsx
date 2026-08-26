import { motion } from "framer-motion";
import {
  CHART_SERIES_ROSE,
} from "@/src/ui/components/charts/chartPalette";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { TrendingUp } from "lucide-react";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import { CHART_CROSSHAIR, ChartTooltip } from "@/src/ui/components/charts/ChartTooltip";
import type { TimelinePoint, Translate } from "./types";
import { formatCostAxisTick } from "./costFormatters";

type AICostTimelineChartProps = {
  aggregationLabel: string;
  noDataLabel: string;
  t: Translate;
  timeline?: TimelinePoint[];
};

export function AICostTimelineChart({
  aggregationLabel,
  noDataLabel,
  t,
  timeline,
}: AICostTimelineChartProps) {
  return (
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
              <h3 className="text-[15px] font-bold tracking-wide">{t("chart.titleUsd", { label: aggregationLabel })}</h3>
            </div>
          </div>

          <div className="w-full h-[300px] min-h-[300px]">
            {timeline && timeline.length > 0 ? (
              <ResponsiveContainer width="100%" height={300} debounce={50}>
                <AreaChart data={timeline}>
                  <defs>
                    <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={CHART_SERIES_ROSE} stopOpacity={0.2} />
                      <stop offset="95%" stopColor={CHART_SERIES_ROSE} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#888888" }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: "#888888" }}
                    tickFormatter={formatCostAxisTick}
                    width={80}
                  />
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
                  <Tooltip
                    cursor={CHART_CROSSHAIR}
                    content={
                      <ChartTooltip
                        formatValue={(value) => formatCostAxisTick(value)}
                        seriesLabel={() => t("chart.tooltipLabel")}
                      />
                    }
                  />
                  {/* No entrance animation: it can wedge and render the series as nothing — see GovernanceRunsChart.tsx. */}
                  <Area isAnimationActive={false}
                    type="monotone"
                    dataKey="cost"
                    stroke={CHART_SERIES_ROSE}
                    strokeWidth={3}
                    fillOpacity={1}
                    fill="url(#colorCost)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="w-full h-full flex flex-col items-center justify-center text-muted opacity-50 relative z-10 bottom-8">
                <TrendingUp className="w-12 h-12 mb-3" />
                <span className="text-[12px] uppercase font-mono tracking-widest">{noDataLabel}</span>
              </div>
            )}
          </div>
        </motion.div>
      </ChartExportWrapper>
    </div>
  );
}
