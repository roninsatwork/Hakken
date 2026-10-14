"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Waypoints } from "lucide-react";
import { useTranslations } from "next-intl";
import { SearchX } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { AI_ASSISTANTS_CHANNEL, DESCRIBED_CHANNELS, GOOGLE_AI_CHANNEL } from "@/convex/utils/aiAssistants";
import { Change } from "@/src/ui/components/screens/Change";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { SiteViewSwitch } from "../../../../sites/_components/SiteViewSwitch";
import { formatNumber, toCsv } from "../../../../sites/_components/siteFormat";
import { useSitePager } from "../../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../../sites/_components/useSiteParam";
import { useSiteSortedList } from "../../../../sites/_components/useSiteSort";
import { FigureCell, MoneyCell } from "../../../_components/AnalyticsCells";
import { pathOf } from "../../../_components/analyticsFormat";
import { useEventName } from "../../../_components/useEventName";
import { AnalyticsGate } from "../../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../../_components/AnalyticsSees";
import { AnalyticsTable } from "../../../_components/AnalyticsListScreen";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, usePeriod } from "../../../_components/useAnalytics";
import { ChannelDayChart, ChannelFigures, ChannelKindBars, ChannelMovers, useKindName, type ChannelDays, type ChannelTop } from "../_components/ChannelParts";
import { KeyEventsDailyChart, SourcesDailyChart } from "../_components/ChannelTableCharts";
import { AssistantFiledBars, AssistantsChart } from "../_components/AssistantParts";

/**
 * A channel's own page (docs/plans/active/ga-channel-pages-plan.md CH2), the
 * same for every channel of any website: What Hakken sees with its Do first
 * steps, four figures, the channel a day against the span before, where it
 * lands by page classification, the pages behind the change, then its table
 * in four views. AI assistants by assistant over time and by how Google
 * filed them in place of the day chart and the pages behind the change, as
 * drawn (CH8). Google Analytics' figures only (CH1).
 */
export default function AnalyticsChannelPage() {
  const t = useTranslations("googleAnalytics.channel");
  const tf = useTranslations("googleAnalytics.filters");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const channel = useSearchParams().get("key") ?? "";
  const assistants = channel === AI_ASSISTANTS_CHANNEL;
  const known = DESCRIBED_CHANNELS.includes(channel) || assistants;
  const currency = status?.connection?.currency ?? null;
  const ready = Boolean(status?.connection?.newestDay) && channel !== "";
  const top = useQuery(api.googleAnalyticsChannelReads.analyticsChannelTop, ready ? { ...args, channel } : "skip");
  const days = useQuery(api.googleAnalyticsChannelReads.analyticsChannelDays, ready ? { ...args, channel } : "skip");
  const kindName = useKindName(top?.kinds);
  const kinds = new Set((top?.kinds ?? []).map((kind) => kind.kind));
  const title = assistants ? t("assistantsTitle") : channel;
  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={{ label: t("back"), href: hrefFor("channels") }}
        icon={<Waypoints className="h-5 w-5 text-brand" />}
        title={title}
        description={t(known ? `description.${channel.replace(/\s+/g, "")}` : "description.other", { host: status?.host ?? "", before: tf(`before.${period}`) })}
      />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <div className="flex flex-col gap-4">
            <AnalyticsSees screen="channelPage" seen={top?.seen} currency={currency} names={(value) => (kinds.has(value) ? kindName(value) : null)} />
            <ChannelFigures figures={top?.figures ?? null} assistants={assistants} />
            {assistants ? (
              // AI assistants by assistant over time, where they land, and how Google filed each (CH8).
              <>
                <AssistantsChart days={days} />
                <ChannelKindBars channel={title} top={top} assistants />
                <AssistantFiledBars top={top} />
              </>
            ) : (
              <>
                <ChannelDayChart channel={title} days={days} />
                <ChannelKindBars channel={title} top={top} />
                <ChannelMovers channel={title} top={top} />
              </>
            )}
            <ChannelTableViews channel={channel} top={top} days={days} kindName={kindName} />
          </div>
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

const VIEWS = ["pages", "groups", "events", "sources"] as const;
type View = (typeof VIEWS)[number];
/** AI assistants open on their assistants (CH8). */
const ASSISTANT_VIEWS: readonly View[] = ["sources", "pages", "groups", "events"];
/** The channels Google files assistants under, for AI assistants' "Filed as" filter. */
const FILED_AS = [GOOGLE_AI_CHANNEL, "Referral", "Unassigned"] as const;
const EVERY = "all";
const COUNTED = ["all", "counted", "uncounted"] as const;
type Counted = (typeof COUNTED)[number];

/**
 * A channel's table (docs/plans/active/ga-channel-pages-plan.md CH7): the
 * standard controls row — the search box, then filter chips, then the view
 * switch — and four views: its landing pages, its classifications, every key
 * event of the property, and its sources. A channel with one source, as
 * Direct, has no Sources view. Landing pages and classifications are every
 * device's, as they are kept.
 */
function ChannelTableViews({ channel, top, days, kindName }: {
  channel: string;
  top: ChannelTop | undefined;
  days: ChannelDays | undefined;
  kindName: (kind: string) => string;
}) {
  const t = useTranslations("googleAnalytics.channelPage.table");
  const hrefFor = useAnalyticsHref(useAnalyticsSiteId());
  const assistants = channel === AI_ASSISTANTS_CHANNEL;
  const manySources = (days?.sources.length ?? 0) > 1 || days?.rest === true || assistants;
  const views = (assistants ? ASSISTANT_VIEWS : VIEWS).filter((view) => view !== "sources" || manySources);
  const [chosen, setView] = useSiteParam<View>("view", views[0], VIEWS);
  const view: View = views.includes(chosen) ? chosen : "pages";
  const [group, setGroup] = useSiteParam<string>("group", EVERY);
  const [filed, setFiled] = useSiteParam<string>("filed", EVERY, [EVERY, ...FILED_AS]);
  const [counted, setCounted] = useSiteParam<Counted>("counted", EVERY, COUNTED);
  const kinds = top?.kinds ?? [];
  const switcher = (
    <SiteViewSwitch
      label={t("viewLabel")}
      options={views.map((value) => ({ value, label: t(`views.${value === "sources" && assistants ? "assistants" : value}`) }))}
      value={view}
      onChange={setView}
    />
  );
  const filters = (chips: ReactNode) => <div className="flex flex-wrap items-center gap-3">{chips}{switcher}</div>;
  if (view === "events") return <KeyEventsTable channel={channel} counted={counted} setCounted={setCounted} filters={filters} days={days} />;
  if (view === "sources") {
    return (
      <div className="flex flex-col gap-4">
        {/* AI assistants' are drawn by assistant above, as columns (CH8). */}
        {assistants ? null : <SourcesDailyChart channel={channel} days={days} />}
        <AnalyticsTable
          key="sources"
          list="source"
          channel={channel}
          {...(assistants && filed !== EVERY ? { filed } : {})}
          noun={assistants ? "assistants" : "sources"}
          searchPlaceholder={assistants ? t("findAssistant") : t("findSource")}
          filters={filters(assistants ? (
            <Select aria-label={t("filedAs")} value={filed} onChange={setFiled} chip={{ label: t("filedAs"), choice: filed === EVERY ? null : filed }}>
              <option value={EVERY}>{t("everyChannel")}</option>
              {FILED_AS.map((one) => <option key={one} value={one}>{one}</option>)}
            </Select>
          ) : null)}
          emptyLabel={t("empty")}
        />
      </div>
    );
  }
  const ofChannel = { visits: top?.figures?.visits ?? 0, kindName };
  if (view === "groups") {
    return (
      <AnalyticsTable
        key="groups"
        list="groups"
        channel={channel}
        ofChannel={ofChannel}
        noun="classifications"
        opening="visits"
        searchPlaceholder={t("findClassification")}
        filters={filters(null)}
        emptyLabel={t("empty")}
      />
    );
  }
  const chosenGroup = group !== EVERY && kinds.some((kind) => kind.kind === group) ? group : null;
  return (
    <AnalyticsTable
      key="pages"
      list="landing"
      channel={channel}
      ofChannel={ofChannel}
      {...(chosenGroup ? { group: chosenGroup } : {})}
      noun="landingPages"
      opening="visits"
      searchPlaceholder={t("findPage")}
      rowHref={(row) => (row.key.startsWith("~") ? hrefFor("landing-pages/page", { key: row.key }) : null)}
      filters={filters(kinds.length > 0 ? (
        <Select aria-label={t("classification")} value={chosenGroup ?? EVERY} onChange={setGroup} chip={{ label: t("classification"), choice: chosenGroup ? kindName(chosenGroup) : null }}>
          <option value={EVERY}>{t("everyClassification")}</option>
          {kinds.map((kind) => <option key={kind.kind} value={kind.kind}>{kindName(kind.kind)}</option>)}
        </Select>
      ) : null)}
      emptyLabel={t("empty")}
    />
  );
}

type EventRow = NonNullable<ReturnType<typeof useEventRows>>[number];

/** The channel's key events; undefined while on their way. */
function useEventRows(channel: string) {
  const args = useAnalyticsArgs();
  const status = useAnalyticsStatus();
  const answer = useQuery(api.googleAnalyticsChannelReads.analyticsChannelEvents, status?.connection?.newestDay ? { ...args, channel } : "skip");
  return answer?.rows;
}

const EVENT_SORTS = {
  name: { value: (row: EventRow & { name: string }) => row.name, first: "asc" as const },
  times: { value: (row: EventRow) => row.count, first: "desc" as const },
  change: { value: (row: EventRow) => (row.countBefore === null ? null : row.count - row.countBefore), first: "desc" as const },
  value: { value: (row: EventRow) => row.value, first: "desc" as const },
};

/**
 * Every key event of the property for the channel (CH7): counted as a
 * conversion or not, with zeros shown — its times, the move on the span
 * before, the value of those counted, and the pages those visits landed on
 * most — under "Key events a day".
 */
function KeyEventsTable({ channel, counted, setCounted, filters, days }: {
  channel: string;
  counted: Counted;
  setCounted: (next: Counted) => void;
  filters: (chips: ReactNode) => ReactNode;
  days: ChannelDays | undefined;
}) {
  const t = useTranslations("googleAnalytics.channelPage.table");
  const tf = useTranslations("googleAnalytics.filters");
  const nameOf = useEventName();
  const status = useAnalyticsStatus();
  const currency = status?.connection?.currency ?? null;
  const [period] = usePeriod();
  const [search, setSearch, settled] = useSiteSearch();
  const all = useEventRows(channel);
  const query = settled.trim().toLowerCase();
  const rows = all
    ?.map((row) => ({ ...row, name: nameOf(row.eventName) }))
    .filter((row) => counted === "all" || (counted === "counted") === row.counted)
    .filter((row) => !query || row.name.toLowerCase().includes(query) || row.eventName.toLowerCase().includes(query));
  const sorted = useSiteSortedList(rows, EVENT_SORTS, { opening: "times", name: (row) => row.name });
  const paged = useSitePager(sorted.rows);
  const chip = (
    <Select aria-label={t("keyEvents")} value={counted} chip={{ label: t("keyEvents"), choice: counted === "all" ? null : t(`counted.${counted}`) }} onChange={(next) => setCounted(next as Counted)}>
      {COUNTED.map((value) => <option key={value} value={value}>{t(`counted.${value}`)}</option>)}
    </Select>
  );
  const csv = () => toCsv(
    [t("columns.event"), t("columns.conversion"), t("columns.times"), t("columns.before"), t("columns.value")],
    (sorted.rows ?? []).map((row) => [row.name, row.counted ? t("isCounted") : t("notCounted"), row.count, row.countBefore, row.value / 100]),
  );
  return (
    <div className="flex flex-col gap-4">
      <KeyEventsDailyChart days={days} />
      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.eventName}
        search={{ value: search, onChange: setSearch, placeholder: t("findEvent") }}
        filters={filters(chip)}
        cardHeader={
          <TableBar footer={paged.footer} noun="keyEvents" actions={<DownloadButton label={t("download")} onClick={() => saveTextFile(csv(), "google-analytics-channel-key-events.csv")} />}>
            <span className="text-[12px] text-secondary">{[tf(`periods.${period}`), tf("devices.all").toLowerCase(), t("everyEvent")].join(" · ")}</span>
          </TableBar>
        }
        empty={{ icon: <SearchX className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch") : t("noEvents") }}
        footer={paged.footer}
        sort={sorted.tableSort}
        columns={[
          { key: "name", header: t("columns.event"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
          { key: "conversion", header: t("columns.conversion"), cell: (row) => <StatusLabel tone={row.counted ? "success" : "neutral"}>{row.counted ? t("isCounted") : t("notCounted")}</StatusLabel> },
          { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.count} /> },
          { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => <Change by={row.countBefore === null || (row.count === 0 && row.countBefore === 0) ? null : row.count - row.countBefore} /> },
          { key: "value", header: t("columns.value"), align: "right", sortable: true, cell: (row) => <MoneyCell value={row.counted ? row.value : null} currency={currency} /> },
          {
            key: "landed",
            header: t("columns.landed"),
            cell: (row) => row.landed.length === 0 ? <span className="text-[12px] text-muted">{t("noneHere")}</span> : (
              <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[12px]">
                {row.landed.map((page) => (
                  <span key={page.address} className="inline-flex items-baseline gap-1">
                    <span className="text-secondary">{pathOf(page.address)}</span>
                    <span className="font-mono text-muted">{formatNumber(page.count)}</span>
                  </span>
                ))}
                {row.landedMore > 0 ? <span className="text-muted">{t("landedMore", { count: row.landedMore })}</span> : null}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
