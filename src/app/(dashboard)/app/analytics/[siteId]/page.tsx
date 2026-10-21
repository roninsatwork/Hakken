"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { LayoutDashboard } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { NOT_SORTED_KIND } from "@/convex/utils/pageKinds";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Notice } from "@/src/ui/components/screens/Notice";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Change } from "@/src/ui/components/screens/Change";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatNumber } from "../../sites/_components/siteFormat";
import { AnalyticsGate, countsAnything } from "../_components/AnalyticsNotices";
import { AnalyticsFigures } from "../_components/AnalyticsFigures";
import { VisitsChart } from "../_components/AnalyticsChart";
import { AnalyticsPanel } from "../_components/AnalyticsPanels";
import { AnalyticsSees } from "../_components/AnalyticsSees";
import { ChangeCell, PageLink } from "../_components/AnalyticsCells";
import { formatMoney, formatPercent, formatPerVisit, formatTime } from "../_components/analyticsFormat";
import { useEventName } from "../_components/useEventName";
import { useHealthWords } from "../_components/useHealthWords";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useVisitorName } from "../_components/useVisitorName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePageHref, usePeriod, type AnalyticsStatus } from "../_components/useAnalytics";

type Overview = NonNullable<FunctionReturnType<typeof api.googleAnalyticsReads.analyticsOverview>>;
type Panels = NonNullable<FunctionReturnType<typeof api.googleAnalyticsOverviewReads.analyticsOverviewPanels>>
  & NonNullable<FunctionReturnType<typeof api.googleAnalyticsOverviewReads.analyticsOverviewPagePanels>>;
type TopRow = Panels["channels"]["rows"][number];
type Figures = NonNullable<Overview["now"]>;

/**
 * Overview (docs/plans/active/ga-overview-plan.md; option 4 of the canvas,
 * "Every figure", built 2026-10-15): What Hakken sees, the figures and visits
 * a day as before, then a panel for each kind of data, each its first three
 * rows and a link to its own page — where visits came from, pages by
 * classification, where visits landed, conversions, who visited, the shop
 * (only when the website sells) and tracking health. A connection that needs
 * fixing shows its banner over the same page (screen 18).
 */
export default function AnalyticsOverviewPage() {
  const t = useTranslations("googleAnalytics.overview");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<LayoutDashboard className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <OverviewBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function OverviewBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const overview = useQuery(api.googleAnalyticsReads.analyticsOverview, args);
  const chart = useQuery(api.googleAnalyticsChartReads.analyticsChart, args);
  // The page panels are a read of their own: a big website's year of landing pages took one read past its time.
  const rest = useQuery(api.googleAnalyticsOverviewReads.analyticsOverviewPanels, args);
  const pagePanels = useQuery(api.googleAnalyticsOverviewReads.analyticsOverviewPagePanels, args);
  const panels: Panels | null | undefined = rest === undefined || pagePanels === undefined ? undefined
    : rest === null || pagePanels === null ? null : { ...rest, ...pagePanels };
  const currency = status.connection?.currency ?? null;
  const counting = countsAnything(status);

  if (overview?.preparing) {
    return <Notice>{t("preparing")}</Notice>;
  }
  const now = overview?.now ?? null;
  const before = overview?.before ?? null;
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="overview" seen={overview?.seen} currency={currency} />

      {now ? (
        <AnalyticsFigures now={now} before={before} currency={currency} conversionsHref={hrefFor("conversions")} counting={counting} />
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      <VisitsChart
        days={chart?.points ?? []}
        host={status.host}
        from={overview?.from ?? null}
        to={overview?.to ?? null}
        exportName="google-analytics-overview"
      />

      <ChannelsPanel panels={panels} now={now} before={before} currency={currency} />
      <KindsPanel panels={panels} />
      <LandingPanel panels={panels} now={now} before={before} />
      <ConversionsPanel panels={panels} now={now} before={before} currency={currency} counting={counting} />
      <WhoPanel panels={panels} now={now} before={before} />
      {status.connection?.shop ? <ShopPanel panels={panels} currency={currency} /> : null}
      <HealthPanel status={status} />
    </div>
  );
}

/** "27.0% more than the 30 days before", "the same as …", or nothing to compare with yet. */
function useChangeWords(): (now: number, before: number | null | undefined) => string {
  const t = useTranslations("googleAnalytics.overview");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
  const span = tf(`before.${period}`);
  return (now, before) => {
    if (before === null || before === undefined || before === 0) return t("noBefore");
    if (now === before) return t("sameAs", { before: span });
    const rate = formatPercent(Math.abs(now - before) / before);
    return t(now > before ? "moreThan" : "fewerThan", { rate, before: span });
  };
}

const mono = (text: string, tone = "text-foreground") => <span className={`whitespace-nowrap font-mono text-[12px] ${tone}`}>{text}</span>;
const quiet = (text: string) => <span className="text-[12.5px] text-secondary">{text}</span>;

/** OV2: the channels with the most visits, and the visits from tagged links and ad keywords. */
function ChannelsPanel({ panels, now, before, currency }: { panels: Panels | null | undefined; now: Figures | null; before: Figures | null; currency: string | null }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const changeWords = useChangeWords();
  const channels = panels?.channels;
  const tagged = channels && channels.tagged !== null ? (channels.tagged > 0 || (channels.keywords ?? 0) > 0
    ? t("channels.tagged", { tagged: formatNumber(channels.tagged), keywords: formatNumber(channels.keywords ?? 0) })
    : t("channels.noneTagged")) : null;
  const note = now && channels
    ? [t("channels.note", { visits: formatNumber(now.visits), count: channels.count, change: changeWords(now.visits, before?.visits) }), tagged].filter(Boolean).join(" ")
    : undefined;
  return (
    <AnalyticsPanel title={t("channels.title")} description={note} seeAll={channels?.count ? { href: hrefFor("channels"), label: t("channels.seeAll", { count: channels.count }) } : null}>
      <CompactList
        rows={panels === undefined ? undefined : channels?.rows ?? []}
        rowKey={(row) => row.key}
        empty={t("channels.empty")}
        columns={[
          { key: "name", header: t("columns.channel"), cell: (row) => <Link href={hrefFor("channels/channel", { key: row.label })} className="text-[13px] text-foreground hover:text-info">{row.label}</Link> },
          { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.visits)) },
          { key: "change", header: t("columns.change"), align: "right", cell: (row) => <ChangeCell change={row.change} /> },
          { key: "conversions", header: t("columns.conversions"), align: "right", cell: (row) => mono(formatNumber(row.conversions), row.conversions > 0 ? "text-foreground" : "text-muted") },
          { key: "value", header: t("columns.value"), align: "right", cell: (row) => (row.value > 0 ? mono(formatMoney(row.value, currency), "text-secondary") : <NoFigure />) },
        ]}
      />
    </AnalyticsPanel>
  );
}

/** The share who left from where they landed, as a figure. */
const leftCell = (row: TopRow) => (row.left === null || row.left === undefined ? <NoFigure /> : mono(formatPercent(row.left), "text-secondary"));

/** OV3: the classifications whose landing pages had the most visits. */
function KindsPanel({ panels }: { panels: Panels | null | undefined }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const kinds = panels?.kinds;
  const name = (row: TopRow) => (row.label === NOT_SORTED_KIND || row.kindName === null ? t("unclassified") : row.kindName ?? row.label);
  return (
    <AnalyticsPanel
      title={t("kinds.title")}
      description={kinds ? t("kinds.note", { count: kinds.count }) : panels === undefined ? undefined : t("kinds.none")}
      seeAll={kinds?.count ? { href: hrefFor("funnel", { view: "groups" }), label: t("kinds.seeAll", { count: kinds.count }) } : null}
    >
      {kinds === null ? null : (
        <CompactList
          rows={kinds?.rows}
          rowKey={(row) => row.key}
          empty={t("kinds.empty")}
          columns={[
            { key: "name", header: t("columns.classification"), cell: (row) => <Link href={hrefFor("funnel", { group: row.key })} className="text-[13px] text-foreground hover:text-info">{name(row)}</Link> },
            { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.visits)) },
            { key: "change", header: t("columns.change"), align: "right", cell: (row) => <ChangeCell change={row.change} /> },
            { key: "left", header: t("columns.left"), align: "right", cell: leftCell },
            { key: "conversions", header: t("columns.conversions"), align: "right", cell: (row) => mono(formatNumber(row.conversions), row.conversions > 0 ? "text-foreground" : "text-muted") },
          ]}
        />
      )}
    </AnalyticsPanel>
  );
}

/** OV4: the landing pages with the most visits, each with its classification. */
function LandingPanel({ panels, now, before }: { panels: Panels | null | undefined; now: Figures | null; before: Figures | null }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const pageLink = usePageHref();
  const changeWords = useChangeWords();
  const landing = panels?.landing;
  const note = now && now.visits > 0
    ? [
      t("landing.note", { views: formatNumber(now.views), change: changeWords(now.views, before?.views), pages: formatPerVisit(now.views / now.visits), time: formatTime(now.length / now.visits) }),
      landing?.left !== null && landing?.left !== undefined ? t("landing.left", { left: formatPercent(landing.left) }) : null,
    ].filter(Boolean).join(" ")
    : undefined;
  const kindOf = (row: TopRow) => (row.kindName === undefined ? undefined : row.kindName ?? t("unclassified"));
  return (
    <AnalyticsPanel title={t("landing.title")} description={note} seeAll={landing?.count ? { href: hrefFor("funnel"), label: t("landing.seeAll") } : null}>
      <CompactList
        rows={panels === undefined ? undefined : landing?.rows ?? []}
        rowKey={(row) => row.key}
        empty={t("landing.empty")}
        columns={[
          { key: "name", header: t("columns.page"), cell: (row) => <PageLink address={row.label} href={row.key.startsWith("~") ? pageLink(row.key) : null} title={row.title} kind={kindOf(row)} /> },
          { key: "visits", header: t("columns.visits"), align: "right", cell: (row) => mono(formatNumber(row.visits)) },
          { key: "change", header: t("columns.change"), align: "right", cell: (row) => <ChangeCell change={row.change} /> },
          { key: "left", header: t("columns.left"), align: "right", cell: leftCell },
          { key: "conversions", header: t("columns.conversions"), align: "right", cell: (row) => mono(formatNumber(row.conversions), row.conversions > 0 ? "text-foreground" : "text-muted") },
        ]}
      />
    </AnalyticsPanel>
  );
}

const STATUS_TONE = { counted: "success", uncounted: "warning", never: "warning" } as const;

/** OV5: what counts and the key events not counted, those that happened first. */
function ConversionsPanel({ panels, now, before, currency, counting }: { panels: Panels | null | undefined; now: Figures | null; before: Figures | null; currency: string | null; counting: boolean }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const changeWords = useChangeWords();
  const conversions = panels?.conversions;
  const note = !counting ? t("conversions.nothingCounted") : now ? t(now.value > 0 ? "conversions.worth" : "conversions.note", {
    conversions: now.conversions,
    value: formatMoney(now.value, currency),
    change: changeWords(now.conversions, before?.conversions),
    rate: formatPercent(now.visits > 0 ? now.conversions / now.visits : null),
  }) : undefined;
  return (
    <AnalyticsPanel title={t("conversions.title")} description={note} seeAll={{ href: hrefFor("conversions"), label: t("conversions.seeAll") }}>
      <CompactList
        rows={panels === undefined ? undefined : conversions?.rows ?? []}
        rowKey={(row) => row.eventName}
        empty={t("conversions.empty")}
        columns={[
          {
            key: "name",
            header: t("conversions.keyEvent"),
            // Its own name, then Google's, as Conversions' table shows them.
            cell: (row) => (
              <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
                <Link href={hrefFor("events/event", { key: row.eventName })} className="text-[13px] text-foreground hover:text-info">{nameOf(row.eventName)}</Link>
                <span className="font-mono text-[11px] text-muted">{row.eventName}</span>
              </span>
            ),
          },
          { key: "times", header: t("conversions.times"), align: "right", cell: (row) => mono(formatNumber(row.times)) },
          { key: "value", header: t("columns.value"), align: "right", cell: (row) => (row.value ? mono(formatMoney(row.value, currency)) : <NoFigure />) },
          { key: "change", header: t("columns.change"), align: "right", cell: (row) => <ChangeCell change={row.change} /> },
          { key: "counted", header: t("conversions.counted"), cell: (row) => <StatusLabel tone={STATUS_TONE[row.status]}>{t(`conversions.status.${row.status}`)}</StatusLabel> },
        ]}
      />
    </AnalyticsPanel>
  );
}

/** OV6: each kind's biggest group Google named, its share and its move in points. */
function WhoPanel({ panels, now, before }: { panels: Panels | null | undefined; now: Figures | null; before: Figures | null }) {
  const t = useTranslations("googleAnalytics.overview");
  const tf = useTranslations("googleAnalytics.filters.devices");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useVisitorName();
  const changeWords = useChangeWords();
  const note = now && now.people > 0
    ? t("who.note", { people: formatNumber(now.people), change: changeWords(now.people, before?.people), newShare: formatPercent(now.newPeople / now.people) })
    : undefined;
  type WhoRow = Panels["who"][number];
  const groupName = (row: WhoRow) => (row.kind === "device" ? (tf.has(row.label) ? tf(row.label) : row.label) : nameOf(row.label));
  const points = (row: WhoRow) => (row.shareBefore === null ? null : Math.round((row.share - row.shareBefore) * 1000) / 10);
  return (
    <AnalyticsPanel title={t("who.title")} description={note} seeAll={{ href: hrefFor("visitors"), label: t("who.seeAll") }}>
      <CompactList
        rows={panels === undefined ? undefined : panels?.who ?? []}
        rowKey={(row) => row.kind}
        empty={t("who.empty")}
        columns={[
          { key: "kind", header: t("who.kind"), cell: (row) => quiet(t(`who.kinds.${row.kind}`)) },
          {
            key: "most",
            header: t("who.most"),
            // Device has no list of its own on Visitors: its group is words, not a link.
            cell: (row) => (row.kind === "device"
              ? <span className="text-[13px] text-foreground">{groupName(row)}</span>
              : <Link href={hrefFor("visitors", { view: row.kind })} className="text-[13px] text-foreground hover:text-info">{groupName(row)}</Link>),
          },
          { key: "share", header: t("who.share"), align: "right", cell: (row) => mono(formatPercent(row.share)) },
          { key: "change", header: t("columns.change"), align: "right", cell: (row) => <Change by={points(row)} same format={(value) => t("who.points", { points: value.toFixed(1) })} /> },
        ]}
      />
    </AnalyticsPanel>
  );
}

/** OV7: the best sellers, for a website that sells. */
function ShopPanel({ panels, currency }: { panels: Panels | null | undefined; currency: string | null }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const shop = panels?.shop;
  const note = shop ? t("shop.note", { bought: shop.bought, revenue: formatMoney(shop.revenue, currency), basket: shop.basket }) : undefined;
  return (
    <AnalyticsPanel title={t("shop.title")} description={note} seeAll={{ href: hrefFor("products"), label: t("shop.seeAll") }}>
      <CompactList
        rows={panels === undefined ? undefined : shop?.rows ?? []}
        rowKey={(row) => row.key}
        empty={t("shop.empty")}
        columns={[
          { key: "name", header: t("shop.product"), cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
          { key: "viewed", header: t("shop.viewed"), align: "right", cell: (row) => mono(formatNumber(row.looks)) },
          { key: "basket", header: t("shop.basket"), align: "right", cell: (row) => mono(formatNumber(row.basket)) },
          { key: "bought", header: t("shop.bought"), align: "right", cell: (row) => mono(formatNumber(row.bought)) },
          { key: "revenue", header: t("shop.revenue"), align: "right", cell: (row) => mono(formatMoney(row.revenue, currency)) },
        ]}
      />
    </AnalyticsPanel>
  );
}

/** OV8: the checks that need a look, from those the connection holds. */
function HealthPanel({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.overview");
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const words = useHealthWords(status);
  const { platformName } = useSystemSettings();
  const checks = status.connection?.health?.checks ?? null;
  const failing = (checks ?? []).filter((check) => !check.passing);
  const note = checks === null ? t("health.notChecked")
    : failing.length > 0 ? t("health.failing", { failing: failing.length, total: checks.length, passing: checks.length - failing.length })
      : t("health.passing", { total: checks.length });
  return (
    <AnalyticsPanel title={t("health.title")} description={note} seeAll={{ href: hrefFor("tracking-health"), label: t("health.seeAll") }}>
      {checks === null ? null : (
        <CompactList
          rows={failing}
          rowKey={(check) => check.check}
          empty={t("health.empty")}
          columns={[
            { key: "check", header: t("health.check"), cell: (check) => <StatusLabel tone="warning">{words(check).title}</StatusLabel> },
            { key: "found", header: t("health.found", { platformName }), cell: (check) => quiet(words(check).short) },
          ]}
        />
      )}
    </AnalyticsPanel>
  );
}
