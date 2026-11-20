import type { ReactNode } from "react";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { formatDateTime, formatTime } from "@/src/lib/dates";
import { formatDay } from "./siteFormat";

/**
 * A connection page's story, as Google Analytics' Connection was redone with Anthony (2026-11-06) and Search Console's
 * after it (search-console-breakdowns-plan-2026-11-20.md): one line saying whether it's working, then plain sentences
 * saying how the figures get here, one a row. A source's Connection page draws it under its header; Bing's and Clarity's
 * take it when they're redone.
 */
export function ConnectionLines({ status, lines }: { status: ReactNode; lines: string[] }) {
  return (
    <>
      {status ? <div className="flex flex-col gap-1.5">{status}</div> : null}
      <CompactList rows={lines} rowKey={(line) => line} empty="–" columns={[{ key: "line", className: "text-[13px] text-foreground", cell: (line) => line }]} />
    </>
  );
}

/** Which of a connection's three "last update" lines to say, and its words: today at a time, on a day, or not yet. */
export function lastUpdate(at: number | null, newestDay: string | null): { key: "lastToday" | "lastOn" | "lastNone"; values: Record<string, string> } {
  if (at === null || newestDay === null) return { key: "lastNone", values: {} };
  const day = formatDay(newestDay);
  return new Date(at).toDateString() === new Date().toDateString()
    ? { key: "lastToday", values: { time: formatTime(at, { options: { hour: "2-digit", minute: "2-digit" } }), day } }
    : { key: "lastOn", values: { when: formatDateTime(at), day } };
}
