import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CHART_CROSSHAIR, ChartTooltip } from "@/src/ui/components/charts/ChartTooltip";
import { LAYER } from "@/src/ui/lib/layers";

type OrganizationUsagePlotProps = {
  estimatedCostLabel: string;
  globalMessagesLabel: string;
  noDataLabel: string;
  timeline: Array<{ date: string; cost: number; messages: number }>;
};

export function OrganizationUsagePlot({
  estimatedCostLabel,
  globalMessagesLabel,
  noDataLabel,
  timeline,
}: OrganizationUsagePlotProps) {
  if (timeline.length === 0) {
    return (
      <div className={`w-full h-full flex flex-col items-center justify-center text-muted opacity-50 relative ${LAYER.RAISED} bottom-8`}>
        <AreaChart className="w-12 h-12 mb-3" />
        <span className="text-[12px] uppercase font-mono tracking-widest">{noDataLabel}</span>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300} debounce={50}>
      <AreaChart data={timeline}>
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
        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: "#888888" }} dy={10} />
        <YAxis
          yAxisId="left"
          orientation="left"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#888888" }}
          tickFormatter={(value) =>
            `$${Number(value || 0).toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
          }
          width={80}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          axisLine={false}
          tickLine={false}
          tick={{ fontSize: 11, fill: "#888888" }}
          tickFormatter={(value) => value.toLocaleString()}
          width={40}
        />
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#ffffff10" />
        <Tooltip
          cursor={CHART_CROSSHAIR}
          content={
            <ChartTooltip
              formatValue={(value, entry) =>
                entry.dataKey === "cost"
                  ? `$${value.toLocaleString("en-GB", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`
                  : value.toLocaleString()
              }
              seriesLabel={(entry) => (entry.dataKey === "cost" ? estimatedCostLabel : globalMessagesLabel)}
            />
          }
        />
        {/* No entrance animation: it can wedge and render the series as nothing — see GovernanceRunsChart.tsx. */}
        <Area
          isAnimationActive={false}
          yAxisId="left"
          type="monotone"
          dataKey="cost"
          stroke="#f43f5e"
          strokeWidth={3}
          fillOpacity={1}
          fill="url(#colorCostOrg)"
        />
        <Area
          isAnimationActive={false}
          yAxisId="right"
          type="monotone"
          dataKey="messages"
          stroke="#8b5cf6"
          strokeWidth={3}
          fillOpacity={1}
          fill="url(#colorMsgOrg)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}
