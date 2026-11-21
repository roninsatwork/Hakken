"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import type { MenuPeriod } from "@/convex/utils/calendarPeriods";
import { CHART_SERIES_AMBER, CHART_SERIES_BLUE, CHART_SERIES_ORANGE, CHART_SERIES_ROSE, CHART_SERIES_TEAL, CHART_SERIES_VIOLET } from "@/src/ui/components/charts/chartPalette";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { ExplorerToolbar } from "@/src/ui/components/screens/ChartExplorer";
import { ScrollPages } from "@/src/ui/components/screens/ScrollPages";
import { formatNumber } from "../sites/_components/siteFormat";
import { useSiteParam } from "../sites/_components/useSiteParam";

/**
 * The client Dashboard's Microsoft Clarity section (dashboard-way-1-plan-2026-11-21.md). The page draws it only while
 * Microsoft Clarity is switched on for the company and for everyone, so it may read Clarity's own reads
 * (`src/section-gate-drift.test.ts`, `SWITCHED_PARTS`).
 */

type ScrollDevice = "all" | "PC" | "Mobile" | "Tablet";
const SCROLL_DEVICES: readonly ScrollDevice[] = ["all", "PC", "Mobile", "Tablet"];
const DEVICE_WORD: Record<ScrollDevice, "everyDevice" | "computers" | "phones" | "tablets"> = { all: "everyDevice", PC: "computers", Mobile: "phones", Tablet: "tablets" };

const KIND_COLOURS = [CHART_SERIES_ORANGE, CHART_SERIES_VIOLET, CHART_SERIES_TEAL, CHART_SERIES_BLUE, CHART_SERIES_AMBER, CHART_SERIES_ROSE];

/** How far people scroll down the busiest pages, each drawn as a page filled as far as people scrolled. Device picks the device. */
export function DashboardClarity({ siteId, period }: { siteId: Id<"companyWebsites">; period: MenuPeriod }) {
  const t = useTranslations("dashboard.clarity");
  const tm = useTranslations("dashboard.menus");
  const [device, setDevice] = useSiteParam<ScrollDevice>("scrollDevice", "all", SCROLL_DEVICES);
  const list = useQuery(api.clarityScreens.clarityPagesList, { siteId, period, page: 1, rows: 8, ...(device === "all" ? {} : { device }) });
  const busiest = (list?.busiest ?? []).slice(0, 8);
  const kinds = [...new Set(busiest.map((page) => page.kindName ?? page.kind))];
  const colourOf = (kind: string) => KIND_COLOURS[kinds.indexOf(kind) % KIND_COLOURS.length];
  const average = list?.website.scroll ?? null;
  return (
    <ChartCard
      title={t("title")}
      hint={t("hint")}
      exportName="dashboard-scroll"
      enoughData={busiest.length > 0}
      controls={<ExplorerToolbar controls={[{ kind: "select", key: "device", label: tm("device"), value: device, options: SCROLL_DEVICES.map((value) => ({ value, label: tm(DEVICE_WORD[value]) })), onChange: (next) => setDevice(next as ScrollDevice) }]} />}
    >
      <ScrollPages
        pages={busiest.map((page) => ({
          key: page.page,
          label: page.page,
          href: `/app/clarity/${siteId}/pages`,
          visits: page.now.visits,
          scroll: page.now.scroll ?? 0,
          colour: colourOf(page.kindName ?? page.kind),
        }))}
        average={average}
        visitsWord={(count) => t("visits", { count, figure: formatNumber(count) })}
        averageWord={t("average", { average: Math.round(average ?? 0) })}
        legend={kinds.map((kind) => ({ name: kind, colour: colourOf(kind) }))}
      />
    </ChartCard>
  );
}
