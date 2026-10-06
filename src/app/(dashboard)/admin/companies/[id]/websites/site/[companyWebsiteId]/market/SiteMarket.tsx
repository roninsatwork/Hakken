"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useLocale, useTranslations } from "next-intl";
import { ArrowRight, Trash2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { GOOGLE_COUNTRIES } from "@/convex/utils/countryCodes";
import { DEFAULT_LOCATION_CODE, SEO_LOCATIONS, findSeoLocation } from "@/convex/utils/seoLocations";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Notice } from "@/src/ui/components/screens/Notice";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldLabel, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { RowIconButton } from "@/src/ui/components/screens/Table";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { countryName } from "@/src/app/(dashboard)/app/search-console/_components/countries";
import { AddBar } from "../../../_components/AddBar";
import { siteBase } from "../siteView";

/** Google's "we could not tell" — never a country a website trades in. */
const UNKNOWN_COUNTRY = "zzz";

const LEAD = "max-w-2xl text-[12px] leading-relaxed text-secondary";

/**
 * A website's two place settings, inputs only (docs/plans/active/
 * search-console-plan.md §16; Anthony, 2026-10-03: "this is an admin screen we
 * don't want results on it"):
 *
 * - **Where it trades** — the website's home countries, the only ones Search
 *   Console keeps (search-console-home-countries-plan.md, 2026-10-06), in the
 *   order added: the first is its main country, every Search Console page
 *   opening on it, and says so. Past `consoleCountriesPerSite` the ones added
 *   first are kept and the rest are marked; the server refuses to add past it.
 *   With none, Search Console keeps the country of the place below. A
 *   competitor has no Search Console, so no countries.
 * - **Where you watch from** — the place rankings and AI answers are collected
 *   from, moved here from Schedules as it was (its save, and the server's
 *   refusal while paired), so nothing is set in two places. A paired
 *   competitor is watched from its pair's place, and says so.
 *
 * One Save for both, as drawn: what changed is sent, and nothing else.
 */
export function SiteMarket({
  companyId,
  companyWebsiteId,
  host,
}: {
  companyId: Id<"companies">;
  companyWebsiteId: Id<"companyWebsites">;
  host: string;
}) {
  const t = useTranslations("admin.siteView.market");
  const tSite = useTranslations("admin.siteView");
  const tCommon = useTranslations("common");
  const locale = useLocale();

  const market = useQuery(api.searchConsoleCountries.searchConsoleMarket, { companyWebsiteId });
  const website = useQuery(api.websites.getCompanyWebsiteById, { id: companyWebsiteId });
  const saveCountries = useMutation(api.searchConsoleCountries.setSearchConsoleCountries);
  const setLocation = useMutation(api.websites.setCompanyWebsiteLocation);
  const action = useAdminAction({ scope: "admin-site-market" });

  // Every country Google names, in the reader's language and alphabet — worked out once per language.
  const named = useMemo(() => {
    const list = GOOGLE_COUNTRIES
      .filter((code) => code !== UNKNOWN_COUNTRY)
      .map((code) => ({ code, name: countryName(code, locale) ?? code.toUpperCase() }))
      .sort((left, right) => left.name.localeCompare(right.name, locale));
    return { list, byCode: new Map(list.map((country) => [country.code, country.name])) };
  }, [locale]);
  const nameOf = (code: string) => named.byCode.get(code) ?? code.toUpperCase();

  // Each part adopts what is saved once per saved state, keyed on the values
  // themselves, so an edit in progress survives the queries refreshing — and
  // a save of one part never throws away an edit to the other.
  const savedCountries = market ? market.countries : null;
  const countriesKey = savedCountries ? savedCountries.join(",") : null;
  const savedPlace = website ? website.locationCode ?? DEFAULT_LOCATION_CODE : null;
  const [countriesAdopted, setCountriesAdopted] = useState<string | null>(null);
  const [placeAdopted, setPlaceAdopted] = useState<number | null>(null);
  const [countries, setCountries] = useState<string[]>([]);
  const [place, setPlace] = useState<number>(DEFAULT_LOCATION_CODE);
  const [picked, setPicked] = useState("");
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (savedCountries && countriesKey !== countriesAdopted) {
    setCountriesAdopted(countriesKey);
    setCountries(savedCountries);
  }
  if (savedPlace !== null && savedPlace !== placeAdopted) {
    setPlaceAdopted(savedPlace);
    setPlace(savedPlace);
  }

  if (market === undefined || website === undefined) {
    return <p className="text-[13px] text-secondary">{tSite("loading")}</p>;
  }
  if (market === null || website === null) {
    return <p className="text-[13px] text-destructive">{tSite("notFound")}</p>;
  }

  const paired = website.pairedWith;
  const limit = market.limit;
  const full = countries.length >= limit;
  const over = countries.length > limit;
  const choices = named.list.filter((country) => !countries.includes(country.code));
  const countriesChanged = market.owned && countries.join(",") !== countriesKey;
  const placeChanged = !paired && place !== savedPlace;

  const edited = <Value,>(set: (value: Value) => void) => (value: Value) => {
    set(value);
    setSaved(false);
  };

  const add = () => {
    if (!picked || full || countries.includes(picked)) return;
    edited(setCountries)([...countries, picked]);
    setPicked("");
  };

  const handleSave = async () => {
    setError("");
    setSaved(false);
    const chosen = SEO_LOCATIONS.find((location) => location.code === place);
    const outcome = await action.run(
      async () => {
        if (countriesChanged) await saveCountries({ companyWebsiteId, countries });
        if (placeChanged) {
          // Absence is the default place, so the default is saved as nothing.
          const isDefault = place === DEFAULT_LOCATION_CODE;
          await setLocation({
            companyWebsiteId,
            locationCode: isDefault ? null : place,
            locationLabel: isDefault ? null : chosen?.label ?? null,
          });
        }
      },
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );
    if (outcome.ok) setSaved(true);
    else setError(outcome.message);
  };

  return (
    <div className="flex flex-col gap-6">
      {market.owned ? (
        <SettingsCard title={t("trades.title")}>
          <p className={LEAD}>{t("trades.lead")}</p>
          <p className={LEAD}>{t("trades.speed")}</p>

          <Notice
            tone={over ? "warning" : "info"}
            action={
              <Link
                href={`${siteBase(companyId, companyWebsiteId)}/limits`}
                title={t("trades.changeLimitTip", { host })}
                className="flex w-fit items-center gap-1.5 whitespace-nowrap text-[13px] text-brand hover:underline"
              >
                {t("trades.changeLimit")}
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            }
          >
            {t(over ? "trades.over" : "trades.limit", { limit })}
          </Notice>

          <CompactList
            rows={countries}
            rowKey={(code) => code}
            empty={t("trades.empty")}
            columns={[
              { key: "country", cell: (code) => <span className="text-[13px] text-foreground">{nameOf(code)}</span> },
              {
                key: "kept",
                cell: (code) => (countries.indexOf(code) >= limit
                  ? <TagLabel>{t("trades.pastLimit")}</TagLabel>
                  : countries.indexOf(code) === 0 ? <TagLabel>{t("trades.main")}</TagLabel> : null),
              },
              {
                key: "remove",
                align: "right",
                className: "w-12",
                cell: (code) => (
                  <RowIconButton
                    label={t("trades.remove", { country: nameOf(code) })}
                    tone="danger"
                    onClick={() => edited(setCountries)(countries.filter((kept) => kept !== code))}
                  >
                    <Trash2 className="h-4 w-4" />
                  </RowIconButton>
                ),
              },
            ]}
          />

          <AddBar
            label={t("trades.add")}
            disabled={!picked || full || action.isBusy()}
            disabledTip={full ? t("trades.fullTip", { limit }) : undefined}
            onAdd={add}
          >
            <div className="flex min-w-[16rem] flex-1 flex-col gap-1.5">
              <FieldLabel htmlFor="market-country">{t("trades.addLabel")}</FieldLabel>
              <Select
                id="market-country"
                value={picked}
                onChange={setPicked}
                disabled={full}
                className="w-full"
                selectClassName="h-[46px] rounded-[12px]"
              >
                <option value="">{t("trades.choose")}</option>
                {choices.map((country) => (
                  <option key={country.code} value={country.code}>{country.name}</option>
                ))}
              </Select>
            </div>
          </AddBar>
        </SettingsCard>
      ) : null}

      <SettingsCard title={t("watch.title")}>
        {paired ? (
          <>
            <p className={LEAD}>
              {t("watch.paired", {
                host: paired.displayHost,
                place: paired.locationLabel ?? findSeoLocation(DEFAULT_LOCATION_CODE)?.label ?? "",
              })}
            </p>
            <Link
              href={`${siteBase(companyId, paired.companyWebsiteId)}/market`}
              className="flex w-fit items-center gap-1.5 text-[13px] text-brand hover:underline"
            >
              {t("watch.pairMarket", { host: paired.displayHost })}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            <p className={LEAD}>{t("watch.lead")}</p>
            <Select
              id="market-place"
              value={place}
              onChange={(value) => edited(setPlace)(Number(value))}
              aria-label={t("watch.title")}
              className="w-full sm:w-[320px]"
            >
              {SEO_LOCATIONS.map((location) => (
                <option key={location.code} value={location.code}>{location.label}</option>
              ))}
            </Select>
          </>
        )}
      </SettingsCard>

      {/* A paired competitor has nothing of its own to set here. */}
      {market.owned || !paired ? (
        <>
          <SaveError>{error}</SaveError>
          <div className="flex justify-end">
            <SaveAction
              onClick={handleSave}
              isSaving={action.isBusy()}
              disabled={!countriesChanged && !placeChanged}
              label={t("save")}
              savingLabel={tCommon("saving")}
              successLabel={t("saved")}
              showSuccess={saved}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
