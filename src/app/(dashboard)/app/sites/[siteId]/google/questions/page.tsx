"use client";

import { Fragment } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageCircleQuestion } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusPill } from "@/src/ui/components/screens/StatusPill";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { RecordLinkCell } from "../../../_components/SiteCells";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch, useSiteTablePage } from "../../../_components/useSiteParam";
import { ListDownload } from "../../../_components/SiteDownloads";

type Kind = "QUESTION" | "RELATED";

/**
 * Questions people ask: Google's "People also ask" questions and related
 * searches from the site's searches, each once, with the searches it came up
 * on — what people want to know next, and so what to write about.
 */
export default function SiteQuestionsPage() {
  const t = useTranslations("sites.googleQuestions");
  const siteId = useSiteId();
  const rows = useQuery(api.siteGoogleSerp.listQuestions, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<Kind | "">("kind", "", ["QUESTION", "RELATED"]);
  const [from, setFrom] = useSiteParam<string>("from-search", "");
  const [page, setPage] = useSiteTablePage();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const searches = [...new Set((rows ?? []).flatMap((row) => row.searches))].sort();
  const lower = term.toLowerCase();
  const matching = rows?.filter((row) =>
    (!lower || row.text.toLowerCase().includes(lower))
    && (!kind || row.kind === kind)
    && (!from || row.searches.includes(from)));
  const totalPages = Math.max(1, Math.ceil((matching?.length ?? 0) / TABLE_PAGE_SIZE));
  const shown = matching?.slice((page - 1) * TABLE_PAGE_SIZE, page * TABLE_PAGE_SIZE);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MessageCircleQuestion className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={shown}
        rowKey={(row) => `${row.kind}:${row.text}`}
        // A related search is a search of its own; a question opens the search it came up on.
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.kind === "RELATED" ? row.text : row.searches[0] }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select aria-label={t("kindFilter")} value={kind} onChange={(value) => setKind(value as Kind | "")}>
              <option value="">{t("anyKind")}</option>
              <option value="QUESTION">{t("kinds.QUESTION")}</option>
              <option value="RELATED">{t("kinds.RELATED")}</option>
            </Select>
            <Select aria-label={t("fromFilter")} value={from} onChange={setFrom}>
              <option value="">{t("anySearch")}</option>
              {searches.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </Select>
            <ListDownload fileName={"questions-people-ask"} rows={matching} columns={[{ header: t("columns.text"), value: (row) => row.text }, { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind}`) }, { header: t("columns.from"), value: (row) => row.searches.join("; ") }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />
          </>
        }
        empty={{ icon: <MessageCircleQuestion className="h-8 w-8 text-muted/30" />, label: term || kind || from ? t("noMatch") : t("empty") }}
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
            key: "text",
            header: t("columns.text"),
            cell: (row) => row.kind === "RELATED"
              ? <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.text })}>{row.text}</RecordLinkCell>
              : <span className="text-[13px] text-foreground">{row.text}</span>,
          },
          { key: "kind", header: t("columns.kind"), cell: (row) => <StatusPill tone={row.kind === "QUESTION" ? "info" : "neutral"}>{t(`kinds.${row.kind}`)}</StatusPill> },
          {
            key: "from",
            header: t("columns.from"),
            cell: (row) => (
              <span className="text-[12px] text-secondary">
                {row.searches.map((entry, index) => (
                  <Fragment key={entry}>
                    {index > 0 ? ", " : null}
                    <RecordLinkCell href={recordHref({ kind: "keyword", keyword: entry })} className="text-[12px] text-info">{entry}</RecordLinkCell>
                  </Fragment>
                ))}
              </span>
            ),
          },
        ]}
      />
    </div>
  );
}
