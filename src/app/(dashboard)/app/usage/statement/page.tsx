"use client";

import { useQuery } from "convex/react";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { MonthPicker } from "../_components/UsageParts";
import { useStatementTable } from "../_components/StatementTable";
import { useUsageMonth, useUsageWords } from "../_components/usageWords";

/**
 * Usage → Statement (docs/plans/active/usage-credits-plan.md, board
 * Statement): every credit in and out in a month, like a bank statement —
 * the balance it opened with, every line in date order with the balance
 * after it, and the balance now. Its lines come a page at a time and its
 * figures from the month's batches and balances, so a month of any length
 * reads whole (finish-off-plan.md, item 10).
 */
export default function UsageStatementPage() {
  const words = useUsageWords();
  const { month } = useUsageMonth();
  const totals = useQuery(api.creditUsage.usageStatementTotals, month ? { month } : {});
  // The month's kinds of work and websites, for the filters.
  const summary = useQuery(api.creditUsage.usageSummary, month ? { month } : {});
  const loading = totals === undefined;
  const into = totals ? totals.planIn + totals.otherIn : 0;
  const out = totals ? totals.used + totals.ended : 0;
  const table = useStatementTable({
    base: month ? { month } : {},
    statement: true,
    opening: totals?.opening,
    closing: totals?.closing,
    totals: totals ? words.t("statement.totals", { out: words.number(out), in: words.number(into) }) : null,
    filters: ["task", "website", "user"],
    kinds: summary?.kinds.map((row) => row.kind) ?? [],
    websites: summary?.websites.map((row) => ({ key: row.website?.websiteId ?? "none", host: row.website?.host ?? words.t("websites.none") })) ?? [],
    people: totals?.people ?? [],
    searchPlaceholder: words.t("statement.search"),
    fileName: `statement-${totals?.month ?? "month"}`,
  });

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<Gauge className="h-6 w-6 text-brand" />} title={words.t("statement.title")} description={words.t("statement.description")} />
        <div className="flex flex-wrap items-center gap-3"><MonthPicker /></div>
        {totals === null ? <Notice>{words.t("noCompany")}</Notice> : (
          <>
            <FigureRow>
              <Figure label={words.t("statement.figures.opening")} value={loading ? "…" : words.number(totals.opening)} detail={words.t("statement.figures.openingDetail")} />
              <Figure label={words.t("statement.figures.in")} value={loading ? "…" : words.number(into)} detail={loading ? null : words.t("statement.figures.inDetail", { plan: words.number(totals.planIn), other: words.number(totals.otherIn) })} />
              <Figure label={words.t("statement.figures.out")} value={loading ? "…" : words.number(out)} detail={loading ? null : words.t("statement.figures.outDetail", { used: words.number(totals.used), ended: words.number(totals.ended) })} />
              <Figure emphasis label={words.t("statement.figures.closing")} value={loading ? "…" : words.number(totals.closing)} detail={words.t("statement.figures.closingDetail")} />
            </FigureRow>
            <DataTable {...table} footer={table.footer} />
          </>
        )}
      </div>
    </>
  );
}
