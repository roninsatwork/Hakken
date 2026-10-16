"use client";

import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import type { api } from "@/convex/_generated/api";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { WatchLink, duration, mono, quiet, useSourceName } from "./ClarityParts";

export type ClarityRecordingRow = FunctionReturnType<typeof api.clarityScreens.clarityRecordingsList>["recordings"][number];

/**
 * A recording in words, as the drawing has it: what the visit shows — an
 * error, a failed or an angry click, a quick return, a long read — and where
 * (agents-and-clarity-plan.md, CM2).
 */
export function useRecordingWords(): (row: ClarityRecordingRow) => string {
  const t = useTranslations("clarity.recordings.what");
  return (row) => {
    const values = { page: row.page, time: duration(row.activeSeconds), pages: row.pages };
    if (row.kind === "LONGEST") return t(row.pages > 1 ? "LONGEST_PAGES" : "LONGEST", values);
    return t(row.kind, values);
  };
}

/** Recordings worth watching, in a short list: what each shows, where it came from, how long it was active, its pages, and the link to watch it in Clarity. */
export function RecordingsList({ rows, empty, pages = true }: { rows: readonly ClarityRecordingRow[]; empty: string; pages?: boolean }) {
  const t = useTranslations("clarity.common");
  const words = useRecordingWords();
  const sourceName = useSourceName();
  return (
    <CompactList
      rows={[...rows]}
      rowKey={(row) => row.link}
      empty={empty}
      columns={[
        { key: "what", header: t("columns.recording"), cell: (row) => <span className="text-[13px] text-foreground">{words(row)}</span> },
        { key: "from", header: t("columns.from"), cell: (row) => quiet(sourceName(row.referrer ?? "")) },
        { key: "length", header: t("columns.length"), align: "right", cell: (row) => mono(duration(row.activeSeconds), "text-secondary") },
        ...(pages ? [{ key: "pages", header: t("columns.pages"), align: "right" as const, cell: (row: ClarityRecordingRow) => (row.pages > 0 ? mono(formatNumber(row.pages), "text-secondary") : <NoFigure />) }] : []),
        { key: "watch", header: "", align: "right", cell: (row) => <WatchLink href={row.link} /> },
      ]}
    />
  );
}
