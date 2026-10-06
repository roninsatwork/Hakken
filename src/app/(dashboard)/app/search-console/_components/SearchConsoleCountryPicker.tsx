"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Select } from "@/src/ui/components/screens/Select";
import { countryName } from "./countries";
import { readerLanguage } from "./searchConsoleFormat";
import { useSearchConsoleCountry, useSearchConsoleSiteId } from "./useSearchConsole";

/**
 * The country every page of a website shows, beside the date boxes and the
 * same size as them — a choice for the whole page, not a table's filter
 * chip. It offers the website's home countries and nothing else
 * (docs/plans/active/search-console-home-countries-plan.md; Anthony,
 * 2026-10-06): its main one first, which every page opens on, then the
 * countries kept ready beside it, in the order they were added on the Market
 * page in admin. Kept in the address (`?country=fra`), so links and the back
 * button keep it.
 */
export function SearchConsoleCountryPicker() {
  const t = useTranslations("searchConsole.country");
  const siteId = useSearchConsoleSiteId();
  const [country, setCountry] = useSearchConsoleCountry();
  const choices = useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId });
  const language = readerLanguage();
  const name = (code: string) => countryName(code, language) ?? code.toUpperCase();

  return (
    <Select aria-label={t("label")} value={country ?? ""} onChange={(next) => setCountry(next || null)}>
      <option value="">{choices ? name(choices.main) : ""}</option>
      {(choices?.ready ?? []).map((code) => <option key={code} value={code}>{name(code)}</option>)}
    </Select>
  );
}
