"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { TextAreaField } from "@/src/ui/components/screens/Field";
import { PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint, FieldLabel, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { useCountryName } from "./ResearchCells";
import { CENTS_A_KEYWORD } from "./researchWords";
import { lookupHref } from "./useLookup";

export type ResearchSetup = NonNullable<FunctionReturnType<typeof api.keywordResearch.researchSetup>>;

/** The keywords typed, one a line, each once however it was typed. */
export function typedKeywords(text: string): string[] {
  const seen = new Map<string, string>();
  for (const line of text.split("\n")) {
    const words = line.trim().replace(/\s+/g, " ");
    if (words && !seen.has(words.toLowerCase())) seen.set(words.toLowerCase(), words);
  }
  return [...seen.values()];
}

/**
 * Look up (board 1): one keyword or several, one a line, up to the company's
 * limit; the country, opening on the chosen website's own; the website it is
 * measured against, or none. Look up writes the lookups and starts the
 * Keyword research agent, then opens the first lookup, which fills in as the
 * agent buys (docs/plans/active/keyword-research-plan.md).
 */
export function LookUpCard({ setup, siteId, onSiteId }: {
  setup: ResearchSetup;
  /** The website measured against, "" for none: the page's, so Start from a competitor follows it. */
  siteId: string;
  onSiteId: (siteId: string) => void;
}) {
  const t = useTranslations("keywordResearch.lookUp");
  const countryName = useCountryName();
  const router = useRouter();
  const lookUp = useMutation(api.keywordResearch.lookUp);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-look-up" });
  const homeOf = (site: string) => setup.websites.find((website) => website.siteId === site)?.homeCountry ?? null;
  const [country, setCountry] = useState<number>(homeOf(siteId) ?? setup.countries[0]?.code ?? 0);
  const [text, setText] = useState("");
  const keywords = typedKeywords(text);
  const limit = setup.limits.keywordsPerLookup;
  const tooMany = keywords.length > limit;
  const home = homeOf(siteId);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (keywords.length === 0 || tooMany) return;
    const outcome = await run(
      () => lookUp({ keywords, locationCode: country, ...(siteId ? { siteId: siteId as Id<"companyWebsites"> } : {}) }),
      { fallbackMessage: t("failed") },
    );
    if (outcome.ok && outcome.data.lookupIds[0]) router.push(lookupHref(outcome.data.lookupIds[0]));
  };

  return (
    <SettingsCard title={t("title")}>
      <p className="max-w-2xl text-[12px] leading-relaxed text-secondary">{t("intro", { limit, days: setup.limits.reuseDays })}</p>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <div className="grid grid-cols-1 items-end gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1fr)_220px_220px_auto]">
          <TextAreaField
            label={t("keywords")}
            placeholder={t("placeholder")}
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="min-h-[88px]"
            required
            error={tooMany ? t("tooMany", { count: keywords.length, limit }) : undefined}
          />
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="kr-country">{t("country")}</FieldLabel>
            <Select id="kr-country" value={country} onChange={(value) => setCountry(Number(value))} className="w-full">
              {setup.countries.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.code === home ? t("home", { country: countryName(option.code, option.label) }) : countryName(option.code, option.label)}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <FieldLabel htmlFor="kr-site">{t("measuredAgainst")}</FieldLabel>
            <Select
              id="kr-site"
              value={siteId}
              onChange={(value) => {
                onSiteId(value);
                // A website's own country is where its keywords are looked up first.
                const next = homeOf(value);
                if (next !== null) setCountry(next);
              }}
              className="w-full"
            >
              {setup.websites.map((website) => (
                <option key={website.siteId} value={website.siteId}>{website.host}</option>
              ))}
              <option value="">{t("noWebsite")}</option>
            </Select>
          </div>
          <PagePrimaryAction type="submit" icon={<Search className="h-4 w-4" />} disabled={tooMany || isBusy()} className="h-[38px]">
            {isBusy() ? t("looking") : t("button")}
          </PagePrimaryAction>
        </div>
        <FieldHint>{t("cost", { cents: CENTS_A_KEYWORD })}</FieldHint>
      </form>
    </SettingsCard>
  );
}
