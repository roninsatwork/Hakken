"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import {
  CHART_SERIES_BLUE,
  CHART_SERIES_ORANGE,
  CHART_SERIES_TEAL,
  CHART_SERIES_VIOLET,
} from "@/src/ui/components/charts/chartPalette";
import { RecordLinkCell } from "../_components/SiteCells";
import { SiteFigure } from "../_components/SiteFigure";
import { formatNumber, movement, movementClass } from "../_components/siteFormat";
import { useSiteListHref, useSiteRecordHref } from "../_components/siteRecordLinks";
import { useSite, useSiteId } from "../_components/useSite";

type Point = FunctionReturnType<typeof api.siteCharts.siteSeries>[number]["points"][number];
type Extras = FunctionReturnType<typeof api.siteOverview.overviewExtras>;

/**
 * The assistants' colours, in the order the server lists them. The engines
 * themselves are named in one place only (`engineLabel.ts`, see the provider
 * guard), so this panel takes their order from the query.
 */
const ASSISTANT_COLOURS = [CHART_SERIES_TEAL, CHART_SERIES_BLUE, CHART_SERIES_VIOLET, CHART_SERIES_ORANGE] as const;

/** Dollars, whole. */
function dollars(value: number | null | undefined): string {
  return value === null || value === undefined ? "–" : `$${formatNumber(value)}`;
}

/** How far a figure moved since the day before the dates chosen, with an arrow that carries the meaning without the colour. */
export function Change({ now, before }: { now: number | null | undefined; before: number | null | undefined }) {
  const t = useTranslations("sites.overview");
  if (now === null || now === undefined || before === null || before === undefined) return <span className="text-muted">{t("noComparison")}</span>;
  const moved = movement(Math.round(now - before));
  return <span className={movementClass(moved.tone)}>{moved.tone === "none" ? t("unchanged") : moved.text}</span>;
}

/**
 * A figure's change, then what else it means, on one line. Before there is
 * a check to compare with, the change is left out rather than saying so under
 * every figure: nine "nothing to compare yet"s were a wall of noise.
 */
function Detail({ now, before, extra }: { now: number | null | undefined; before: number | null | undefined; extra?: ReactNode }) {
  const comparable = now !== null && now !== undefined && before !== null && before !== undefined;
  if (!comparable) return extra ? <span className="text-secondary">{extra}</span> : null;
  return (
    <>
      <Change now={now} before={before} />
      {extra ? <span className="text-secondary"> · {extra}</span> : null}
    </>
  );
}

/** One of the Overview's three headline panels: the same card as its charts, without a download. */
function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-border-dim bg-card/40 p-5">
      <h2 className="text-[14px] font-medium text-foreground">{title}</h2>
      {children}
    </section>
  );
}

/** A strength out of 1,000, as a ring: website strength, home page strength. */
function StrengthRing({ label, value, colour, href }: { label: string; value: number | null; colour: string; href?: string }) {
  const t = useTranslations("sites.overview.panels");
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const filled = value === null ? 0 : (Math.min(value, 1000) / 1000) * circumference;
  return (
    <div className="flex items-center gap-3">
      <svg width="60" height="60" viewBox="0 0 60 60" role="img" aria-label={`${label}: ${value ?? "–"} ${t("ofThousand")}`}>
        <circle cx="30" cy="30" r={radius} fill="none" strokeWidth="8" stroke="currentColor" className="text-border-dim" />
        <circle
          cx="30"
          cy="30"
          r={radius}
          fill="none"
          strokeWidth="8"
          stroke={colour}
          strokeDasharray={`${filled.toFixed(1)} ${circumference.toFixed(1)}`}
          transform="rotate(-90 30 30)"
        />
      </svg>
      <SiteFigure framed={false} label={label} value={value ?? "–"} href={href} detail={<span className="text-muted">{t("ofThousand")}</span>} />
    </div>
  );
}

/**
 * The Overview's three headline panels, as Ahrefs lays out a site's
 * dashboard (drawn and agreed 2026-09-25): Search, Backlink profile and AI
 * answers. Each figure shows what changed since the day before the dates
 * chosen, and opens the records behind it.
 */
export function OverviewPanels({ latest, before, extras }: { latest: Point | null; before: Point | null; extras: Extras | undefined }) {
  const t = useTranslations("sites.overview.panels");
  const siteId = useSiteId();
  const site = useSite();
  const engineLabel = useEngineLabel();
  const listHref = useSiteListHref(siteId);
  const recordHref = useSiteRecordHref(siteId);

  const keywords = latest?.rankedKeywordsTotal ?? latest?.keywords ?? null;
  const keywordsBefore = before?.rankedKeywordsTotal ?? before?.keywords ?? null;
  const top3 = (latest?.allBands ?? latest?.bands)?.p01_03 ?? null;
  const named = new Map((latest?.ai ?? []).map((entry) => [entry.engine, entry]));
  const assistantRows = (extras?.assistants ?? []).map((entry, index) => ({
    engine: entry.engine,
    colour: ASSISTANT_COLOURS[index % ASSISTANT_COLOURS.length],
    day: named.get(entry.engine) ?? null,
    pages: entry.pages,
  }));
  const aiPages = extras ? `${formatNumber(extras.aiOverviewPages)}${extras.aiOverviewCapped ? "+" : ""}` : null;

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
      <Panel title={t("search.title")}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-5">
          <SiteFigure
            framed={false}
            label={t("search.keywords")}
            value={formatNumber(keywords)}
            href={listHref("keywords")}
            detail={<Detail now={keywords} before={keywordsBefore} extra={top3 !== null ? t("search.top3", { count: formatNumber(top3) }) : undefined} />}
          />
          <SiteFigure
            framed={false}
            label={t("search.visits")}
            value={formatNumber(latest?.estimatedTraffic)}
            href={listHref("keywords/pages", { sort: "traffic" })}
            detail={<Detail now={latest?.estimatedTraffic} before={before?.estimatedTraffic} extra={latest?.trafficValue !== undefined ? t("search.worth", { value: dollars(latest.trafficValue) }) : undefined} />}
          />
          <SiteFigure
            framed={false}
            label={t("search.paidSearches")}
            value={formatNumber(latest?.paidKeywords)}
            href={listHref("paid/keywords")}
            detail={<Detail now={latest?.paidKeywords} before={before?.paidKeywords} />}
          />
          <SiteFigure
            framed={false}
            label={t("search.paidVisits")}
            value={formatNumber(latest?.paidTraffic)}
            href={listHref("paid/keywords", { sort: "cost" })}
            detail={<Detail now={latest?.paidTraffic} before={before?.paidTraffic} extra={t("search.cost", { value: latest?.paidTrafficCost ? dollars(latest.paidTrafficCost) : "–" })} />}
          />
        </div>
      </Panel>

      <Panel title={t("links.title")}>
        <div className="flex flex-col gap-3">
          <StrengthRing label={t("links.websiteStrength")} value={latest?.domainRank ?? null} colour={CHART_SERIES_VIOLET} href={listHref("backlinks")} />
          <StrengthRing
            label={t("links.homeStrength")}
            value={extras?.homePageRank ?? null}
            colour={CHART_SERIES_TEAL}
            href={recordHref({ kind: "page", page: "/" })}
          />
        </div>
        <div className="grid grid-cols-2 gap-4 border-t border-border-dim pt-4">
          <SiteFigure
            framed={false}
            label={t("links.links")}
            value={formatNumber(latest?.backlinks)}
            href={listHref("backlinks/all", { links: "every" })}
            detail={<Detail now={latest?.backlinks} before={before?.backlinks} extra={latest?.brokenBacklinks !== undefined ? t("links.broken", { count: formatNumber(latest.brokenBacklinks) }) : undefined} />}
          />
          <SiteFigure
            framed={false}
            label={t("links.linkingWebsites")}
            value={formatNumber(latest?.referringDomains)}
            href={listHref("backlinks/domains")}
            detail={<Detail now={latest?.referringDomains} before={before?.referringDomains} extra={latest?.referringMainDomains !== undefined ? t("links.mainWebsites", { count: formatNumber(latest.referringMainDomains) }) : undefined} />}
          />
        </div>
      </Panel>

      <Panel title={t("ai.title")}>
        <SiteFigure
          framed={false}
          label={t("ai.overviews")}
          value={latest?.aiOverviewRefs === undefined ? "–" : t("ai.searches", { count: formatNumber(latest.aiOverviewRefs) })}
          href={recordHref({ kind: "feature", feature: "ai_overview_reference" })}
          detail={<Detail now={latest?.aiOverviewRefs} before={before?.aiOverviewRefs} extra={aiPages !== null ? t("ai.pagesLinked", { count: aiPages }) : undefined} />}
        />
        <CompactList
          rows={assistantRows}
          rowKey={(row) => row.engine}
          empty="–"
          columns={[
            {
              key: "assistant",
              header: t("ai.assistant"),
              cell: (row) => (
                <span className="flex items-center gap-2 text-[13px]">
                  <span className="h-2 w-2 rounded-full" style={{ background: row.colour }} aria-hidden="true" />
                  <RecordLinkCell href={listHref("ai/mentions", { engine: row.engine })}>{engineLabel(row.engine)}</RecordLinkCell>
                </span>
              ),
            },
            {
              key: "named",
              header: t("ai.naming"),
              align: "right",
              cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.day ? t("ai.namedOf", { named: row.day.named, asked: row.day.asked }) : "–"}</span>,
            },
            {
              key: "pages",
              header: t("ai.pages"),
              align: "right",
              cell: (row) => <span className="font-mono text-[12px] text-secondary">{site?.counts.questionsSetUp ? formatNumber(row.pages) : "–"}</span>,
            },
          ]}
        />
        {site && !site.counts.questionsSetUp ? <p className="text-[12px] text-secondary">{t("ai.addQuestions")}</p> : null}
      </Panel>
    </div>
  );
}
