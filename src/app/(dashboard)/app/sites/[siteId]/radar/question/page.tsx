"use client";

import { useMutation, useQuery } from "convex/react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { MessageCircleQuestion, Plus } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { NoFigure } from "@/src/ui/components/screens/NoFigure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { DetailHeader, PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { SegmentedChoice } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { CUT_COLUMN, ExternalUrlCell, RecordLinkCell } from "../../../_components/SiteCells";
import { ListDownload } from "../../../_components/SiteDownloads";
import { SiteSees } from "../../../_components/SiteSees";
import { formatNumber } from "../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteListHref, useSiteRecordHref } from "../../../_components/siteRecordLinks";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";

type Kind = "DIRECTORY" | "REVIEWS" | "FORUM" | "NEWS" | "VIDEO" | "REFERENCE" | "WEBSITE" | "RIVAL" | "YOURS";
type Named = { host: string; you: boolean; place: number | null; page: string | null };
type Page = { url: string; host: string; kind: Kind };

const VIEWS = ["named", "pages"] as const;
type View = (typeof VIEWS)[number];
const NAMED_SORTS: SiteSortColumns<Named, "place" | "business"> = {
  place: { value: (row) => row.place, first: "asc" },
  business: { value: (row) => row.host, first: "asc" },
};
const PAGE_SORTS: SiteSortColumns<Page, "page" | "website"> = {
  page: { value: (row) => row.url, first: "asc" },
  website: { value: (row) => row.host, first: "asc" },
};
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");
const pathOf = (url: string) => {
  try {
    return new URL(url).pathname || "/";
  } catch {
    return url;
  }
};

/**
 * Discovery → One question (docs/plans/active/discovery-detail-and-hakken-
 * sees-plan.md §3, DS2–DS3; drawn as "Detail · One question in Google's AI"):
 * a question Google's AI answers are given for, as Brand radar reads it — the
 * businesses it names, in order, and every page it quotes. Opened from Brand
 * radar's questions and the question rows of the other detail screens. A
 * super admin can track it (D19 of the Discovery plan), so its answers are
 * read from every assistant too.
 */
export default function OneQuestionPage() {
  const t = useTranslations("sites.questionRecord");
  const tk = useTranslations("sites.radar.sources.kinds");
  const tr = useTranslations("sites.record");
  const siteId = useSiteId();
  const site = useSite();
  const router = useRouter();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  const back = useRecordBack("question");
  const asked = useRecordKey("question");
  const data = useQuery(api.siteRadarDetails.questionDetail, asked ? { siteId, question: asked } : "skip");
  const me = useQuery(api.users.getMe);
  const addQuestion = useMutation(api.websiteCanonical.addWebsiteQuestion);
  const action = useAdminAction({ scope: "site-question" });
  const [view, setView] = useSiteParam<View>("view", "named", VIEWS);
  const [search, setSearch, term] = useSiteSearch();
  const matches = wordStartMatcher(term);

  const named = useSiteSortedList(data?.named.filter((row) => !matches || matches(row.host)), NAMED_SORTS, { opening: "place", name: (row) => row.host, table: "named" });
  const namedPager = useSitePager(named.rows, { isLoading: data === undefined, table: "named" });
  const pages = useSiteSortedList(data?.pages.filter((row) => !matches || matches(row.url, row.host)) as Page[] | undefined, PAGE_SORTS, { opening: "page", name: (row) => row.url, table: "pages" });
  const pagesPager = useSitePager(pages.rows, { isLoading: data === undefined, table: "pages" });

  const icon = <MessageCircleQuestion className="h-6 w-6 text-brand" />;
  if (!asked) return <DetailHeader back={back} icon={icon} title={t("missingTitle")} description={t("missingBody")} />;

  const you = data?.named.find((row) => row.you);
  const first = data?.named.find((row) => row.place === 1);
  const yourPage = data?.pages.find((row) => row.kind === "YOURS");
  const rivalPages = data?.pages.filter((row) => row.kind === "RIVAL") ?? [];
  const canTrack = me?.role === "SUPER_ADMIN" && data?.found && !data.tracked;
  const nameOf = (row: Named) => (row.you ? t("youName", { name: row.host }) : row.host);
  const whoseOf = (row: Page) => (row.kind === "YOURS" ? t("yours") : row.host);
  const openBusiness = (row: Named) => (row.you ? listHref("local") : recordHref({ kind: "business", business: row.host }));
  const openWebsite = (row: Page) => (row.kind === "YOURS" ? recordHref({ kind: "page", page: pathOf(row.url) }) : recordHref({ kind: "website", host: row.host }));
  const fileBase = `${site?.host ?? "site"}-question`;
  const views = data ? (
    <SegmentedChoice
      size="compact"
      label={t("viewLabel")}
      value={view}
      onChange={(next) => setView(next)}
      options={[
        { value: "named", label: t("views.named", { count: data.named.filter((row) => row.place !== null).length }) },
        { value: "pages", label: t("views.pages", { count: data.pages.length }) },
      ]}
    />
  ) : undefined;
  const searchBox = { value: search, onChange: setSearch, placeholder: t("searchPlaceholder") };

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={icon}
        title={data?.question ?? asked}
        description={data?.found ? t("description", { asks: formatNumber(data.volume), place: site?.placeLabel ?? "" }) : t("descriptionLoading")}
        pills={data?.found
          ? <>
            {you?.place ? <StatusLabel tone="success">{t("labels.namesYou", { place: you.place })}</StatusLabel> : <StatusLabel tone="neutral">{t("labels.notNamed")}</StatusLabel>}
            {data.tracked ? <TagLabel>{t("labels.tracked")}</TagLabel> : null}
          </>
          : undefined}
        action={canTrack ? (
          <PagePrimaryAction
            icon={<Plus className="h-4 w-4" />}
            disabled={action.isBusy("track")}
            onClick={() => void action.run(() => addQuestion({ companyWebsiteId: siteId, prompt: data.question }), { key: "track", fallbackMessage: t("trackFailed") })}
          >
            {t("track")}
          </PagePrimaryAction>
        ) : undefined}
      />
      <SiteSees screen="question" seen={data?.seen} />

      {data === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : !data.found ? (
        <Notice>{t("notFound")}</Notice>
      ) : (
        <>
          <FigureRow>
            <Figure label={t("figures.asked")} value={formatNumber(data.volume)} detail={<span className="text-secondary">{t("figures.askedDetail", { place: site?.placeLabel ?? "" })}</span>} />
            <Figure label={t("figures.named")} emphasis value={formatNumber(data.named.filter((row) => row.place !== null).length)} detail={<span className="text-secondary">{first ? t("figures.namedFirst", { name: nameOf(first) }) : t("figures.namedNone")}</span>} />
            <Figure label={t("figures.pages")} value={formatNumber(data.pages.length)} detail={<span className="text-secondary">{yourPage ? t("figures.pagesYours", { page: pathOf(yourPage.url) }) : t("figures.pagesNoneYours")}</span>} />
            <Figure label={t("figures.rivalPages")} value={formatNumber(rivalPages.length)} detail={<span className="text-secondary">{rivalPages[0] ? shortUrl(rivalPages[0].url) : t("figures.rivalPagesNone")}</span>} />
          </FigureRow>

          {view === "named" ? (
            <DataTable
              rows={namedPager.pageRows}
              rowKey={(row) => row.host}
              views={views}
              search={searchBox}
              rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
              onRowClick={(row) => router.push(openBusiness(row))}
              cardHeader={<TableBar footer={namedPager.footer} noun="businesses" actions={<ListDownload fileName={`${fileBase}-businesses`} rows={named.rows ?? []} columns={[{ header: t("columns.place"), value: (row) => row.place }, { header: t("columns.business"), value: nameOf }, { header: t("columns.page"), value: (row) => row.page }]} />} />}
              empty={{ icon: <MessageCircleQuestion className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("namedEmpty") }}
              footer={namedPager.footer}
              sort={named.tableSort}
              columns={[
                { key: "place", header: t("columns.place"), align: "right", sortable: true, cell: (row) => (row.place === null ? <NoFigure /> : <span className="font-mono text-[12px] tabular-nums">{row.place}</span>) },
                { key: "business", header: t("columns.business"), sortable: true, cell: (row) => <RecordLinkCell href={openBusiness(row)}>{nameOf(row)}</RecordLinkCell> },
                { key: "page", header: t("columns.page"), className: CUT_COLUMN.second, cell: (row) => (row.page ? <ExternalUrlCell cut url={row.page} label={shortUrl(row.page)} /> : row.you && row.place === null ? <StatusLabel tone="neutral">{t("labels.notNamed")}</StatusLabel> : <NoFigure />) },
              ]}
            />
          ) : (
            <DataTable
              rows={pagesPager.pageRows}
              rowKey={(row) => row.url}
              views={views}
              search={searchBox}
              rowClassName={(row) => (row.kind === "YOURS" ? "bg-brand/5" : "")}
              onRowClick={(row) => router.push(openWebsite(row))}
              cardHeader={<TableBar footer={pagesPager.footer} noun="pages" actions={<ListDownload fileName={`${fileBase}-pages`} rows={pages.rows ?? []} columns={[{ header: t("columns.address"), value: (row) => row.url }, { header: t("columns.website"), value: whoseOf }, { header: t("columns.kind"), value: (row) => tk(row.kind) }]} />} />}
              empty={{ icon: <MessageCircleQuestion className="h-8 w-8 text-muted/30" />, label: term ? t("noMatch") : t("pagesEmpty") }}
              footer={pagesPager.footer}
              sort={pages.tableSort}
              columns={[
                { key: "page", header: t("columns.address"), sortable: true, className: CUT_COLUMN.first, cell: (row) => <ExternalUrlCell cut url={row.url} label={shortUrl(row.url)} /> },
                { key: "website", header: t("columns.website"), sortable: true, cell: (row) => <RecordLinkCell href={openWebsite(row)}>{whoseOf(row)}</RecordLinkCell> },
                { key: "kind", header: t("columns.kind"), cell: (row) => <TagLabel>{tk(row.kind)}</TagLabel> },
              ]}
            />
          )}
        </>
      )}
    </div>
  );
}
