"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { ArrowRight, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { CHART_SERIES_ORANGE } from "@/src/ui/components/charts/chartPalette";
import { Button } from "@/src/ui/components/screens/Button";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { Figure } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Select } from "@/src/ui/components/screens/Select";
import { FieldHint } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { hasFigures } from "../../search-console/_components/SearchConsoleNotices";
import { useLiveAsk } from "../../search-console/_components/searchConsoleRecords";
import { ExternalUrlCell, PageTypeText } from "../../sites/_components/SiteCells";
import { SiteStackedAreaChart } from "../../sites/_components/SiteCharts";
import { datedRow } from "../../sites/_components/datedRows";
import { formatMonthName, formatNumber, formatVisits, toCsv } from "../../sites/_components/siteFormat";
import { formatDate } from "@/src/lib/dates";
import { shiftDay } from "../../sites/_components/siteRange";
import { ResearchPositionCell, ResearchSection, useCountryName } from "./ResearchCells";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { VERDICT_TONES, dayDate, isIntent, lastDayOfMonth, pathOf, readableAddress } from "./researchWords";
import { ideasHref, lookupHref, useLookupAnswers, type LookupOverview } from "./useLookup";

/** "What Google counted" reads Search Console's last this many days, as drawn. */
const COUNTED_DAYS = 28;

type ForWebsite = NonNullable<LookupOverview["forWebsite"]>;
type Figures = NonNullable<LookupOverview["overview"]>;

/** A keyword as Search Console and Websites keep it: trimmed, one space, lower case. */
const searchKey = (keyword: string) => keyword.trim().replace(/\s+/g, " ").toLowerCase();

/**
 * "For acme-agency.test" (board 2): one of the four answers, and why — worked out
 * on the server from the figures on these pages (`verdictOf`) — then the
 * website's own page, what Search Console counted, and its competitors.
 */
export function ForWebsiteSection({ lookup, forWebsite, figures }: { lookup: LookupOverview; forWebsite: ForWebsite; figures: Figures | null }) {
  const t = useTranslations("keywordResearch.overview");
  const tv = useTranslations("keywordResearch.verdicts");
  const host = forWebsite.host;
  const verdict = forWebsite.verdict;
  const reasons: string[] = [];
  if (forWebsite.position !== null && forWebsite.url) {
    reasons.push(t("reasons.ranks", { page: pathOf(forWebsite.url), position: forWebsite.position, googlePage: Math.ceil(forWebsite.position / 10) }));
  } else if (forWebsite.notInTop100) {
    reasons.push(t("reasons.noPage"));
  }
  if (figures?.volume !== null && figures?.volume !== undefined) {
    reasons.push(isIntent(figures.intent)
      ? t("reasons.searched", { volume: formatNumber(figures.volume), intent: t(`seeking.${figures.intent}`) })
      : t("reasons.searchedOnly", { volume: formatNumber(figures.volume) }));
  }
  // Like for like (`verdictOf`): the website's strength against the top ten's websites', both 0 to 100.
  const top = figures?.topTenStrength ?? null;
  if (top !== null) {
    const mine = forWebsite.strength;
    reasons.push(mine === null
      ? t("reasons.strengthTop", { top: formatNumber(top) })
      : t(mine >= top ? "reasons.strengthWithin" : "reasons.strengthOut", { top: formatNumber(top), host, mine: formatNumber(mine) }));
  }
  if (!verdict) reasons.push(t("reasons.notJudged"));

  return (
    <div className="flex flex-col gap-3">
      <ChartCard title={t("forHost", { host })} hint={t("forHostHint")}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <StatusLabel tone={verdict ? VERDICT_TONES[verdict] : "neutral"} size="md">
              <span className="text-[15px] font-semibold text-foreground">{tv(verdict ?? "NONE")}</span>
            </StatusLabel>
            {verdict === "IMPROVE" || verdict === "NEW_PAGE" ? <TagLabel>{t("worthIt")}</TagLabel> : null}
          </div>
          <ul className="flex list-disc flex-col gap-1.5 pl-5 text-[13px] leading-relaxed text-secondary">
            {reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
          <FieldHint>{t("fourAnswers")}</FieldHint>
        </div>
      </ChartCard>
      <div className="grid grid-cols-1 gap-3 xl:grid-cols-3">
        <YourPage lookup={lookup} forWebsite={forWebsite} />
        <WhatGoogleCounted forWebsite={forWebsite} keyword={lookup.keyword} />
        <ChartCard title={t("competitors")} hint={forWebsite.competitors.length > 0 ? t("competitorsHint", { count: forWebsite.competitors.length }) : undefined}>
          <CompactList
            rows={forWebsite.competitors}
            rowKey={(row) => row.host}
            density="tight"
            empty={t("noCompetitors", { host })}
            columns={[
              { key: "host", className: "max-w-0 w-full", cell: (row) => <span title={row.host} className="block truncate text-[13px] text-foreground">{row.host}</span> },
              {
                key: "position",
                align: "right",
                // Google's top 100 was read whenever the website's own place was.
                cell: (row) => <ResearchPositionCell position={row.position} notInTop100={forWebsite.notInTop100 || forWebsite.position !== null} />,
              },
            ]}
          />
        </ChartCard>
      </div>
    </div>
  );
}

/** The website's own page for the keyword: where it ranks, the visits it gets, and the way to it in Websites. */
function YourPage({ lookup, forWebsite }: { lookup: LookupOverview; forWebsite: ForWebsite }) {
  const t = useTranslations("keywordResearch.overview");
  const websitesHref = `/app/sites/${forWebsite.siteId}/keywords/keyword?keyword=${encodeURIComponent(searchKey(lookup.keyword))}`;
  return (
    <ChartCard title={t("yourPage")}>
      {forWebsite.url ? (
        <div className="flex flex-col gap-3">
          <ExternalUrlCell url={forWebsite.url} label={pathOf(forWebsite.url)} />
          <div className="grid grid-cols-2 gap-3">
            <Figure framed={false} label={t("position")} value={forWebsite.position ?? <NoFigure />} />
            <Figure framed={false} label={t("visits")} value={formatVisits(forWebsite.visits)} />
          </div>
          <FieldHint>
            {forWebsite.checkedDay ? `${t("checked", { day: dayDate(forWebsite.checkedDay) })} · ` : null}
            <Link href={websitesHref} className="text-secondary underline hover:text-foreground">{t("openInWebsites")}</Link>
          </FieldHint>
        </div>
      ) : (
        <p className="text-[13px] text-secondary">{t("noPage")}</p>
      )}
    </ChartCard>
  );
}

/**
 * What Google counted (board 2): Search Console's own figures for this
 * keyword on this website over its last 28 days — shown, clicks and average
 * position — asked of Google as the card opens, as a keyword's own screen in
 * Search Console asks (`searchConsoleKeySeries`). A website not connected
 * says so in a line.
 */
function WhatGoogleCounted({ forWebsite, keyword }: { forWebsite: ForWebsite; keyword: string }) {
  const t = useTranslations("keywordResearch.overview");
  const status = useQuery(api.searchConsoleConnect.searchConsoleStatus, { siteId: forWebsite.siteId });
  const connected = Boolean(status && hasFigures(status));
  const newest = status?.connection?.newestDay ?? null;
  const series = useLiveAsk(
    api.searchConsoleLists.searchConsoleKeySeries,
    connected && newest
      ? { siteId: forWebsite.siteId, searchType: "web", dimension: "query", key: searchKey(keyword), from: shiftDay(newest, -(COUNTED_DAYS - 1)), to: newest }
      : null,
  );
  const answer = series.answer;
  const notConnected = status === null || (status !== undefined && !connected) || (answer && !answer.ok && answer.problem === "NOT_CONNECTED");

  let body;
  if (notConnected) body = <p className="text-[13px] text-secondary">{t("notConnected")}</p>;
  else if (status === undefined || answer === undefined) body = <div className="h-[52px] animate-pulse rounded-lg bg-sidebar/30" aria-busy="true" />;
  else if (!answer.ok) body = <p className="text-[13px] text-secondary">{t("countedProblem")}</p>;
  else {
    const totals = answer.totals;
    body = (
      <div className="grid grid-cols-3 gap-3">
        <Figure framed={false} label={t("shown")} value={formatNumber(totals?.impressions ?? 0)} />
        <Figure framed={false} label={t("clicks")} value={formatNumber(totals?.clicks ?? 0)} />
        <Figure framed={false} label={t("position")} value={totals && totals.impressions > 0 ? totals.position.toFixed(1) : <NoFigure />} />
      </div>
    );
  }
  return (
    <ChartCard title={t("counted")} hint={t("countedHint", { days: COUNTED_DAYS })}>
      {body}
    </ChartCard>
  );
}

/** The last 24 months of searches, as Sites draws a line over dates — so Google's updates are marked on it. */
export function MonthsChart({ lookup, figures, place }: { lookup: LookupOverview; figures: Figures; place: string }) {
  const t = useTranslations("keywordResearch.overview");
  const { platformName } = useSystemSettings();
  const rows = figures.monthly.map((point) => datedRow(
    { day: `${point.month}-01`, lastDay: lastDayOfMonth(point.month) },
    { volume: point.volume },
    `${formatMonthName(point.month)} ${point.month.slice(0, 4)}`,
  ));
  return (
    <ChartCard
      title={t("chartTitle", { place })}
      hint={t("chartHint")}
      exportName={`${searchKey(lookup.keyword).replace(/\s/g, "-")}-searches-a-month`}
      csv={() => toCsv([t("month"), t("chartSeries")], figures.monthly.map((point) => [point.month, point.volume]))}
      caption={[lookup.keyword, place, platformName].filter(Boolean).join(" · ")}
      enoughData={rows.length >= 2}
    >
      <SiteStackedAreaChart data={rows} series={[{ key: "volume", name: t("chartSeries"), colour: CHART_SERIES_ORANGE }]} height={240} />
    </ChartCard>
  );
}

/**
 * Searches by country (board 2): the home country, and each other country
 * picked, its searches beside a bar on one scale. Another is looked up only
 * when picked (Anthony, 2026-10-04: "just the home countries by default").
 */
export function SearchesByCountry({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.overview");
  const countryName = useCountryName();
  const lookUpInCountry = useMutation(api.keywordResearch.lookUpInCountry);
  const { run, isBusy } = useAdminAction({ scope: "keyword-research-country" });
  const [picked, setPicked] = useState("");
  const shown = lookup.countries.filter((country) => country.state !== null);
  const left = lookup.countries.filter((country) => country.state === null || country.state === "FAILED");
  const most = Math.max(1, ...shown.map((country) => country.volume ?? 0));

  const note = (state: (typeof shown)[number]["state"]) => {
    if (state === "HOME") return <TagLabel>{t("home")}</TagLabel>;
    if (state === "WAITING") return <StatusLabel tone="info" icon="working">{t("lookingUp")}</StatusLabel>;
    if (state === "FAILED") return <StatusLabel tone="danger">{t("countryFailed")}</StatusLabel>;
    return <TagLabel>{t("lookedUp")}</TagLabel>;
  };

  return (
    <ChartCard title={t("byCountry")} hint={t("byCountryHint", { cents: lookup.costs.country })}>
      <div className="flex flex-col gap-4">
        {shown.map((country) => (
          <div key={country.code} className="flex flex-col gap-2">
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="flex items-center gap-2">{countryName(country.code, country.label)}{note(country.state)}</span>
              {country.volume === null ? <NoFigure /> : <span className="font-mono text-[12px] tabular-nums text-foreground">{formatNumber(country.volume)}</span>}
            </div>
            <Meter value={country.volume === null ? null : country.volume / most} size="md" />
          </div>
        ))}
        {lookup.canLookUp && left.length > 0 ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-border-dim pt-4">
            <Select aria-label={t("anotherCountry")} value={picked} onChange={setPicked} className="w-[200px]">
              <option value="">{t("chooseCountry")}</option>
              {left.map((country) => <option key={country.code} value={country.code}>{countryName(country.code, country.label)}</option>)}
            </Select>
            <Button
              variant="quiet"
              title={t("lookUpCountryTitle", { cents: lookup.costs.country })}
              disabled={!picked || isBusy()}
              onClick={async () => {
                const outcome = await run(() => lookUpInCountry({ lookupId: lookup.lookupId, locationCode: Number(picked) }), { fallbackMessage: t("countryLookUpFailed") });
                if (outcome.ok) setPicked("");
              }}
              className="inline-flex h-[38px] items-center gap-1.5"
            >
              <Search className="h-3.5 w-3.5" aria-hidden="true" />
              {t("lookUpCountry")}
            </Button>
          </div>
        ) : null}
      </div>
    </ChartCard>
  );
}

/** Google's results, the top five the server sends (board 2), each page's kind and visits, and the way to all ten. */
export function TopFive({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.overview");
  const tc = useTranslations("keywordResearch.columns");
  return (
    <ChartCard title={t("results")} hint={lookup.serpBoughtAt
        ? lookup.serpFrom
          ? t("resultsHintFrom", { day: formatDate(lookup.serpBoughtAt), city: lookup.serpFrom })
          : t("resultsHint", { day: formatDate(lookup.serpBoughtAt) })
        : undefined}>
      <CompactList
        rows={lookup.top ?? undefined}
        rowKey={(row) => `${row.position}-${row.url}`}
        density="tight"
        empty={t("noResults")}
        loading={t("noResults")}
        columns={[
          { key: "position", header: "#", className: "w-9", cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{row.position}</span> },
          { key: "page", header: tc("page"), className: "max-w-0 w-[60%]", cell: (row) => <ExternalUrlCell url={row.url} label={readableAddress(row.url)} cut /> },
          { key: "kind", header: tc("kind"), cell: (row) => <PageTypeText type={row.kind} /> },
          { key: "visits", header: tc("visits"), align: "right", cell: (row) => <span className="font-mono text-[12px] tabular-nums text-foreground">{formatVisits(row.visits)}</span> },
        ]}
      />
      <OnwardLink
        href={lookupHref(lookup.lookupId, "results")}
        title={lookup.canLookUp && lookup.results !== "READY" ? t("seeAllTitle", { cents: lookup.costs.results }) : undefined}
      >
        {t("seeAll")}
      </OnwardLink>
    </ChartCard>
  );
}

/** "See all ten →": the quiet link onward under a card, as the drawing kit's "A quiet link onward". */
function OnwardLink({ href, title, children }: { href: string; title?: string; children: string }) {
  return (
    <Link href={href} title={title} className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground">
      {children}
      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
    </Link>
  );
}

/**
 * Keyword ideas on the Overview before they are held: what they cost, and
 * the way to Keyword ideas, which buys them when it opens. The Overview
 * itself never buys them.
 */
export function IdeasCardWaiting({ lookup, waiting }: { lookup: LookupOverview; waiting: boolean }) {
  const t = useTranslations("keywordResearch.overview");
  return (
    <ResearchSection
      title={t("ideasTitle")}
      description={waiting ? t("ideasWaiting") : lookup.canLookUp ? t("ideasNotYet", { cents: lookup.costs.ideas }) : t("ideasNotYetReadOnly")}
    >
      <OnwardLink href={ideasHref(lookup.lookupId, "terms")}>{t("ideasOpen")}</OnwardLink>
    </ResearchSection>
  );
}

/**
 * What the AI says on the Overview (board 2): whether each assistant names
 * the website, once asked — and until then what asking costs, and the way to
 * What the AI says, which asks when it opens.
 */
export function AnswersCard({ lookup }: { lookup: LookupOverview }) {
  const t = useTranslations("keywordResearch.overview");
  const ta = useTranslations("keywordResearch.ai");
  const engineLabel = useEngineLabel();
  const answers = useLookupAnswers();
  const href = lookupHref(lookup.lookupId, "ai");
  const held = Boolean(answers?.figures);
  return (
    <ChartCard title={t("aiTitle")} hint={answers?.question ? t("aiAsked", { question: answers.question }) : undefined}>
      {held && answers ? (
        <>
          <CompactList
            rows={answers.engines}
            rowKey={(row) => row.engine}
            density="tight"
            empty={ta("noAnswers")}
            columns={[
              { key: "engine", cell: (row) => <span className="text-[13px] text-foreground">{engineLabel(row.engine)}</span> },
              {
                key: "you",
                align: "right",
                cell: (row) => (!row.answered
                  ? <StatusLabel tone="neutral">{ta("noAnswer")}</StatusLabel>
                  : row.yourPlace !== null
                    ? <StatusLabel tone="success">{ta("namesYou")}</StatusLabel>
                    : <StatusLabel tone="neutral">{ta("doesNotNameYou")}</StatusLabel>),
              },
            ]}
          />
          <OnwardLink href={href}>{t("aiWhoInstead")}</OnwardLink>
        </>
      ) : (
        <>
          <p className="text-[13px] text-secondary">
            {answers?.state === "WAITING" ? t("aiWaiting") : lookup.canLookUp ? t("aiNotYet", { cents: lookup.costs.answers }) : t("aiNotYetReadOnly")}
          </p>
          <OnwardLink href={href}>{t("aiOpen")}</OnwardLink>
        </>
      )}
    </ChartCard>
  );
}
