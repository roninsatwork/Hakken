"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { HandCoins, TriangleAlert } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { Button } from "@/src/ui/components/screens/Button";
import { Select } from "@/src/ui/components/screens/Select";
import { Change } from "@/src/ui/components/screens/Change";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useSitePager } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../sites/_components/useSiteSort";
import { AnalyticsGate, NothingCounted, countsAnything } from "../../_components/AnalyticsNotices";
import { BeforeLine } from "../../_components/AnalyticsFigures";
import { ConversionsChart } from "../../_components/AnalyticsChart";
import { AnalyticsPanel, TopList } from "../../_components/AnalyticsPanels";
import { changeOf, formatMoney, formatPercent } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";

type Kind = FunctionReturnType<typeof api.googleAnalyticsReads.analyticsConversions>["kinds"][number];

const SORTS: SiteSortColumns<Kind & { name: string }, "name" | "event" | "count" | "each" | "value" | "change"> = {
  name: { value: (row) => row.name, first: "asc" },
  event: { value: (row) => row.eventName, first: "asc" },
  count: { value: (row) => row.count, first: "desc" },
  each: { value: (row) => row.each, first: "desc" },
  value: { value: (row) => row.value, first: "desc" },
  change: { value: (row) => (row.countBefore === null ? null : row.count - row.countBefore), first: "desc" },
};

const EVERY = "all";

/**
 * Conversions (§5; §11 boards 7 and 8): each thing the website counts as a
 * conversion, over time and with its value, then the landing pages and
 * channels that brought them; for a shop, its revenue, purchases and average
 * order first (GA7). Nothing counted yet says how to choose (§11 board 18).
 */
export default function AnalyticsConversionsPage() {
  const t = useTranslations("googleAnalytics.conversions");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<HandCoins className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          {countsAnything(status) ? <ConversionsBody status={status} /> : <NothingCounted status={status} siteId={siteId} />}
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function ConversionsBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.conversions");
  const tt = useTranslations("googleAnalytics.table");
  const router = useRouter();
  const args = useAnalyticsArgs();
  const hrefFor = useAnalyticsHref(args.siteId);
  const nameOf = useEventName();
  const answer = useQuery(api.googleAnalyticsReads.analyticsConversions, args);
  const chart = useQuery(api.googleAnalyticsReads.analyticsChart, args);
  const [chosen, setChosen] = useSiteParam<string>("conversion", EVERY);
  const eventArg = chosen === EVERY ? {} : { eventName: chosen };
  const landing = useQuery(api.googleAnalyticsReads.analyticsTopList, { ...args, list: "landing", ...eventArg });
  const channels = useQuery(api.googleAnalyticsReads.analyticsTopList, { ...args, list: "channel", ...eventArg });
  const currency = status.connection?.currency ?? null;
  const [search, setSearch, settled] = useSiteSearch();
  const matches = wordStartMatcher(settled.toLowerCase());
  const named = answer?.kinds.map((kind) => ({ ...kind, name: nameOf(kind.eventName) }));
  const rows = named?.filter((row) => !matches || matches(row.name, row.eventName));
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "value", name: (row) => row.name });
  const paged = useSitePager(sorted, { isLoading: sorted === undefined });
  const shop = answer?.shop ?? null;
  const total = (answer?.kinds ?? []).reduce((sum, kind) => sum + kind.count, 0);
  const totalBefore = answer?.kinds.every((kind) => kind.countBefore !== null) ? answer.kinds.reduce((sum, kind) => sum + (kind.countBefore ?? 0), 0) : null;
  const value = (answer?.kinds ?? []).reduce((sum, kind) => sum + (kind.value ?? 0), 0);
  const valueBefore = answer?.kinds.every((kind) => kind.setIn === null || kind.valueBefore !== null)
    ? answer.kinds.reduce((sum, kind) => sum + (kind.valueBefore ?? 0), 0)
    : null;
  const unvalued = (answer?.kinds ?? []).filter((kind) => kind.setIn === null && kind.count > 0);
  const rate = answer && answer.visits > 0 ? total / answer.visits : null;
  const rateBefore = answer?.visitsBefore && totalBefore !== null ? totalBefore / answer.visitsBefore : null;
  const others = (answer?.kinds ?? []).filter((kind) => kind.setIn !== "REVENUE");
  const sales = shop !== null && shop.purchases > 0;
  const page = (row: { key: string }) => (row.key.startsWith("~") ? hrefFor("landing-pages/page", { key: row.key }) : null);

  return (
    <div className="flex flex-col gap-6">
      {answer ? (
        sales && shop ? (
          <FigureRow>
            <Figure label={t("revenue")} emphasis value={formatMoney(shop.revenue, currency)} detail={<BeforeLine now={shop.revenue} before={shop.revenueBefore} />} />
            <Figure label={t("purchases")} value={formatNumber(shop.purchases)} detail={<BeforeLine now={shop.purchases} before={shop.purchasesBefore} />} />
            <Figure
              label={t("averageOrder")}
              value={formatMoney(Math.round(shop.revenue / shop.purchases), currency)}
              detail={<BeforeLine now={shop.revenue / shop.purchases} before={shop.purchasesBefore ? (shop.revenueBefore ?? 0) / shop.purchasesBefore : null} />}
            />
            {others[0] ? (
              <Figure
                label={nameOf(others[0].eventName)}
                value={formatNumber(others[0].count)}
                detail={<span className="text-[12px] text-secondary">{formatMoney(others[0].value, currency)} · <Change by={changeOf(others[0].count, others[0].countBefore) === null ? null : Math.round(changeOf(others[0].count, others[0].countBefore)! * 1000) / 10} format={(by) => `${by.toFixed(1)}%`} /></span>}
              />
            ) : <Figure label={t("conversionRate")} value={formatPercent(rate)} detail={t("ofVisits", { visits: formatNumber(answer.visits) })} />}
          </FigureRow>
        ) : (
          <FigureRow>
            <Figure label={t("conversions")} value={formatNumber(total)} detail={<BeforeLine now={total} before={totalBefore} />} />
            <Figure label={t("value")} emphasis value={formatMoney(value, currency)} detail={<BeforeLine now={value} before={answer.visitsBefore === null ? null : valueBefore} />} />
            <Figure
              label={t("conversionRate")}
              value={formatPercent(rate)}
              detail={(
                <span className="text-[12px] text-secondary">
                  {t("ofVisits", { visits: formatNumber(answer.visits) })}
                  {rate !== null && rateBefore !== null ? <> · <Change by={Math.round((rate - rateBefore) * 10_000) / 100} format={(by) => t("points", { points: by.toFixed(2) })} /></> : null}
                </span>
              )}
            />
            <Figure
              label={t("withoutValue")}
              href={unvalued.length > 0 && status.canManage ? hrefFor("connection", { change: "1" }) : undefined}
              value={formatNumber(unvalued.reduce((sum, kind) => sum + kind.count, 0))}
              detail={unvalued.length > 0 ? t("setValue", { names: unvalued.map((kind) => nameOf(kind.eventName)).join(", ") }) : t("allValued")}
            />
          </FigureRow>
        )
      ) : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      <ConversionsChart
        days={chart?.points ?? []}
        events={chart?.events ?? []}
        names={nameOf}
        host={status.host}
        from={answer?.from ?? null}
        to={answer?.to ?? null}
        currency={currency}
      />

      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.eventName}
        search={{ value: search, onChange: setSearch, placeholder: t("findConversion") }}
        cardHeader={
          <TableBar
            footer={paged.footer}
            noun="conversionKinds"
            actions={status.canManage ? <Button variant="quiet" className="px-3 py-2 text-[12px]" onClick={() => router.push(hrefFor("connection", { change: "1" }))}>{t("changeWhatCounts")}</Button> : null}
          >
            <span className="text-[12px] text-secondary">{t("chosenOnConnection")}</span>
          </TableBar>
        }
        empty={{ icon: <HandCoins className="h-8 w-8 text-muted/30" />, label: settled ? tt("noMatch") : t("empty") }}
        footer={paged.footer}
        sort={tableSort}
        columns={[
          { key: "name", header: t("columns.conversion"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
          { key: "event", header: t("columns.event"), sortable: true, cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.eventName}</span> },
          { key: "count", header: t("columns.howMany"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.count)}</span> },
          {
            key: "each",
            header: t("columns.valueEach"),
            align: "right",
            sortable: true,
            cell: (row) => (row.setIn === null ? (
              <span className="inline-flex items-center gap-1.5 text-[12px] text-secondary"><TriangleAlert className="h-3.5 w-3.5 text-warning" aria-hidden="true" />{t("noValue")}</span>
            ) : (
              <span className="flex flex-col items-end leading-tight">
                <span className="font-mono text-[12px] text-secondary">{formatMoney(row.each, currency)}</span>
                <span className="text-[11.5px] text-muted">{t(`setIn.${row.setIn}`)}</span>
              </span>
            )),
          },
          { key: "value", header: t("columns.value"), align: "right", sortable: true, cell: (row) => (row.value ? <span className="font-mono text-[12px] text-secondary">{formatMoney(row.value, currency)}</span> : <NoFigure />) },
          { key: "change", header: t("columns.change"), align: "right", sortable: true, cell: (row) => <Change by={row.countBefore === null ? null : row.count - row.countBefore} same /> },
        ]}
      />

      <div className="flex flex-wrap items-center gap-3">
        <Select aria-label={t("conversionPicker")} value={chosen} onChange={setChosen} chip={{ label: t("conversionPicker"), choice: chosen === EVERY ? null : nameOf(chosen) }}>
          <option value={EVERY}>{t("everyConversion")}</option>
          {(answer?.kinds ?? []).map((kind) => <option key={kind.eventName} value={kind.eventName}>{nameOf(kind.eventName)}</option>)}
        </Select>
        <span className="text-[12.5px] text-secondary">{t("whereFrom")}</span>
      </div>

      <AnalyticsPanel title={sales ? t("landingSalesTitle") : t("landingTitle")} description={sales ? t("landingSalesDescription") : t("landingDescription")} seeAll={{ href: hrefFor("landing-pages"), label: t("seeEveryLandingPage") }}>
        <TopList rows={landing?.rows} kind="page" currency={currency} pageHref={page} showVisits={false} sales={sales && chosen === EVERY} empty={landing?.live ? t("landingLive") : t("noneBrought")} />
      </AnalyticsPanel>
      <AnalyticsPanel title={sales ? t("channelsSalesTitle") : t("channelsTitle")} description={sales ? t("channelsSalesDescription") : t("channelsDescription")} seeAll={{ href: hrefFor("channels"), label: t("seeEveryChannel") }}>
        <TopList rows={channels?.rows} kind="channel" currency={currency} showVisits={false} sales={sales && chosen === EVERY} empty={t("noneBrought")} />
      </AnalyticsPanel>
    </div>
  );
}
