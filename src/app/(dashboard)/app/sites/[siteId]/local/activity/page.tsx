"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Activity } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { PageSection } from "../../../../_components/PageSection";
import { formatDay } from "../../../_components/siteFormat";
import { ListDownload } from "../../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../../_components/useSite";
import { useSitePager } from "../../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../../_components/useSiteSort";
import { LocalSetupNotice, useOfficeName } from "../_components/LocalParts";
import { useHoursChangeWords } from "../_components/profileDetails";

type Kind = "POST" | "OFFER" | "EVENT" | "CATEGORY_ADDED" | "CATEGORY_REMOVED" | "HOURS_CHANGED" | "NAME_CHANGED" | "WEBSITE_CHANGED" | "RATING_CHANGE" | "PHOTOS_ADDED";
type Line = { day: string; listingId: string; name: string; kind: Kind; text: string | null; from: number | null; to: number | null };
type Question = { text: string; listingId: string; name: string; town: string | null; yours: boolean; day: string; answeredDay: string | null };

/** The "What" filter's groups, as drawn. */
const WHATS = ["posts", "offers", "changes", "ratings"] as const;
type What = (typeof WHATS)[number];
const KINDS_OF: Record<What, readonly Kind[]> = {
  posts: ["POST", "EVENT"],
  offers: ["OFFER"],
  changes: ["CATEGORY_ADDED", "CATEGORY_REMOVED", "HOURS_CHANGED", "NAME_CHANGED", "WEBSITE_CHANGED", "PHOTOS_ADDED"],
  ratings: ["RATING_CHANGE"],
};

const SORTS: SiteSortColumns<Line, "date" | "rival" | "what"> = {
  date: { value: (row) => row.day, first: "desc" },
  rival: { value: (row) => row.name, first: "asc" },
  what: { value: (row) => row.kind, first: "asc" },
};
const QUESTION_SORTS: SiteSortColumns<Question, "question" | "profile" | "asked" | "answered"> = {
  question: { value: (row) => row.text, first: "asc" },
  profile: { value: (row) => row.name, first: "asc" },
  asked: { value: (row) => row.day, first: "desc" },
  answered: { value: (row) => row.answeredDay, first: "desc" },
};
const lineName = (row: Line) => `${row.day}${row.name}${row.text ?? ""}`;
const questionName = (row: Question) => row.text;
const DAY_MS = 86_400_000;

/**
 * Discovery → Local → Rival activity (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, D18; drawn as "More · Rival activity"): what the
 * rivals watched do on Google — their posts and offers, changes to their
 * profiles, their rating moving — and the questions people ask on profiles.
 */
export default function LocalActivityPage() {
  const t = useTranslations("sites.local.activity");
  const siteId = useSiteId();
  const site = useSite();
  const officeName = useOfficeName();
  const hoursWords = useHoursChangeWords();
  const data = useQuery(api.siteLocalMarket.rivalActivity, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [rival, setRival] = useSiteParam<string>("rival", "");
  const [what, setWhat] = useSiteParam<What | "">("what", "", WHATS);

  const matches = wordStartMatcher(term);
  const matching = (data?.lines as Line[] | undefined)?.filter((row) => (!matches || matches(row.text, row.name))
    && (!rival || row.listingId === rival)
    && (!what || KINDS_OF[what].includes(row.kind)));
  const { rows: sorted, tableSort } = useSiteSortedList(matching, SORTS, { opening: "date", name: lineName });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const questionsSorted = useSiteSortedList(data?.questions as Question[] | undefined, QUESTION_SORTS, { opening: "asked", name: questionName, table: "questions" });
  const questionsPager = useSitePager(questionsSorted.rows, { isLoading: data === undefined, table: "questions" });

  const detail = (row: Line): string => {
    switch (row.kind) {
      case "RATING_CHANGE": return t("details.rating", { from: row.from?.toFixed(1) ?? "", to: row.to?.toFixed(1) ?? "" });
      case "PHOTOS_ADDED": return t("details.photos", { count: (row.to ?? 0) - (row.from ?? 0), total: row.to ?? 0 });
      case "CATEGORY_ADDED": return t("details.categoryAdded", { category: row.text ?? "" });
      case "CATEGORY_REMOVED": return t("details.categoryRemoved", { category: row.text ?? "" });
      case "HOURS_CHANGED": return hoursWords(row.text ?? "");
      case "NAME_CHANGED": return t("details.name", { name: row.text ?? "" });
      case "WEBSITE_CHANGED": return t("details.website", { website: row.text ?? "" });
      default: return row.text ? `"${row.text}"` : "–";
    }
  };
  const answered = (row: Question) => {
    if (!row.answeredDay) {
      const days = Math.max(0, Math.round((Date.now() - Date.parse(row.day)) / DAY_MS));
      return <StatusLabel tone={row.yours ? "warning" : "neutral"}>{t("notAnswered", { days })}</StatusLabel>;
    }
    const days = Math.round((Date.parse(row.answeredDay) - Date.parse(row.day)) / DAY_MS);
    return <StatusLabel tone="success">{days <= 0 ? t("answeredSameDay") : t("answeredAfter", { days })}</StatusLabel>;
  };
  const figures = data?.figures;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Activity className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />
      {data && data.rivals.length === 0 ? <LocalSetupNotice siteId={siteId} reason="noRivals" /> : null}

      {figures ? (
        <FigureRow>
          <Figure label={t("figures.posts")} emphasis value={figures.rivalPosts} detail={<span className="text-secondary">{t("figures.postsDetail", { count: figures.yourPosts })}</span>} />
          <Figure label={t("figures.offers")} value={figures.offers} detail={<span className="text-secondary">{figures.offerNames.length > 0 ? figures.offerNames.join(", ") : t("figures.noOffers")}</span>} />
          <Figure label={t("figures.questions")} value={figures.openQuestions} detail={<span className="text-secondary">{t("figures.questionsDetail")}</span>} />
          <Figure label={t("figures.changes")} value={figures.profileChanges} detail={<span className="text-secondary">{t("figures.changesDetail")}</span>} />
        </FigureRow>
      ) : null}

      <DataTable
        rows={pager.pageRows}
        rowKey={(row) => `${row.day}|${row.listingId}|${row.kind}|${row.text ?? ""}|${row.to ?? ""}`}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("rivalFilter"), choice: data?.rivals.find((entry) => entry.listingId === rival)?.name ?? null }} value={rival} onChange={setRival}>
              <option value="">{t("everyRival")}</option>
              {(data?.rivals ?? []).map((entry) => <option key={entry.listingId} value={entry.listingId}>{entry.name}</option>)}
            </Select>
            <Select chip={{ label: t("whatFilter"), choice: what ? t(`whats.${what}`) : null }} value={what} onChange={(value) => setWhat(value as What | "")}>
              <option value="">{t("everything")}</option>
              {WHATS.map((entry) => <option key={entry} value={entry}>{t(`whats.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="rivalActions" actions={<ListDownload fileName={`${site?.host ?? "site"}-rival-activity`} rows={sorted ?? []} columns={[{ header: t("columns.date"), value: (row) => row.day }, { header: t("columns.rival"), value: (row) => row.name }, { header: t("columns.what"), value: (row) => t(`kinds.${row.kind}`) }, { header: t("columns.detail"), value: (row) => detail(row) }]} />} />}
        empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: term || rival || what ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          { key: "date", header: t("columns.date"), sortable: true, cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{formatDay(row.day)}</span> },
          { key: "rival", header: t("columns.rival"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{row.name}</span> },
          { key: "what", header: t("columns.what"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{t(`kinds.${row.kind}`)}</span> },
          { key: "detail", header: t("columns.detail"), cell: (row) => <span className="text-[12px] text-secondary">{detail(row)}</span> },
        ]}
      />

      <PageSection tight title={t("questionsTitle")} description={t("questionsDescription")}>
        <DataTable
          rows={questionsPager.pageRows}
          rowKey={(row) => `${row.listingId}|${row.day}|${row.text}`}
          empty={{ icon: <Activity className="h-8 w-8 text-muted/30" />, label: t("questionsEmpty") }}
          // As drawn, without a footer — until there is more than one page of questions.
          footer={questionsPager.footer.totalCount > questionsPager.footer.pageSize ? questionsPager.footer : undefined}
          sort={questionsSorted.tableSort}
          columns={[
            { key: "question", header: t("questionColumns.question"), sortable: true, cell: (row) => <span className="text-[13px] text-foreground">{`"${row.text}"`}</span> },
            { key: "profile", header: t("questionColumns.profile"), sortable: true, cell: (row) => <span className="text-[12px] text-secondary">{row.yours ? t("yours", { office: officeName(row) }) : row.name}</span> },
            { key: "asked", header: t("questionColumns.asked"), sortable: true, cell: (row) => <span className="font-mono text-[12px] tabular-nums text-secondary">{formatDay(row.day)}</span> },
            { key: "answered", header: t("questionColumns.answered"), sortable: true, cell: answered },
          ]}
        />
      </PageSection>
    </div>
  );
}
