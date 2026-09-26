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
import { RecordLinkCell } from "../../../_components/SiteCells";
import { SiteTableBar } from "../../../_components/SiteTableBar";
import { useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSiteId } from "../../../_components/useSite";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { ListDownload } from "../../../_components/SiteDownloads";
import { wordStartMatcher } from "@/convex/utils/wordStarts";

type Kind = "QUESTION" | "RELATED";

type Asked = { text: string; searches: readonly string[] };

/**
 * The columns that sort (docs/plans/active/sites-table-sorting-plan.md): the
 * question or search A to Z, and the most searches it came up on — the order
 * it opens on. The kind does not; its filter narrows to one.
 */
const SORTS: SiteSortColumns<Asked, "text" | "from"> = {
  text: { value: (row) => row.text, first: "asc" },
  from: { value: (row) => row.searches.length, first: "desc" },
};
const textOf = (row: Asked) => row.text;

/**
 * Questions people ask: Google's "People also ask" questions and related
 * searches from the site's searches, each once, with the searches it came up
 * on — what people want to know next, and so what to write about.
 */
export default function SiteQuestionsPage() {
  const t = useTranslations("sites.googleQuestions");
  const siteId = useSiteId();
  const answer = useQuery(api.siteGoogleSerp.listQuestions, { siteId });
  const rows = answer?.rows;
  const [search, setSearch, term] = useSiteSearch();
  const [kind, setKind] = useSiteParam<Kind | "">("kind", "", ["QUESTION", "RELATED"]);
  const [from, setFrom] = useSiteParam<string>("from-search", "");
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);

  const searches = [...new Set((rows ?? []).flatMap((row) => row.searches))].sort();
  const matches = wordStartMatcher(term);
  const matching = rows?.filter((row) =>
    (!matches || matches(row.text))
    && (!kind || row.kind === kind)
    && (!from || row.searches.includes(from)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "from", name: textOf });
  const pager = useSitePager(sorted, { isLoading: rows === undefined, cut: answer?.cut });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<MessageCircleQuestion className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => `${row.kind}:${row.text}`}
        // A related search is a search of its own; a question opens the search it came up on.
        onRowClick={(row) => router.push(recordHref({ kind: "keyword", keyword: row.kind === "RELATED" ? row.text : row.searches[0] }))}
        minWidthClassName="min-w-[720px]"
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("kindFilter"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={(value) => setKind(value as Kind | "")}>
              <option value="">{t("anyKind")}</option>
              <option value="QUESTION">{t("kinds.QUESTION")}</option>
              <option value="RELATED">{t("kinds.RELATED")}</option>
            </Select>
            <Select chip={{ label: t("fromFilter"), choice: from || null }} className="max-w-[320px]" value={from} onChange={setFrom}>
              <option value="">{t("anySearch")}</option>
              {searches.map((entry) => <option key={entry} value={entry}>{entry}</option>)}
            </Select>
          </>
        }
        cardHeader={<SiteTableBar footer={pager.footer} noun="questionsAndSearches" actions={<ListDownload fileName={"questions-people-ask"} rows={sorted} columns={[{ header: t("columns.text"), value: (row) => row.text }, { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind}`) }, { header: t("columns.from"), value: (row) => row.searches.join("; ") }, { header: t("columns.lastChecked"), value: (row) => row.day }]} />} />}
        empty={{ icon: <MessageCircleQuestion className="h-8 w-8 text-muted/30" />, label: term || kind || from ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          {
            key: "text",
            header: t("columns.text"),
            sortable: true,
            cell: (row) => row.kind === "RELATED"
              ? <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.text })}>{row.text}</RecordLinkCell>
              : <span className="text-[13px] text-foreground">{row.text}</span>,
          },
          { key: "kind", header: t("columns.kind"), cell: (row) => <StatusPill tone={row.kind === "QUESTION" ? "info" : "neutral"}>{t(`kinds.${row.kind}`)}</StatusPill> },
          {
            key: "from",
            header: t("columns.from"),
            // By how many searches it came up on.
            sortable: true,
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
