"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { AtSign, BookOpen, CirclePlay, ExternalLink, Globe, Library, type LucideIcon } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { NewsItemKind } from "@/convex/newsSchema";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { GoogleMark } from "../../sites/_components/GoogleMark";
import { addDays, daysBetween, formatShortDay, formatWhen } from "../../_learn/learnDates";
import { useCountClick } from "../../_learn/useReading";

/** One story as News reads it, in the reader's language. */
export type NewsItem = NonNullable<FunctionReturnType<typeof api.news.getNewsItem>>;
type UpdateFacts = NonNullable<NewsItem["update"]>;

/** What a story is: one of News's kinds, a Knowledge article, or a Helpful content article (R5; insights-helpful-content-plan.md, IH8). */
export type StoryKind = NewsItemKind | "KNOWLEDGE" | "HELPFUL";

const KIND_ICONS: Record<Exclude<StoryKind, "GOOGLE_UPDATE">, LucideIcon> = {
  WEBSITE: Globe,
  YOUTUBE: CirclePlay,
  X: AtSign,
  KNOWLEDGE: BookOpen,
  HELPFUL: Library,
};

export const storyHref = (itemId: string) => `/app/news/${itemId}`;

/** A story's icon: grey for where it came from, and Google's own "G" for Google's updates, as on the charts. */
export function KindIcon({ kind, size = 14 }: { kind: StoryKind; size?: number }) {
  if (kind === "GOOGLE_UPDATE") return <GoogleMark size={size} />;
  const Icon = KIND_ICONS[kind];
  return <Icon aria-hidden="true" className="shrink-0 text-secondary" style={{ width: size, height: size }} />;
}

/** The line above a story's headline: what it is, where it came from, and when. */
export function StoryKicker({ kind, sourceName, publishedAt }: { kind: StoryKind; sourceName: string; publishedAt: number }) {
  const t = useTranslations("news.story");
  const locale = useLocale();
  return (
    <p className="flex min-w-0 items-center gap-2 whitespace-nowrap text-[12px] text-secondary">
      <KindIcon kind={kind} />
      <span className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-foreground/85">{t(`kinds.${kind}`)}</span>
      <span aria-hidden="true" className="text-muted">·</span>
      <span className="truncate">{sourceName}</span>
      <span aria-hidden="true" className="text-muted">·</span>
      <time dateTime={new Date(publishedAt).toISOString()}>{formatWhen(publishedAt, locale)}</time>
    </p>
  );
}

/** Where a rollout stands on `today`: how far along its line, and the day it is on. */
export function rolloutPlace(update: UpdateFacts, today: string) {
  const end = update.finishedOn ?? addDays(update.startedOn, update.expectedDays);
  const length = Math.max(daysBetween(update.startedOn, end), 1);
  const day = daysBetween(update.startedOn, today) + 1;
  const done = update.finishedOn ? 1 : Math.min(Math.max((day - 1) / length, 0), 1);
  return { end, length, day, done };
}

/** The least room kept between "Today · day N" and the words at either end of the line. */
const ROLLOUT_LABEL_GAP_PX = 12;

/**
 * Where "Today · day N" sits on a rollout line, in px from its left: under the
 * dot when there is room, moved in from an end whose words it would run into,
 * and null — left out — when the line is too narrow for all three. Nothing is
 * lost then: the words beneath the line say the same day. A 1440px window ran
 * the middle words 20px into "Done by …" on day 13 of 14 (2026-10-06).
 *
 * Measured once laid out, and again whenever the line or any of its words
 * changes size (a narrower window, the fonts arriving); null until then, so
 * the words never show where they would collide.
 */
function useRolloutLabelPlace(
  preferred: number,
  line: RefObject<HTMLDivElement | null>,
  start: RefObject<HTMLSpanElement | null>,
  middle: RefObject<HTMLSpanElement | null>,
  end: RefObject<HTMLSpanElement | null>,
): number | null {
  const [left, setLeft] = useState<number | null>(null);

  useLayoutEffect(() => {
    const box = line.current;
    if (!box || typeof ResizeObserver === "undefined") return;
    // A ResizeObserver reports each element once as it starts watching, so this also places the words the first time.
    const observer = new ResizeObserver(() => {
      const width = box.clientWidth;
      const label = middle.current?.offsetWidth ?? 0;
      if (!width || !label) {
        setLeft(null);
        return;
      }
      const half = label / 2;
      const min = (start.current?.offsetWidth ?? 0) + ROLLOUT_LABEL_GAP_PX + half;
      const max = width - (end.current?.offsetWidth ?? 0) - ROLLOUT_LABEL_GAP_PX - half;
      setLeft(min > max ? null : Math.min(Math.max(preferred * width, min), max));
    });
    for (const element of [box, start.current, middle.current, end.current]) if (element) observer.observe(element);
    return () => observer.disconnect();
  }, [preferred, line, start, middle, end]);

  return left;
}

/**
 * A Google update's rollout (R6): the chart marker's own "G" where it started,
 * a solid line as far as today, dashed to the latest it should finish — solid
 * end to end once it has. The words beneath say the same, so the line is never
 * the only way to read it.
 */
export function RolloutLine({ update, today }: { update: UpdateFacts; today: string }) {
  const t = useTranslations("news.rollout");
  const locale = useLocale();
  const { end, length, day, done } = rolloutPlace(update, today);
  const finished = update.finishedOn !== null;
  // The middle words follow the dot, kept clear of the words at either end.
  const labelAt = Math.min(Math.max(done, 0.3), 0.7);
  const lineRef = useRef<HTMLDivElement>(null);
  const startRef = useRef<HTMLSpanElement>(null);
  const todayRef = useRef<HTMLSpanElement>(null);
  const endRef = useRef<HTMLSpanElement>(null);
  const todayLeft = useRolloutLabelPlace(labelAt, lineRef, startRef, todayRef, endRef);

  return (
    <div className="flex flex-col gap-2">
      <div ref={lineRef} className="relative mt-2 h-[52px]" aria-hidden="true">
        <span className="absolute left-[11px] right-[5px] top-[10px] h-0">
          <span className="absolute left-0 top-0 border-t-2 border-foreground/75" style={{ width: `${done * 100}%` }} />
          {finished ? null : <span className="absolute right-0 top-[0.5px] border-t border-dashed border-foreground/35" style={{ left: `${done * 100}%` }} />}
        </span>
        <span className="absolute left-0 top-0 grid h-[22px] w-[22px] place-items-center rounded-full border border-foreground/20 bg-card">
          <GoogleMark size={14} />
        </span>
        {finished ? null : (
          <span
            className="absolute top-[6px] h-[10px] w-[10px] -translate-x-1/2 rounded-full bg-foreground ring-4 ring-background"
            style={{ left: `calc(11px + (100% - 16px) * ${done})` }}
          />
        )}
        <span className={cn("absolute right-0 top-[6px] h-[10px] w-[10px] rounded-full border-[1.5px]", finished ? "border-foreground/75 bg-foreground/75" : "border-foreground/45 bg-background")} />
        <span ref={startRef} className="absolute left-0 top-[32px] whitespace-nowrap text-[12px] text-secondary">
          {t.rich("started", { day: formatShortDay(update.startedOn, locale), strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
        </span>
        {finished ? null : (
          <span
            ref={todayRef}
            className={cn("absolute top-[32px] hidden -translate-x-1/2 whitespace-nowrap text-[12px] text-secondary sm:inline", todayLeft === null && "invisible")}
            style={{ left: todayLeft === null ? `${labelAt * 100}%` : todayLeft }}
          >
            {t.rich("today", { day, strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span> })}
          </span>
        )}
        <span ref={endRef} className="absolute right-0 top-[32px] whitespace-nowrap text-[12px] text-secondary">
          {t.rich(finished ? "finished" : "doneBy", {
            day: formatShortDay(end, locale),
            days: length,
            strong: (chunks) => <span className="font-medium text-foreground">{chunks}</span>,
          })}
        </span>
      </div>
      {finished ? (
        <StatusLabel tone="success" size="md">{t("finishedStatus", { days: length })}</StatusLabel>
      ) : (
        <StatusLabel tone="warning" icon="working" size="md">{t("rollingOut", { day, days: update.expectedDays })}</StatusLabel>
      )}
    </div>
  );
}

/**
 * What a story says, below its headline — on the front page's lead and on its
 * own page alike: the summary, a Google update's rollout, what it means for
 * the reader, the original, and Ask Hakken about it (R10).
 */
export function StoryBody({ item, today }: { item: NewsItem; today: string }) {
  const t = useTranslations("news.story");
  const countClick = useCountClick();
  const { platformName } = useSystemSettings();
  const askHref = `/app/assistant?ask=${encodeURIComponent(t("askQuestion", { title: item.title }))}`;
  return (
    <div className="flex flex-col gap-6">
      {item.summary ? <p className="max-w-2xl text-[16.5px] leading-relaxed text-foreground/85">{item.summary}</p> : null}
      {item.update ? <RolloutLine update={item.update} today={today} /> : null}
      {item.meaning ? (
        <div className="flex max-w-2xl flex-col gap-1.5">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("meaning")}</p>
          <p className="text-[14px] leading-relaxed text-foreground/85">{item.meaning}</p>
        </div>
      ) : null}
      <p className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[13px] text-secondary">
        <a
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => countClick({ type: "STORY", id: item._id })}
          className={`relative ${LAYER.RAISED} inline-flex items-center gap-1.5 underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground`}
        >
          {item.kind === "GOOGLE_UPDATE" ? t("readGoogle") : t("readOriginal")}
          <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
        <Link href={askHref} className={`relative ${LAYER.RAISED} underline decoration-foreground/25 underline-offset-4 transition-colors hover:text-foreground`}>
          {t("askHakken", { platformName })}
        </Link>
      </p>
    </div>
  );
}
