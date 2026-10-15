"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { ArrowUpRight, MapPin } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Notice } from "@/src/ui/components/screens/Notice";
import { SaveAction, SaveError } from "@/src/ui/components/screens/SaveControls";
import { Select } from "@/src/ui/components/screens/Select";
import { SegmentedChoice, SettingRow, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDateTime } from "@/src/lib/dates";
import { SeoScheduleFields } from "@/src/app/(dashboard)/admin/_components/SeoScheduleFields";
import {
  createDefaultScheduleDraft,
  hydrateScheduleDraft,
  serializeScheduleDraft,
  validateScheduleDraft,
  type ScheduleDraft,
} from "@/src/app/(dashboard)/admin/_lib/scheduleConfig";
import { useScheduleSummary } from "@/src/app/(dashboard)/admin/_lib/useScheduleSummary";
import type { WebsiteSourcesData } from "./WebsiteSources";

/** The cadences the SEO control offers. Anything else cannot be drawn by it. */
const SEO_CADENCES = new Set(["daily", "weekly", "fortnightly", "monthly"]);

/** The pairing choice's value for "not paired". A real id is never empty. */
const UNPAIRED = "";

type Mode = "company" | "own";

/**
 * Coerce whatever is stored into something this control can actually draw.
 *
 * A website may hold an interval the old generic builder wrote — hourly, or a
 * list of exact times — because that builder offered both and nothing on the
 * server refused them. Opening such a row without this would show four
 * cadence cards with none selected. Weekly is the recommended cadence.
 */
function hydrateSeoDraft(intervalStr?: string | null): ScheduleDraft {
  const draft = hydrateScheduleDraft(intervalStr);
  if (draft.mode !== "recurring" || !SEO_CADENCES.has(draft.cadence)) {
    return { ...draft, mode: "recurring", cadence: "weekly" };
  }
  return draft;
}

/** A link in the card's quiet style: the kit's link with its arrow. */
function CardLink({ href, children }: { href: string; children: string }) {
  return (
    <Link href={href} className="inline-flex w-fit items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * "When rankings and AI answers are collected" (docs/plans/active/website-schedules-plan.md,
 * WS5–WS7): the one card on a website's Schedules page. A choice of the
 * company's schedule or its own — the four cadences and their day and time
 * when its own — then when it is next collected and where from. A competitor
 * starts with what it is watched against: paired, it is collected with that
 * website, on its day; unpaired, it has the same choice. The company's switch
 * is the master, so the card warns while it is off. One Save.
 *
 * Only the *difference* from the company is stored: a website following its
 * company stores no schedule, so changing the company moves it. Its own switch
 * is the table's ("What Hakken collects") and is left alone here.
 */
export function SiteSchedule({
  data,
  companyWebsiteId,
  marketHref,
  companySchedulesHref,
  siteSchedulesHref,
}: {
  data: WebsiteSourcesData;
  companyWebsiteId: Id<"companyWebsites">;
  /** The website's Market page, where it is watched from is set. */
  marketHref: string;
  /** The company's own Schedules page, where its switch and schedule are. */
  companySchedulesHref: string;
  /** Another website's Schedules page in this section: its pair's. */
  siteSchedulesHref: (siteId: Id<"companyWebsites">) => string;
}) {
  const t = useTranslations("admin.siteView.schedulesPage.card");
  const tCommon = useTranslations("common");
  const summary = useScheduleSummary();
  const setSchedule = useMutation(api.websites.setCompanyWebsiteSchedule);
  const setPairing = useMutation(api.websiteAttachments.setTrackedPairing);
  const ownSites = useQuery(api.websiteAttachments.listCompanyOwnedWebsites, data.owned ? "skip" : { companyId: data.companyId });
  const action = useAdminAction({ scope: "admin-site-settings" });

  const company = data.companyName;
  const host = data.host;
  const rankings = data.rankings;
  const storedPair = rankings.pairedWith?.companyWebsiteId ?? UNPAIRED;

  // Adopted once per saved state, so an edit in progress survives the query
  // refreshing underneath it.
  const adoptKey = `${companyWebsiteId}:${rankings.ownIntervalStr ?? ""}:${storedPair}`;
  const [adopted, setAdopted] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>("company");
  const [draft, setDraft] = useState<ScheduleDraft>(createDefaultScheduleDraft());
  const [pair, setPair] = useState<string>(UNPAIRED);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  if (adoptKey !== adopted) {
    setAdopted(adoptKey);
    setMode(rankings.ownIntervalStr ? "own" : "company");
    setDraft(hydrateSeoDraft(rankings.ownIntervalStr ?? data.companyIntervalStr));
    setPair(storedPair);
    setError("");
  }

  const touched = <Value,>(set: (value: Value) => void) => (value: Value) => {
    set(value);
    setSaved(false);
  };

  const paired = !data.owned && pair !== UNPAIRED;

  const handleSave = async () => {
    setError("");
    setSaved(false);
    if (!paired && mode === "own") {
      const problem = validateScheduleDraft(draft);
      if (problem) {
        setError(problem);
        return;
      }
    }
    const outcome = await action.run(
      async () => {
        if (!data.owned && pair !== storedPair) {
          await setPairing({ id: companyWebsiteId, againstCompanyWebsiteId: pair === UNPAIRED ? null : (pair as Id<"companyWebsites">) });
        }
        // Paired, its day is its pair's: there is no schedule of its own to save.
        if (!paired) {
          await setSchedule({
            id: companyWebsiteId,
            // Absence is how a website says "follow the company", so following
            // sends nothing rather than freezing today's company schedule.
            refreshIntervalStr: mode === "own" ? serializeScheduleDraft(draft) : undefined,
          });
        }
      },
      { suppressErrorToast: true, fallbackMessage: t("errors.saveFailed") },
    );
    if (outcome.ok) setSaved(true);
    else if (outcome.message) setError(outcome.message);
  };

  if (!rankings.on) {
    return (
      <SettingsCard title={t("title")}>
        <p className="text-[13px] text-secondary">{t("off", { host })}</p>
      </SettingsCard>
    );
  }

  const choice = (
    <>
      <SettingRow label={t("scheduleLabel")} description={t("scheduleDescription", { company })}>
        <SegmentedChoice<Mode>
          label={t("scheduleLabel")}
          size="compact"
          value={mode}
          options={[{ value: "company", label: t("sameAs", { company }) }, { value: "own", label: t("own") }]}
          onChange={touched(setMode)}
        />
      </SettingRow>
      {mode === "company" ? (
        <div className="flex flex-col gap-3 border-t border-border-dim pt-5">
          <p className="text-[13px] text-foreground">
            {data.companyIntervalStr
              ? t("companySchedule", { company, schedule: summary(data.companyIntervalStr) })
              : t("noCompanySchedule", { company })}
          </p>
          <CardLink href={companySchedulesHref}>{t("changeCompany", { company })}</CardLink>
        </div>
      ) : (
        <div className="border-t border-border-dim pt-5">
          <SeoScheduleFields draft={draft} onChange={touched(setDraft)} />
        </div>
      )}
    </>
  );

  const pairHost = (ownSites ?? []).find((site) => site.companyWebsiteId === pair)?.displayHost ?? rankings.pairedWith?.displayHost ?? "";
  const next = !data.companyOn
    ? t("nothingWhileOff", { host, company })
    : rankings.nextRunAt
      ? t("next", { when: formatDateTime(rankings.nextRunAt, { options: { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit", hourCycle: "h23" } }) })
      : t("notScheduled", { host });

  return (
    <SettingsCard title={t("title")}>
      <div className="flex flex-col">
        {data.companyOn ? null : (
          <div className="flex flex-col gap-2 pb-2">
            <Notice tone="warning">{t("companyOff", { company })}</Notice>
            <CardLink href={companySchedulesHref}>{t("openCompany", { company })}</CardLink>
          </div>
        )}

        {data.owned ? choice : (
          <>
            <SettingRow label={t("pairLabel")} description={t("pairDescription")}>
              <Select
                value={pair}
                onChange={touched(setPair)}
                disabled={ownSites === undefined}
                aria-label={t("pairLabel")}
              >
                {(ownSites ?? []).map((site) => (
                  <option key={site.companyWebsiteId} value={site.companyWebsiteId}>{site.displayHost}</option>
                ))}
                <option value={UNPAIRED}>{t("notPaired")}</option>
              </Select>
            </SettingRow>
            {paired ? (
              <div className="flex flex-col gap-3 border-t border-border-dim pt-5">
                <p className="text-[13px] text-foreground">
                  {pair === storedPair && rankings.intervalStr
                    ? t("collectedWith", { host: pairHost, schedule: summary(rankings.intervalStr) })
                    : t("collectedWithOnSave", { host: pairHost })}
                </p>
                <CardLink href={siteSchedulesHref(pair as Id<"companyWebsites">)}>{t("changePair", { host: pairHost })}</CardLink>
              </div>
            ) : choice}
          </>
        )}

        <div className="mt-2 flex flex-col gap-2 border-t border-border-dim pt-4">
          <p className="text-[13px] text-foreground">{next}</p>
          {data.owned ? <p className="text-[12px] text-muted">{t("competitorsFollow")}</p> : null}
          <Link
            href={marketHref}
            className="flex w-fit items-center gap-1.5 text-[12px] text-secondary transition-colors hover:text-foreground"
          >
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            {t("placeOnMarket")}
          </Link>
        </div>

        <SaveError>{error}</SaveError>

        <div className="mt-2 flex justify-end border-t border-border-dim pt-4">
          <SaveAction
            onClick={handleSave}
            isSaving={action.isBusy()}
            label={tCommon("save")}
            savingLabel={tCommon("saving")}
            successLabel={t("saved")}
            showSuccess={saved}
          />
        </div>
      </div>
    </SettingsCard>
  );
}
