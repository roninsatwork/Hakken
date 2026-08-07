"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { RUN_OUTCOME_COLOURS } from "./governanceColours";

/**
 * Runs per day, stacked by what became of them.
 *
 * Stacked rather than three lines because the question underneath is "how much
 * is this platform doing", and three lines answer a different one. The height of
 * the column is the day's workload; the bands are how it went.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

export type RunsChartPoint = {
  date: string;
  finished: number;
  waited: number;
  unfinished: number;
};

type GovernanceRunsChartProps = {
  data: RunsChartPoint[];
  labels: { finished: string; waited: string; unfinished: string };
};

/** "5 Aug". The year is never in doubt on a ninety-day window. */
function formatDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function GovernanceRunsChart({ data, labels }: GovernanceRunsChartProps) {
  // Roughly six dates across the axis whatever the range, so ninety days does
  // not turn its labels into a grey smear.
  const tickGap = Math.max(1, Math.ceil(data.length / 6));

  const bandLabel: Record<string, string> = {
    finished: labels.finished,
    waited: labels.waited,
    unfinished: labels.unfinished,
  };

  return (
    <ResponsiveContainer width="100%" height={200} debounce={50}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -20 }} barCategoryGap="18%">
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="currentColor" className="text-border-dim" />
        <XAxis
          dataKey="date"
          axisLine={false}
          tickLine={false}
          interval={tickGap - 1}
          tickFormatter={formatDay}
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted"
          dy={6}
        />
        <YAxis
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={44}
          tick={{ fontSize: 11, fill: "currentColor" }}
          className="text-muted"
        />
        <Tooltip
          cursor={{ fill: "currentColor", className: "text-border-dim/40" }}
          contentStyle={{
            backgroundColor: "rgba(20,20,20,0.92)",
            borderRadius: "12px",
            border: "1px solid rgba(255,255,255,0.12)",
            fontSize: "12px",
          }}
          itemStyle={{ color: "#ffffff", fontSize: "12px" }}
          labelStyle={{ color: "#a1a1a1", fontSize: "11px", marginBottom: "4px" }}
          labelFormatter={(date) => formatDay(String(date))}
          formatter={(value, key) =>
            [Number(value ?? 0).toLocaleString(), bandLabel[String(key)] ?? String(key)] as [string, string]
          }
        />
        {/* Ordered so the band a reader cares about most sits at the top of the
            column, where its height is easiest to judge against the gridline. */}
        <Bar dataKey="finished" stackId="runs" fill={RUN_OUTCOME_COLOURS.finished} />
        <Bar dataKey="waited" stackId="runs" fill={RUN_OUTCOME_COLOURS.waited} />
        <Bar dataKey="unfinished" stackId="runs" fill={RUN_OUTCOME_COLOURS.unfinished} radius={[3, 3, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
