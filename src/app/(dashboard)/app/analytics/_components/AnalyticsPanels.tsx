"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { ChartCard } from "@/src/ui/components/screens/ChartCard";
import { CompactList, type CompactListColumn } from "@/src/ui/components/screens/CompactList";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { formatNumber } from "../../sites/_components/siteFormat";
import { formatMoney } from "./analyticsFormat";
import { PageLink } from "./AnalyticsCells";

/** A panel holding a short list, with its title, a line saying what it is, and "See all" to its full table (§10, Q14). */
export function AnalyticsPanel({ title, description, seeAll, children }: {
  title: string;
  description?: string;
  seeAll?: { href: string; label: string } | null;
  children: ReactNode;
}) {
  return (
    <ChartCard title={title} hint={description}>
      <div className="flex flex-col gap-4">
        {children}
        {seeAll ? (
          <Link href={seeAll.href} className="inline-flex items-center gap-1 self-start text-[12.5px] text-secondary hover:text-info">
            {seeAll.label}
            <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </ChartCard>
  );
}

type TopRow = { key: string; label: string; visits: number; conversions: number; value: number; purchases: number; revenue: number };

/** The first five of a list by value: a channel's name, or a page's path linking to its own screen. */
export function TopList({ rows, kind, currency, pageHref, channelHref, showVisits = true, sales = false, empty }: {
  rows: TopRow[] | undefined;
  kind: "channel" | "page";
  currency: string | null;
  pageHref?: (row: TopRow) => string | null;
  channelHref?: (row: TopRow) => string;
  showVisits?: boolean;
  /** A shop's sales (GA7; §11 board 8): purchases, revenue and the average order. */
  sales?: boolean;
  empty: string;
}) {
  const t = useTranslations("googleAnalytics.table");
  if (sales) {
    const salesColumns: CompactListColumn<TopRow>[] = [
      {
        key: "name",
        header: kind === "channel" ? t("columns.channel") : t("columns.page"),
        cell: (row) => (kind === "page" ? <PageLink address={row.label} href={pageHref ? pageHref(row) : null} /> : <span className="text-[13px] text-foreground">{row.label}</span>),
      },
      { key: "purchases", header: t("columns.purchases"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.purchases)}</span> },
      { key: "revenue", header: t("columns.revenue"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatMoney(row.revenue, currency)}</span> },
      { key: "average", header: t("columns.averageOrder"), align: "right", cell: (row) => (row.purchases > 0 ? <span className="font-mono text-[12px] text-secondary">{formatMoney(Math.round(row.revenue / row.purchases), currency)}</span> : <NoFigure />) },
    ];
    return <CompactList rows={rows} columns={salesColumns} rowKey={(row) => row.key} empty={empty} />;
  }
  const columns: CompactListColumn<TopRow>[] = [
    {
      key: "name",
      header: kind === "channel" ? t("columns.channel") : t("columns.page"),
      cell: (row) => (kind === "page"
        ? <PageLink address={row.label} href={pageHref ? pageHref(row) : null} />
        : channelHref ? <Link href={channelHref(row)} className="text-[13px] text-foreground hover:text-info">{row.label}</Link> : <span className="text-[13px] text-foreground">{row.label}</span>),
    },
    ...(showVisits ? [{ key: "visits", header: t("columns.visits"), align: "right" as const, cell: (row: TopRow) => <span className="font-mono text-[12px] text-foreground">{formatNumber(row.visits)}</span> }] : []),
    { key: "conversions", header: t("columns.conversions"), align: "right", cell: (row) => <span className="font-mono text-[12px] text-secondary">{formatNumber(row.conversions)}</span> },
    { key: "value", header: t("columns.value"), align: "right", cell: (row) => (row.value ? <span className="font-mono text-[12px] text-secondary">{formatMoney(row.value, currency)}</span> : <NoFigure />) },
  ];
  return <CompactList rows={rows} columns={columns} rowKey={(row) => row.key} empty={empty} />;
}
