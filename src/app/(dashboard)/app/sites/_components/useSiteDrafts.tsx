"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { PenLine } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { Select } from "@/src/ui/components/screens/Select";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { DRAFT_STATUSES, type DraftArea, type DraftStatus } from "@/convex/utils/insightDrafts";
import { ListDownload } from "./SiteDownloads";
import { useSitePager } from "./useSitePagedTable";
import { useSiteParam, useSiteSearch } from "./useSiteParam";

const TONE: Record<DraftStatus, "info" | "success" | "neutral"> = { DRAFTED: "info", APPROVED: "success", DISMISSED: "neutral" };

/**
 * Hakken's drafted fixes for one area of a website (insights-analyst-plan.md
 * I23, phases 10 and 11, drawn on the VisLocal, VisReviews and VisLinks
 * boards): the table's rows, search, status filter and columns, for the page
 * to draw under its own header. A row opens the draft, where it is approved
 * and copied, or dismissed. Nothing for a rival's website.
 */
export function useSiteDrafts(siteId: Id<"companyWebsites">, area: DraftArea, host: string) {
  const t = useTranslations("sites.drafts");
  const rows = useQuery(api.insightsDrafts.siteDrafts, { siteId, area });
  const [search, setSearch, term] = useSiteSearch("dq", "drafts");
  const [status, setStatus] = useSiteParam<string>("draft", "", ["", ...DRAFT_STATUSES]);
  const matches = wordStartMatcher(term.toLowerCase());
  const shown = rows?.filter((row) => (!status || row.status === status) && (!matches || matches(`${row.title} ${row.target}`)));
  const pager = useSitePager(rows ? shown : undefined, { isLoading: rows === undefined, table: "drafts" });
  const href = (draftId: Id<"insightDrafts">) => `/app/sites/${siteId}/drafts/${draftId}`;
  return {
    shown: rows !== null,
    href,
    pager,
    search: { value: search, onChange: setSearch, placeholder: t("search") },
    filters: (
      <Select chip={{ label: t("status"), choice: status ? t(`statuses.${status}`) : null }} value={status} onChange={setStatus} aria-label={t("status")}>
        <option value="">{t("everyStatus")}</option>
        {DRAFT_STATUSES.map((value) => <option key={value} value={value}>{t(`statuses.${value}`)}</option>)}
      </Select>
    ),
    title: t(`titles.${area}`, { count: shown?.length ?? 0 }),
    download: <ListDownload label={t("download")} fileName={`${host}-drafts`} rows={shown} columns={[{ header: t(`columns.draft.${area}`), value: (row) => row.title }, { header: t(`columns.for.${area}`), value: (row) => row.target }, { header: t("columns.why"), value: (row) => row.why }, { header: t("columns.status"), value: (row) => t(`statuses.${row.status}`) }]} />,
    empty: { icon: <PenLine className="h-8 w-8 text-muted/30" />, label: term || status ? t("noMatch") : t(`empty.${area}`) },
    link: <Link href="/app/insights/findings" className="w-fit text-[13px] text-secondary hover:text-foreground">{t(`seeInsights.${area}`)}</Link>,
    // A site leads a link's row, as the board draws it; a fix leads the others.
    columns: (area === "LINKS" ? ["for", "draft"] : ["draft", "for"]).map((key) => key === "draft"
      ? { key: "draft", header: t(`columns.draft.${area}`), cell: (row: Row) => <span className="text-[13px] text-foreground">{row.title}</span> }
      : { key: "for", header: t(`columns.for.${area}`), cell: (row: Row) => <span className="truncate text-[12px] text-secondary">{row.target}</span> }).concat([
      { key: "why", header: t("columns.why"), cell: (row: Row) => <span className="text-[12px] text-secondary">{row.why}</span> },
      { key: "status", header: t("columns.status"), cell: (row: Row) => <StatusLabel tone={TONE[row.status]}>{t(`statuses.${row.status}`)}</StatusLabel> },
    ]),
  };
}

type Row = { title: string; target: string; why: string; status: DraftStatus };
