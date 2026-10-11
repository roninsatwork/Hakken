"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { MessagesSquare } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Notice } from "@/src/ui/components/screens/Notice";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay, formatNumber } from "./siteFormat";
import { ListDownload } from "./SiteDownloads";
import { useSitePager } from "./useSitePagedTable";
import { useSiteParam, useSiteSearch } from "./useSiteParam";

const KINDS = ["SEARCH", "NAME", "GUIDE"] as const;
const TONE = { ASKING: "success", WAITING: "neutral", OVER_LIMIT: "warning" } as const;

/**
 * The buyer-question panel on Full answers (insights-analyst-plan.md I28,
 * phase 12, drawn on the VisAiAnswers board): Hakken's questions a business's
 * buyers would ask an AI assistant, what each was built from, how often that
 * is searched, whether it names the business, and whether it is asked yet —
 * for the page to draw under its own header. Nothing for a rival's website or
 * before the first panel.
 */
export function useBuyerPanel(siteId: Id<"companyWebsites">, host: string) {
  const t = useTranslations("sites.buyerPanel");
  const panel = useQuery(api.insightsPanel.sitePanel, { siteId });
  const [search, setSearch, term] = useSiteSearch("pq", "panel");
  const [kind, setKind] = useSiteParam<string>("built", "", ["", ...KINDS]);
  const matches = wordStartMatcher(term.toLowerCase());
  const rows = panel?.questions.filter((row) => (!kind || row.kind === kind) && (!matches || matches(`${row.prompt} ${row.builtFrom}`)));
  const pager = useSitePager(panel ? rows : undefined, { isLoading: panel === undefined, table: "panel" });
  const asking = panel?.questions.filter((row) => row.status === "ASKING").length ?? 0;
  const statusWords = (row: { status: keyof typeof TONE; firstAsked: number | null }) => (row.status === "ASKING" && row.firstAsked ? t("statuses.ASKING", { day: formatDay(new Date(row.firstAsked).toISOString().slice(0, 10)) }) : t(`statuses.${row.status}`, { day: "" }));
  return {
    shown: Boolean(panel),
    notice: panel ? <Notice>{t(panel.on ? "noticeOn" : "noticeOff", { count: panel.questions.length, asking })}</Notice> : null,
    pager,
    search: { value: search, onChange: setSearch, placeholder: t("search") },
    filters: (
      <Select chip={{ label: t("builtFrom"), choice: kind ? t(`kinds.${kind}`) : null }} value={kind} onChange={setKind} aria-label={t("builtFrom")}>
        <option value="">{t("everySource")}</option>
        {KINDS.map((value) => <option key={value} value={value}>{t(`kinds.${value}`)}</option>)}
      </Select>
    ),
    title: t("tableTitle", { count: rows?.length ?? 0, day: panel ? formatDay(new Date(panel.builtAt).toISOString().slice(0, 10)) : "–" }),
    download: <ListDownload label={t("download")} fileName={`${host}-buyer-questions`} rows={rows} columns={[{ header: t("columns.question"), value: (row) => row.prompt }, { header: t("columns.builtFrom"), value: (row) => row.builtFrom }, { header: t("columns.volume"), value: (row) => row.volume ?? "" }, { header: t("columns.name"), value: (row) => t(row.withName ? "withName" : "withoutName") }, { header: t("columns.status"), value: statusWords }]} />,
    empty: { icon: <MessagesSquare className="h-8 w-8 text-muted/30" />, label: t("noMatch") },
    link: <Link href="/app/insights/findings" className="w-fit text-[13px] text-secondary hover:text-foreground">{t("seeInsights")}</Link>,
    columns: [
      { key: "question", header: t("columns.question"), cell: (row: Row) => <span className="text-[13px] text-foreground">{row.prompt}</span> },
      { key: "builtFrom", header: t("columns.builtFrom"), cell: (row: Row) => <span className="text-[12px] text-secondary">{row.kind === "NAME" ? t("yourName") : row.builtFrom}</span> },
      { key: "volume", header: t("columns.volume"), align: "right" as const, cell: (row: Row) => <span className="font-mono text-[12px] text-secondary">{row.volume === null ? "–" : formatNumber(row.volume)}</span> },
      { key: "name", header: t("columns.name"), cell: (row: Row) => <TagLabel>{t(row.withName ? "withName" : "withoutName")}</TagLabel> },
      { key: "status", header: t("columns.status"), cell: (row: Row) => <StatusLabel tone={TONE[row.status]}>{statusWords(row)}</StatusLabel> },
    ],
  };
}

type Row = { prompt: string; builtFrom: string; kind: string; volume: number | null; withName: boolean; status: keyof typeof TONE; firstAsked: number | null };
