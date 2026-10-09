"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { Layers } from "lucide-react";
import { api } from "@/convex/_generated/api";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { Figure, FigureRow } from "@/src/ui/components/screens/Figure";
import { Notice } from "@/src/ui/components/screens/Notice";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Select } from "@/src/ui/components/screens/Select";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { TableBar } from "@/src/ui/components/screens/TableBar";
import { formatNumber } from "../../_components/siteFormat";
import { ListDownload } from "../../_components/SiteDownloads";
import { useSite, useSiteId } from "../../_components/useSite";
import { useSitePager } from "../../_components/useSitePagedTable";
import { useSiteParam, useSiteSearch } from "../../_components/useSiteParam";
import { useSiteSortedList, type SiteSortColumns } from "../../_components/useSiteSort";

type Phrase = { code: string; a?: number; b?: number; text?: string };
type Kind = "WEBSITE" | "PAGE" | "PROFILE" | "REVIEW_SITE" | "AI_APP" | "AI_OVERVIEW" | "DIRECTORY";
type Stage = "NOT_THERE" | "NOT_SEEN" | "SEEN_NOT_CHOSEN" | "WORKING";
type Row = { key: string; kind: Kind; name: string; sub?: string; seen: Phrase; chosen: Phrase | null; stage: Stage; fix: Phrase | null };

const GROUPS = ["website", "profiles", "reviews", "ai", "places"] as const;
const GROUP_OF: Record<Kind, (typeof GROUPS)[number]> = {
  WEBSITE: "website", PAGE: "website", PROFILE: "profiles", REVIEW_SITE: "reviews", AI_APP: "ai", AI_OVERVIEW: "ai", DIRECTORY: "places",
};
const STAGES = ["NOT_SEEN", "SEEN_NOT_CHOSEN", "WORKING", "NOT_THERE"] as const;
const STAGE_TONE = { NOT_THERE: "danger", NOT_SEEN: "warning", SEEN_NOT_CHOSEN: "warning", WORKING: "success" } as const;
/** Weakest first: what is not there, then what is not seen, then what is not chosen. */
const STAGE_ORDER: Record<Stage, number> = { NOT_THERE: 0, NOT_SEEN: 1, SEEN_NOT_CHOSEN: 2, WORKING: 3 };
const SORTS: SiteSortColumns<Row, "asset" | "stage"> = {
  asset: { value: (row) => row.name, first: "asc" },
  stage: { value: (row) => STAGE_ORDER[row.stage], first: "asc" },
};
const keyOf = (row: Row) => row.key;

/**
 * Discovery → Site → Your assets (docs/plans/active/discovery-local-
 * reputation-ai-plan.md, step 5, D18; drawn as "Site · Your assets"): every
 * place people can find the business, how often each is seen and chosen,
 * the stage where it loses people, and the first thing to fix.
 */
export default function YourAssetsPage() {
  const t = useTranslations("sites.assets");
  const { platformName } = useSystemSettings();
  const siteId = useSiteId();
  const site = useSite();
  const data = useQuery(api.siteAssets.yourAssets, { siteId });
  const [search, setSearch, term] = useSiteSearch();
  const [group, setGroup] = useSiteParam<(typeof GROUPS)[number] | "">("kind", "", GROUPS);
  const [stage, setStage] = useSiteParam<Stage | "">("stage", "", STAGES);

  const all = (data?.rows ?? []) as Row[];
  const matches = wordStartMatcher(term);
  const rows = data ? all.filter((row) => (!group || GROUP_OF[row.kind] === group) && (!stage || row.stage === stage) && (!matches || matches(row.name, row.sub))) : undefined;
  const { rows: sorted, tableSort } = useSiteSortedList(rows, SORTS, { opening: "stage", name: keyOf });
  const pager = useSitePager(sorted, { isLoading: data === undefined });
  const count = (kinds: readonly Kind[]) => all.filter((row) => kinds.includes(row.kind)).length;
  // A figure's or a fix's words from its code (`assetSummaries.ts`): one message a code, its numbers filled in.
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const phrase = (prefix: "seen" | "chosen" | "fix", value: Phrase | null) => (value ? coded(`${prefix}.${value.code}`, { a: formatNumber(value.a ?? 0), count: value.a ?? 0, b: value.b ?? 0, rating: ((value.b ?? 0) / 10).toFixed(1), text: value.text ?? "" }) : "–");
  const nameWords = (row: Row) => (row.kind === "PROFILE" ? t("profileOf", { town: row.sub ?? row.name }) : row.kind === "AI_APP" ? t("appAnswers", { name: row.name }) : row.name);
  const fileBase = `${site?.host ?? "site"}-your-assets`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={<Layers className="h-6 w-6 text-brand" />} title={t("title")} description={t("description")} />

      {data ? (
        <FigureRow>
          <Figure
            label={t("figures.assets")}
            value={all.length}
            detail={<span className="text-secondary">{t("figures.assetsDetail", { profiles: count(["PROFILE"]), reviews: count(["REVIEW_SITE"]), ai: count(["AI_APP", "AI_OVERVIEW"]), others: count(["PAGE", "DIRECTORY"]) })}</span>}
          />
          <Figure label={t("figures.working")} value={all.filter((row) => row.stage === "WORKING").length} detail={<span className="text-secondary">{t("figures.workingDetail")}</span>} />
          <Figure label={t("figures.losing")} emphasis value={all.filter((row) => row.stage === "NOT_SEEN" || row.stage === "SEEN_NOT_CHOSEN").length} detail={<span className="text-secondary">{t("figures.losingDetail")}</span>} />
          <Figure label={t("figures.missing")} href={`/app/sites/${siteId}/radar/sources?there=missing`} value={all.filter((row) => row.stage === "NOT_THERE").length} detail={<span className="text-secondary">{t("figures.missingDetail")}</span>} />
        </FigureRow>
      ) : null}
      <Notice>{t("notice", { platformName })}</Notice>

      <DataTable
        rows={pager.pageRows}
        rowKey={keyOf}
        search={{ value: search, onChange: setSearch, placeholder: t("searchPlaceholder") }}
        filters={
          <>
            <Select chip={{ label: t("kindFilter"), choice: group ? t(`groups.${group}`) : null }} value={group} onChange={(value) => setGroup(value as (typeof GROUPS)[number] | "")}>
              <option value="">{t("everyKind")}</option>
              {GROUPS.map((entry) => <option key={entry} value={entry}>{t(`groups.${entry}`)}</option>)}
            </Select>
            <Select chip={{ label: t("stageFilter"), choice: stage ? t(`stages.${stage}`) : null }} value={stage} onChange={(value) => setStage(value as Stage | "")}>
              <option value="">{t("everyStage")}</option>
              {STAGES.map((entry) => <option key={entry} value={entry}>{t(`stages.${entry}`)}</option>)}
            </Select>
          </>
        }
        cardHeader={<TableBar footer={pager.footer} noun="assets" actions={<ListDownload fileName={fileBase} rows={sorted ?? []} columns={[{ header: t("columns.asset"), value: nameWords }, { header: t("columns.kind"), value: (row) => t(`kinds.${row.kind}`) }, { header: t("columns.seen"), value: (row) => phrase("seen", row.seen) }, { header: t("columns.chosen"), value: (row) => phrase("chosen", row.chosen) }, { header: t("columns.stage"), value: (row) => t(`stages.${row.stage}`) }, { header: t("columns.fix"), value: (row) => phrase("fix", row.fix) }]} />} />}
        empty={{ icon: <Layers className="h-8 w-8 text-muted/30" />, label: term || group || stage ? t("noMatch") : t("empty") }}
        footer={pager.footer}
        sort={tableSort}
        columns={[
          {
            key: "asset",
            header: t("columns.asset"),
            sortable: true,
            cell: (row) => (
              <span className="flex min-w-0 flex-col">
                <span className="text-[13px] text-foreground">{nameWords(row)}</span>
                <span className="text-[12px] text-secondary">{t(`kinds.${row.kind}`)}</span>
              </span>
            ),
          },
          { key: "seen", header: t("columns.seen"), cell: (row) => <span className="text-[12px] text-secondary">{phrase("seen", row.seen)}</span> },
          { key: "chosen", header: t("columns.chosen"), cell: (row) => <span className="text-[12px] text-secondary">{phrase("chosen", row.chosen)}</span> },
          { key: "stage", header: t("columns.stage"), sortable: true, cell: (row) => <StatusLabel tone={STAGE_TONE[row.stage]}>{t(`stages.${row.stage}`)}</StatusLabel> },
          { key: "fix", header: t("columns.fix"), cell: (row) => <span className="text-[12px] text-foreground">{row.fix ? phrase("fix", row.fix) : <span className="text-muted">{t("nothingToFix")}</span>}</span> },
        ]}
      />
    </div>
  );
}
