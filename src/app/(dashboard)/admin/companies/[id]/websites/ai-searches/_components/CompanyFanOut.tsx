"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Info, Sparkles } from "lucide-react";

import type { FunctionReturnType } from "convex/server";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import useDebounce from "@/src/hooks/useDebounce";
import { formatDate } from "@/src/lib/dates";
import { useEngineLabel } from "@/src/app/(dashboard)/admin/_components/EngineChoice";
import { useAiLists } from "./AiLists";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;
type IntentChoice = (typeof INTENTS)[number];

type Row = FunctionReturnType<typeof api.companyAiLists.listCompanyFanOut>["data"][number];

/**
 * AI searches: every search the AI assistants ran for the company's prompts
 * — across all its own websites, or one website's when one is chosen in the
 * section's menu — most seen first (FA9; docs/plans/active/
 * websites-section-menu-plan.md). What came back, read only: where the
 * website came in each one's newest Google check — its first check, or a
 * ticked one's latest — and whether it is checked every run
 * (fan-out-opt-in-plan.md). The list is changed, and ticked, on the prompt's
 * own screen (prompt-fan-out-queries-plan.md), so nothing here adds, ticks or
 * unticks. The filters live in the address.
 *
 * One list at both scopes: until 2026-09-28 a website had a second, with
 * other columns and actions.
 */
export function CompanyFanOut({ companyWebsiteId, host }: { companyWebsiteId?: Id<"companyWebsites">; host?: string }) {
  const t = useTranslations("admin.companyAiLists");
  const tf = useTranslations("admin.companyAiLists.fanOut");
  const tIntent = useTranslations("admin.websiteFanOut.intents");
  const tSection = useTranslations("admin.websitesSection");
  const { companyId } = useAiLists();
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const engineLabel = useEngineLabel();

  const prompt = params.get("q") ?? "";
  const intentParam = params.get("intent") ?? "";
  const intent = (INTENTS as readonly string[]).includes(intentParam) ? (intentParam as IntentChoice) : "";

  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(searchTerm, 400);

  const setFilter = (key: string, value: string) => {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${pathname}${next.toString() ? `?${next.toString()}` : ""}`);
    setPage(1);
  };

  const list = useQuery(api.companyAiLists.listCompanyFanOut, {
    companyId,
    ...(companyWebsiteId ? { companyWebsiteId } : {}),
    ...(prompt ? { prompt } : {}),
    ...(intent ? { intent } : {}),
    searchTerm: debouncedSearch,
    page,
    pageSize: TABLE_PAGE_SIZE,
  });
  const isLoading = list === undefined;

  const intentPill = (value: string | null) => {
    if (!value) return <span className="text-[12px] text-muted">{tf("unjudged")}</span>;
    const label = tIntent(value as Exclude<IntentChoice, "UNJUDGED">);
    return <StatusPill tone={value === "BUYING" ? "success" : "neutral"}>{label}</StatusPill>;
  };

  const questions = list?.questions ?? [];

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <PageHeader
        icon={<Sparkles className="h-6 w-6 text-brand" />}
        title={tSection("pages.fanOut")}
        description={host ? tf("descriptionOne", { host }) : tf("description")}
      />

      <div className="flex items-start gap-4 rounded-[12px] border border-border-dim/50 bg-foreground/[0.015] p-4 text-secondary">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-muted" />
        <p className="text-[12.5px] leading-relaxed">{tf("note")}</p>
      </div>

      {list?.cut ? <p className="text-[12px] text-muted">{t("cut", { count: list.totalCount })}</p> : null}

      <DataTable
        rows={isLoading ? undefined : list.data}
        rowKey={(row) => row.key}
        minWidthClassName="min-w-[1000px]"
        search={{
          value: searchTerm,
          onChange: (value) => {
            setSearchTerm(value);
            setPage(1);
          },
          placeholder: tf("searchPlaceholder"),
        }}
        filters={
          <>
            <Select
              chip={{ label: tf("questionFilter"), choice: prompt || null }}
              className="max-w-[22rem]"
              value={prompt}
              onChange={(value) => setFilter("q", value)}
            >
              <option value="">{tf("anyQuestion")}</option>
              {questions.map((question) => (
                <option key={`${question.companyWebsiteId}::${question.prompt}`} value={question.prompt}>{question.prompt}</option>
              ))}
            </Select>
            <Select
              chip={{ label: tf("intentFilter"), choice: intent ? (intent === "UNJUDGED" ? tf("unjudged") : tIntent(intent)) : null }}
              value={intent}
              onChange={(value) => setFilter("intent", value)}
            >
              <option value="">{tf("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{entry === "UNJUDGED" ? tf("unjudged") : tIntent(entry)}</option>)}
            </Select>
          </>
        }
        empty={{
          icon: <Sparkles className="h-8 w-8 text-muted/30" />,
          label: searchTerm || prompt || intent ? tf("noMatch") : tf("empty"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages: list?.totalPages ?? 1,
          totalCount: list?.totalCount ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading,
          onPageChange: setPage,
          labels: { empty: tf("empty") },
        }}
        columns={[
          {
            key: "search",
            header: tf("columns.search"),
            className: "max-w-0 w-[36%]",
            cell: (row) => (
              <span className="flex min-w-0 flex-col gap-0.5">
                <span title={row.queryText} className="truncate text-[13px] text-foreground">{row.queryText}</span>
                <span title={row.prompt} className="truncate text-[11px] text-muted">{tf("asked", { question: row.prompt })}</span>
              </span>
            ),
          },
          ...(companyWebsiteId ? [] : [{
            key: "website",
            header: tf("columns.website"),
            cell: (row: Row) => <span className="text-[12px] text-secondary">{row.host}</span>,
          }]),
          { key: "intent", header: tf("columns.intent"), cell: (row) => intentPill(row.intent) },
          {
            key: "engines",
            header: tf("columns.engines"),
            cell: (row) => <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span>,
          },
          {
            key: "times",
            header: tf("columns.times"),
            align: "right",
            cell: (row) => <span className="font-mono text-[12px] text-foreground">{row.timesSeen}</span>,
          },
          {
            key: "onGoogle",
            header: tf("columns.onGoogle"),
            align: "right",
            cell: (row) => !row.google ? (
              <span className="text-[12px] text-muted">{tf("notCheckedYet")}</span>
            ) : (
              <span className="text-[12px]">
                <span className="text-foreground">
                  {row.google.position === null ? tf("notInTop") : tf("position", { position: row.google.position })}
                </span>
                <span className="text-muted"> · {formatDate(row.google.day, { options: { day: "numeric", month: "short" } })}</span>
              </span>
            ),
          },
          {
            key: "checked",
            header: tf("columns.checked"),
            align: "right",
            cell: (row) => (
              <StatusPill tone={row.everyRun ? "success" : "neutral"}>{row.everyRun ? tf("everyRun") : tf("once")}</StatusPill>
            ),
          },
        ]}
      />
    </div>
  );
}
