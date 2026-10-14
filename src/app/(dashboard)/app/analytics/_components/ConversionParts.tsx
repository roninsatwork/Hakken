"use client";

import type { FunctionReturnType } from "convex/server";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { OTHER_KIND } from "@/convex/utils/sees/analyticsChannel";
import { FLOW_LEFT, FLOW_MORE } from "@/convex/utils/conversionFlow";
import { CHART_COMPARATOR_GREY, CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { ChannelMap, type ChannelMapRow } from "@/src/ui/components/screens/ChannelMap";
import { PageFlowChart, type PageFlowBand, type PageFlowNode } from "@/src/ui/components/screens/PageFlowChart";
import { SiteBarChart } from "../../sites/_components/SiteCharts";
import { formatNumber, toCsv } from "../../sites/_components/siteFormat";
import { SearchConsoleChartCard } from "../../search-console/_components/SearchConsoleChartCard";
import { useKindName } from "../[siteId]/channels/_components/ChannelParts";
import { formatMoney, formatPercent } from "./analyticsFormat";
import { useEventName } from "./useEventName";
import { useAnalyticsStatus, usePeriod } from "./useAnalytics";

/**
 * Conversions' pictures (docs/plans/active/ga-conversions-visitors-plan.md
 * CV3, CV4; drawn and approved 2026-10-14): how visits reached a conversion,
 * by page classification (`PageFlowChart`, its last column how visits ended);
 * conversions by page classification (`ChannelMap`, Anthony: "maybe in this
 * style"); and what people did before converting, over 12 months, as
 * Channels' "What a visit is worth" is drawn. Read from Conversions' own
 * answer: nothing is asked of Google.
 */

type ConversionsAnswer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsReads.analyticsConversions>>;
type Flow = NonNullable<ConversionsAnswer["flow"]>;
type Before = NonNullable<ConversionsAnswer["before"]>;

/**
 * A page classification's words for these pictures and Visitors' grid: its own
 * name, no page recorded, the rest — and a page no classification catches,
 * "Unclassified" (Anthony, 2026-10-14).
 */
export function useFlowKindName(kinds: ReadonlyArray<{ kind: string; name: string | null }> = []): (kind: string) => string {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const named = useKindName(kinds);
  return (kind) => (kind === NOT_SORTED_KIND ? t("unclassified") : named(kind));
}

/** "How visits reached a conversion, by page classification" (CV3): channels, then the kind of page landed on, then how the visit ended. */
export function ConversionFlowCard({ flow, currency }: { flow: Flow | null; currency: string | null }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const kindName = useFlowKindName(flow?.kinds ?? []);
  if (!flow) return null;
  const channelLabel = (key: string, more: number) => (key === FLOW_MORE ? t("moreChannels", { count: more }) : key);
  const kindLabel = (kind: string, more: number) => (kind === OTHER_KIND ? t("moreKinds", { count: more }) : kindName(kind));
  const endingLabel = (key: string) => (key === FLOW_LEFT ? t("left") : nameOf(key));
  const nodes: PageFlowNode[] = [
    ...flow.channels.map((row) => {
      const name = channelLabel(row.key, row.more);
      return { id: `c:${row.key}`, column: 0 as const, label: name, visits: row.visits, left: 0, conversions: row.conversions, hover: t("nodeHover", { name, visits: row.visits, conversions: row.conversions }) };
    }),
    ...flow.kinds.map((row) => {
      const name = kindLabel(row.kind, row.more);
      return { id: `k:${row.kind}`, column: 1 as const, label: name, visits: row.visits, left: 0, conversions: row.conversions, hover: t("nodeHover", { name, visits: row.visits, conversions: row.conversions }) };
    }),
    ...flow.endings.map((row) => {
      const name = endingLabel(row.key);
      const ending = row.key === FLOW_LEFT ? "left" as const : !row.counted ? "uncounted" as const : row.count === 0 ? "never" as const : "counted" as const;
      const hover = ending === "left" ? t("leftHover", { count: row.count })
        : ending === "uncounted" ? t("uncountedHover", { name, count: row.count })
          : ending === "never" ? t("neverHover", { name }) : t("countedHover", { name, count: row.count });
      return { id: `e:${row.key}`, column: 2 as const, label: name, visits: row.count, left: 0, conversions: row.counted ? row.count : 0, hover, ending };
    }),
  ];
  const labelOf = new Map(nodes.map((node) => [node.id, node.label]));
  const bands: PageFlowBand[] = flow.routes.map((route) => {
    const from = labelOf.get(route.from) ?? route.from;
    const to = labelOf.get(route.to) ?? route.to;
    const words = route.to === `e:${FLOW_LEFT}` ? t("bandLeft", { from, count: route.visits })
      : route.to.startsWith("e:") ? t("bandEnded", { from, to, count: route.visits })
        : route.conversions > 0 ? t("bandHoverConverted", { from, to, visits: route.visits, conversions: route.conversions })
          : t("bandHover", { from, to, visits: route.visits });
    return {
      from: route.from, to: route.to, visits: route.visits, conversions: route.conversions, landings: route.channels,
      hover: route.revenue > 0 ? t("bandRevenue", { words, money: formatMoney(route.revenue, currency) }) : words,
    };
  });
  const conversions = flow.endings.filter((row) => row.counted).reduce((sum, row) => sum + row.count, 0);
  const uncounted = flow.endings.filter((row) => !row.counted && row.key !== FLOW_LEFT).reduce((sum, row) => sum + row.count, 0);
  const channelCount = flow.channels.reduce((sum, row) => sum + (row.key === FLOW_MORE ? row.more : 1), 0);
  const kindCount = flow.kinds.reduce((sum, row) => sum + (row.kind === OTHER_KIND ? row.more : 1), 0);
  const columns = [
    { title: t("came"), summary: t("cameSummary", { visits: formatNumber(flow.visits), count: channelCount }) },
    { title: t("landed"), summary: t("landedSummary", { visits: formatNumber(flow.visits), count: kindCount }) },
    { title: t("ended"), summary: t("endedSummary", { conversions, uncounted: formatNumber(uncounted) }) },
  ];
  const figuresOf = (node: PageFlowNode) => (node.ending === "never" ? t("figuresNever")
    : node.ending === "uncounted" ? t("figuresUncounted", { count: formatNumber(node.visits) })
      : node.conversions > 0 ? t("figuresConverted", { visits: formatNumber(node.visits), conversions: node.conversions })
        : t("figures", { visits: formatNumber(node.visits) }));
  const csv = () => toCsv([t("csvFrom"), t("csvTo"), t("csvVisits"), t("csvConversions")], bands.map((band) => [labelOf.get(band.from) ?? band.from, labelOf.get(band.to) ?? band.to, band.visits, band.conversions]));
  return (
    <SearchConsoleChartCard
      title={t("title")}
      hint={`${t("hint", { period: tf(`periods.${period}`) })}${flow.everyDevice ? ` ${t("everyDevice")}` : ""}`}
      exportName="google-analytics-conversion-flow"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {flow.collecting ? <p className="py-10 text-center text-[12px] text-muted">{t("collecting")}</p>
        : flow.visits === 0 ? <p className="py-10 text-center text-[12px] text-muted">{t("empty")}</p>
          : <PageFlowChart columns={columns} nodes={nodes} bands={bands} figuresOf={figuresOf} legend={{ conversions: t("legendConversions"), uncounted: t("legendUncounted"), left: t("legendLeft") }} />}
    </SearchConsoleChartCard>
  );
}

/**
 * "Conversions by page classification" (Anthony, 2026-10-14: "maybe in this
 * style", pointing at Visitors' grid): each counted kind and each key event
 * not counted down the side, the classifications across, each square that
 * event's count from visits that started on that kind of page.
 */
export function ConversionsByKind({ flow }: { flow: Flow | null }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  const kindName = useFlowKindName(flow?.grid.kinds ?? []);
  if (!flow) return null;
  const columns = flow.grid.kinds.map((kind) => kindName(kind.kind));
  const counts = new Map(flow.grid.rows.map((row) => [row.eventName, row.cells.reduce((sum, count) => sum + count, 0)]));
  const rows: ChannelMapRow[] = flow.grid.rows.map((row) => ({
    key: row.eventName,
    label: nameOf(row.eventName),
    total: !row.counted ? t("byKindNotCounted", { count: formatNumber(row.count) }) : row.count === 0 ? t("byKindNever") : t("byKindCounted", { count: row.count }),
    cells: row.cells.map((count, at) => ({ visits: count, conversions: 0, hover: t("byKindHover", { event: nameOf(row.eventName), kind: columns[at] ?? "", count }) })),
  }));
  const csv = () => toCsv(["event", ...columns], flow.grid.rows.map((row) => [row.eventName, ...row.cells]));
  return (
    <SearchConsoleChartCard
      title={t("byKindTitle")}
      hint={`${t("byKindHint", { period: tf(`periods.${period}`) })}${flow.everyDevice ? ` ${t("everyDevice")}` : ""}`}
      exportName="google-analytics-conversions-by-classification"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {rows.length > 0 ? (
        <ChannelMap
          columns={columns}
          rows={rows}
          rowVisits={(row) => counts.get(row.key) ?? 0}
          conversionsWord={() => ""}
          legend={{ visits: t("byKindLegend"), shades: t("byKindShades"), empty: t("byKindEmpty") }}
        />
      ) : <p className="py-10 text-center text-[12px] text-muted">{t("byKindNone")}</p>}
    </SearchConsoleChartCard>
  );
}

/**
 * "What people did before converting" (CV4): each action over the last 12
 * months, the share of its people who went on to convert, orange where that
 * beats everyone's on enough people to judge — Channels' "What a visit is
 * worth" drawn the same way.
 */
export function BeforeConvertingCard({ before }: { before: Before | null }) {
  const t = useTranslations("googleAnalytics.conversionFlow");
  const status = useAnalyticsStatus();
  const nameOf = useEventName();
  if (!before) return null;
  const siteRate = before.siteRate ?? 0;
  type Row = Before["rows"][number];
  const data = before.rows.map((row) => ({ label: nameOf(row.eventName), rate: row.did > 0 ? row.then / row.did : 0, row }));
  const csv = () => toCsv(["event", "people", "wentOnToConvert", "rate"], before.rows.map((row) => [row.eventName, row.did, row.then, row.did > 0 ? row.then / row.did : 0]));
  return (
    <SearchConsoleChartCard
      title={t("beforeTitle")}
      // Until everyone's own rate is kept, the hint names no rate to beat.
      hint={before.siteRate === null ? t("beforeHintWaiting") : t("beforeHint", { siteRate: formatPercent(before.siteRate), few: before.few })}
      exportName="google-analytics-before-converting"
      csv={csv}
      host={status?.host ?? ""}
      from={null}
      to={null}
    >
      {before.collecting ? <p className="py-10 text-center text-[12px] text-muted">{t("beforeCollecting")}</p>
        : data.length === 0 ? <p className="py-10 text-center text-[12px] text-muted">{t("beforeEmpty")}</p>
          : (
            <SiteBarChart
              horizontal
              data={data}
              xKey="label"
              updateKey={false}
              series={[{ key: "rate", name: t("beforeRate"), colour: CHART_COMPARATOR_GREY }]}
              // Orange only where the share beats everyone's, on enough people to judge.
              highlight={{ colour: CHART_SERIES_ORANGE, rows: (entry) => Number(entry.rate) > siteRate && (entry.row as Row).did >= before.few }}
              formatScale={(value) => formatPercent(value)}
              formatValue={(value, entry) => {
                const row = entry.payload?.row as Row | undefined;
                return t(row && row.did < before.few ? "beforeReadoutFew" : "beforeReadout", {
                  rate: formatPercent(value), people: formatNumber(row?.did ?? 0), siteRate: formatPercent(before.siteRate), few: before.few,
                });
              }}
            />
          )}
    </SearchConsoleChartCard>
  );
}
