"use client";

import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import {
  CHART_ACTIVE_BAR,
  CHART_CURSOR,
  ChartTooltip,
} from "@/src/ui/components/charts/ChartTooltip";

const AXIS_TICK = { fontSize: 11, fill: "var(--color-muted)" } as const;

type PlanDistributionPoint = {
  name: string;
  companies: number;
};

type PlanDistributionChartProps = {
  data: PlanDistributionPoint[];
  noPlanName: string;
  noPlanFill: string;
  planFill: string;
  /** What a bar's number counts, pluralised by the caller. */
  unitLabel: (count: number) => string;
};

/**
 * Plan bars stay together behind one load boundary so Recharts receives real
 * Cell children and can apply each plan's intended fill.
 */
export function PlanDistributionChart({
  data,
  noPlanName,
  noPlanFill,
  planFill,
  unitLabel,
}: PlanDistributionChartProps) {
  // Each bar's colour is decided once and travels with the row, so the hover
  // readout keys the plan in the colour the reader is pointing at rather than
  // guessing from a fill it cannot see.
  const bars = data.map((plan) => ({
    ...plan,
    fill: plan.name === noPlanName ? noPlanFill : planFill,
  }));

  return (
    <div className="w-full">
      <ResponsiveContainer width="100%" height={Math.max(120, data.length * 48)}>
        <BarChart data={bars} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
          <CartesianGrid stroke="var(--color-border-dim)" strokeDasharray="3 3" horizontal={false} />
          <XAxis type="number" allowDecimals={false} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="name" width={130} tick={AXIS_TICK} tickLine={false} axisLine={false} />
          {/* The plan name is already the heading, so the row says what the
              number counts rather than repeating the column key. */}
          <Tooltip
            cursor={CHART_CURSOR}
            content={
              <ChartTooltip seriesLabel={(entry) => unitLabel(Number(entry.value ?? 0))} />
            }
          />
          <Bar dataKey="companies" radius={[0, 4, 4, 0]} isAnimationActive={false} activeBar={CHART_ACTIVE_BAR}>
            {/* Unpriced workspaces are revenue not collected, so they read as
                absence rather than as another plan. */}
            {bars.map((plan) => (
              <Cell key={plan.name} fill={plan.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
