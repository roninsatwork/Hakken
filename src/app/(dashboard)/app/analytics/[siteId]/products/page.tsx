"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { ShoppingBag } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useCanWriteHere } from "@/src/ui/components/screens/AccessLevel";
import { useSeesPart } from "@/src/ui/components/screens/hakkenSeesStore";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Meter } from "@/src/ui/components/screens/Meter";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";
import { SiteViewSwitch } from "../../../sites/_components/SiteViewSwitch";
import { formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { useSiteListPage } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSort } from "../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { FigureCell } from "../../_components/AnalyticsCells";
import { BeforeLine, PerVisitLine } from "../../_components/AnalyticsFigures";
import { formatPercent } from "../../_components/analyticsFormat";
import { useEventName } from "../../_components/useEventName";
import { leftWithout } from "@/convex/utils/sees/analyticsProducts";
import { periodWord, useAnalyticsArgs, useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, useDevice, usePageHref, usePeriod, type AnalyticsStatus } from "../../_components/useAnalytics";
import { BoughtOrLeftChart, ProductsChart, eventFigures, type ShopChoice } from "./_components/ProductsCharts";

type Answer = NonNullable<FunctionReturnType<typeof api.googleAnalyticsProductReads.analyticsProducts>>;
type Shown = FunctionReturnType<typeof api.googleAnalyticsProductReads.analyticsProductList>["rows"][number];

/** Which way each heading's first press runs: the most first, names A to Z. */
const FIRSTS = { name: "asc", itemsBought: "desc", share: "desc", itemsAdded: "desc" } as const;
const TABLE_VIEWS = ["products", "categories"] as const;
type TableView = (typeof TABLE_VIEWS)[number];
const SHOWS = ["all", "selling", "notBought"] as const;
type Show = (typeof SHOWS)[number];

/** Google's own names for a basket, a checkout and a purchase: the steps whose boxes are named so. */
const BASKET = "add_to_cart";
const CHECKOUT = "begin_checkout";
const PURCHASE = "purchase";

/**
 * Products, as board "4 · Your products" of the canvas "Products page, three ways" draws it
 * (docs/plans/active/products-screen-4-plan-2026-11-02.md, phase 3): the header; four boxes, each against the period
 * before — the baskets left behind, the checkouts not finished, the visits that bought and the products added and never
 * bought; Bought or left behind, its steps and sale picked from the shop's own events; the products chart; and the
 * products table, by product or category. Visits and items, never money: not every Google Analytics account records
 * revenue (Anthony, 2026-11-02). Only for a website that is a shop, found by itself (§18.6.6).
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
  const args = useAnalyticsArgs();
  const answer = useQuery(api.googleAnalyticsProductReads.analyticsProducts, args);
  const canWrite = useCanWriteHere();
  const save = useMutation(api.googleAnalyticsShopSteps.saveShopSteps);
  const { run } = useAdminAction({ scope: "google-analytics-shop-steps" });
  // A pick shows at once, for the boxes and the chart alike; saved for the company when the viewer may change it.
  const [picked, setPicked] = useState<ShopChoice | null>(null);
  const choice: ShopChoice | null = picked ?? (answer ? { steps: answer.choice.steps, sale: answer.choice.sale } : null);
  const pick = (next: ShopChoice) => {
    setPicked(next);
    const sale = next.sale;
    if (canWrite && sale) void run(() => save({ siteId: args.siteId, steps: next.steps, sale }), { fallbackMessage: t("steps.saveFailed") });
  };
  const nameOf = useEventName();
  // What the eye reads: the boxes and the steps as shown, the same object until the figures or the pick change. The
  // events' words change only with the language, which reloads the page.
  const seesData = useMemo(
    () => (answer ? productsSeesData(answer, picked ?? { steps: answer.choice.steps, sale: answer.choice.sale }, nameOf, t("neverBought")) : undefined),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [answer, picked],
  );
  // Where the team's "Do first" steps may send the reader: a product's page among All pages, and how people reach the shop.
  const hrefFor = useAnalyticsHref(args.siteId);
  const tm = useTranslations("googleAnalytics.menu");
  const links = useMemo(() => [
    { label: tm("allPages"), href: hrefFor("all-pages") },
    { label: tm("landingPages"), href: hrefFor("funnel") },
    { label: tm("channels"), href: hrefFor("channels") },
    { label: tm("conversions"), href: hrefFor("conversions") },
  ], [hrefFor, tm]);
  return (
    <div className="flex flex-col gap-6">
      <AnalyticsSees screen="products" seen={answer?.seen} currency={null} data={seesData} links={links} />
      {answer?.preparing ? <Notice>{t("preparing")}</Notice> : null}
      {answer && choice ? (
        <>
          <ShopBoxes answer={answer} choice={choice} />
          <BoughtOrLeftChart answer={answer} choice={choice} onPick={pick} host={status.host} />
          <ProductsChart categories={answer.categories} host={status.host} />
        </>
      ) : null}
      <ProductsTable categories={answer?.categories ?? []} host={status.host} />
    </div>
  );
}

/**
 * What the eye reads of Products (page-screen-redo-plan-2026-11-03.md, step 3): only what the screen shows, under the
 * measures' names (`convex/utils/sees/measures.ts`), so code finds what moved — the four boxes against the period
 * before; the steps the shop picked, a funnel and never a whole (`picked`). The charts and the table hand their own
 * rows (`useSeesPart`). Visits, items and products, never money; never every event the shop records.
 */
function productsSeesData(answer: Answer, choice: ShopChoice, nameOf: (eventName: string) => string, neverBoughtName: string) {
  const figureOf = eventFigures(answer);
  const steps = choice.steps.map(figureOf).sort((left, right) => right.visits - left.visits);
  const sale = choice.sale ? figureOf(choice.sale) : null;
  // The visits left after each of the first two steps, as the boxes count them, where they are Google's basket and checkout.
  const leftAt = (eventName: string) => {
    const step = steps.slice(0, 2).find((one) => one.eventName === eventName);
    if (!step || !sale) return null;
    const before = step.visitsBefore !== null && sale.visitsBefore !== null ? Math.max(0, step.visitsBefore - sale.visitsBefore) : null;
    return { now: Math.max(0, step.visits - sale.visits), before };
  };
  const baskets = leftAt(BASKET);
  const checkouts = leftAt(CHECKOUT);
  return {
    boxes: {
      ...(baskets ? { basketsLeft: baskets.now, basketsLeftBefore: baskets.before } : {}),
      ...(checkouts ? { checkoutsLeft: checkouts.now, checkoutsLeftBefore: checkouts.before } : {}),
      ...(sale ? { sale: nameOf(sale.eventName), visitsThatBought: sale.visits, visitsThatBoughtBefore: sale.visitsBefore } : {}),
      productsNeverBought: answer.neverBought.count, productsNeverBoughtBefore: answer.neverBought.countBefore, productsAdded: answer.neverBought.of, neverBoughtName,
    },
    steps: {
      picked: true,
      rows: steps.map((step) => ({ name: nameOf(step.eventName), visits: step.visits, visitsBefore: step.visitsBefore, visitsThatBought: sale ? Math.min(sale.visits, step.visits) : 0, visitsLeft: sale ? Math.max(0, step.visits - sale.visits) : step.visits })),
    },
  };
}

/**
 * The four boxes, from the same steps and sale as the chart beneath them, so the two always agree: the visits left
 * after the first two steps, named as baskets and checkouts where they are Google's own; the visits with the sale; and
 * the products put in a basket and never bought. Each against the period before.
 */
function ShopBoxes({ answer, choice }: { answer: Answer; choice: ShopChoice }) {
  const t = useTranslations("googleAnalytics.products");
  const nameOf = useEventName();
  const figureOf = eventFigures(answer);
  const steps = choice.steps.map(figureOf).sort((left, right) => right.visits - left.visits);
  if (choice.sale === null || steps.length === 0) return <Notice>{t("pickSteps")}</Notice>;
  const sale = figureOf(choice.sale);
  const saleName = nameOf(sale.eventName);
  const of = (part: number, whole: number) => (whole > 0 ? formatPercent(Math.min(1, part / whole)) : "–");
  const inPoints = (value: number) => (value * 100).toFixed(1);
  const left = (step: (typeof steps)[number]) => {
    const share = leftWithout(step.visits, sale.visits);
    const before = step.visitsBefore !== null && sale.visitsBefore !== null ? leftWithout(step.visitsBefore, sale.visitsBefore) : null;
    const rate = share === null ? "–" : formatPercent(share);
    const label = step.eventName === BASKET ? t("basketsLeft") : step.eventName === CHECKOUT ? t("checkoutsLeft") : t("stepLeft", { step: nameOf(step.eventName) });
    const words = step.eventName === BASKET ? t("basketsLeftDetail", { rate }) : step.eventName === CHECKOUT ? t("checkoutsLeftDetail", { rate }) : t("stepLeftDetail", { rate, step: nameOf(step.eventName), sale: saleName });
    return (
      <Figure
        key={step.eventName}
        label={label}
        value={formatNumber(Math.max(0, step.visits - sale.visits))}
        detail={<span className="flex flex-col"><span className="text-secondary">{words}</span><PerVisitLine now={share} before={before} format={inPoints} points lowerIsBetter /></span>}
      />
    );
  };
  const first = steps[0];
  const never = answer.neverBought;
  return (
    <FigureRow columns={steps.length > 1 ? 4 : 3}>
      {steps.slice(0, 2).map(left)}
      <Figure
        label={sale.eventName === PURCHASE ? t("boughtVisits") : t("saleVisits", { sale: saleName })}
        value={formatNumber(sale.visits)}
        detail={(
          <span className="flex flex-col">
            <span className="text-secondary">{first.eventName === BASKET ? t("boughtOfBasket", { rate: of(sale.visits, first.visits) }) : t("boughtDetail", { rate: of(sale.visits, first.visits), step: nameOf(first.eventName) })}</span>
            <BeforeLine now={sale.visits} before={sale.visitsBefore} />
          </span>
        )}
      />
      <Figure
        label={t("neverBought")}
        value={t("neverBoughtValue", { count: never.count })}
        detail={<span className="flex flex-col"><span className="text-secondary">{t("neverBoughtDetail", { rate: of(never.count, never.of) })}</span><BeforeLine now={never.count} before={never.countBefore} lowerIsBetter /></span>}
      />
    </FigureRow>
  );
}

/** The products table, by product or by category: items bought, the share of every item sold, and items added. */
function ProductsTable({ categories, host }: { categories: readonly string[]; host: string }) {
  const t = useTranslations("googleAnalytics.products.table");
  const tf = useTranslations("googleAnalytics.filters");
  const args = useAnalyticsArgs();
  const [period] = usePeriod();
  const [device] = useDevice();
  const [view, setView] = useSiteParam<TableView>("table", "products", TABLE_VIEWS);
  const [show, setShow] = useSiteParam<Show>("show", "all", SHOWS);
  // Any category in the address: the list holds it to the shop's own (`analyticsProductList`).
  const [category, setCategory] = useSiteParam<string>("category", "");
  const [search, setSearch, settled] = useSiteSearch();
  const order = useSiteSort(FIRSTS, "itemsBought");
  const byCategory = view === "categories";
  const listArgs = {
    ...args, view, show, ...(category ? { category } : {}), ...(settled ? { q: settled } : {}), sort: order.key, direction: order.direction,
  };
  const paged = useSiteListPage(api.googleAnalyticsProductReads.analyticsProductList, listArgs);
  // Its own query, so the page's eye is handed its rows here (sees-every-page-plan-2026-10-31.md): the page on screen,
  // picked from every product by its sort, so never "holds most of the list".
  // The rest of the table by its name in the reader's words, for the eye's "left in baskets far more than the others".
  const othersName = t("eyeOthers");
  const seen = useMemo(() => (paged.pageRows ? { picked: true, rows: paged.pageRows, othersName } : undefined), [paged.pageRows, othersName]);
  useSeesPart("productsTable", seen);
  const bar = [tf(`periods.${periodWord(period)}`), tf(`devices.${device}`).toLowerCase()].join(" · ");
  const most = Math.max(0, ...(paged.pageRows ?? []).map((row) => row.share));
  // A product opens the page it is sold on, and its screen's Back returns here as it was (Anthony, 2026-11-02:
  // "click through and click back"); with no page near enough its name, All pages searched for it.
  const convex = useConvex();
  const router = useRouter();
  const pageHref = usePageHref();
  const hrefFor = useAnalyticsHref(args.siteId);
  const openProduct = async (row: Shown) => {
    const found = await convex.query(api.googleAnalyticsProductReads.analyticsProductPage, { ...args, name: row.name }).catch(() => null);
    router.push(found ? pageHref(found.key) : hrefFor("all-pages", { q: row.name }));
  };
  return (
    <DataTable
      rows={paged.pageRows}
      rowKey={(row) => row.key}
      views={<SiteViewSwitch label={t("viewLabel")} options={TABLE_VIEWS.map((value) => ({ value, label: t(`views.${value}`) }))} value={view} onChange={setView} />}
      search={{ value: search, onChange: setSearch, placeholder: byCategory ? t("findCategory") : t("findProduct") }}
      filters={(
        <div className="flex flex-wrap items-center gap-3">
          <Select chip={{ label: t("showLabel"), choice: show === "all" ? null : t(`show.${show}`) }} value={show} onChange={(value) => setShow(value as Show)}>
            {SHOWS.map((value) => <option key={value} value={value}>{t(`show.${value}`)}</option>)}
          </Select>
          {categories.length > 0 ? (
            <Select chip={{ label: t("categoryLabel"), choice: category || null }} value={category} onChange={setCategory}>
              <option value="">{t("everyCategory")}</option>
              {categories.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </Select>
          ) : null}
        </div>
      )}
      cardHeader={
        <TableBar footer={paged.footer} noun={byCategory ? "categories" : "products"} actions={<ProductsDownload args={listArgs} host={host} />}>
          <span className="text-[12px] text-secondary">{paged.result?.live ? t("collecting") : bar}</span>
        </TableBar>
      }
      sort={order.tableSort}
      onRowClick={byCategory ? undefined : (row) => void openProduct(row)}
      empty={{ icon: <ShoppingBag className="h-8 w-8 text-muted/30" />, label: settled || category || show !== "all" ? t("noMatch") : t("empty") }}
      footer={paged.footer}
      columns={[
        {
          key: "name",
          header: byCategory ? t("columns.category") : t("columns.product"),
          sortable: true,
          className: CUT_COLUMN.first,
          cell: (row: Shown) => (
            <span className="flex min-w-0 flex-col">
              <span className="block truncate text-[13px] text-foreground" title={row.name}>{row.name}</span>
              {!byCategory && row.category && !/^\(.*\)$/.test(row.category) ? <span className="block truncate text-[12px] text-muted">{row.category}</span> : null}
            </span>
          ),
        },
        { key: "itemsBought", header: <span title={t("columns.boughtTitle")}>{t("columns.bought")}</span>, align: "right", sortable: true, cell: (row: Shown) => <FigureCell value={row.itemsBought} /> },
        {
          key: "share",
          header: <span title={t("columns.shareTitle")}>{t("columns.share")}</span>,
          align: "right",
          sortable: true,
          // The bar against the largest share on the page, beside its figure (Anthony, 2026-11-02: "i really love this").
          cell: (row: Shown) => (
            <div className="flex items-center justify-end gap-2">
              <Meter value={most > 0 ? row.share / most : 0} className="w-16 shrink-0" />
              <span className="w-12 shrink-0 text-right font-mono text-[12px] text-secondary">{formatPercent(row.share)}</span>
            </div>
          ),
        },
        { key: "itemsAdded", header: <span title={t("columns.addedTitle")}>{t("columns.added")}</span>, align: "right", sortable: true, cell: (row: Shown) => <FigureCell value={row.itemsAdded} /> },
      ]}
    />
  );
}

/** Every product or category, in the order on screen, as CSV: read when pressed. */
function ProductsDownload({ args, host }: {
  args: Parameters<typeof useSiteListPage<typeof api.googleAnalyticsProductReads.analyticsProductList>>[1];
  host: string;
}) {
  const t = useTranslations("googleAnalytics.products.table");
  const tf = useTranslations("googleAnalytics.filters");
  const [period] = usePeriod();
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
        const byCategory = args.view === "categories";
        const headers = [
          byCategory ? t("columns.category") : t("columns.product"), ...(byCategory ? [] : [t("columns.category")]),
          t("csv.itemsBought"), t("csv.itemsAdded"), t("csv.itemsLeft"), t("csv.share"), t("csv.itemsBoughtBefore", { before: tf(`before.${periodWord(period)}`) }),
        ];
        const rows = outcome.data.rows.map((row) => [
          row.name, ...(byCategory ? [] : [row.category]), row.itemsBought, row.itemsAdded, row.itemsLeft, Math.round(row.share * 1000) / 10, row.itemsBoughtBefore,
        ]);
        saveTextFile(toCsv(headers, rows), `${host}-google-analytics-${byCategory ? "product-categories" : "products"}.csv`);
      }}
    />
  );
}
