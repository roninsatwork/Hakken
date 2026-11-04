"use client";

import { useMemo } from "react";
import { useQuery } from "convex/react";
import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen, type ListPageAnswer } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { CampaignsDailyChart, ListTopBars } from "../../_components/AnalyticsChart";
import { useAnalyticsArgs, useAnalyticsStatus, usePeriod, periodWord } from "../../_components/useAnalytics";
import { useEyeNames } from "../../_components/useEyeFigures";

/** The table's two lists: the campaigns, and the words their links carry. */
const VIEWS = ["campaign", "adKeyword"] as const;
type View = (typeof VIEWS)[number];

/**
 * Campaigns (GA28; §18.2 board 17): visits from links tagged for a campaign —
 * an email, an ad, a social post — and what they went on to do. What Hakken
 * sees, the visits from tagged links a day, visits by campaign as bars, and
 * one table switching between the campaigns (with where each link was) and
 * the words tagged links carry; the visits from no tagged link said beside it.
 */
export default function AnalyticsCampaignsPage() {
  const t = useTranslations("googleAnalytics.campaigns");
  const tf = useTranslations("googleAnalytics.filters");
  const currency = useAnalyticsStatus()?.connection?.currency ?? null;
  const [period] = usePeriod();
  const [view, setView] = useSiteParam<View>("view", "campaign", VIEWS);
  return (
    <AnalyticsListScreen
      header={{ icon: <Megaphone className="h-5 w-5 text-brand" />, title: t("title"), description: t("description", { before: tf(`before.${periodWord(period)}`) }) }}
      head={(answer) => (
        <>
          <CampaignsSees answer={answer} currency={currency} />
          <CampaignsDailyChart />
          <ListTopBars list="campaign" sort="visits" bars="campaigns" />
        </>
      )}
      list={view}
      noun={view === "campaign" ? "campaigns" : "keywords"}
      searchPlaceholder={t(view === "campaign" ? "findCampaign" : "findKeyword")}
      filters={<SiteViewSwitch label={t("showing")} options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />}
      opening="visits"
      emptyLabel={t(view === "campaign" ? "empty" : "emptyKeywords")}
    />
  );
}

/** Every campaign the eye weighs, from the busiest, however the table is paged: a website with more is cut here. */
const EYE_CAMPAIGNS = 100;

/**
 * The page's eye: the table's page as shown, and every campaign (`campaignsAll`) for its rules to weigh each against
 * all campaign visits together, whichever list the table shows (ask-hakken-every-chart-page-plan-2026-11-03.md, section 5).
 */
function CampaignsSees({ answer, currency }: { answer: ListPageAnswer | undefined; currency: string | null }) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const names = useEyeNames();
  const every = useQuery(api.googleAnalyticsReads.analyticsListPage, status?.connection?.newestDay ? { ...args, list: "campaign", sort: "visits", direction: "desc", page: 1, rows: EYE_CAMPAIGNS } : "skip");
  const data = useMemo(() => (answer ? { ...answer, ...(every ? { campaignsAll: every } : {}), names } : answer), [answer, every, names]);
  return <AnalyticsSees screen="campaigns" seen={answer?.seen} currency={currency} data={data} />;
}
