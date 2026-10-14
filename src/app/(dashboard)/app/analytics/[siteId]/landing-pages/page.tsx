"use client";

import { useQuery } from "convex/react";
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Select } from "@/src/ui/components/screens/Select";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { LandingFlowCard } from "../../_components/LandingFlow";
import { useAnalyticsSiteId, useAnalyticsStatus, usePageHref } from "../../_components/useAnalytics";

const VIEWS = ["pages", "groups"] as const;
type View = (typeof VIEWS)[number];
const ANY_GROUP = "all";

/**
 * Landing pages (docs/plans/active/landing-pages-flow-plan.md, drawn and
 * approved 2026-10-14): What Hakken sees, then "How visits moved through
 * your website" — landing pages, the next page and the page after, click a
 * page to follow its routes (LF2) — then each landing page's own funnel:
 * visits, left here, went on, the page most went to, conversions (LF4) —
 * each page, or the website's page groups (GA15), with a Page group filter.
 * Every page opens its own screen (GA22). A website with no groups shows
 * pages only.
 */
export default function AnalyticsLandingPagesPage() {
  const t = useTranslations("googleAnalytics.landing");
  const siteId = useAnalyticsSiteId();
  const pageHref = usePageHref();
  const currency = useAnalyticsStatus()?.connection?.currency ?? null;
  const choices = useQuery(api.pageKinds.pageKindChoices, { siteId });
  const [view, setView] = useSiteParam<View>("view", "pages", VIEWS);
  const [group, setGroup] = useSiteParam<string>("group", ANY_GROUP);
  const groups = choices ?? [];
  const byGroups = view === "groups" && groups.length > 0;
  const filters = groups.length > 0 ? (
    <div className="flex flex-wrap items-center gap-3">
      {!byGroups ? (
        <Select aria-label={t("groupFilter")} value={group} onChange={setGroup} chip={{ label: t("groupFilter"), choice: group === ANY_GROUP ? null : groups.find((one) => one.id === group)?.name ?? t("notSorted") }}>
          <option value={ANY_GROUP}>{t("everyGroup")}</option>
          {groups.map((one) => <option key={one.id} value={one.id}>{one.name}</option>)}
          <option value="NOT_SORTED">{t("notSorted")}</option>
        </Select>
      ) : null}
      <SiteViewSwitch label={t("viewLabel")} options={VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />
    </div>
  ) : null;
  return (
    <AnalyticsListScreen
      key={byGroups ? "groups" : "pages"}
      header={{ icon: <LogIn className="h-5 w-5 text-brand" />, title: t("title"), description: t("description") }}
      head={(answer) => (
        <>
          <AnalyticsSees screen="landing" seen={answer?.seen} currency={currency} />
          <LandingFlowCard />
        </>
      )}
      list={byGroups ? "groups" : "landing"}
      {...(!byGroups && group !== ANY_GROUP ? { group } : {})}
      noun={byGroups ? "groups" : "landingPages"}
      opening="visits"
      searchPlaceholder={byGroups ? t("findGroup") : t("findPage")}
      rowHref={byGroups ? undefined : (row) => (row.key.startsWith("~") ? pageHref(row.key) : null)}
      filters={filters}
      emptyLabel={t("empty")}
    />
  );
}
