"use client";

import { useMemo } from "react";
import { Megaphone } from "lucide-react";
import { useTranslations } from "next-intl";
import { campaignForEye, hasNoName } from "@/convex/utils/campaignNames";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { CameFromSelect, CampaignBoxes, CampaignDaysCard, CampaignMapCard, CampaignSquaresCard, useCameFromChoice, useCampaignNames, useCampaigns } from "../../_components/CampaignParts";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsStatus } from "../../_components/useAnalytics";
import { useEyeNames, useWebsiteForEye } from "../../_components/useEyeFigures";
import { spansOfList, useSpanInWords } from "../../_components/VisitsCharts";

/** The table's two lists: the campaigns, and the words their links carry. */
const VIEWS = ["campaign", "adKeyword"] as const;
type View = (typeof VIEWS)[number];

/**
 * Campaigns (docs/plans/active/campaigns-new-page-plan-2026-11-05.md; board "The new page so far" on the canvas "Hakken — Campaigns,
 * three ways"): four boxes, the visits from campaigns each day, a map of the campaigns, what people did after they arrived, then
 * the table. The Came from menu holds the whole page to one place. A website with no campaign in these dates keeps its boxes,
 * and the table says so in place of the charts.
 */
export default function AnalyticsCampaignsPage() {
  const t = useTranslations("googleAnalytics.campaigns");
  const [view, setView] = useSiteParam<View>("view", "campaign", VIEWS);
  const choice = useCameFromChoice();
  const campaigns = useCampaigns(choice);
  const { name, place } = useCampaignNames();
  const inWords = useSpanInWords(...spansOfList(campaigns.every));
  const nothing = campaigns.every?.campaignTotals?.visits === 0;
  return (
    <AnalyticsListScreen
      header={{ icon: <Megaphone className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={() => (
        <>
          <CampaignsSees campaigns={campaigns} />
          <CampaignBoxes campaigns={campaigns} />
          {nothing ? null : (
            <>
              <CampaignDaysCard choice={choice} campaigns={campaigns} />
              <CampaignMapCard choice={choice} campaigns={campaigns} />
              <CampaignSquaresCard choice={choice} />
            </>
          )}
        </>
      )}
      list={view}
      {...(view === "campaign" && choice.cameFrom ? { cameFrom: choice.cameFrom } : {})}
      noun={view === "campaign" ? "campaigns" : "keywords"}
      searchPlaceholder={t(view === "campaign" ? "findCampaign" : "findKeyword")}
      nameOf={view === "campaign" ? name : undefined}
      nameHover={view === "campaign" ? (row) => (hasNoName(row.label) ? row.label : undefined) : undefined}
      sourceName={(row) => place(row.cameFrom ?? "notKnown")}
      leaveOutColumns={campaigns.sells ? undefined : ["bought"]}
      filters={(
        <>
          {view === "campaign" ? <CameFromSelect choice={choice} choices={campaigns.every?.cameFromChoices} /> : null}
          <SiteViewSwitch label={t("showing")} options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />
        </>
      )}
      opening="visits"
      emptyLabel={t(view === "campaign" ? "empty" : "emptyKeywords", { when: inWords.now })}
    />
  );
}

/**
 * The page's eye: every campaign, in the page's own names, for its rules to weigh each against all campaign visits together, the whole
 * website's figures, and the charts' own (`useSeesPart`), whichever list the table shows (campaigns-new-page-plan-2026-11-05.md, step 8).
 */
function CampaignsSees({ campaigns }: { campaigns: ReturnType<typeof useCampaigns> }) {
  const tm = useTranslations("googleAnalytics.menu");
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const hrefFor = useAnalyticsHref(args.siteId);
  const eyeNames = useEyeNames();
  const website = useWebsiteForEye();
  const { name, place } = useCampaignNames();
  const { every, overview, sells } = campaigns;
  const data = useMemo(() => (every ? {
    rows: every.rows.map((row) => campaignForEye(row, name(row), place(row.cameFrom ?? "notKnown"))),
    total: every.total,
    untagged: every.untagged,
    names: eyeNames,
    sells,
    ...(every.campaignTotals ? { totals: every.campaignTotals } : {}),
    ...(website ? { website: { ...website, bought: overview?.now?.purchases ?? 0, boughtBefore: overview?.before?.purchases ?? null } } : {}),
  } : undefined), [every, eyeNames, name, place, website, overview, sells]);
  // Where "Do first" may send the reader: where campaigns' figures are looked into and their tracking checked.
  const links = useMemo(() => [
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("conversions"), href: hrefFor("conversions") },
    { label: tm("trackingHealth"), href: hrefFor("tracking-health") },
    // eslint-disable-next-line react-hooks/exhaustive-deps -- hrefFor is new each draw; the dates, device and country decide.
  ], [tm, args.period, args.device, args.country]);
  // No campaign in these dates: the rule's words say it at once, and a press would only say them again, minutes later.
  return <AnalyticsSees screen="campaigns" seen={every?.seen} currency={status?.connection?.currency ?? null} data={data} links={links} writes={every?.campaignTotals?.visits !== 0} />;
}
