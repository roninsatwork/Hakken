"use client";

import { useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Building2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { CUT_COLUMN, ExternalUrlCell, RecordLinkCell } from "../../../../_components/SiteCells";
import { ListDownload } from "../../../../_components/SiteDownloads";
import { SiteSees } from "../../../../_components/SiteSees";
import { VisitLink } from "../../../../_components/VisitLink";
import { formatDay, formatNumber } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteListHref, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../../_components/useSite";
import { useSitePager } from "../../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../../_components/useSiteSort";
import { FigureCell } from "../../_components/LocalParts";
import { useActivityWords, type ActivityLine } from "../../_components/profileDetails";

type Question = { question: string; volume: number; it: number | null; you: number | null; page: string | null };
type Answer = { question: string; answerId: string; day: string; it: number; you: number | null };
type Place = { search: string; volume: number | null; it: number | null; you: number | null };
type Mention = { url: string; host: string; title: string | null; day: string; kind: number; tone: number; linked: number };
type Post = ActivityLine & { day: string };

const VIEWS = ["ai", "chatgpt", "map", "pages", "posts"] as const;
type View = (typeof VIEWS)[number];
const MENTION_KINDS = ["OTHER", "NEWS", "BLOG", "FORUM", "SHOP", "ORGANISATION"] as const;
const MENTION_TONES = ["NEUTRAL", "WELL", "BADLY"] as const;
const TONE_TONE = { WELL: "success", NEUTRAL: "neutral", BADLY: "danger" } as const;
const QUESTION_SORTS: SiteSortColumns<Question, "question" | "volume" | "it" | "you"> = {
  question: { value: (row) => row.question, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  it: { value: (row) => row.it, first: "asc" },
  you: { value: (row) => row.you, first: "asc" },
};
const ANSWER_SORTS: SiteSortColumns<Answer, "question" | "it" | "you" | "day"> = {
  question: { value: (row) => row.question, first: "asc" },
  it: { value: (row) => row.it, first: "asc" },
  you: { value: (row) => row.you, first: "asc" },
  day: { value: (row) => row.day, first: "desc" },
};
const PLACE_SORTS: SiteSortColumns<Place, "search" | "volume" | "it" | "you"> = {
  search: { value: (row) => row.search, first: "asc" },
  volume: { value: (row) => row.volume, first: "desc" },
  it: { value: (row) => row.it, first: "asc" },
  you: { value: (row) => row.you, first: "asc" },
};
const MENTION_SORTS: SiteSortColumns<Mention, "day" | "page"> = {
  day: { value: (row) => row.day, first: "desc" },
  page: { value: (row) => row.title ?? row.url, first: "asc" },
};
const POST_SORTS: SiteSortColumns<Post, "day"> = { day: { value: (row) => row.day, first: "desc" } };
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/**
 * Discovery → One business (docs/plans/active/discovery-detail-and-hakken-
 * sees-plan.md §3, DS2–DS3; drawn as "Detail · One business"): a business the
 * website is up against — where Google's AI names it, where ChatGPT shows it,
 * its place on Google Maps for the website's searches, the pages naming it and
 * what it posts — each beside the website's own figure. Opened from every
 * table listing businesses; never as a modal.
 */
export default function OneBusinessPage() {
  const t = useTranslations("sites.businessRecord");
  const tm = useTranslations("sites.mentions");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const activity = useActivityWords();
  const back = useRecordBack("business");
  const asked = useRecordKey("business");
  const data = useQuery(api.siteBusinessDetail.businessDetail, asked ? { siteId, business: asked } : "skip");
  // Opens on the first view with rows: a business known only on Google Maps opens on its map places.
  const counts: Record<View, number> = { ai: data?.questions.length ?? 0, chatgpt: data?.answers.length ?? 0, map: data?.map.length ?? 0, pages: data?.mentions.length ?? 0, posts: data?.posts.length ?? 0 };
  const [view, setView] = useSiteParam<View>("view", VIEWS.find((entry) => counts[entry] > 0) ?? "ai", VIEWS);
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term);

  const questions = useSiteSortedList(data?.questions.filter((row) => !matches || matches(row.question)), QUESTION_SORTS, { opening: "volume", name: (row) => row.question, table: "ai" });
  const questionsPager = useSitePager(questions.rows, { isLoading: data === undefined, table: "ai" });
  const answers = useSiteSortedList(data?.answers.filter((row) => !matches || matches(row.question)), ANSWER_SORTS, { opening: "day", name: (row) => row.answerId, table: "chatgpt" });
  const answersPager = useSitePager(answers.rows, { isLoading: data === undefined, table: "chatgpt" });
  const places = useSiteSortedList(data?.map.filter((row) => !matches || matches(row.search)), PLACE_SORTS, { opening: "volume", name: (row) => row.search, table: "map" });
  const placesPager = useSitePager(places.rows, { isLoading: data === undefined, table: "map" });
  const mentions = useSiteSortedList(data?.mentions.filter((row) => !matches || matches(row.title, row.host)), MENTION_SORTS, { opening: "day", name: (row) => row.url, table: "pages" });
  const mentionsPager = useSitePager(mentions.rows, { isLoading: data === undefined, table: "pages" });
  const posts = useSiteSortedList((data?.posts as Post[] | undefined)?.filter((row) => !matches || matches(row.text)), POST_SORTS, { opening: "day", name: (row) => `${row.day}${row.kind}${row.text ?? ""}`, table: "posts" });
  const postsPager = useSitePager(posts.rows, { isLoading: data === undefined, table: "posts" });

  const icon = <Building2 className="h-6 w-6 text-brand" />;
  if (!asked) return <DetailHeader back={back} icon={icon} title={t("missingTitle")} description={t("missingBody")} />;

  const placeWords = (place: number | null) => (place === null ? null : t("place", { place }));
  const youCell = (place: number | null, missing: string) => (place === null ? <StatusLabel tone="neutral">{missing}</StatusLabel> : <StatusLabel tone="success">{placeWords(place)}</StatusLabel>);
  const fileBase = `${site?.host ?? "site"}-${data?.host ?? "business"}`;
  const searchBox = { value: search, onChange: setSearch, placeholder: t("searchPlaceholder") };
  const views = data ? (
    <SegmentedChoice
      size="compact"
      label={t("viewLabel")}
      value={view}
      onChange={(next) => setView(next)}
      options={[
        { value: "ai", label: t("views.ai", { count: data.questions.length }) },
        { value: "chatgpt", label: t("views.chatgpt", { count: data.answers.length }) },
        { value: "map", label: t("views.map", { count: data.map.length }) },
        { value: "pages", label: t("views.pages", { count: data.mentions.length }) },
        { value: "posts", label: t("views.posts", { count: data.posts.length }) },
      ]}
    />
  ) : undefined;
  const description = data
    ? [data.category, data.town && (data.km !== null ? t("townAway", { town: data.town, km: data.km.toLocaleString("en-GB") }) : data.town), data.host].filter(Boolean).join(" · ") || t("descriptionLoading")
    : t("descriptionLoading");
  const f = data?.figures;

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={icon}
        title={data?.name ?? asked.replace(/^listing:/, "")}
        description={description}
        pills={data ? (
          <>
            {data.watched ? <TagLabel>{t("labels.rival")}</TagLabel> : null}
            {data.rivalId ? <RecordLinkCell href={recordHref({ kind: "rival", rivalId: data.rivalId })} className="text-[12px] text-secondary">{t("labels.rankings")}</RecordLinkCell> : null}
          </>
        ) : undefined}
        action={data?.host ? <VisitLink icon href={`https://${data.host}`}>{t("visit", { host: data.host })}</VisitLink> : data?.profileUrl ? <VisitLink icon href={data.profileUrl}>{t("openOnGoogle")}</VisitLink> : undefined}
      />
      <SiteSees screen="business" seen={data?.seen} />

      {data === undefined || !f ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          <FigureRow>
            <Figure label={t("figures.named")} emphasis value={f.named === null ? "–" : formatNumber(f.named)} detail={<span className="text-secondary">{f.named === null ? t("figures.notRead") : t("figures.namedDetail", { you: f.namedYou === null ? "–" : formatNumber(f.namedYou) })}</span>} />
            <Figure label={t("figures.shown")} value={f.answers > 0 ? t("figures.ofAnswers", { count: f.shown, of: f.answers }) : "–"} detail={<span className="text-secondary">{t("figures.shownDetail", { you: f.shownYou, of: f.answers })}</span>} />
            <Figure label={t("figures.rating")} value={f.rating === null ? "–" : f.rating.toFixed(1)} detail={<span className="text-secondary">{t(f.rating === null ? "figures.ratingNone" : "figures.ratingDetail", { reviews: f.reviews === null ? "–" : formatNumber(f.reviews), you: f.ratingYou === null ? "–" : f.ratingYou.toFixed(1), youReviews: f.reviewsYou === null ? "–" : formatNumber(f.reviewsYou) })}</span>} />
            <Figure label={t("figures.mentions")} value={f.mentions === null ? "–" : formatNumber(f.mentions)} detail={<span className="text-secondary">{f.mentions === null ? t("figures.notRead") : t("figures.mentionsDetail", { you: f.mentionsYou === null ? "–" : formatNumber(f.mentionsYou) })}</span>} />
          </FigureRow>

          {view === "ai" ? (
            <DataTable
              rows={questionsPager.pageRows}
              rowKey={(row) => row.question}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "question", question: row.question }))}
              cardHeader={<TableBar footer={questionsPager.footer} noun="questions" actions={<ListDownload fileName={`${fileBase}-questions`} rows={questions.rows ?? []} columns={[{ header: t("columns.question"), value: (row) => row.question }, { header: t("columns.asked"), value: (row) => row.volume }, { header: t("columns.it"), value: (row) => row.it }, { header: t("columns.you"), value: (row) => row.you }, { header: t("columns.page"), value: (row) => row.page }]} />} />}
              empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : data.rivalId ? t("aiEmpty") : t("notWatched") }}
              footer={questionsPager.footer}
              sort={questions.tableSort}
              columns={[
                { key: "question", header: t("columns.question"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "question", question: row.question })}>{row.question}</RecordLinkCell> },
                { key: "volume", header: t("columns.asked"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
                { key: "it", header: t("columns.it"), align: "right", sortable: true, cell: (row) => (row.it === null ? <NoFigure /> : <span className="font-mono text-[12px] tabular-nums">{placeWords(row.it)}</span>) },
                { key: "you", header: t("columns.you"), sortable: true, cell: (row) => youCell(row.you, t("notNamed")) },
                { key: "page", header: t("columns.page"), className: CUT_COLUMN.second, cell: (row) => (row.page ? <ExternalUrlCell cut url={row.page} label={shortUrl(row.page)} /> : <NoFigure />) },
              ]}
            />
          ) : view === "chatgpt" ? (
            <DataTable
              rows={answersPager.pageRows}
              rowKey={(row) => row.answerId}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(recordHref({ kind: "answer", answerId: row.answerId }))}
              cardHeader={<TableBar footer={answersPager.footer} noun="answers" actions={<ListDownload fileName={`${fileBase}-chatgpt`} rows={answers.rows ?? []} columns={[{ header: t("columns.question"), value: (row) => row.question }, { header: t("columns.it"), value: (row) => row.it }, { header: t("columns.you"), value: (row) => row.you }, { header: t("columns.day"), value: (row) => row.day }]} />} />}
              empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("chatgptEmpty") }}
              footer={answersPager.footer}
              sort={answers.tableSort}
              columns={[
                { key: "question", header: t("columns.question"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <RecordLinkCell cut href={recordHref({ kind: "answer", answerId: row.answerId })}>{row.question}</RecordLinkCell> },
                { key: "it", header: t("columns.it"), align: "right", sortable: true, cell: (row) => <span className="font-mono text-[12px] tabular-nums">{placeWords(row.it)}</span> },
                { key: "you", header: t("columns.you"), sortable: true, cell: (row) => youCell(row.you, t("notShown")) },
                { key: "day", header: t("columns.day"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{formatDay(row.day)}</span> },
              ]}
            />
          ) : view === "map" ? (
            <DataTable
              rows={placesPager.pageRows}
              rowKey={(row) => row.search}
              views={views}
              search={searchBox}
              onRowClick={(row) => router.push(listHref("local/maps/search", { keyword: row.search }))}
              cardHeader={<TableBar footer={placesPager.footer} noun="searches" actions={<ListDownload fileName={`${fileBase}-map`} rows={places.rows ?? []} columns={[{ header: t("columns.search"), value: (row) => row.search }, { header: t("columns.volume"), value: (row) => row.volume }, { header: t("columns.it"), value: (row) => row.it }, { header: t("columns.you"), value: (row) => row.you }]} />} />}
              empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("mapEmpty") }}
              footer={placesPager.footer}
              sort={places.tableSort}
              columns={[
                { key: "search", header: t("columns.search"), sortable: true, cell: (row) => <RecordLinkCell href={listHref("local/maps/search", { keyword: row.search })}>{row.search}</RecordLinkCell> },
                { key: "volume", header: t("columns.volume"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.volume} /> },
                { key: "it", header: t("columns.it"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.it} /> },
                { key: "you", header: t("columns.you"), sortable: true, cell: (row) => (row.you === null ? <StatusLabel tone="neutral">{t("notOnMap")}</StatusLabel> : <StatusLabel tone="success">{formatNumber(row.you)}</StatusLabel>) },
              ]}
            />
          ) : view === "pages" ? (
            <DataTable
              rows={mentionsPager.pageRows}
              rowKey={(row) => row.url}
              views={views}
              search={searchBox}
              onRowClick={(row) => window.open(row.url, "_blank", "noopener,noreferrer")}
              cardHeader={<TableBar footer={mentionsPager.footer} noun="mentions" actions={<ListDownload fileName={`${fileBase}-mentions`} rows={mentions.rows ?? []} columns={[{ header: t("columns.date"), value: (row) => row.day }, { header: t("columns.address"), value: (row) => row.title ?? row.url }, { header: t("columns.kind"), value: (row) => tm(`kinds.${MENTION_KINDS[row.kind]}`) }, { header: t("columns.tone"), value: (row) => tm(`toneOne.${MENTION_TONES[row.tone]}`) }, { header: t("columns.link"), value: (row) => (row.linked ? t("linksToIt") : t("noLink")) }]} />} />}
              empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : data.rivalId ? t("pagesEmpty") : t("notWatched") }}
              footer={mentionsPager.footer}
              sort={mentions.tableSort}
              columns={[
                { key: "day", header: t("columns.date"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.day)}</span> },
                {
                  key: "page",
                  header: t("columns.address"),
                  sortable: true,
                  className: CUT_COLUMN.first,
                  cell: (row) => (
                    <span className="flex min-w-0 flex-col">
                      <span className="truncate text-[13px] text-foreground">{row.title ?? shortUrl(row.url)}</span>
                      <ExternalUrlCell cut url={row.url} label={shortUrl(row.url)} />
                    </span>
                  ),
                },
                { key: "kind", header: t("columns.kind"), cell: (row) => <TagLabel>{tm(`kinds.${MENTION_KINDS[row.kind]}`)}</TagLabel> },
                { key: "tone", header: t("columns.tone"), cell: (row) => <StatusLabel tone={TONE_TONE[MENTION_TONES[row.tone]]}>{tm(`toneOne.${MENTION_TONES[row.tone]}`)}</StatusLabel> },
                { key: "link", header: t("columns.link"), cell: (row) => (row.linked ? <StatusLabel tone="success">{t("linksToIt")}</StatusLabel> : <StatusLabel tone="neutral">{t("noLink")}</StatusLabel>) },
              ]}
            />
          ) : (
            <DataTable
              rows={postsPager.pageRows}
              rowKey={(row) => `${row.day}${row.kind}${row.text ?? ""}`}
              views={views}
              search={searchBox}
              rowClickable={() => Boolean(data.profileUrl)}
              onRowClick={() => { if (data.profileUrl) window.open(data.profileUrl, "_blank", "noopener,noreferrer"); }}
              cardHeader={<TableBar footer={postsPager.footer} noun="rivalActions" actions={<ListDownload fileName={`${fileBase}-posts`} rows={posts.rows ?? []} columns={[{ header: t("columns.date"), value: (row) => row.day }, { header: t("columns.what"), value: activity.what }, { header: t("columns.detail"), value: activity.detail }]} />} />}
              empty={{ icon: <Building2 className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("postsEmpty") }}
              footer={postsPager.footer}
              sort={posts.tableSort}
              columns={[
                { key: "day", header: t("columns.date"), sortable: true, cell: (row) => <span className="whitespace-nowrap text-[12px] text-secondary">{formatDay(row.day)}</span> },
                { key: "what", header: t("columns.what"), cell: (row) => <TagLabel>{activity.what(row)}</TagLabel> },
                { key: "detail", header: t("columns.detail"), cell: (row) => <span className="text-[12px] text-secondary">{activity.detail(row)}</span> },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
