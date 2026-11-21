"use client";

import { useMemo } from "react";
import { useLocale } from "next-intl";

/**
 * A span's name where it has one: a whole calendar month by its name, "October", with its year when it isn't this year's;
 * null for any other span, which the screen words by its period instead. Shared by every screen that names its dates
 * (moved here from Google Analytics' `VisitsCharts.tsx` on 21 November 2026, so the client Dashboard can name its months
 * without reading anything of Google Analytics').
 */
export function useSpanName(): (span: { from: string; to: string } | null) => string | null {
  const locale = useLocale();
  const months = useMemo(() => new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, { month: "long", timeZone: "UTC" }), [locale]);
  const year = new Date().getUTCFullYear();
  return (span) => {
    if (!span?.from || !span.to || !span.from.endsWith("-01")) return null;
    const last = new Date(Date.UTC(Number(span.from.slice(0, 4)), Number(span.from.slice(5, 7)), 0)).toISOString().slice(0, 10);
    if (span.to !== last) return null;
    const name = months.format(new Date(`${span.from}T00:00:00Z`));
    return Number(span.from.slice(0, 4)) === year ? name : `${name} ${span.from.slice(0, 4)}`;
  };
}
