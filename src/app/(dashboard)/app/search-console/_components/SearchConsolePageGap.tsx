"use client";

import { useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { formatNumber } from "../../sites/_components/siteFormat";
import { countryName } from "./countries";
import { useSiteFiguresFor } from "./SearchConsoleFigures";
import { useResultKind, useSearchConsoleCountry, useSearchConsoleRange, useSearchConsoleSiteId, useSearchConsoleStatus } from "./useSearchConsole";

/**
 * The clicks Google doesn't tie to a page (insights-analyst-plan.md §7, S2,
 * drawn as board 39): inside a country, Google's page list leaves out the
 * searches it keeps private, so a website's pages add up to only part of its
 * clicks. Four figures say so — the country's clicks, those tied to a page
 * (what the pages below add up to), the rest, and the clicks from every
 * country (the country list) — with one sentence why. Shown only for a
 * ready-made period and every device, where the page list is the whole of
 * the website's (`tied`, the list's clicks before any search or filter).
 */
export function SearchConsolePageGap({ tied }: { tied: number | null }) {
  const t = useTranslations("searchConsole.pageGap");
  const locale = useLocale();
  const siteId = useSearchConsoleSiteId();
  const status = useSearchConsoleStatus();
  const [kind] = useResultKind();
  const [country] = useSearchConsoleCountry();
  const range = useSearchConsoleRange(status?.connection?.newestDay);
  const held = Boolean(status?.connection?.newestDay);
  const ask = held ? { siteId, searchType: kind, from: range.from, to: range.to } : null;
  const { figures } = useSiteFiguresFor(ask);
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  // The country list is every country's: its clicks before any search are the website's clicks worldwide.
  const world = useQuery(api.searchConsoleLists.searchConsoleSplitList, ask ? { ...ask, dimension: "country" as const } : "skip");
  const total = figures?.totals?.clicks;
  if (tied === null || total === undefined || total <= 0 || tied > total) return null;
  const code = country ?? choices?.main ?? null;
  const place = (code && countryName(code, locale)) || t("homeCountry");
  const untied = total - tied;
  const worldwide = world && !world.live ? world.named : null;
  return (
    <div className="flex flex-col gap-3">
      <FigureRow>
        <Figure label={t("total", { place })} value={formatNumber(total)} detail={<span className="text-secondary">{t("totalDetail", { days: range.days })}</span>} />
        <Figure label={t("tied")} value={formatNumber(tied)} detail={<span className="text-secondary">{t("tiedDetail", { share: Math.round((tied / total) * 100) })}</span>} />
        <Figure label={t("untied")} value={formatNumber(untied)} emphasis detail={<span className="text-secondary">{t("untiedDetail")}</span>} />
        <Figure label={t("worldwide")} value={worldwide === null ? "–" : formatNumber(worldwide)} detail={<span className="text-secondary">{t("worldwideDetail")}</span>} />
      </FigureRow>
      <Notice>{t("why", { place })}</Notice>
    </div>
  );
}
