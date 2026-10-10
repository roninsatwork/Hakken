"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { FileText } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { CUT_COLUMN, RecordLinkCell } from "../../../../_components/SiteCells";
import { ListDownload } from "../../../../_components/SiteDownloads";
import { SiteSees } from "../../../../_components/SiteSees";
import { VisitLink } from "../../../../_components/VisitLink";
import { formatDay, formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref, type SiteRecord } from "../../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../../_components/useSite";
import { useSitePager } from "../../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../_components/useSiteSort";
import { FigureCell } from "../../../local/_components/LocalParts";

type Whose = "YOURS" | "RIVAL" | "OTHER";
type Answer = { question: string; day: string; answerId: string; cited: boolean };
type Instead = { url: string; host: string; whose: Whose; times: number; wins: number | null };
type Question = { question: string; volume: number; you: number | null };

const VIEWS = ["answers", "instead", "google"] as const;
type View = (typeof VIEWS)[number];
const ANSWER_SORTS: SiteSortColumns<Answer, "question" | "day"> = {
  question: { value: (row) => row.question, first: "asc" },
  day: { value: (row) => row.day, first: "desc" },
};
const INSTEAD_SORTS: SiteSortColumns<Instead, "page" | "whose" | "times"> = {
  page: { value: (row) => row.url, first: "asc" },
  whose: { value: (row) => row.host, first: "asc" },
  times: { value: (row) => row.times, first: "desc" },
};
const QUESTION_SORTS: SiteSortColumns<Question, "question" | "volume"> = {
  question: { value: (row) => row.question, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
};
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");
const percent = (part: number, whole: number) => (whole > 0 ? `${Math.round((part / whole) * 100)}%` : "–");

/**
 * Discovery → One page (docs/plans/active/discovery-detail-and-hakken-sees-
 * plan.md §3, DS2–DS3; drawn as "Detail · One page"): a page the ChatGPT app
 * read while answering the website's questions — every answer that read it
 * and whether it was cited, the pages cited in its place, and the questions
 * Google's AI quotes it for. Opened from Read but not cited, Pages AI cites
 * most, an answer's pages and One website's pages; never as a modal.
 */
export default function OnePagePage() {
  const t = useTranslations("sites.aiPageRecord");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const back = useRecordBack("aiPage");
  const asked = useRecordKey("aiPage");
  const data = useQuery(api.siteAiPageDetail.aiPageDetail, asked ? { siteId, url: asked } : "skip");
  const [view, setView] = useSiteParam<View>("view", "answers", VIEWS);
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term);

  const answers = useSiteSortedList(data?.answers.filter((row) => !matches || matches(row.question)), ANSWER_SORTS, { opening: "day", name: (row) => `${row.answerId}`, table: "answers" });
  const answersPager = useSitePager(answers.rows, { isLoading: data === undefined, table: "answers" });
  const instead = useSiteSortedList(data?.instead.filter((row) => !matches || matches(row.url, row.host)), INSTEAD_SORTS, { opening: "times", name: (row) => row.url, table: "instead" });
  const insteadPager = useSitePager(instead.rows, { isLoading: data === undefined, table: "instead" });
  const questions = useSiteSortedList(data?.questions.filter((row) => !matches || matches(row.question)), QUESTION_SORTS, { opening: "volume", name: (row) => row.question, table: "google" });
  const questionsPager = useSitePager(questions.rows, { isLoading: data === undefined, table: "google" });

  const icon = <FileText className="h-6 w-6 text-brand" />;
  if (!asked) return <DetailHeader back={back} icon={icon} title={t("missingTitle")} description={t("missingBody")} />;

  const whoseWords = (row: { whose: Whose; host: string }) => (row.whose === "YOURS" ? t("whose.YOURS") : row.host);
  const opensWhose = (row: Instead): SiteRecord => (row.whose === "RIVAL" ? { kind: "business", business: row.host } : { kind: "website", host: row.host });
  const top = data?.instead[0];
  const fileBase = `${site?.host ?? "site"}-page`;
  const views = data ? (
    <SegmentedChoice
      size="compact"
      label={t("viewLabel")}
      value={view}
      onChange={(next) => setView(next)}
      options={[
        { value: "answers", label: t("views.answers", { count: data.answers.length }) },
        { value: "instead", label: t("views.instead", { count: data.instead.length }) },
        { value: "google", label: t("views.google", { count: data.questions.length }) },
      ]}
    />
  ) : undefined;
  const searchBox = { value: search, onChange: setSearch, placeholder: t("searchPlaceholder") };

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={icon}
        title={data ? (data.whose === "YOURS" ? data.path : shortUrl(data.url)) : shortUrl(asked)}
        description={data ? t(`description.${data.whose}`, { address: shortUrl(data.url), host: data.host }) : t("descriptionLoading")}
        pills={data && data.read > 0
          ? <StatusLabel tone={data.cited === data.read ? "success" : "warning"}>{t("labels.readCited", { read: data.read, cited: data.cited })}</StatusLabel>
          : undefined}
        action={<VisitLink icon href={data?.url ?? asked}>{t("visit")}</VisitLink>}
      />
      <SiteSees screen="aiPage" seen={data?.seen} />

      {data === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          <FigureRow>
            <Figure label={t("figures.read")} value={formatNumber(data.read)} detail={<span className="text-secondary">{t("figures.readDetail", { count: data.cited })}</span>} />
            <Figure label={t("figures.wins")} emphasis value={percent(data.cited, data.read)} detail={<span className="text-secondary">{top && top.wins !== null ? t("figures.winsDetail", { page: shortUrl(top.url), wins: percent(top.wins, 1) }) : t("figures.winsNone")}</span>} />
            <Figure label={t("figures.instead")} value={top ? top.host : "–"} detail={<span className="text-secondary">{top ? t("figures.insteadDetail", { count: top.times }) : t("figures.insteadNone")}</span>} />
            <Figure label={t("figures.google")} value={formatNumber(data.questions.length)} detail={<span className="text-secondary">{t("figures.googleDetail")}</span>} />
          </FigureRow>

          {view === "answers" ? (
            <DataTable
              rows={answersPager.pageRows}
              rowKey={(row) => row.answerId}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "answer", answerId: row.answerId }))}
              cardHeader={<TableBar footer={answersPager.footer} noun="answers" actions={<ListDownload fileName={`${fileBase}-answers`} rows={answers.rows ?? []} columns={[{ header: t("columns.question"), value: (row) => row.question }, { header: t("columns.asked"), value: (row) => row.day }, { header: t("columns.inAnswer"), value: (row) => (row.cited ? t("cited") : t("readNotCited")) }]} />} />}
              empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("answersEmpty") }}
              footer={answersPager.footer}
              sort={answers.tableSort}
              columns={[
                { key: "question", header: t("columns.question"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "answer", answerId: row.answerId })}>{row.question}</RecordLinkCell> },
                { key: "day", header: t("columns.asked"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{formatDay(row.day)}</span> },
                { key: "cited", header: t("columns.inAnswer"), cell: (row) => <StatusLabel tone={row.cited ? "success" : "warning"}>{row.cited ? t("cited") : t("readNotCited")}</StatusLabel> },
              ]}
            />
          ) : view === "instead" ? (
            <DataTable
              rows={insteadPager.pageRows}
              rowKey={(row) => row.url}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "aiPage", url: row.url }))}
              cardHeader={<TableBar footer={insteadPager.footer} noun="pages" actions={<ListDownload fileName={`${fileBase}-cited-instead`} rows={instead.rows ?? []} columns={[{ header: t("columns.page"), value: (row) => row.url }, { header: t("columns.whose"), value: whoseWords }, { header: t("columns.times"), value: (row) => row.times }]} />} />}
              empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("insteadEmpty") }}
              footer={insteadPager.footer}
              sort={instead.tableSort}
              columns={[
                { key: "page", header: t("columns.page"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "aiPage", url: row.url })} className="text-[12px] text-info">{shortUrl(row.url)}</RecordLinkCell> },
                { key: "whose", header: t("columns.whose"), sortable: true, cell: (row) => (row.whose === "YOURS" ? <TagLabel>{whoseWords(row)}</TagLabel> : <RecordLinkCell href={recordHref(opensWhose(row))}>{whoseWords(row)}</RecordLinkCell>) },
                { key: "times", header: t("columns.times"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.times} /> },
              ]}
            />
          ) : (
            <DataTable
              rows={questionsPager.pageRows}
              rowKey={(row) => row.question}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "question", question: row.question }))}
              cardHeader={<TableBar footer={questionsPager.footer} noun="questions" actions={<ListDownload fileName={`${fileBase}-questions`} rows={questions.rows ?? []} columns={[{ header: t("columns.question"), value: (row) => row.question }, { header: t("columns.volume"), value: (row) => row.volume }, { header: t("columns.you"), value: (row) => row.you }]} />} />}
              empty={{ icon: <FileText className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("googleEmpty") }}
              footer={questionsPager.footer}
              sort={questions.tableSort}
              columns={[
                { key: "question", header: t("columns.question"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "question", question: row.question })}>{row.question}</RecordLinkCell> },
                { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
                { key: "you", header: t("columns.you"), cell: (row) => (row.you === null ? <StatusLabel tone="neutral">{t("notNamed")}</StatusLabel> : <StatusLabel tone="success">{t("namedAt", { place: row.you })}</StatusLabel>) },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
