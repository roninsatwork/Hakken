"use client";

import { useQuery } from "convex/react";
import { ChartColumn, GraduationCap, Globe, LayoutDashboard, MousePointerClick, ScanSearch, SearchCheck } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { OPENING_PERIOD, ukDay, type MenuPeriod } from "@/convex/utils/calendarPeriods";
import { MENU_FEATURES } from "@/convex/utils/coreModules";
import { SiteOnPageContext } from "@/src/hooks/useSiteIdOnPage";
import Header from "@/src/ui/components/layout/Header";
import { DatesMenu } from "@/src/ui/components/screens/DatesMenu";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { useDateChoice } from "./sites/_components/useCalendarPeriod";
import { useSiteParam } from "./sites/_components/useSiteParam";
import { DashboardBing } from "./_dashboard/DashboardBing";
import { DashboardClarity } from "./_dashboard/DashboardClarity";
import { DashboardGoogleAnalytics } from "./_dashboard/DashboardGoogleAnalytics";
import { DashboardNumbers, DashboardReadingRoom, DashboardSection } from "./_dashboard/DashboardParts";
import { DashboardSearchConsole } from "./_dashboard/DashboardSearchConsole";
import { DashboardVisibility } from "./_dashboard/DashboardVisibility";

/**
 * The client Dashboard, the first screen a company's people see each day (docs/plans/active/dashboard-way-1-plan-2026-11-21.md,
 * Way 1 on the canvas "Dashboard, three ways"). The four numbers with their days; the Reading room's own front page; then a
 * section for each source the company has switched on, in Anthony's order: Search Console, Google Analytics, Visibility,
 * Microsoft Clarity, Bing Webmaster. A section switched off for the company, or for everyone, isn't on the page at all.
 *
 * Every chart is full width and there are no tables. The numbers add up the company's own websites, or the one the Website
 * menu picks; the charts show that website, or the first own one, through each section's real cards. Nobody is sent
 * anywhere from here, super admins included (Anthony, 21 November 2026).
 */
export default function AppDashboardPage() {
  const t = useTranslations("dashboard");
  const locale = useLocale();
  const workspace = useQuery(api.companies.getMyWorkspaceModules, {});
  const holds = useQuery(api.sites.listPickerHolds, {});
  const own = (holds ?? []).filter((hold) => hold.relationship === "OWNED");
  const [site, setSite] = useSiteParam<string>("site", "all");
  const chosen = own.find((hold) => hold.siteId === site)?.siteId as Id<"companyWebsites"> | undefined;
  const shown = (chosen ?? own[0]?.siteId) as Id<"companyWebsites"> | undefined;
  const [choice, setChoice] = useDateChoice(null);
  const period: MenuPeriod = choice.period === "custom" ? OPENING_PERIOD : choice.period;
  const on = (feature: string) => workspace?.enabledModules.includes(feature) ?? false;
  const today = new Date(`${ukDay()}T12:00:00Z`).toLocaleDateString(locale === "en" ? "en-GB" : locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
  const icon = "h-4 w-4 text-brand";

  return (
    <div className="flex flex-col gap-8">
      <Header />
      <PageHeader
        divider
        icon={<LayoutDashboard className="h-5 w-5 text-brand" />}
        title={t("title")}
        description={t("description", { day: today })}
        action={(
          <div className="flex flex-wrap items-center gap-3">
            {own.length > 1 ? (
              <Select
                chip={{ label: t("website.label"), choice: chosen ? own.find((hold) => hold.siteId === chosen)?.host ?? null : t("website.all") }}
                value={chosen ?? "all"}
                onChange={setSite}
                aria-label={t("website.label")}
              >
                <option value="all">{t("website.all")}</option>
                {own.map((hold) => <option key={hold.siteId} value={hold.siteId}>{hold.host}</option>)}
              </Select>
            ) : null}
            <DatesMenu value={{ period }} newest={null} custom={false} onChange={(next) => setChoice(next)} />
          </div>
        )}
      />

      {shown ? (
        <SiteOnPageContext.Provider value={shown}>
          <DashboardNumbers period={period} siteId={chosen} firstSite={shown} websites={chosen ? own.filter((hold) => hold.siteId === chosen).map((hold) => hold.host) : own.map((hold) => hold.host)} />
        </SiteOnPageContext.Provider>
      ) : null}

      <DashboardSection title={t("sections.readingRoom")} line={t("sections.readingRoomLine")} icon={<GraduationCap className={icon} />}>
        <DashboardReadingRoom />
      </DashboardSection>

      {shown ? (
        <SiteOnPageContext.Provider value={shown}>
          {on(MENU_FEATURES.searchConsole) ? (
            <DashboardSection title={t("sections.searchConsole")} icon={<SearchCheck className={icon} />}>
              <DashboardSearchConsole siteId={shown} />
            </DashboardSection>
          ) : null}
          {on(MENU_FEATURES.googleAnalytics) ? (
            <DashboardSection title={t("sections.googleAnalytics")} icon={<ChartColumn className={icon} />}>
              <DashboardGoogleAnalytics siteId={shown} period={period} />
            </DashboardSection>
          ) : null}
          {on(MENU_FEATURES.visibility) ? (
            <DashboardSection title={t("sections.visibility")} icon={<Globe className={icon} />}>
              <DashboardVisibility siteId={shown} />
            </DashboardSection>
          ) : null}
          {on(MENU_FEATURES.clarity) ? (
            <DashboardSection title={t("sections.clarity")} icon={<MousePointerClick className={icon} />}>
              <DashboardClarity siteId={shown} period={period} />
            </DashboardSection>
          ) : null}
          {on(MENU_FEATURES.bingWebmaster) ? (
            <DashboardSection title={t("sections.bing")} icon={<ScanSearch className={icon} />}>
              <DashboardBing siteId={shown} period={period} />
            </DashboardSection>
          ) : null}
        </SiteOnPageContext.Provider>
      ) : null}
    </div>
  );
}
