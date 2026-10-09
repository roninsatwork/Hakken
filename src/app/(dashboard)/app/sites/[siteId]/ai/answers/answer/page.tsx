"use client";

import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessageSquareQuote } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { DetailHeader } from "@/src/ui/components/screens/PageHeader";
import { SegmentedChoice, SettingsCard } from "@/src/ui/components/screens/SettingsCard";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import type { StatusTone } from "@/src/ui/components/screens/statusTone";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { HakkenMarkdown } from "@/src/ui/components/chat/HakkenMarkdown";
import { ENGINE_SCREEN_ORDER, useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import { PageSection } from "../../../../../_components/PageSection";
import { ExternalUrlCell, RecordLinkCell } from "../../../../_components/SiteCells";
import { formatDay } from "../../../../_components/siteFormat";
import { useRecordBack, useRecordKey, useSiteRecordHref } from "../../../../_components/siteRecordLinks";
import { useSiteId } from "../../../../_components/useSite";
import { useSitePager } from "../../../../_components/useSitePagedTable";
import { useSiteSortedList, type SiteSortColumns } from "../../../../_components/useSiteSort";
import { FigureCell, ratingText } from "../../../local/_components/LocalParts";

type Stance = "RECOMMENDED" | "NAMED" | "WARNED_AGAINST" | "NOT_NAMED";
type Business = { name: string; host: string | null; rating: number | null; reviews: number | null; you: boolean; place: number };
type Search = { query: string; text: string; position: number | null; tracked: boolean };

const STANCE_TONES: Record<Stance, StatusTone> = {
  RECOMMENDED: "success",
  NAMED: "info",
  WARNED_AGAINST: "danger",
  NOT_NAMED: "neutral",
};
const BUSINESS_SORTS: SiteSortColumns<Business, "place" | "rating" | "reviews"> = {
  place: { value: (row) => row.place, first: "asc" },
  rating: { value: (row) => row.rating, first: "desc" },
  reviews: { value: (row) => row.reviews, first: "desc" },
};
const SEARCH_SORTS: SiteSortColumns<Search, "position"> = { position: { value: (row) => row.position, first: "asc" } };
const businessName = (row: Business) => row.name;
/** A footer only past one page: an answer's lists are short. */
const pagedOnly = <Footer extends { totalCount: number; pageSize: number }>(footer: Footer) => (footer.totalCount > footer.pageSize ? footer : undefined);
const searchName = (row: Search) => row.query;

/**
 * One answer's own screen (AI answers › Full answers › an answer;
 * docs/plans/active/discovery-local-reputation-ai-plan.md, step 3, D5, D18;
 * drawn as "AI answers · one answer, five ways"): the same question's answer
 * from each assistant that day, switched between; what it said, word for
 * word, with this site's names picked out; and what each showed beside it —
 * an app's businesses, the pages it read and the searches it ran, or the
 * sources it cited.
 *
 * The text is another model's writing: shown to people, never read as
 * instructions (D9). Opened from Full answers, never as a modal.
 */
export default function SiteAnswerPage() {
  const t = useTranslations("sites.answerRecord");
  const ta = useTranslations("sites.aiAnswers");
  const tr = useTranslations("sites.record");
  const engineLabel = useEngineLabel();
  const { platformName } = useSystemSettings();
  const router = useRouter();
  const siteId = useSiteId();
  const back = useRecordBack("answer");
  const recordHref = useSiteRecordHref(siteId);
  const asked = useRecordKey("answer");
  // An id is 32 lowercase letters and digits; anything else is not one.
  // Its wording's id while that is kept, the answer's own after (90 days).
  const answerId = /^[a-z0-9]{32}$/.test(asked) ? (asked as Id<"aiAnswerTexts"> | Id<"aiAnswers">) : null;
  const record = useQuery(api.siteAnswers.answerRecord, answerId ? { siteId, answerId } : "skip");
  const shown = useQuery(api.siteAnswerShown.answerShown, answerId ? { siteId, answerId } : "skip");
  const track = useMutation(api.siteFanOutTracking.trackSiteFanOutQuery);
  const action = useAdminAction({ scope: "site-answer" });

  const businesses = (shown?.businesses ?? []).map((business, at) => ({ ...business, place: at + 1 }));
  const businessesSorted = useSiteSortedList(shown ? businesses : undefined, BUSINESS_SORTS, { opening: "place", name: businessName, table: "businesses" });
  const searchesSorted = useSiteSortedList(shown?.searches, SEARCH_SORTS, { opening: "position", name: searchName, table: "searches" });
  const businessesPager = useSitePager(businessesSorted.rows, { isLoading: shown === undefined, table: "businesses" });
  const readPager = useSitePager(shown?.read, { isLoading: shown === undefined, table: "read" });
  const searchesPager = useSitePager(searchesSorted.rows, { isLoading: shown === undefined, table: "searches" });
  const sourcesPager = useSitePager(record?.sources, { isLoading: record === undefined, table: "sources" });

  if (!answerId) {
    return <DetailHeader back={back} icon={<MessageSquareQuote className="h-6 w-6 text-brand" />} title={t("missingTitle")} description={t("missingBody")} />;
  }
  if (record === null || shown === null) {
    return <DetailHeader back={back} icon={<MessageSquareQuote className="h-6 w-6 text-brand" />} title={t("notFoundTitle")} description={t("notFoundBody")} />;
  }

  const nameOf = (engine: string, askedAs: "APP" | "MODEL" | "PAGE") => (askedAs === "APP" ? t("appOf", { engine: engineLabel(engine) }) : engineLabel(engine));
  const choices = (shown?.others ?? [])
    .filter((other) => other.answerId !== null)
    .sort((left, right) => ENGINE_SCREEN_ORDER.indexOf(left.engine) - ENGINE_SCREEN_ORDER.indexOf(right.engine));
  const app = shown?.askedAs === "APP" && (shown.businesses.length > 0 || shown.read.length > 0);
  const you = businesses.find((business) => business.you);
  const sources = record?.sources ?? [];
  const yourSources = sources.filter((source) => source.page !== null).length;
  const cited = shown?.read.filter((page) => page.cited).length ?? 0;
  const ordinal = (place: number) => t("ordinal", { place });
  const placeValue = shown?.named.place ? t("placeOf", { place: ordinal(shown.named.place), of: shown.named.of }) : t("notNamed");
  const placeDetail = shown && shown.named.of > 0 ? t("namedBusinesses", { count: shown.named.of }) : t("namedNobody");

  return (
    <div className="flex flex-col gap-6">
      <DetailHeader
        back={back}
        icon={<MessageSquareQuote className="h-6 w-6 text-brand" />}
        title={record?.prompt ?? tr("loading")}
        // Past the 90 days its wording is kept, it says what is left: who it named and cited.
        description={record ? t(record.text === null ? "descriptionNotKept" : "description", { engine: shown ? nameOf(record.engine, shown.askedAs) : engineLabel(record.engine), day: formatDay(record.day) }) : undefined}
        pills={record ? <StatusLabel tone={STANCE_TONES[record.stance]}>{ta(`stances.${record.stance}`)}</StatusLabel> : undefined}
        action={record && shown && choices.length > 1 ? (
          <SegmentedChoice
            size="compact"
            label={t("whereAsked")}
            value={record.engine}
            options={choices.map((other) => ({ value: other.engine, label: nameOf(other.engine, other.askedAs) }))}
            onChange={(engine) => {
              const next = choices.find((other) => other.engine === engine)?.answerId;
              if (next) router.replace(recordHref({ kind: "answer", answerId: next }));
            }}
          />
        ) : undefined}
      />
      <p className="max-w-2xl text-[12px] text-secondary">{t("howAsked", { platformName })}</p>

      {record === undefined || shown === undefined ? (
        <div className="h-40 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" aria-label={tr("loading")} />
      ) : (
        <>
          {app ? (
            <FigureRow>
              <Figure
                label={t("figures.whereYouCame")}
                emphasis
                value={you ? t("placeOf", { place: ordinal(you.place), of: businesses.length }) : placeValue}
                detail={<span className="text-secondary">{businesses[0] && !businesses[0].you ? t("figures.cameFirst", { name: businesses[0].name }) : placeDetail}</span>}
              />
              <Figure label={t("figures.businessesShown")} value={businesses.length} detail={<span className="text-secondary">{t("figures.businessesShownDetail")}</span>} />
              <Figure label={t("figures.pagesRead")} value={shown.read.length} detail={<span className="text-secondary">{t("figures.pagesReadDetail", { count: cited })}</span>} />
              <Figure label={t("figures.searchesRan")} value={shown.searches.length} detail={<span className="text-secondary">{t("figures.searchesRanDetail")}</span>} />
            </FigureRow>
          ) : shown.askedAs === "PAGE" ? (
            <FigureRow>
              <Figure label={t("figures.whereYouCame")} emphasis value={placeValue} detail={<span className="text-secondary">{placeDetail}</span>} />
              <Figure label={t("figures.sourcesCited")} value={sources.length} detail={<span className="text-secondary">{yourSources > 0 ? t("figures.yoursOf", { count: yourSources }) : t("figures.noneYours")}</span>} />
              <Figure label={t("figures.googlePosition")} value="–" detail={<span className="text-secondary">{t("figures.notTracked")}</span>} />
              <Figure label={t("figures.mapPlace")} value="–" detail={<span className="text-secondary">{t("figures.notTracked")}</span>} />
            </FigureRow>
          ) : (
            <FigureRow>
              <Figure label={t("figures.whereYouCame")} emphasis value={placeValue} detail={<span className="text-secondary">{placeDetail}</span>} />
              <Figure label={t("figures.sourcesCited")} value={sources.length} detail={<span className="text-secondary">{yourSources > 0 ? t("figures.yoursOf", { count: yourSources }) : t("figures.noneYours")}</span>} />
              <Figure label={t("figures.searchesRan")} value={shown.searches.length > 0 ? shown.searches.length : record.searches.length} detail={<span className="text-secondary">{t("figures.searchesRanDetail")}</span>} />
              <Figure
                label={t("figures.howAsked")}
                value={shown.askedAs === "APP" ? t("figures.itsApp") : t("figures.itsModel")}
                detail={<span className="text-secondary">{shown.askedAs === "APP" ? t("figures.itsAppDetail") : t("figures.itsModelDetail")}</span>}
              />
            </FigureRow>
          )}

          <SettingsCard title={shown.askedAs === "MODEL" ? t("answerTitleModel", { engine: engineLabel(record.engine) }) : t("answerTitleShown", { engine: nameOf(record.engine, shown.askedAs) })}>
            {record.text === null ? (
              // Past the 90 days its wording is kept: how it treated the site and its sources still show.
              <p className="text-[13px] text-muted">{ta("wordingNotKept")}</p>
            ) : (
              <div className="max-w-[75ch] text-[13px] text-secondary">
                <HakkenMarkdown content={record.text} highlight={record.names} />
              </div>
            )}
          </SettingsCard>

          {app ? (
            <>
              <PageSection tight title={t("businessesTitle")} description={t("businessesDescription", { engine: engineLabel(record.engine) })}>
                <DataTable
                  rows={businessesPager.pageRows}
                  rowKey={(row) => row.name}
                  footer={pagedOnly(businessesPager.footer)}
                  rowClassName={(row) => (row.you ? "bg-brand/5" : "")}
                  cardHeader={<TableBar footer={businessesPager.footer} noun="businesses" />}
                  empty={{ icon: <MessageSquareQuote className="h-8 w-8 text-muted/30" />, label: t("noBusinesses") }}
                  sort={businessesSorted.tableSort}
                  columns={[
                    { key: "place", header: t("columns.place"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.place} /> },
                    {
                      key: "business",
                      header: t("columns.business"),
                      cell: (row) => (
                        <span className="flex min-w-0 flex-col">
                          <span className="text-[13px] text-foreground">{row.you ? t("you", { name: row.name }) : row.name}</span>
                          {row.host ? <ExternalUrlCell url={`https://${row.host}`} label={row.host} /> : <span className="text-[12px] text-muted">{t("noWebsite")}</span>}
                        </span>
                      ),
                    },
                    { key: "rating", header: t("columns.rating"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.rating} text={ratingText(row.rating)} /> },
                    { key: "reviews", header: t("columns.reviews"), align: "right", sortable: true, cell: (row) => <FigureCell value={row.reviews} /> },
                    { key: "map", header: t("columns.onMaps"), cell: () => <span className="text-[12px] text-muted">{t("notTrackedShort")}</span> },
                  ]}
                />
              </PageSection>

              <PageSection tight title={t("readTitle")} description={t("readDescription", { engine: engineLabel(record.engine) })}>
                <DataTable
                  rows={readPager.pageRows}
                  rowKey={(row) => row.url}
                  footer={pagedOnly(readPager.footer)}
                  cardHeader={<TableBar footer={readPager.footer} noun="pages"><span className="text-[13px] text-secondary">{t("citedOfThem", { count: cited })}</span></TableBar>}
                  empty={{ icon: <MessageSquareQuote className="h-8 w-8 text-muted/30" />, label: t("noRead") }}
                  columns={[
                    { key: "page", header: t("columns.page"), cell: (row) => <ExternalUrlCell url={row.url} /> },
                    { key: "whose", header: t("columns.whose"), cell: (row) => <span className="text-[12px] text-secondary">{row.yours ? t("yours") : row.host}</span> },
                    { key: "inAnswer", header: t("columns.inAnswer"), cell: (row) => <StatusLabel tone={row.cited ? "success" : "neutral"}>{row.cited ? t("cited") : t("readNotCited")}</StatusLabel> },
                  ]}
                />
              </PageSection>

              <PageSection tight title={t("searchesRanTitle")} description={t("searchesRanDescription", { engine: engineLabel(record.engine) })}>
                <DataTable
                  rows={searchesPager.pageRows}
                  rowKey={(row) => row.query}
                  footer={pagedOnly(searchesPager.footer)}
                  empty={{ icon: <MessageSquareQuote className="h-8 w-8 text-muted/30" />, label: t("noSearches") }}
                  sort={searchesSorted.tableSort}
                  columns={[
                    { key: "search", header: t("columns.search"), cell: (row) => <RecordLinkCell href={recordHref({ kind: "keyword", keyword: row.query })}>{row.text}</RecordLinkCell> },
                    { key: "position", header: t("columns.position"), align: "right", sortable: true, cell: (row) => (row.position === null ? <span className="text-[12px] text-muted">{t("notInTop")}</span> : <FigureCell value={row.position} />) },
                    {
                      key: "tracked",
                      header: t("columns.tracked"),
                      cell: (row) => (
                        <Checkbox
                          label={t("everyCheck")}
                          checked={row.tracked}
                          disabled={action.isBusy(`track:${row.query}`)}
                          onChange={(next) => void action.run(() => track({ siteId, prompt: record.prompt, queries: [row.text], track: next }), { key: `track:${row.query}`, fallbackMessage: t("trackFailed") })}
                        />
                      ),
                    },
                  ]}
                />
              </PageSection>
            </>
          ) : (
            <PageSection tight title={t("sourcesTitle")} description={shown.askedAs === "PAGE" ? t("sourcesGoogle") : t("sourcesLinked")}>
              <DataTable
                rows={sourcesPager.pageRows}
                rowKey={(row) => row.url}
                footer={pagedOnly(sourcesPager.footer)}
                empty={{ icon: <MessageSquareQuote className="h-8 w-8 text-muted/30" />, label: t("noSources") }}
                columns={[
                  {
                    key: "page",
                    header: t("columns.page"),
                    cell: (row) => (row.page !== null
                      ? <RecordLinkCell href={recordHref({ kind: "page", page: row.page })} className="break-all text-[12px] text-info">{row.url}</RecordLinkCell>
                      : <ExternalUrlCell url={row.url} />),
                  },
                  { key: "whose", header: t("columns.whose"), cell: (row) => <span className="text-[12px] text-secondary">{row.page !== null ? t("yours") : hostOf(row.url)}</span> },
                ]}
              />
            </PageSection>
          )}
        </>
      )}
    </div>
  );
}

function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}
