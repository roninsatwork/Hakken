"use client";

import type { ReactNode } from "react";
import { Target } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ChartReadoutTableProps, ReadoutCell, ReadoutColumn } from "@/src/ui/components/charts/ChartReadoutTable";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatPerConversion } from "./analyticsFormat";
import { measureOf, type LinesBy, type Measure } from "./explorerRule";

type Sums = { visits: number; conversions: number };

/** A line of the readout: its name and colour, its step's figures, and the figures of the step it is set against. */
export type ReadoutLine = { key: string; name: string; colour: string; now: Sums; then: Sums | null };

type Column = "visits" | "conversions" | "one" | "rate";

/**
 * The hover of a page's "Visits needed for one conversion, by channel", as the kit's `ChartReadoutTable` draws it
 * (Anthony, 2026-10-20, Hover B: "it should adapt for drop down selection"): a row a line — a channel, a kind of
 * conversion, or everything ticked — with their total; visits, the conversions on their band with a target, and
 * visits for one, or the rate when the chart shows it; the column the chart draws marked. A line per kind of
 * conversion shares one set of visits, said once above the rows.
 */
export function useExplorerReadout() {
  const t = useTranslations("googleAnalytics.conversionExplorer");
  return ({ heading, against, measure, linesBy, lines, total, note }: {
    heading: ReactNode;
    against: string | null;
    measure: Measure;
    linesBy: LinesBy;
    lines: readonly ReadoutLine[];
    total: { now: Sums; then: Sums | null };
    note?: ReactNode;
  }): ChartReadoutTableProps => {
    const keys: Column[] = [...(linesBy === "kind" ? [] : ["visits" as const]), "conversions", measure === "rate" ? "rate" : "one"];
    const drawn: Column = measure === "perOne" ? "one" : measure === "conversions" ? "conversions" : measure;
    const labels: Record<Column, string> = { visits: t("readoutVisits"), conversions: t("readoutConversions"), one: t("readoutForOne"), rate: t("readoutRate") };
    const columns: ReadoutColumn[] = keys.map((key) => ({
      key,
      label: labels[key],
      drawn: key === drawn,
      ...(key === "conversions" ? { tone: "band" as const, icon: <Target aria-hidden className="h-3.5 w-3.5 shrink-0" /> } : key === "one" || key === "rate" ? { tone: "quiet" as const } : {}),
    }));
    const text = (key: Column, sums: Sums): { text: string; quiet: boolean } => {
      if (key === "visits" || key === "conversions") {
        const count = Math.round(key === "visits" ? sums.visits : sums.conversions);
        return { text: formatNumber(count), quiet: count === 0 };
      }
      const value = measureOf(key === "one" ? "perOne" : "rate", sums);
      // A dash where there is nothing to divide by; a count of none is 0.
      if (value === null) return { text: "–", quiet: true };
      return { text: key === "one" ? formatPerConversion(value) : t("rateValue", { value }), quiet: false };
    };
    const cells = (now: Sums, then: Sums | null): Record<string, ReadoutCell> => Object.fromEntries(keys.map((key) => [key, {
      ...text(key, now),
      was: then ? text(key, then).text : null,
    }]));
    return {
      heading,
      against,
      note,
      columns,
      rows: lines.map((line) => ({ key: line.key, name: line.name, colour: line.colour, cells: cells(line.now, line.then) })),
      total: cells(total.now, total.then),
    };
  };
}
