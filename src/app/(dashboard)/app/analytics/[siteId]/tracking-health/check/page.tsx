"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Activity } from "lucide-react";
import { useTranslations } from "next-intl";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { ListTable } from "@/src/ui/components/screens/ListTable";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { formatLongDate } from "@/src/lib/dates";
import { HEALTH_CHECKS_WITH_STEPS } from "@/convex/utils/sees/analytics";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../../sites/_components/useSiteParam";
import { formatNumber } from "../../../../sites/_components/siteFormat";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { choosableHere, healthResult, useHealthWords, type HealthCheckRow } from "../../../_components/useHealthWords";
import { useEventName } from "../../../_components/useEventName";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../../_components/useAnalytics";

type Check = HealthCheckRow;

/** The checks whose names are events; those whose names are addresses; the one whose names are pages. */
const NAMES_EVENTS = new Set(["NEVER_HAPPENS", "ENQUIRY_UNCOUNTED", "NO_VALUE", "SOMETHING_ELSE", "COUNTED_TWICE"]);
const NAMES_ADDRESSES = new Set(["STRANGERS", "SELF_REFERRAL", "PAYMENT_REFERRALS", "CONVERSIONS_ELSEWHERE"]);
const NAMES_PAGES = new Set(["COUNTED_AGAIN"]);
const RESULT_TONE = { off: "warning", none: "neutral", good: "success" } as const;

/**
 * A Tracking health check's own screen (overview-new-page-plan-2026-11-06.md,
 * step 15), opened from its table: what it found, why it matters, what it
 * affects and how it gets fixed, then what it names. Read from the checks the
 * weekly run keeps: nothing is asked of Google.
 */
export default function AnalyticsTrackingCheckPage() {
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return status ? (
    <AnalyticsGate status={status} siteId={siteId}>
      <CheckBody status={status} />
    </AnalyticsGate>
  ) : null;
}

function CheckBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health");
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const words = useHealthWords(status);
  const key = useSearchParams().get("key") ?? "";
  const health = status.connection?.health ?? null;
  const check = health?.checks.find((one) => one.check === key) ?? null;
  const known = HEALTH_CHECKS_WITH_STEPS.includes(key);
  const said = check ? words(check) : null;
  const shown = check ? healthResult(check) : null;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("screen.back"), href: hrefFor("tracking-health") }}
        icon={<Activity className="h-5 w-5 text-brand" />}
        title={said?.name ?? (known ? t(`checks.${key}.name`) : t("title"))}
        description={known && health ? t("screen.description", { about: t(`checks.${key}.about`), when: formatLongDate(health.checkedAt) }) : undefined}
        pills={shown ? <StatusLabel tone={RESULT_TONE[shown]}>{t(`results.${shown}`)}</StatusLabel> : undefined}
      />
      {!health ? <Notice>{t("notYet")}</Notice> : !check || !said || !known ? <Notice>{t("screen.unknown")}</Notice> : (
        <>
          <CompactList
            rows={[
              { key: "found", label: t("screen.found"), words: said.found },
              { key: "why", label: t("screen.why"), words: said.why },
              { key: "affects", label: t("screen.affects"), words: said.affects },
              ...(check.passing ? [] : [{ key: "fix", label: t("screen.fix"), words: said.fix }]),
            ]}
            rowKey={(row) => row.key}
            empty="–"
            columns={[
              { key: "label", className: "w-[200px] whitespace-nowrap align-top text-[13px] text-secondary", cell: (row) => row.label },
              { key: "words", className: "text-[13px] text-foreground", cell: (row) => row.words },
            ]}
          />
          {!check.passing && (check.names ?? []).length > 0 ? <WhatItNames check={check} status={status} /> : null}
        </>
      )}
    </div>
  );
}

/** What a failing check names: its events, with all of them a press away; its addresses with their figures; or its pages. */
function WhatItNames({ check, status }: { check: Check; status: AnalyticsStatus }) {
  if (NAMES_EVENTS.has(check.check)) return <NamedEvents check={check} status={status} />;
  if (NAMES_ADDRESSES.has(check.check)) return <NamedAddresses check={check} status={status} />;
  if (NAMES_PAGES.has(check.check)) return <NamedPages check={check} />;
  return null;
}

type EventRow = { name: string; words: string; times: number | null };
const SHOW = ["named", "all"] as const;
type Show = (typeof SHOW)[number];

/** A check's events (Anthony, 2026-11-06: "can we have show all and empty"): those it names, or every counted event beside them. */
function NamedEvents({ check, status }: { check: Check; status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health.screen.events");
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const nameOf = useEventName();
  const [show, setShow] = useSiteParam<Show>("show", "named", SHOW);
  const [text, setText, term] = useSiteSearch();
  const held = status.connection?.events ?? [];
  const named = [...new Set([...(check.names ?? []), ...(check.check === "COUNTED_TWICE" ? check.others ?? [] : [])])];
  const timesOf = (name: string) => held.find((event) => event.eventName === name)?.lastThirtyDays ?? null;
  const names = show === "named" ? named : [...new Set([...named, ...held.filter((event) => event.counted).map((event) => event.eventName)])];
  const search = term.toLowerCase();
  const rows: EventRow[] = names
    .map((name) => ({ name, words: nameOf(name), times: timesOf(name) }))
    .filter((row) => !search || `${row.words} ${row.name}`.toLowerCase().includes(search))
    .sort((left, right) => (right.times ?? -1) - (left.times ?? -1));
  const pager = useSitePager(rows, { isLoading: false });
  const canChoose = status.canManage && (check.check !== "ENQUIRY_UNCOUNTED" || choosableHere(check, status));
  return (
    <ListTable<EventRow>
      noun="events"
      title={t("title")}
      rows={pager.pageRows}
      rowKey={(row) => row.name}
      onRowClick={(row) => router.push(hrefFor("events/event", { key: row.name }))}
      actions={canChoose ? <Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>{t("choose")}</Button> : undefined}
      search={{ value: text, onChange: setText, placeholder: t("search") }}
      filters={(
        <Select aria-label={t("show")} value={show} onChange={(next) => setShow(next as Show)} chip={{ label: t("show"), choice: show === "all" ? t("all") : t(`named.${check.check}`) }}>
          <option value="named">{t(`named.${check.check}`)}</option>
          <option value="all">{t("all")}</option>
        </Select>
      )}
      empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: t("empty") }}
      footer={pager.footer}
      columns={[
        { key: "event", header: t("event"), cell: (row) => <span className="text-[13px] text-foreground">{row.words}</span> },
        { key: "google", header: t("google"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.name}</span> },
        { key: "times", header: t("times"), align: "right", cell: (row) => (row.times === null ? <NoFigure /> : <span className="font-mono text-[13px] text-foreground">{formatNumber(row.times)}</span>) },
      ]}
    />
  );
}

/** A check's addresses, each with its visits, or its events for a check about events on other addresses, as the weekly run counted them. */
function NamedAddresses({ check, status }: { check: Check; status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.health.screen.addresses");
  const [text, setText, term] = useSiteSearch();
  const elsewhere = check.check === "CONVERSIONS_ELSEWHERE";
  const figures = new Map(elsewhere
    ? (status.connection?.hostConversions ?? []).map((one) => [one.host, one.conversions])
    : (status.connection?.hostVisits ?? []).map((one) => [one.host, one.visits]));
  const counted = check.check === "STRANGERS" || elsewhere;
  const search = term.toLowerCase();
  const rows = (check.names ?? [])
    .filter((name) => !search || name.toLowerCase().includes(search))
    .sort((left, right) => (figures.get(right) ?? 0) - (figures.get(left) ?? 0));
  const pager = useSitePager(rows, { isLoading: false });
  return (
    <ListTable<string>
      noun="addresses"
      title={t("title")}
      rows={pager.pageRows}
      rowKey={(name) => name}
      search={{ value: text, onChange: setText, placeholder: t("search") }}
      empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: t("empty") }}
      footer={pager.footer}
      columns={[
        { key: "address", header: t("address"), cell: (name) => <span className="text-[13px] text-foreground">{name}</span> },
        ...(counted ? [{
          key: "figure",
          header: elsewhere ? t("events") : t("visits"),
          align: "right" as const,
          cell: (name: string) => (figures.has(name) ? <span className="font-mono text-[13px] text-foreground">{formatNumber(figures.get(name) ?? 0)}</span> : <NoFigure />),
        }] : []),
      ]}
    />
  );
}

/** The pages Google Analytics counts most often in one visit. The check keeps the worst few, not them all. */
function NamedPages({ check }: { check: Check }) {
  const t = useTranslations("googleAnalytics.health.screen.pages");
  const [text, setText, term] = useSiteSearch();
  const search = term.toLowerCase();
  const rows = (check.names ?? []).filter((name) => !search || name.toLowerCase().includes(search));
  const pager = useSitePager(rows, { isLoading: false });
  return (
    <ListTable<string>
      noun="pages"
      title={t("title")}
      rows={pager.pageRows}
      rowKey={(name) => name}
      search={{ value: text, onChange: setText, placeholder: t("search") }}
      empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: t("empty") }}
      footer={pager.footer}
      columns={[{ key: "page", header: t("page"), cell: (name) => <span className="font-mono text-[12px] text-foreground">{name}</span> }]}
    />
  );
}
