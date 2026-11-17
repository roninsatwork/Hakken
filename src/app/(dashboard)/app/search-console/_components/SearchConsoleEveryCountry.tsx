"use client";

import { useTranslations } from "next-intl";
import { Notice } from "@/src/ui/components/screens/Notice";

/**
 * Says a screen's page figures are every country's (Anthony, 2026-11-17:
 * "Every country's pages"; `EVERY_COUNTRY_LISTS` in
 * `convex/searchConsoleApi.ts`). Google leaves the searches it keeps
 * private out of a page's figures whenever a country is chosen, so a page's
 * are asked of every country, while the website's totals and keywords stay
 * the home country's. In place of the clicks Google didn't tie to a page
 * (insights-analyst-plan.md §7, S2), which every country's pages now hold.
 * On every screen that shows page figures, as its explanation box.
 */
export function SearchConsoleEveryCountry() {
  const t = useTranslations("searchConsole.everyCountry");
  return <Notice>{t("pages")}</Notice>;
}
