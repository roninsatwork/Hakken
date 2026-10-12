"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { formatDay } from "../../sites/_components/siteFormat";

/** The important points shown at most. */
const MOST_POINTS = 5;
const LABEL = "text-[13px] font-semibold uppercase tracking-[0.12em] text-muted";

/**
 * The Head of Strategy's note for the managing director (Executive summary,
 * approved 12 Oct 2026, replacing "What Hakken sees"): the week's verdict in
 * bold, two or three paragraphs every figure of which the Editor checked, and
 * the important points, each the week's finding it comes from.
 */
export function StrategyNote({ verdict, paragraphs, writtenAt, points, href }: {
  verdict: string;
  paragraphs: readonly string[];
  writtenAt: number;
  points: ReadonlyArray<{ findingId: string; headline: string }>;
  href: (segment: string) => string;
}) {
  const t = usePlatformTranslations("insights.summary.strategy");
  return (
    <section data-part="strategy-note" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 data-part-title="true" className={LABEL}>{t("title")}</h2>
        <span className="text-[12px] text-muted">{t("byline", { day: formatDay(new Date(writtenAt).toISOString().slice(0, 10)) })}</span>
      </div>
      <p className="max-w-[75ch] text-lg font-semibold leading-snug text-foreground">{verdict}</p>
      {paragraphs.length > 0 ? (
        <div className="flex max-w-[75ch] flex-col gap-3">
          {paragraphs.map((paragraph, index) => <p key={index} className="text-[14px] leading-[1.6] text-foreground">{paragraph}</p>)}
        </div>
      ) : null}
      {points.length > 0 ? (
        <div className="flex flex-col gap-2">
          <div className="text-[12px] text-muted">{t("points")}</div>
          {points.slice(0, MOST_POINTS).map((point, index) => (
            <div key={point.findingId} className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-foreground">{index + 1}. {point.headline}</span>
              <Link href={href(`findings/${point.findingId}`)} className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
                {t("seeFinding")}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** One line of what Hakken did or does next, opening the page it is about. */
export type WorkLine = { words: string; href: string };

/**
 * What Hakken did this week and what it does next, side by side (Executive
 * summary, approved 12 Oct 2026): an agency reports its work, it never hands
 * its client a to-do list ("this is supposed to be automated and should never
 * need me"). Each line opens its page.
 */
export function WorkLog({ did, next }: { did: readonly WorkLine[]; next: readonly WorkLine[] }) {
  const t = usePlatformTranslations("insights.summary.work");
  const list = (title: string, lines: readonly WorkLine[]) => (
    <div data-part="work-log" className="flex flex-col">
      <h2 data-part-title="true" className={`mb-2 ${LABEL}`}>{title}</h2>
      {lines.map((line) => (
        <Link key={line.words} href={line.href} className="flex items-center justify-between gap-3 rounded-[10px] border-b border-border-dim px-2 py-3 hover:bg-hover/50">
          <span className="text-[13px] text-foreground">{line.words}</span>
          <ArrowUpRight className="h-3.5 w-3.5 shrink-0 text-secondary" aria-hidden="true" />
        </Link>
      ))}
    </div>
  );
  return (
    <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      {list(t("did"), did)}
      {list(t("next"), next)}
    </section>
  );
}
