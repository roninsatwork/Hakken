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
 * after it, and the balance now.
 */
export default function UsageStatementPage() {
  const words = useUsageWords();
  const { month } = useUsageMonth();
  const statement = useQuery(api.creditUsage.usageStatement, { month });
  const lines = statement?.lines;
  const into = lines?.reduce((sum, line) => sum + line.in, 0) ?? 0;
  const out = lines?.reduce((sum, line) => sum + line.out, 0) ?? 0;
  const used = lines?.filter((line) => line.entry === "charge").reduce((sum, line) => sum + line.out, 0) ?? 0;
  const ended = out - used;
  const planIn = lines?.filter((line) => line.entry === "grant" && line.source === "plan").reduce((sum, line) => sum + line.in, 0) ?? 0;
  const loading = statement === undefined;
  const table = useStatementTable({
    statement: true,
    lines,
    opening: statement?.opening,
    closing: statement?.closing,
    filters: ["task", "website", "user"],
    searchPlaceholder: words.t("statement.search"),
    fileName: `statement-${statement?.month ?? "month"}`,
  });

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<Gauge className="h-6 w-6 text-brand" />} title={words.t("statement.title")} description={words.t("statement.description")} />
        <div className="flex flex-wrap items-center gap-3"><MonthPicker /></div>
        {statement === null ? <Notice>{words.t("noCompany")}</Notice> : (
          <>
            <FigureRow>
              <Figure label={words.t("statement.figures.opening")} value={loading ? "…" : words.number(statement.opening)} detail={words.t("statement.figures.openingDetail")} />
              <Figure label={words.t("statement.figures.in")} value={loading ? "…" : words.number(into)} detail={loading ? null : words.t("statement.figures.inDetail", { plan: words.number(planIn), other: words.number(into - planIn) })} />
              <Figure label={words.t("statement.figures.out")} value={loading ? "…" : words.number(out)} detail={loading ? null : words.t("statement.figures.outDetail", { used: words.number(used), ended: words.number(ended) })} />
              <Figure emphasis label={words.t("statement.figures.closing")} value={loading ? "…" : words.number(statement.closing)} detail={words.t("statement.figures.closingDetail")} />
            </FigureRow>
            {statement?.cut ? <Notice tone="warning">{words.t("statement.cut")}</Notice> : null}
            <DataTable {...table} footer={table.footer} />
          </>
        )}
      </div>
    </>
  );
}
