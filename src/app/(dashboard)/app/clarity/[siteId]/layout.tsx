"use client";

import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MousePointerClick } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { formatDateTime } from "@/src/lib/dates";
import { formatDay } from "../../sites/_components/siteFormat";
import { SiteMark } from "../../sites/_components/SiteMark";
import { SectionMenu } from "../../_components/SectionMenu";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { CLARITY_DAYS, CLARITY_PAGES, clarityPageForPath, useClarityPath, useClaritySiteId, useClarityStatus } from "../_components/useClarity";

/**
 * One website in Microsoft Clarity's section (docs/plans/active/
 * insights-analyst-plan.md I27, phase 15, drawn as the Clarity boards): its
 * header with the way back and its connection, the switch between the
 * company's own websites and the days, the menu, and the page.
 */
export default function ClaritySiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("clarity");
  const router = useRouter();
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const pathname = useClarityPath();
  const [days, setDays] = useSiteParam<string>("days", "30", CLARITY_DAYS.map(String));
  if (status === undefined) return <><Header /><div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (status === null || !status.owned) return <><Header /><HakkenEmptyState icon={MousePointerClick} title={t("site.notFoundTitle")} description={t("site.notFoundDescription")} /></>;
  const connection = status.connection;
  const state = connection?.status ?? "NOT_CONNECTED";
  const current = clarityPageForPath(pathname, siteId);
  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          back={{ label: t("site.back"), href: "/app/clarity" }}
          icon={<SiteMark host={status.host} iconUrl={null} owned />}
          title={status.host}
          description={connection?.projectName ? t("site.withProject", { name: connection.projectName }) : t("site.yourWebsite")}
          pills={state === "CONNECTED" && connection?.lastCollectedAt
            ? <StatusLabel tone="success">{t("site.updated", { when: formatDateTime(connection.lastCollectedAt) })}</StatusLabel>
            : <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : "neutral"}>{t(`status.${state}`)}</StatusLabel>}
          action={
            <div className="flex flex-wrap items-end gap-3">
              {status.ownSites.length > 1 ? (
                <Select aria-label={t("site.switch")} value={siteId} onChange={(next) => router.push(`/app/clarity/${next}`)}>
                  {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
                </Select>
              ) : null}
              <Select aria-label={t("site.days")} value={days} onChange={setDays}>
                {CLARITY_DAYS.map((value) => <option key={value} value={String(value)}>{t("site.lastDays", { days: value })}</option>)}
              </Select>
            </div>
          }
        />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <SectionMenu
              label={t("menu.label")}
              groups={[
                { id: "figures", label: t("menu.figures"), items: CLARITY_PAGES.filter((page) => page.id !== "connection").map((page) => ({ id: page.id, label: t(`menu.${page.id}`), href: `/app/clarity/${siteId}${page.segment ? `/${page.segment}` : ""}` })) },
                { id: "settings", label: t("menu.settings"), items: [{ id: "connection", label: t("menu.connection"), href: `/app/clarity/${siteId}/connection` }] },
              ]}
              currentId={current}
              openAtFirst={["figures", "settings"]}
            />
          </aside>
          <section className="flex min-w-0 flex-col gap-3">
            {connection?.newestDay ? <p className="text-[12px] text-muted">{t("site.figuresTo", { day: formatDay(connection.newestDay) })}</p> : null}
            {children}
          </section>
        </div>
      </div>
    </>
  );
}
