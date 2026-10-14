"use client";

import { useConvex, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { toCsv } from "../../../sites/_components/siteFormat";
import { useSiteListPage } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSort } from "../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { ChangeCell, FigureCell, MoneyCell } from "../../_components/AnalyticsCells";
import { ChannelsChart, TopBars } from "../../_components/AnalyticsChart";
import { BeforeLine } from "../../_components/AnalyticsFigures";
import { formatMoney, formatPercent } from "../../_components/analyticsFormat";
import { formatNumber } from "../../../sites/_components/siteFormat";
import { useAnalyticsArgs, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePeriod, type AnalyticsStatus } from "../../_components/useAnalytics";

type Product = FunctionReturnType<typeof api.googleAnalyticsProductReads.analyticsProductList>["rows"][number];

/** Which way each heading's first press runs: the most first, names A to Z. */
const FIRSTS = { name: "asc", looks: "desc", basket: "desc", bought: "desc", revenue: "desc", change: "desc" } as const;

/**
 * Products (GA34; §18.2 board 25): what each product sold, and how far
 * shoppers got with it — looked, added it to the basket, started checkout,
 * bought. What Hakken sees, the shop's four steps as figures and bars, the
 * products bought a day, and each product's looks, basket, bought, revenue
 * and change, with a Category filter. Only for a website that is a shop,
 * found by itself (§18.6.6); one device's lists asked of Google when the
 * screen opens.
 */
export default function AnalyticsProductsPage() {
  const t = useTranslations("googleAnalytics.products");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<ShoppingBag className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          {status.connection?.shop ? <ProductsBody status={status} /> : <Notice>{t("notAShop", { host: status.host })}</Notice>}
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function ProductsBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.products");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const [device] = useDevice();
  const currency = status.connection?.currency ?? null;
  const answer = useQuery(api.googleAnalyticsProductReads.analyticsProducts, args);
  // Any category in the address: the list holds it to the shop's own (`analyticsProductList`).
  const [category, setCategory] = useSiteParam<string>("category", "");
  const [search, setSearch, settled] = useSiteSearch();
  const order = useSiteSort(FIRSTS, "revenue");
  const listArgs = { ...args, ...(category ? { category } : {}), ...(settled ? { q: settled } : {}), sort: order.key, direction: order.direction };
  const paged = useSiteListPage(api.googleAnalyticsProductReads.analyticsProductList, listArgs);
  const steps = answer?.steps ?? null;
  const before = answer?.before ?? null;
  const periodName = tf(`periods.${period}`);
  const of = (part: number, whole: number) => (whole > 0 ? formatPercent(Math.min(1, part / whole)) : "–");
  const bar = [periodName, tf(`devices.${device}`).toLowerCase()].join(" · ");

  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="products" seen={answer?.seen} currency={currency} />
      {answer?.preparing ? <Notice>{t("preparing")}</Notice> : null}
      {steps ? (
        <FigureRow columns={4}>
          <Figure label={t("steps.looked")} value={formatNumber(steps.looked)} detail={<BeforeLine now={steps.looked} before={before?.looked} />} />
          <Figure
            label={t("steps.basket")}
            value={formatNumber(steps.basket)}
            detail={<span className="flex flex-col"><span className="text-secondary">{t("ofLooks", { rate: of(steps.basket, steps.looked) })}</span><BeforeLine now={steps.basket} before={before?.basket} /></span>}
          />
          <Figure
            label={t("steps.checkout")}
            value={formatNumber(steps.checkout)}
            detail={<span className="flex flex-col"><span className="text-secondary">{t("ofBaskets", { rate: of(steps.checkout, steps.basket) })}</span><BeforeLine now={steps.checkout} before={before?.checkout} /></span>}
          />
          <Figure
            label={t("steps.bought")}
            value={formatNumber(steps.bought)}
            detail={(
              <span className="flex flex-col">
                <span className="text-secondary">{t("ofCheckouts", { rate: of(steps.bought, steps.checkout), revenue: formatMoney(steps.revenue, currency) })}</span>
                <BeforeLine now={steps.bought} before={before?.bought} />
              </span>
            )}
          />
        </FigureRow>
      ) : null}
      <TopBars
        title={t("stepsTitle")}
        hint={t("stepsHint", { period: periodName.toLowerCase() })}
        rows={steps ? (["looked", "basket", "checkout", "bought"] as const).map((step) => ({ label: t(`steps.${step}`), value: steps[step] })) : undefined}
        measure={t("times")}
        exportName="google-analytics-shop-steps"
        host={status.host}
        from={null}
        to={null}
      />
      <ChannelsChart
        channels={[t("bought")]}
        rest={false}
        points={(answer?.points ?? []).map((point) => ({ day: point.day, lastDay: point.lastDay, visits: [point.bought] }))}
        host={status.host}
        from={null}
        to={null}
        exportName="google-analytics-products-bought"
        title={{ ...t.raw("chartTitle") as { day: string; week: string; month: string }, hint: t("chartHint", { period: periodName }) }}
      />
      <DataTable
        rows={paged.pageRows}
        rowKey={(row) => row.key}
        search={{ value: search, onChange: setSearch, placeholder: t("findProduct") }}
        filters={(answer?.categories.length ?? 0) > 0 ? (
          <Select chip={{ label: t("categoryFilter"), choice: category || null }} value={category} onChange={(value) => setCategory(value)}>
            <option value="">{t("everyCategory")}</option>
            {answer?.categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
          </Select>
        ) : undefined}
        cardHeader={
          <TableBar footer={paged.footer} noun="products" actions={<ProductsDownload args={listArgs} currency={currency} host={status.host} />}>
            <span className="text-[12px] text-secondary">{paged.result?.live ? t("collecting") : bar}</span>
          </TableBar>
        }
        sort={order.tableSort}
        empty={{ icon: <ShoppingBag className="h-8 w-8 text-muted/30" />, label: settled || category ? t("noMatch") : t("empty") }}
        footer={paged.footer}
        columns={[
          {
            key: "name",
            header: t("columns.product"),
            sortable: true,
            className: CUT_COLUMN.first,
            cell: (row: Product) => (
              <span className="flex min-w-0 flex-col">
                <span className="block truncate text-[13px] text-foreground" title={row.name}>{row.name}</span>
                {row.category && !/^\(.*\)$/.test(row.category) ? <span className="block truncate text-[12px] text-muted">{row.category}</span> : null}
              </span>
            ),
          },
          { key: "looks", header: t("columns.looks"), align: "right", sortable: true, cell: (row: Product) => <FigureCell value={row.looks} /> },
          { key: "basket", header: t("columns.basket"), align: "right", sortable: true, cell: (row: Product) => <FigureCell value={row.basket} /> },
          { key: "bought", header: t("columns.bought"), align: "right", sortable: true, cell: (row: Product) => <FigureCell value={row.bought} /> },
          { key: "revenue", header: t("columns.revenue"), align: "right", sortable: true, cell: (row: Product) => <MoneyCell value={row.revenue} currency={currency} /> },
          { key: "change", header: <span title={t("columns.changeTitle")}>{t("columns.change")}</span>, align: "right", sortable: true, cell: (row: Product) => <ChangeCell change={row.change} /> },
        ]}
      />
    </div>
  );
}

/** Every product, in the order on screen, as CSV: read when pressed. */
function ProductsDownload({ args, currency, host }: {
  args: Parameters<typeof useSiteListPage<typeof api.googleAnalyticsProductReads.analyticsProductList>>[1];
  currency: string | null;
  host: string;
}) {
  const t = useTranslations("googleAnalytics.products");
  const convex = useConvex();
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-products-download" });
  if (args === "skip") return null;
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={isBusy()}
      onClick={async () => {
        const outcome = await run(() => convex.query(api.googleAnalyticsProductReads.analyticsProductListAll, args), { fallbackMessage: t("downloadFailed") });
        if (!outcome.ok) return;
        const headers = [t("columns.product"), t("csv.category"), t("columns.looks"), t("columns.basket"), t("columns.bought"), t("csv.revenue", { currency: currency ?? "" }), t("csv.change")];
        const rows = outcome.data.rows.map((row) => [row.name, row.category, row.looks, row.basket, row.bought, row.revenue / 100, row.change === null ? null : Math.round(row.change * 1000) / 10]);
        saveTextFile(toCsv(headers, rows), `${host}-google-analytics-products.csv`);
      }}
    />
  );
}
