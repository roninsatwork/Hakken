"use client";

import { useEffect } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { MousePointerClick } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TitleSwitch } from "@/src/ui/components/screens/TitleSwitch";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import { openingPeriod, ukDay } from "@/convex/utils/calendarPeriods";
import { SiteMark } from "../../sites/_components/SiteMark";
import { SectionMenu } from "../../_components/SectionMenu";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { DatesMenu } from "@/src/ui/components/screens/DatesMenu";
import { OpeningPeriodContext, useDateChoice } from "../../sites/_components/useCalendarPeriod";
import { formatWhen, useDeviceName } from "../_components/ClarityParts";
import { CLARITY_DEVICES, CLARITY_PAGES, clarityPageForPath, useClarityPath, useClarityQuery, useClaritySiteId, useClarityStatus } from "../_components/useClarity";

/**
 * One website in Microsoft Clarity's section (docs/plans/active/agents-and-clarity-plan.md,
 * Part 4, CS2, drawn on "Hakken — Microsoft Clarity"): the standard website
 * header (2026-10-30) — the website's name, the switch between the company's
 * own websites, then "Updated …" beside every device or one and the date
 * menu's calendar period (calendar-periods-plan.md, phase 3) — the menu, and
 * the page. Recordings shows every one
 * Clarity still keeps, so it draws no date menu (item 11.6).
 */
export default function ClaritySiteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("clarity");
  const router = useRouter();
  const siteId = useClaritySiteId();
  const status = useClarityStatus();
  const pathname = useClarityPath();
  const query = useClarityQuery();
  const deviceName = useDeviceName();
  // A website whose Clarity days begin this month opens on This month until the 1st (agreed 2026-10-20).
  const opening = openingPeriod(status?.connection?.oldestDay, ukDay());
  const [choice, setChoice] = useDateChoice(status?.connection?.newestDay ?? null, opening);
  const prepare = useMutation(api.clarity.prepareCustomSpan);
  // Custom dates are built from the days held when first asked for (clarity.ts, prepareCustomSpan): the server builds once a day.
  const custom = choice.period === "custom" ? choice : null;
  useEffect(() => {
    if (custom) prepare({ siteId, from: custom.from, to: custom.to }).catch(() => undefined);
  }, [prepare, siteId, custom?.from, custom?.to]); // eslint-disable-line react-hooks/exhaustive-deps
  const [device, setDevice] = useSiteParam<string>("device", "", ["", ...CLARITY_DEVICES]);
  if (status === undefined) return <><Header /><div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" /></>;
  if (status === null || !status.owned) return <><Header /><HakkenEmptyState icon={MousePointerClick} title={t("site.notFoundTitle")} description={t("site.notFoundDescription")} /></>;
  const connection = status.connection;
  const state = connection?.status ?? "NOT_CONNECTED";
  const current = clarityPageForPath(pathname, siteId);
  const href = (segment: string) => `/app/clarity/${siteId}${segment ? `/${segment}` : ""}${query}`;
  return (
    <OpeningPeriodContext.Provider value={opening}>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <DetailHeader
          layout="compact"
          back={{ label: t("site.back"), href: "/app/clarity" }}
          icon={<SiteMark host={status.host} iconUrl={null} owned />}
          title={
            status.ownSites.length > 1 ? (
              <TitleSwitch label={status.host} aria-label={t("site.switch")} value={siteId} onChange={(next) => router.push(`/app/clarity/${next}${query}`)}>
                {status.ownSites.map((site) => <option key={site.siteId} value={site.siteId}>{site.host}</option>)}
              </TitleSwitch>
            ) : status.host
          }
          pills={state === "CONNECTED" && connection?.lastCollectedAt
            ? <StatusLabel tone="success">{t("site.updated", { when: formatWhen(connection.lastCollectedAt) })}</StatusLabel>
            : <StatusLabel tone={state === "NEEDS_RECONNECT" ? "warning" : "neutral"}>{t(`status.${state}`)}</StatusLabel>}
          action={
            current === "connection" ? null : (
              <div className="flex flex-wrap items-end gap-3">
                {current === "recordings" ? null : (
                  <Select aria-label={t("site.device")} value={device} onChange={setDevice}>
                    <option value="">{t("site.everyDevice")}</option>
                    {CLARITY_DEVICES.map((value) => <option key={value} value={value}>{deviceName(value)}</option>)}
                  </Select>
                )}
                {current === "recordings" ? null : (
                  <DatesMenu value={choice} newest={connection?.newestDay ?? null} onChange={setChoice} />
                )}
              </div>
            )
          }
        />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <SectionMenu
              label={t("menu.label")}
              groups={[
                { id: "figures", label: t("menu.figures"), items: CLARITY_PAGES.filter((page) => page.id !== "connection").map((page) => ({ id: page.id, label: t(`menu.${page.id}`), href: href(page.segment) })) },
                { id: "settings", label: t("menu.settings"), items: [{ id: "connection", label: t("menu.connection"), href: `/app/clarity/${siteId}/connection` }] },
              ]}
              currentId={current}
              openAtFirst={["figures", "settings"]}
            />
          </aside>
          <section className="flex min-w-0 flex-col gap-6">
            {children}
          </section>
        </div>
      </div>
    </OpeningPeriodContext.Provider>
  );
}
