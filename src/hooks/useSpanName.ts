"use client";

import { useLocale } from "next-intl";
import { spanNameOf } from "@/convex/utils/sees/eyeData/searchConsoleWords";

/**
 * A span's name where it has one: a whole calendar month by its name, "October", with its year when it isn't this year's;
 * null for any other span, which the screen words by its period instead. Shared by every screen that names its dates
 * (moved here from Google Analytics' `VisitsCharts.tsx` on 21 November 2026, so the client Dashboard can name its months
 * without reading anything of Google Analytics').
 */
export function useSpanName(): (span: { from: string; to: string } | null) => string | null {
  const locale = useLocale();
  // The same function the server names a chat app's dates with (`spanNameOf`), so the two can't disagree.
  return (span) => spanNameOf(span, locale);
}
