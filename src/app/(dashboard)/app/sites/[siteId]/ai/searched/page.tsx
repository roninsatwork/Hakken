"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Telescope } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { IntentPill, RecordLinkCell } from "../../../_components/SiteCells";
import { formatNumber } from "../../../_components/siteFormat";
import { useSiteId } from "../../../_components/useSite";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteParam, useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

const INTENTS = ["BUYING", "RESEARCHING", "BRANDED", "IRRELEVANT", "OTHER", "UNJUDGED"] as const;

/**
 * What the AI searched: the searches the engines ran behind the scenes for the
 * site's questions, most persistent first. Read-only (D1) — tracking one is
 * done in admin. The list is bounded on the server (its most persistent
 * thousand), so the search and filters narrow it in place.
 */
export default function SiteSearchedPage() {
  const t = useTranslations("sites.aiSearched");
  const tc = useTranslations("sites.common");
  const siteId = useSiteId();
  const engineLabel = useEngineLabel();
  const [search, setSearch, settled] = useSiteSearch();
  const [intent, setIntent] = useSiteParam<string>("intent", "");
  const [tracked, setTracked] = useSiteParam<string>("tracked", "");
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const rows = useQuery(api.siteAi.listSearched, { siteId });

  const term = settled.toLowerCase();
  const matching = rows?.filter((row) =>
    (!term || row.queryText.toLowerCase().includes(term) || row.prompt.toLowerCase().includes(term))
    && (!intent || (row.intent ?? "UNJUDGED") === intent)
    && (!tracked || (tracked === "yes") === row.tracked));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Telescope className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={shown}
        rowKey={(row) => `${row.prompt}::${row.query}`}
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.query }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={tc("intentFilter")} value={intent} onChange={setIntent}>
              <option value="">{tc("anyIntent")}</option>
              {INTENTS.map((entry) => <option key={entry} value={entry}>{tc(`intents.${entry}`)}</option>)}
            </Select>
            <Select aria-label={t("trackedFilter")} value={tracked} onChange={setTracked}>
              <option value="">{t("anyTracked")}</option>
              <option value="yes">{t("onlyTracked")}</option>
              <option value="no">{t("onlyUntracked")}</option>
            </Select>
            <ListDownload fileName={"ai-searches"} rows={matching} columns={[{ header: t("columns.search"), value: (row) => row.queryText }, { header: t("columns.engines"), value: (row) => row.engines.join("; ") }, { header: t("columns.times"), value: (row) => row.timesSeen }, { header: t("columns.lastChecked"), value: (row) => row.lastSeenDay }]} />
          </>
        }
        empty={{ icon: <Telescope className="h-8 w-8 text-muted/30" />, label: term || intent || tracked ? t("noMatch") : t("empty") }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: matching?.length ?? 0,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: rows === undefined,
          onPageChange: setPage,
        }}
        columns={[
          {
            key: "search",
            header: t("columns.search"),
            cell: (row) => (
              <span className="flex flex-col gap-0.5">
                <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.query })}>{row.queryText}</RecordLinkCell>
                <span className="text-[11px] text-muted">{t("fromQuestion", { question: row.prompt })}</span>
              </span>
            ),
          },
          { key: "intent", header: t("columns.intent"), cell: (row) => <IntentPill intent={row.intent} /> },
          { key: "engines", header: t("columns.engines"), cell: (row) => <span className="text-[12px] text-secondary">{row.engines.map(engineLabel).join(", ")}</span> },
          { key: "times", header: t("columns.times"), align: "right", cell: (row) => <span className="font-mono text-[12px]">{formatNumber(row.timesSeen)}</span> },
          { key: "tracked", header: t("columns.tracked"), cell: (row) => (row.tracked ? <StatusPill tone="success">{tc("yes")}</StatusPill> : <span className="text-muted">–</span>) },
        ]}
      />
    </div>
  );
}
