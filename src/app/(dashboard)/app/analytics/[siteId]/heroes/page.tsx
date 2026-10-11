"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConvex } from "convex/react";
import type { FunctionReturnType } from "convex/server";
import { Check, ListTodo, SearchX, Target } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DataTable, type DataTableColumn } from "@/src/ui/components/screens/DataTable";
import { DownloadButton, saveTextFile } from "@/src/ui/components/screens/DownloadButton";
import { Notice } from "@/src/ui/components/screens/Notice";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatDay, formatNumber, toCsv } from "../../../sites/_components/siteFormat";
import { useSiteListPage } from "../../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../sites/_components/useSiteParam";
import { useSiteSort } from "../../../sites/_components/useSiteSort";
import { AnalyticsGate } from "../../_components/AnalyticsNotices";
import { AnalyticsSees } from "../../_components/AnalyticsSees";
import { formatMoney, formatPercent } from "../../_components/analyticsFormat";
import { formatRate } from "../../_components/PageStages";
import { HERO_TONES, worthWords } from "../../_components/heroWords";
import { useAnalyticsHref, useAnalyticsSiteId, useAnalyticsStatus, type AnalyticsStatus } from "../../_components/useAnalytics";
import { HERO_KINDS, type HeroKind } from "@/convex/utils/heroes";
import { PageLink } from "../../_components/AnalyticsCells";
import { CUT_COLUMN } from "../../../sites/_components/SiteCells";

type Heroes = FunctionReturnType<typeof api.googleAnalyticsHeroes.analyticsHeroes>;
type HeroRow = Heroes["rows"][number];
type Tab = "all" | HeroKind;

const TABS: readonly Tab[] = ["all", ...HERO_KINDS];
const TAB_KEY = "tab";

/** Which way each heading's first press runs: worth most first, names A to Z. */
const FIRSTS = { worth: "desc", name: "asc", what: "asc", task: "desc" } as const;

/**
 * Heroes and attention (docs/plans/active/google-analytics-plan.md §13; §15
 * screen 3): each landing page followed from Google's results to the money it
 * makes. What Hakken sees; one row of four figures, a stage each from Google
 * to money, the one losing most marked; then Pages to fix — its tabs above
 * the search box, then the standard table, worth most first, every row
 * opening the page's own view.
 */
export default function AnalyticsHeroesPage() {
  const t = useTranslations("googleAnalytics.heroes");
  const status = useAnalyticsStatus();
  const siteId = useAnalyticsSiteId();
  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Target className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {status ? (
        <AnalyticsGate status={status} siteId={siteId}>
          <HeroesBody status={status} />
        </AnalyticsGate>
      ) : null}
    </div>
  );
}

function HeroesBody({ status }: { status: AnalyticsStatus }) {
  const t = useTranslations("googleAnalytics.heroes");
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const siteId = useAnalyticsSiteId();
  const hrefFor = useAnalyticsHref(siteId);
  const [tab, setTab] = useSiteParam<Tab>(TAB_KEY, "all", TABS);
  const [search, setSearch, settled] = useSiteSearch();
  const order = useSiteSort(FIRSTS, "worth");
  const args = { siteId, tab, ...(settled ? { q: settled } : {}), sort: order.key, direction: order.direction };
  const paged = useSiteListPage(api.googleAnalyticsHeroes.analyticsHeroes, args);
  const answer = paged.result;
  const currency = answer?.currency ?? status.connection?.currency ?? null;
  const pageHref = (row: HeroRow) => hrefFor("heroes/page", { key: row.page, ...(row.ref ? { ref: row.ref } : {}), ...(row.console ? { console: row.console } : {}) });
  const taskHref = (row: HeroRow) => `/app/assistant?ask=${encodeURIComponent(t(`taskAsk.${row.main}`, { page: row.page, host: status.host }))}`;

  if (paged.preparing) return <Notice>{t("preparing")}</Notice>;

  const counts = new Map((answer?.tabs ?? []).map((entry) => [entry.tab, entry.count]));
  const columns: DataTableColumn<HeroRow>[] = [
    {
      key: "name",
      header: t("columns.page"),
      sortable: true,
      // Its title over its address (GA27), each cut to a line in its share of the table, as Sites' words are.
      className: CUT_COLUMN.first,
      cell: (row) => <PageLink address={row.page} href={pageHref(row)} title={row.title} />,
    },
    {
      key: "what",
      header: t("columns.what"),
      sortable: true,
      cell: (row) => (
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <StatusLabel tone={HERO_TONES[row.main]}>{t(`kinds.${row.main}`)}</StatusLabel>
          {row.hero && row.main !== "hero" ? <StatusLabel tone="success">{t("kinds.hero")}</StatusLabel> : null}
        </span>
      ),
    },
    {
      key: "worth",
      header: t("columns.worth"),
      align: "right",
      sortable: true,
      cell: (row) => (row.worth === null ? <NoFigure /> : <span className="font-mono text-[12px] text-foreground">{worthWords(row.worth, currency, t)}</span>),
    },
    {
      key: "task",
      header: t("columns.task", { platformName }),
      align: "right",
      sortable: true,
      cell: (row) => row.task ? (
        <span className="inline-flex text-success" title={t("taskMade", { platformName })} aria-label={t("taskMade", { platformName })}>
          <Check className="h-4 w-4" aria-hidden="true" />
        </span>
      ) : (
        <Link
          href={taskHref(row)}
          className="inline-flex text-secondary hover:text-foreground"
          title={t("taskMake", { platformName })}
          aria-label={t("taskMake", { platformName })}
          onClick={(event) => event.stopPropagation()}
        >
          <ListTodo className="h-4 w-4" aria-hidden="true" />
        </Link>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {answer?.analyticsTo ? (
        <p className="text-[12px] text-muted">
          {answer.consoleTo
            ? t("figuresTo", { console: formatDay(answer.consoleTo), analytics: formatDay(answer.analyticsTo) })
            : t("figuresToAnalytics", { analytics: formatDay(answer.analyticsTo) })}
        </p>
      ) : null}

      <AnalyticsSees screen="heroes" seen={answer?.seen} currency={currency} />

      {answer ? <Stages answer={answer} currency={currency} tabHref={(one) => hrefFor("heroes", { [TAB_KEY]: one })} consoleHref={`/app/search-console/${siteId}/connection`} /> : <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />}

      <div className="flex flex-col gap-1">
        <h2 className="text-[14px] font-medium text-foreground">{t("listTitle")}</h2>
        <p className="text-[12px] text-secondary">
          {answer && answer.totalGain > 0 ? t("listDescription", { money: formatMoney(answer.totalGain, currency) }) : t("listDescriptionNone")}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <SegmentedChoice
          size="compact"
          label={t("tabsLabel")}
          value={tab}
          options={TABS.map((one) => ({ value: one, label: `${t(`tabs.${one}`)} ${counts.get(one) ?? 0}` }))}
          onChange={(next) => setTab(next)}
        />
        <DataTable
          rows={paged.pageRows}
          rowKey={(row) => row.page}
          onRowClick={(row) => router.push(pageHref(row))}
          search={{ value: search, onChange: setSearch, placeholder: t("search") }}
          cardHeader={
            <TableBar footer={paged.footer} noun="pages" actions={<HeroesDownload args={args} currency={currency} />}>
              <span className="text-[12px] text-secondary">{t("bar")}</span>
            </TableBar>
          }
          empty={{ icon: <SearchX className="h-8 w-8 text-muted/30" />, label: settled ? t("noMatch", { q: settled }) : t(`empty.${tab}`) }}
          footer={paged.footer}
          sort={order.tableSort}
          columns={columns}
        />
      </div>
    </div>
  );
}

/** The four stages from Google to money for the whole website, the one losing most marked. */
function Stages({ answer, currency, tabHref, consoleHref }: { answer: Heroes; currency: string | null; tabHref: (tab: Tab) => string; consoleHref: string }) {
  const t = useTranslations("googleAnalytics.heroes.website");
  const stages = answer.stages;
  const gain = (money: number, tab: Tab) => (money > 0 ? (
    <Link href={tabHref(tab)} className="self-start text-[12px] text-info hover:underline">
      {t("toGain", { money: formatMoney(money, currency) })}
    </Link>
  ) : null);
  return (
    <FigureRow>
      <Figure
        label={t("shown")}
        value={stages.shown === null ? "–" : formatNumber(stages.shown)}
        detail={stages.position !== null
          ? <span className="text-secondary">{t("position", { position: Math.round(stages.position) })}</span>
          : <Link href={consoleHref} className="text-info hover:underline">{t("connectConsole")}</Link>}
      />
      <Figure
        label={t("clicked")}
        emphasis={stages.marked === 1}
        value={stages.clicks === null ? "–" : formatNumber(stages.clicks)}
        detail={(
          <span className="flex flex-col gap-1">
            <span className="text-secondary">{stages.clickRate === null ? t("noConsole") : t("ofShowings", { rate: formatRate(stages.clickRate) })}</span>
            {gain(stages.gainInGoogle, "push")}
          </span>
        )}
      />
      <Figure
        label={t("visits")}
        emphasis={stages.marked === 2}
        value={formatNumber(stages.visits)}
        detail={(
          <span className="flex flex-col gap-1">
            <span className="text-secondary">
              {t("visitsLine", { engaged: formatPercent(stages.visits > 0 ? stages.engaged / stages.visits : null), conversions: stages.conversions })}
            </span>
            {gain(stages.gainOnPages, "convert")}
          </span>
        )}
      />
      <Figure
        label={t("value")}
        value={formatMoney(stages.value, currency)}
        detail={(
          <span className="flex flex-col gap-1">
            <span className="text-secondary">{t("valueLine", { share: formatPercent(stages.websiteValue > 0 ? stages.value / stages.websiteValue : null), total: formatMoney(stages.websiteValue, currency) })}</span>
            {stages.heroes > 0 ? (
              <Link href={tabHref("hero")} className="self-start text-[12px] text-info hover:underline">
                {t("heroes", { count: stages.heroes, money: formatMoney(stages.heroesValue, currency) })}
              </Link>
            ) : null}
          </span>
        )}
      />
    </FigureRow>
  );
}

/** Every row on the tab, in the order on screen, as CSV: read when pressed. */
function HeroesDownload({ args, currency }: { args: { siteId: string; tab: Tab; q?: string; sort: "worth" | "name" | "what" | "task"; direction: "asc" | "desc" }; currency: string | null }) {
  const t = useTranslations("googleAnalytics.heroes");
  const convex = useConvex();
  const { run, isBusy } = useAdminAction({ scope: "google-analytics-heroes-download" });
  return (
    <DownloadButton
      label={t("download")}
      busyLabel={t("downloading")}
      busy={isBusy()}
      onClick={async () => {
        const outcome = await run(
          () => convex.query(api.googleAnalyticsHeroes.analyticsHeroesAll, args as Parameters<typeof convex.query<typeof api.googleAnalyticsHeroes.analyticsHeroesAll>>[1]),
          { fallbackMessage: t("downloadFailed") },
        );
        if (!outcome.ok) return;
        const headers = ["page", "what", "hero", "worth", "shown", "position", "clicks", "visits", "conversions", "value"].map((column) => t(`csv.${column}`, { currency: currency ?? "" }));
        const rows = outcome.data.map((row) => [
          row.page,
          t(`kinds.${row.main}`),
          row.hero ? 1 : 0,
          row.worth === null ? null : Math.round(row.worth) / 100,
          row.shown,
          row.position === null ? null : Math.round(row.position * 10) / 10,
          row.clicks,
          row.visits,
          row.conversions,
          row.value === null ? null : row.value / 100,
        ]);
        saveTextFile(toCsv(headers, rows), "google-analytics-heroes-and-attention.csv");
      }}
    />
  );
}
