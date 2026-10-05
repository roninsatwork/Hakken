"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { GOOGLE_COUNTRIES } from "@/convex/utils/countryCodes";
import { Select } from "@/src/ui/components/screens/Select";
import { countryName } from "./countries";
import { readerLanguage } from "./searchConsoleFormat";
import { pageForPath, useSearchConsoleCountry, useSearchConsoleSiteId, type SearchConsolePageId } from "./useSearchConsole";

/** Google's "we could not tell": never a country to choose. */
const UNKNOWN_COUNTRY = "zzz";

/** The website's countries kept ready (search-console-plan.md §16), in the order added; undefined while they load. */
function useCountriesKeptReady(): string[] | undefined {
  const siteId = useSearchConsoleSiteId();
  return useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })?.ready;
}

/** Countries nearly all of the website's searches: their searches and pages are all countries' (finish-off plan 2B). */
function useCountriesAsAll(): string[] {
  const siteId = useSearchConsoleSiteId();
  return useQuery(api.searchConsoleCountries.searchConsoleCountryChoices, { siteId })?.asAll ?? [];
}

/**
 * The country every page of a website shows (search-console-plan.md §16),
 * beside the date boxes and the same size as them — a choice for the whole
 * page, not a table's filter chip. It opens on All countries; then the
 * website's countries kept ready, in the order they were added on the Market
 * page in admin, each as quick as All countries; then every other country by
 * name in the reader's language, asked of Google when chosen. Kept in the
 * address (`?country=gbr`), so links and the back button keep it.
 */
export function SearchConsoleCountryPicker() {
  const t = useTranslations("searchConsole.country");
  const [country, setCountry] = useSearchConsoleCountry();
  const ready = useCountriesKeptReady();
  const language = readerLanguage();
  const readyKey = (ready ?? []).join(",");
  const named = useMemo(() => {
    const kept = readyKey ? readyKey.split(",") : [];
    const name = (code: string) => countryName(code, language) ?? code.toUpperCase();
    const collator = new Intl.Collator(language);
    return {
      kept: kept.map((code) => ({ code, name: name(code) })),
      others: GOOGLE_COUNTRIES
        .filter((code) => code !== UNKNOWN_COUNTRY && !kept.includes(code))
        .map((code) => ({ code, name: name(code) }))
        .sort((left, right) => collator.compare(left.name, right.name)),
    };
  }, [readyKey, language]);

  return (
    <Select aria-label={t("label")} value={country ?? ""} onChange={(next) => setCountry(next || null)}>
      <option value="">{t("all")}</option>
      {named.kept.length > 0 ? (
        <optgroup label={t("ready")}>
          {named.kept.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
        </optgroup>
      ) : null}
      <optgroup label={t("others")}>
        {named.others.map((entry) => <option key={entry.code} value={entry.code}>{entry.name}</option>)}
      </optgroup>
    </Select>
  );
}

/** Pages that never ask Google for the country chosen: New and lost says the country isn't kept ready instead, and the connection shows no figures. */
const NEVER_ASKED: readonly SearchConsolePageId[] = ["newLost", "connection"];

/**
 * Beside "Figures to …", when the country chosen is not one the website
 * keeps ready: its figures are asked of Google as the page opens, so they
 * take a moment.
 */
export function CountryAskedNote() {
  const t = useTranslations("searchConsole.country");
  const siteId = useSearchConsoleSiteId();
  const pathname = usePathname();
  const [country] = useSearchConsoleCountry();
  const ready = useCountriesKeptReady();
  const asAll = useCountriesAsAll();
  if (!country || !ready) return null;
  // Nearly all of the searches: its searches and pages are all countries', said where the page names its figures.
  if (asAll.includes(country)) return <span> · {t("asAll", { country: countryName(country, readerLanguage()) ?? country.toUpperCase() })}</span>;
  if (ready.includes(country) || NEVER_ASKED.includes(pageForPath(pathname, siteId))) return null;
  return <span> · {t("asked")}</span>;
}
