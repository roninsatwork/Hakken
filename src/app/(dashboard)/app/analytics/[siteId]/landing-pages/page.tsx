"use client";

import { useQuery } from "convex/react";
import { LogIn } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Select } from "@/src/ui/components/screens/Select";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { useSiteParam } from "../../../sites/_components/useSiteParam";
import { AnalyticsListScreen } from "../../_components/AnalyticsListScreen";
import { useAnalyticsHref, useAnalyticsSiteId, usePeriod } from "../../_components/useAnalytics";

const VIEWS = ["pages", "groups"] as const;
type View = (typeof VIEWS)[number];
const ANY_GROUP = "all";

/**
 * Landing pages (§5; §11 board 5): the first page of each visit, and what
 * those visits went on to do — each page, or the website's own page groups
 * (GA15), with a Page group filter. Every page opens its own screen (GA22).
 * A website with no groups shows pages only.
 */
export default function AnalyticsLandingPagesPage() {
  const t = useTranslations("googleAnalytics.landing");
  const tf = useTranslations("googleAnalytics.filters");
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const [period] = usePeriod();
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
      header={{ icon: <LogIn className="h-5 w-5 text-brand" />, title: t("title"), description: t("description", { before: tf(`before.${period}`) }) }}
      list={byGroups ? "groups" : "landing"}
      {...(!byGroups && group !== ANY_GROUP ? { group } : {})}
      noun={byGroups ? "groups" : "landingPages"}
      searchPlaceholder={byGroups ? t("findGroup") : t("findPage")}
      rowHref={byGroups ? undefined : (row) => (row.key.startsWith("~") ? hrefFor("landing-pages/page", { key: row.key }) : null)}
      filters={filters}
      emptyLabel={t("empty")}
    />
  );
}
