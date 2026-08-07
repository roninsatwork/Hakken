"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { RiskMix } from "@/convex/governanceActivityService";

import { GovernanceRunsChart } from "./GovernanceRunsChart";
import { RISK_COLOURS, RUN_OUTCOME_COLOURS, SIDE_EFFECT_COLOURS } from "./governanceColours";

/**
 * What the AI has been doing, above the checks that say whether anything is wrong.
 *
 * The standing view could only count problems, so on a healthy estate every
 * figure on the page read nought and the screen had nothing to show — Anthony,
 * 2026-08-06: *"its factual and boring."* This is the other half of the record,
 * and none of it is new data: every run, every action and every decision was
 * already being written down.
 *
 * Nothing here is a projection or an average of an average. Each figure is a
 * count of rows somebody can go and read.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */

const RANGES = [7, 30, 90] as const;

type GovernanceActivityProps = {
  riskMix: RiskMix;
  systems: number;
};

/** Label, figure, and the one line that says what the figure means. */
function Tile({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-[12px] border border-border-dim bg-sidebar/40 p-4">
      <p className="text-[12px] text-secondary">{label}</p>
      <p className="mt-1 text-[24px] font-medium leading-none text-foreground">{value}</p>
      <p className="mt-1.5 text-[12px] text-muted">{hint}</p>
    </div>
  );
}

type Segment = { key: string; label: string; value: number; colour: string };

/**
 * A proportion, drawn once and then written out underneath.
 *
 * The bar is the glance and the list is the answer. Reading a compliance figure
 * off the width of a segment is guesswork, so every segment repeats itself in
 * words with its count.
 */
function ProportionBar({ segments, empty }: { segments: Segment[]; empty: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <div>
      <div className="flex h-[22px] gap-[2px] overflow-hidden rounded-[4px]">
        {total === 0 ? (
          <div className="w-full bg-border-dim" />
        ) : (
          segments
            .filter((segment) => segment.value > 0)
            .map((segment) => (
              <div
                key={segment.key}
                style={{ width: `${(segment.value / total) * 100}%`, backgroundColor: segment.colour }}
              />
            ))
        )}
      </div>

      {total === 0 ? (
        <p className="mt-2.5 text-[12px] text-muted">{empty}</p>
      ) : (
        <ul className="mt-2.5 flex flex-col gap-1.5">
          {segments.map((segment) => (
            <li key={segment.key} className="flex items-center gap-2 text-[12px] text-secondary">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-[2px]"
                style={{ backgroundColor: segment.colour }}
                aria-hidden="true"
              />
              <span className="flex-1">{segment.label}</span>
              <span className="tabular-nums text-foreground">{segment.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-[12px] border border-border-dim bg-sidebar/40 p-4">
      <p className="mb-3 text-[13px] font-medium text-foreground">{title}</p>
      {children}
    </div>
  );
}

export function GovernanceActivity({ riskMix, systems }: GovernanceActivityProps) {
  const t = useTranslations("admin.governance.dashboard.activity");
  const [days, setDays] = useState<number>(30);
  const activity = useQuery(api.governanceActivity.getGovernanceActivity, { days });

  if (activity === undefined) {
    return (
      <div className="flex items-center justify-center rounded-[12px] border border-border-dim bg-sidebar/40 p-10">
        <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }

  const { actions, oversight, runs } = activity;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[13px] font-medium text-foreground">{t("title")}</p>

        <div className="flex gap-1.5" role="group" aria-label={t("rangeLabel")}>
          {RANGES.map((range) => (
            <button
              key={range}
              type="button"
              onClick={() => setDays(range)}
              aria-pressed={days === range}
              className={`rounded-[8px] border px-2.5 py-1 text-[12px] transition-colors ${
                days === range
                  ? "border-foreground/30 text-foreground"
                  : "border-border-dim text-secondary hover:border-foreground/20"
              }`}
            >
              {t("range", { count: range })}
            </button>
          ))}
        </div>
      </div>

      {activity.truncated ? (
        <p className="flex items-start gap-2 rounded-[12px] border border-border-dim bg-sidebar/40 px-4 py-3 text-[12px] text-secondary">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#b45309] dark:text-[#fbbf24]" aria-hidden="true" />
          {/* A truncated chart on a compliance page is a claim about the estate
              that happens to be false. If the ceiling was reached, say so. */}
          {t("truncated")}
        </p>
      ) : null}

      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Tile
          label={t("tiles.runs.label")}
          value={runs.total.toLocaleString()}
          hint={t("tiles.runs.hint", { count: runs.perDay })}
        />
        <Tile
          label={t("tiles.actions.label")}
          value={actions.total.toLocaleString()}
          hint={
            actions.total === 0
              ? t("tiles.actions.none")
              : t("tiles.actions.hint", { percent: actions.readShare })
          }
        />
        <Tile
          label={t("tiles.oversight.label")}
          value={oversight.decided.toLocaleString()}
          hint={
            oversight.medianMinutes === null
              ? t("tiles.oversight.none")
              : t("tiles.oversight.hint", { minutes: oversight.medianMinutes })
          }
        />
        <Tile
          label={t("tiles.unfinished.label")}
          value={runs.unfinished.toLocaleString()}
          hint={t("tiles.unfinished.hint", { count: oversight.refused })}
        />
      </div>

      <Panel title={t("chart.title")}>
        <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-secondary">
          {(["finished", "waited", "unfinished"] as const).map((band) => (
            <span key={band} className="flex items-center gap-1.5">
              <span
                className="h-2.5 w-2.5 rounded-[2px]"
                style={{ backgroundColor: RUN_OUTCOME_COLOURS[band] }}
                aria-hidden="true"
              />
              {t(`chart.${band}`)}
            </span>
          ))}
        </div>

        {runs.total === 0 ? (
          /* A flat line across an empty window reads as a broken chart rather
             than as a quiet month. Say which it is. */
          <p className="flex h-[200px] items-center justify-center text-[12px] text-muted">
            {t("chart.empty")}
          </p>
        ) : (
          <GovernanceRunsChart
            data={activity.timeline}
            labels={{
              finished: t("chart.finished"),
              waited: t("chart.waited"),
              unfinished: t("chart.unfinished"),
            }}
          />
        )}
      </Panel>

      <div className="grid gap-2 lg:grid-cols-2">
        <Panel title={t("touched.title")}>
          <ProportionBar
            empty={t("touched.empty")}
            segments={[
              { key: "read", label: t("touched.read"), value: actions.read, colour: SIDE_EFFECT_COLOURS.read },
              { key: "write", label: t("touched.write"), value: actions.write, colour: SIDE_EFFECT_COLOURS.write },
              {
                key: "external",
                label: t("touched.external"),
                value: actions.external,
                colour: SIDE_EFFECT_COLOURS.external,
              },
              {
                key: "destructive",
                label: t("touched.destructive"),
                value: actions.destructive,
                colour: SIDE_EFFECT_COLOURS.destructive,
              },
            ]}
          />
        </Panel>

        <Panel title={t("risk.title", { count: systems })}>
          <ProportionBar
            empty={t("risk.empty")}
            segments={[
              { key: "high", label: t("risk.high"), value: riskMix.high, colour: RISK_COLOURS.high },
              { key: "medium", label: t("risk.medium"), value: riskMix.medium, colour: RISK_COLOURS.medium },
              { key: "low", label: t("risk.low"), value: riskMix.low, colour: RISK_COLOURS.low },
              { key: "unrated", label: t("risk.unrated"), value: riskMix.unrated, colour: RISK_COLOURS.unrated },
            ]}
          />
          {riskMix.unrated > 0 ? (
            <p className="mt-2.5 flex items-start gap-2 text-[12px] text-[#b45309] dark:text-[#fbbf24]">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              {t("risk.warning")}
            </p>
          ) : null}
        </Panel>
      </div>

      <Panel title={t("busiest.title")}>
        {activity.busiest.length === 0 ? (
          <p className="text-[12px] text-muted">{t("busiest.empty")}</p>
        ) : (
          <ul className="flex flex-col">
            {activity.busiest.map((system, index) => (
              <li
                key={system.id}
                className={`flex items-center gap-3 py-2 text-[13px] ${
                  index > 0 ? "border-t border-border-dim" : ""
                }`}
              >
                <span className="flex-1 truncate text-foreground">{system.name}</span>
                {/* The rating travels with the count. Unrated and busy is urgent
                    in a way unrated and dormant is not, and the two facts were
                    two screens apart. */}
                <span className="rounded-full bg-border-dim/60 px-2 py-0.5 text-[11px] text-secondary">
                  {t(`risk.${system.risk.toLowerCase()}`)}
                </span>
                <span className="w-20 shrink-0 text-right tabular-nums text-secondary">
                  {t("busiest.runs", { count: system.runs })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
