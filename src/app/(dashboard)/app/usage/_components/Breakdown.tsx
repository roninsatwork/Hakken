"use client";

import { useQuery } from "convex/react";
import { useSearchParams } from "next/navigation";
import { Gauge } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { CreditKind } from "@/convex/creditKinds";
import Header from "@/src/ui/components/layout/Header";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { ResearchSection } from "../../keyword-research/_components/ResearchCells";
import { SectionMenu } from "../../_components/SectionMenu";
import { MonthPicker } from "./UsageParts";
import { useStatementTable } from "./StatementTable";
import { CREDIT_KIND_ORDER, relationshipWord, useUsageMonth, useUsageWords } from "./usageWords";

/**
 * Usage → By work and By website (docs/plans/active/usage-credits-plan.md,
 * boards ByWork and ByWebsite): one kind of work, or one website, picked from
 * the side menu — its month in four figures, then every charge it made:
 * date, time, what, who, credits.
 */

const NOT_TIED = "none";

export function UsageBreakdown({ by }: { by: "work" | "website" }) {
  const words = useUsageWords();
  const params = useSearchParams();
  const { month, withMonth } = useUsageMonth();
  const summary = useQuery(api.creditUsage.usageSummary, { month });

  const base = by === "work" ? "/app/usage/work" : "/app/usage/websites";
  const kinds = CREDIT_KIND_ORDER.filter((kind) => summary?.kinds.some((row) => row.kind === kind));
  const websites = summary?.websites ?? [];
  const menuItems = by === "work"
    ? kinds.map((kind) => ({ id: kind, label: words.kind(kind), href: withMonth(`${base}?kind=${kind}`), count: words.number(summary?.kinds.find((row) => row.kind === kind)?.credits ?? 0) }))
    : websites.map((row) => {
      const id = row.website?.websiteId ?? NOT_TIED;
      return { id, label: row.website?.host ?? words.t("websites.none"), href: withMonth(`${base}?website=${id}`), count: words.number(row.credits) };
    });
  const asked = params.get(by === "work" ? "kind" : "website");
  const current = menuItems.find((item) => item.id === asked)?.id ?? menuItems[0]?.id ?? null;

  // Only the picked kind's or website's lines are asked for.
  const statement = useQuery(
    api.creditUsage.usageStatement,
    current ? { month, ...(by === "work" ? { kind: current as CreditKind } : { website: current }) } : "skip",
  );
  const lines = statement?.lines.filter((line) => line.entry === "charge" && (by === "work"
    ? line.kind === current
    : (line.website?.websiteId ?? NOT_TIED) === current));
  const credits = lines?.reduce((sum, line) => sum + line.out, 0) ?? 0;
  const people = new Set(lines?.filter((line) => line.how === "byHand" && line.user).map((line) => line.user));
  const runs = lines?.length ?? 0;
  const websiteRow = by === "website" ? websites.find((row) => (row.website?.websiteId ?? NOT_TIED) === current) : undefined;
  const kind = by === "work" ? (current as CreditKind | null) : null;
  const price = kind ? summary?.prices.find((row) => row.kind === kind) : undefined;

  const title = by === "work" ? words.t("byWork.title") : words.t("byWebsite.title");
  const description = by === "work" ? words.t("byWork.description") : words.t("byWebsite.description");
  const sectionTitle = kind ? words.kind(kind) : websiteRow ? (websiteRow.website?.host ?? words.t("websites.none")) : "";
  const sectionAbout = kind
    ? words.t(`about.${kind}`)
    : websiteRow?.website ? relationshipWord(words, websiteRow.website) : words.t("byWebsite.notTied");
  const table = useStatementTable({
    lines,
    filters: by === "work" ? ["user", "website"] : ["user", "task"],
    searchPlaceholder: by === "work" ? words.t("byWork.search") : words.t("byWebsite.search"),
    fileName: by === "work" ? `usage-${current ?? "work"}` : "usage-website",
  });

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <PageHeader divider icon={<Gauge className="h-6 w-6 text-brand" />} title={title} description={description} />
        <div className="flex flex-wrap items-center gap-3"><MonthPicker /></div>
        {summary === null ? <Notice>{words.t("noCompany")}</Notice> : summary && menuItems.length === 0 ? <Notice>{words.t("nothingYet")}</Notice> : (
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
            <aside className="lg:sticky lg:top-4 lg:self-start">
              {current ? (
                <SectionMenu
                  label={by === "work" ? words.t("byWork.menu") : words.t("byWebsite.menu")}
                  groups={[{ id: by, label: by === "work" ? words.t("byWork.menu") : words.t("byWebsite.menu"), items: menuItems }]}
                  currentId={current}
                  openAtFirst={[by]}
                />
              ) : null}
            </aside>
            <section className="flex min-w-0 flex-col gap-6">
              <ResearchSection title={sectionTitle} description={sectionAbout}>
                <FigureRow>
                  <Figure label={words.t("figures.creditsThisMonth")} value={words.number(credits)} detail={summary ? words.t("figures.shareOfAll", { share: summary.used ? `${Math.round((credits / summary.used) * 100)}%` : "–" }) : null} />
                  <Figure label={words.t("figures.runs")} value={words.number(runs)} detail={people.size ? words.t("figures.startedBy", { count: people.size }) : words.t("figures.allScheduled")} />
                  {by === "work" ? (
                    <Figure label={words.t("figures.price")} value={price ? words.number(price.credits) : "…"} detail={kind && price ? words.price(kind, price) : null} />
                  ) : (
                    <Figure label={words.t("figures.checks")} value={words.number(websiteRow?.kinds.length ?? 0)} detail={websiteRow?.kinds.map((item) => words.kind(item)).join(", ") ?? null} />
                  )}
                  <Figure label={words.t("figures.eachRun")} value={runs ? words.number(Math.round(credits / runs)) : "–"} detail={words.t("figures.eachRunDetail")} />
                </FigureRow>
              </ResearchSection>
              {statement?.cut ? <Notice tone="warning">{words.t("statement.cut")}</Notice> : null}
              <DataTable {...table} footer={table.footer} />
            </section>
          </div>
        )}
      </div>
    </>
  );
}
