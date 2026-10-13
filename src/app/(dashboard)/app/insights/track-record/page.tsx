"use client";

import { useQuery } from "convex/react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { useRouter } from "next/navigation";
import { History } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { HakkenSees } from "@/src/ui/components/screens/HakkenSees";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { TagLabel } from "@/src/ui/components/screens/TagLabel";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { formatDay, formatNumber } from "../../sites/_components/siteFormat";
import { ListDownload } from "../../sites/_components/SiteDownloads";
import { useSitePager } from "../../sites/_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../sites/_components/useSiteParam";
import { useInsightsBox, useInsightsHref, useInsightsSite } from "../_components/useInsights";
import { boxedSays } from "../_components/insightBoxSays";
import { soFarRow } from "../_components/insightCheck";

const RESULT_TONE = { RIGHT: "success", WRONG: "warning", TOO_EARLY: "neutral", DUE: "info" } as const;
const CHANGE_TONE = { GREW: "success", HELD: "neutral", LOST: "warning", WAITING: "info", TOO_EARLY: "info" } as const;

/**
 * The Track record (docs/plans/active/insights-analyst-plan.md §2.7, §4.1,
 * I25, I30; drawn as the Track board): every finding, whether it was acted
 * on, and whether it proved right on the day it named; the change log —
 * each change Hakken saw and what followed; and what the changes teach, from
 * this website's own and, once enough companies have made one, from totals
 * across Hakken.
 */
export default function InsightsTrackRecordPage() {
  const t = usePlatformTranslations("insights.track");
  const tBox = usePlatformTranslations("insights.box");
  const tCheck = usePlatformTranslations("insights.check");
  const box = useInsightsBox("TRACK_RECORD");
  const router = useRouter();
  const href = useInsightsHref();
  const site = useInsightsSite();
  const data = useQuery(api.insightsReads.insightsTrackRecord, site ? { siteId: site } : {});
  const [changeSearch, setChangeSearch, changeTerm] = useSiteSearch("q", "changes");
  const [search, setSearch, term] = useSiteSearch();
  const [result, setResult] = useSiteParam<string>("result", "");
  const today = new Date().toISOString().slice(0, 10);
  const resultOf = (row: { outcome: string | null; checkOn: string | null }) => row.outcome ?? (row.checkOn && row.checkOn <= today ? "TOO_EARLY" : "DUE");
  const changeWords = (row: { kind: string; from: string | null; to: string | null }) => t(`changes.kinds.${row.kind}`, { from: row.from ?? "", to: row.to ?? "" });
  const changeMatch = wordStartMatcher(changeTerm.toLowerCase());
  // The approved fixes join the change log (I39): what changed, on the day it was approved, and what its tagged link brought.
  const fixRows = (data?.fixes ?? []).map((fix) => ({
    changeId: fix.draftId as string, host: fix.host, kind: "FIX", from: fix.title, to: fix.target, seenIn: "campaigns", before: fix.visits, after: fix.enquiries,
    result: fix.enquiries > 0 ? "GREW" : fix.visits > 0 ? "HELD" : "WAITING", week: fix.approved, day: fix.approved,
  }));
  const changes = data ? [...fixRows, ...data.changes].filter((row) => !changeMatch || changeMatch(changeWords(row))) : undefined;
  // Where each change was seen: Analytics' pages, the weekly check of the money pages, the company's own Google profile (I25).
  const seenIn = (row: { kind: string; seenIn: string }) => t(row.kind === "FIX" ? "changes.campaigns" : row.seenIn === "pageCheck" ? "changes.pageCheck" : row.seenIn === "profile" ? "changes.profile" : "changes.analytics");
  const followed = (row: { kind: string; seenIn: string; before: number; after: number; result: string }) => {
    if (row.kind === "FIX") return t("changes.fixFollowed", { visits: row.before, enquiries: row.after });
    // A page or profile change is judged on the 30 days either side of its day; a page replaced, on the years.
    if (row.seenIn === "pageCheck" || row.seenIn === "profile") {
      const which = row.seenIn === "pageCheck" ? "page" : "site";
      return t(row.result === "TOO_EARLY" ? `changes.${which}Waiting` : `changes.${which}Followed`, { before: row.before, after: row.after });
    }
    return t("changes.followedWords", { before: row.before, after: row.after });
  };
  const when = (row: { day: string | null; week: string }) => formatDay(row.day ?? row.week);
  const match = wordStartMatcher(term.toLowerCase());
  const findings = data?.findings.filter((row) => (!result || resultOf(row) === result) && (!match || match(row.headline)));
  const changePages = useSitePager(changes, { isLoading: data === undefined, table: "changes" });
  const findingPages = useSitePager(findings, { isLoading: data === undefined });

  const written = data?.findings.length ?? 0;
  const acted = data?.findings.filter((row) => row.actedAt).length ?? 0;
  const firstDue = data?.findings.map((row) => row.checkOn).filter((day): day is string => Boolean(day)).sort()[0] ?? null;
  const checked = data ? data.tally.right + data.tally.wrong + data.tally.unclear : 0;
  const says = data
    ? checked > 0
      ? [t("sees.checked", { checked, right: data.tally.right, wrong: data.tally.wrong })]
      : [t("sees.none", { written, day: firstDue ? formatDay(firstDue) : "–" })]
    : [];
  // The Head of Strategy's box is one website's: shown when the screen is that website's — one chosen, or the company's findings all its.
  const oneWebsite = Boolean(site) || new Set(data?.findings.map((row) => row.host)).size <= 1;
  const boxed = oneWebsite ? boxedSays(box, says, tBox) : says;
  const firstUnacted = data?.findings.find((row) => !row.actedAt);
  const steps = firstUnacted ? [{ words: t("sees.act"), link: t("seeFinding"), href: href(`findings/${firstUnacted.findingId}`) }] : [];
  const learning = data?.learnings.map((entry) => {
    const own = t("learnings.own", { kind: t(`changes.kindNames.${entry.kind}`), held: entry.own.held + entry.own.grew, all: entry.own.lost + entry.own.held + entry.own.grew });
    return entry.across ? `${own} ${t("learnings.across", { held: entry.across.held + entry.across.grew, all: entry.across.lost + entry.across.held + entry.across.grew, companies: entry.across.companies })}` : own;
  }) ?? [];

  return (
    <>
      <PageHeader icon={<History className="h-5 w-5 text-brand" />} title={t("title")} description={t("description")} />
      {data ? <HakkenSees says={boxed} steps={steps} /> : null}
      <FigureRow>
        <Figure label={t("figures.written")} value={data ? formatNumber(written) : "…"} detail={<span className="text-secondary">{t("figures.writtenDetail")}</span>} />
        <Figure label={t("figures.acted")} value={data ? formatNumber(acted) : "…"} detail={<span className="text-secondary">{t("figures.of", { all: formatNumber(written) })}</span>} />
        <Figure label={t("figures.right")} value={checked > 0 ? formatNumber(data?.tally.right ?? 0) : "–"} detail={<span className="text-secondary">{checked > 0 ? t("figures.of", { all: formatNumber(checked) }) : t("figures.firstDue", { day: firstDue ? formatDay(firstDue) : "–" })}</span>} />
        <Figure label={t("figures.wrong")} value={checked > 0 ? formatNumber(data?.tally.wrong ?? 0) : "–"} detail={<span className="text-secondary">{t("figures.wrongDetail")}</span>} />
      </FigureRow>
      <DataTable
        rows={changePages.pageRows}
        rowKey={(row) => row.changeId}
        search={{ value: changeSearch, onChange: setChangeSearch, placeholder: t("changes.search") }}
        cardHeader={<TableBar footer={changePages.footer} noun="results" title={t("changes.title")} actions={<ListDownload label={t("download")} fileName="insights-changes" rows={changes} columns={[{ header: t("changes.change"), value: changeWords }, { header: t("changes.when"), value: (row) => row.day ?? row.week }, { header: t("changes.seenIn"), value: seenIn }, { header: t("changes.followed"), value: followed }, { header: t("changes.result"), value: (row) => t(`changes.results.${row.result}`) }]} />} />}
        empty={{ icon: <History className="h-8 w-8 text-muted/30" />, label: changeTerm ? t("noMatch") : t("changes.empty") }}
        footer={changePages.footer}
        columns={[
          { key: "change", header: t("changes.change"), cell: (row) => <span className="flex flex-col"><span className="text-[13px] text-foreground">{changeWords(row)}</span><span className="text-[12px] text-secondary">{row.host}</span></span> },
          { key: "when", header: t("changes.when"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{when(row)}</span> },
          { key: "seenIn", header: t("changes.seenIn"), cell: (row) => <TagLabel>{seenIn(row)}</TagLabel> },
          { key: "followed", header: t("changes.followed"), cell: (row) => <span className="text-[12px] text-secondary">{followed(row)}</span> },
          { key: "result", header: t("changes.result"), cell: (row) => <StatusLabel tone={CHANGE_TONE[row.result as keyof typeof CHANGE_TONE] ?? "neutral"}>{t(`changes.results.${row.result}`)}</StatusLabel> },
        ]}
      />
      <Notice>{learning.length > 0 ? t("learnings.intro", { learnings: learning.join(" ") }) : t("learnings.none")}</Notice>
      <DataTable
        rows={findingPages.pageRows}
        rowKey={(row) => row.findingId}
        onRowClick={(row) => router.push(href(`findings/${row.findingId}`))}
        search={{ value: search, onChange: setSearch, placeholder: t("search") }}
        filters={
          <Select chip={{ label: t("result"), choice: result ? t(`results.${result}`) : null }} value={result} onChange={setResult} aria-label={t("result")}>
            <option value="">{t("everyResult")}</option>
            {(["DUE", "RIGHT", "WRONG", "TOO_EARLY"] as const).map((value) => <option key={value} value={value}>{t(`results.${value}`)}</option>)}
          </Select>
        }
        cardHeader={<TableBar footer={findingPages.footer} noun="results" title={t("findingsTitle")} actions={<ListDownload label={t("download")} fileName="insights-track-record" rows={findings} columns={[{ header: t("columns.finding"), value: (row) => row.headline }, { header: t("columns.acted"), value: (row) => (row.actedAt ? t("yes") : t("notYet")) }, { header: t("columns.checkOn"), value: (row) => row.checkOn ?? "" }, { header: t("columns.result"), value: (row) => t(`results.${resultOf(row)}`) }]} />} />}
        empty={{ icon: <History className="h-8 w-8 text-muted/30" />, label: term || result ? t("noMatch") : t("empty") }}
        footer={findingPages.footer}
        columns={[
          { key: "finding", header: t("columns.finding"), cell: (row) => <span className="flex flex-col"><span className="text-[13px] text-foreground">{row.headline}</span>{row.outcomeNote ? <span className="text-[12px] text-secondary">{row.outcomeNote}</span> : null}</span> },
          { key: "acted", header: t("columns.acted"), cell: (row) => <TagLabel>{row.actedAt ? t("yes") : t("notYet")}</TagLabel> },
          { key: "checkOn", header: t("columns.checkOn"), cell: (row) => <span className="font-mono text-[12px] text-secondary">{row.checkOn ? formatDay(row.checkOn) : "–"}</span> },
          // An open finding's figure so far beside its result (utils/insightClock.ts).
          { key: "result", header: t("columns.result"), cell: (row) => {
            const soFar = row.outcome ? null : soFarRow(row.progress, tCheck);
            return <span className="flex flex-col gap-0.5"><StatusLabel tone={RESULT_TONE[resultOf(row) as keyof typeof RESULT_TONE]}>{t(`results.${resultOf(row)}`)}</StatusLabel>{soFar ? <span className="text-[12px] text-secondary">{soFar}</span> : null}</span>;
          } },
        ]}
      />
    </>
  );
}
