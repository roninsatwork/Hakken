"use client";

import { useRef, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import html2canvas from "html2canvas";
import {
  BadgePoundSterling,
  Building2,
  ChevronRight,
  Download,
  Loader2,
  Play,
  ShoppingCart,
  Sparkles,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import Header from "@/src/ui/components/layout/Header";
import { SonaeMarkdown } from "@/src/ui/components/chat/SonaeMarkdown";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { LAYER } from "@/src/ui/lib/layers";

/**
 * The opportunity report: what converting the prospects and closing the chain
 * gaps would be worth, priced by the deterministic passes behind
 * `getLatestOpportunityReport` and narrated by the Comax agent.
 *
 * Every figure on this page is read from the report row. Nothing is computed
 * here beyond grouping stored rows — the acceptance rule is that any number
 * on screen can be reproduced by hand from the rows below it, and a screen
 * that derived its own totals would break that quietly.
 *
 * The shape of the page is the story told to a customer, not the shape of
 * the data: a total, a ranked "where the money is" list, then one card per
 * chain — biggest first — holding that chain's sites to win and its product
 * gaps. The first cut was two flat tables and Anthony called it: *"totally
 * awful and TLDR for anyone trying to read it"* (2026-08-03). Repetition is
 * collapsed into one sentence above each table instead of being restated on
 * every row, and every estimate says in plain words how it was priced —
 * management reads every prospect's price here, so all of them are shown.
 */

type Report = NonNullable<
  ReturnType<typeof useQuery<typeof api.salesOpportunityReports.getLatestOpportunityReport>>
>;
type Prospect = Report["prospects"][number];
type Gap = Report["gaps"][number];

/** Exact pounds, never compacted: the figures must match the working. */
function formatPounds(value: number) {
  return value.toLocaleString("en-GB", {
    style: "currency",
    currency: "GBP",
    minimumFractionDigits: value % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/**
 * How far along the fixed phase order is. The percentages are the honest
 * shape of the work — the two computed passes land quickly once the agent
 * calls them; the summary is the slow part — and the step count beside the
 * bar is what stops "a bar, but no idea how far through" (Anthony,
 * 2026-08-03, watching the first live run).
 */
const PHASE_PROGRESS: Record<Report["phase"], { step: number; percent: number }> = {
  MATCHING: { step: 1, percent: 25 },
  GAPS: { step: 2, percent: 55 },
  SUMMARY: { step: 3, percent: 85 },
  DONE: { step: 3, percent: 100 },
};
const PHASE_STEPS = 3;

type GapProductLine = Report["gapProducts"][number]["products"][number];

export default function OpportunityReportPage() {
  const t = useTranslations("salesData.opportunityReport");
  const report = useQuery(api.salesOpportunityReports.getLatestOpportunityReport, {});
  const pdfRef = useRef<HTMLDivElement>(null);

  // The export must carry everything the screen can show, so the capture
  // briefly forces every collapsed tail and the summary open, then lets go.
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    if (!pdfRef.current) return;
    setExporting(true);
    await new Promise((resolve) => setTimeout(resolve, 150));
    try {
      const canvas = await html2canvas(pdfRef.current, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#0d0d0d",
      });
      const link = document.createElement("a");
      link.download = `opportunity-report-${new Date().toISOString().split("T")[0]}.png`;
      link.href = canvas.toDataURL("image/png");
      link.click();
    } finally {
      setExporting(false);
    }
  };

  if (report === undefined) {
    return (
      <>
        <Header />
        <div className="flex items-center justify-center h-[50vh]">
          <Loader2 className="w-8 h-8 animate-spin text-brand" />
        </div>
      </>
    );
  }

  const isRunning = report?.status === "RUNNING";
  const hasSections = Boolean(report?.headline) && report?.phase === "DONE";
  const productsFor = report ? productsMapOf(report) : new Map<string, GapProductLine[]>();

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <BadgePoundSterling className="w-6 h-6 text-brand" />
              {t("title")}
            </h1>
            <p className="text-[13px] text-secondary mt-1">{t("subtitle")}</p>
          </div>
          {hasSections && (
            <button
              type="button"
              onClick={() => void handleExport()}
              className="flex items-center gap-2 px-3 py-2 rounded-[12px] border border-brand/40 bg-brand/10 text-[13px] text-brand hover:bg-brand/20 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              {t("exportButton")}
            </button>
          )}
        </div>

        <RunBar report={report} />

        {report === null || (!hasSections && !isRunning) ? (
          <EmptyState failureReason={report?.failureReason ?? null} />
        ) : null}

        {hasSections && report?.headline && (
          <div ref={pdfRef} className="flex flex-col gap-6 bg-background pb-4">
            <ImportLine report={report} />
            <TotalCard report={report} headline={report.headline} />
            {chainsOf(report).map((chain) => (
              <ChainCard
                key={chain.name}
                chain={chain}
                productsFor={productsFor}
                exporting={exporting}
              />
            ))}
            <CategoryChart report={report} />
            {report.summary && <AgentSummary summary={report.summary} exporting={exporting} />}
            {report.exceptions.length > 0 && <Exceptions exceptions={report.exceptions} />}
          </div>
        )}
      </div>
    </>
  );
}

/**
 * The button and the bar, in the customers screen's toolbar idiom: one press,
 * both rest while it works, and the line carries the story — including how
 * the last run ended, because finishing silently reads as never finishing.
 */
function RunBar({ report }: { report: Report | null }) {
  const t = useTranslations("salesData.opportunityReport");
  const startReport = useMutation(api.salesOpportunityReports.startOpportunityReport);
  const [message, setMessage] = useState<string | null>(null);
  const isRunning = report?.status === "RUNNING";

  // A finish watched from this page announces itself once — an old finished
  // report must not greet every visit with a modal. The modal carries the
  // real ending: the first live run failed and the popup still said "ready",
  // which is exactly the kind of lie these screens are not allowed to tell.
  // The RUNNING → finished transition is caught during render, the React
  // previous-render pattern, because an effect doing it re-rendered twice.
  const [finishedNotice, setFinishedNotice] = useState<"DONE" | "FAILED" | null>(null);
  const [sawRunning, setSawRunning] = useState(false);
  if (isRunning && !sawRunning) setSawRunning(true);
  if (!isRunning && sawRunning && report && report.status !== "RUNNING") {
    setSawRunning(false);
    setFinishedNotice(report.status === "FAILED" ? "FAILED" : "DONE");
  }

  const onPress = async () => {
    setMessage(null);
    try {
      const result = await startReport({});
      if (result.alreadyRunning) setMessage(t("alreadyRunning"));
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : String(caught));
    }
  };

  // The line carries what is known so far — real counts the moment a pass
  // lands, like the research bar next door, never a bare spinner sentence
  // once there is a number to show.
  const statusLine = isRunning
    ? report.phase === "MATCHING"
      ? t("runningPhaseMatching")
      : report.phase === "GAPS"
        ? t("runningPhaseGapsCounted", { prospects: report.prospects.length })
        : t("runningPhaseSummaryCounted", {
            prospects: report.prospects.length,
            gaps: report.gaps.length,
          })
    : message
      ?? (report?.status === "FAILED"
        ? t("failed", { reason: report.failureReason ?? "" })
        : t("idle"));

  return (
    <>
      {finishedNotice && (
        <div
          className={`fixed inset-0 ${LAYER.OVERLAY} flex items-center justify-center bg-black/50 backdrop-blur-sm`}
        >
          <div className="w-[min(420px,90vw)] rounded-[16px] border border-border-dim bg-sidebar p-6 flex flex-col gap-4 shadow-xl">
            <h2 className="text-[16px] font-semibold text-foreground">
              {finishedNotice === "FAILED" ? t("failedTitle") : t("doneTitle")}
            </h2>
            <p className="text-[13.5px] text-secondary leading-relaxed">
              {finishedNotice === "FAILED"
                ? t("failedBody", { reason: report?.failureReason ?? "" })
                : t("doneBody")}
            </p>
            <button
              type="button"
              onClick={() => setFinishedNotice(null)}
              className="self-end px-4 py-2 rounded-[10px] border border-brand/40 bg-brand/10 text-[13px] text-brand hover:bg-brand/20 transition-colors"
            >
              {t("doneOk")}
            </button>
          </div>
        </div>
      )}
      <div
        className={`relative ${LAYER.PAGE_CHROME} flex flex-wrap items-center gap-3 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl`}
      >
        <button
          type="button"
          onClick={() => void onPress()}
          disabled={isRunning}
          className="flex items-center gap-2 px-3 py-2 rounded-[12px] border border-brand/40 bg-brand/10 text-[13px] text-brand hover:bg-brand/20 transition-colors disabled:opacity-60"
        >
          <Play className="w-3.5 h-3.5" />
          {t("runButton")}
        </button>
        <div className="flex-1 min-w-[220px] flex flex-col gap-1.5 px-2">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <span className={`text-[12.5px] ${isRunning ? "text-foreground" : "text-muted"}`}>
              {statusLine}
            </span>
            {isRunning && (
              <span className="text-[12px] text-secondary tabular-nums">
                {t("progressStep", {
                  step: PHASE_PROGRESS[report.phase].step,
                  total: PHASE_STEPS,
                  percent: PHASE_PROGRESS[report.phase].percent,
                })}
              </span>
            )}
          </div>
          <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
            <div
              className="h-full bg-brand transition-all duration-700"
              style={{ width: `${isRunning ? PHASE_PROGRESS[report.phase].percent : 0}%` }}
            />
          </div>
        </div>
      </div>
    </>
  );
}

function EmptyState({ failureReason }: { failureReason: string | null }) {
  const t = useTranslations("salesData.opportunityReport");
  return (
    <SonaeEmptyState
      icon={Sparkles}
      title={t("emptyTitle")}
      description={failureReason ? t("failed", { reason: failureReason }) : t("emptyBody")}
    />
  );
}

/** Which file the figures are sums over, and whether it is still current. */
function ImportLine({ report }: { report: Report }) {
  const t = useTranslations("salesData.opportunityReport");
  return (
    <div className="flex flex-wrap items-center gap-3 text-[12.5px] text-muted -mb-2">
      {report.importFileName && <span>{t("reportOf", { file: report.importFileName })}</span>}
      {!report.describesCurrentImport && (
        <span className="text-brand">{t("newerImport")}</span>
      )}
    </div>
  );
}

/** One chain's slice of the report: its prospects, its gaps, its totals. */
type Chain = {
  name: string;
  prospects: Prospect[];
  gaps: Gap[];
  prospectTotalGBP: number;
  gapTotalGBP: number;
  totalGBP: number;
};

/**
 * The stored rows regrouped under their chain, biggest chain first —
 * grouping and ordering only; every pound was priced upstream.
 */
function chainsOf(report: Report): Chain[] {
  const byName = new Map<string, { prospects: Prospect[]; gaps: Gap[] }>();
  const chainFor = (name: string) => {
    let chain = byName.get(name);
    if (!chain) {
      chain = { prospects: [], gaps: [] };
      byName.set(name, chain);
    }
    return chain;
  };
  for (const prospect of report.prospects) chainFor(prospect.groupName).prospects.push(prospect);
  for (const gap of report.gaps) chainFor(gap.groupName).gaps.push(gap);

  return [...byName.entries()]
    .map(([name, { prospects, gaps }]) => {
      const prospectTotalGBP = prospects.reduce(
        (sum, prospect) => sum + (prospect.estimateGBP ?? 0),
        0
      );
      const gapTotalGBP = gaps.reduce((sum, gap) => sum + gap.estimateGBP, 0);
      return {
        name,
        prospects: [...prospects].sort(
          (a, b) => (b.estimateGBP ?? -1) - (a.estimateGBP ?? -1)
        ),
        gaps: [...gaps].sort((a, b) => b.estimateGBP - a.estimateGBP),
        prospectTotalGBP,
        gapTotalGBP,
        totalGBP: prospectTotalGBP + gapTotalGBP,
      };
    })
    .sort((a, b) => b.totalGBP - a.totalGBP);
}

/**
 * The top of the report: the one number management came for, how it was
 * worked out in plain words, and the ranked list saying which chains it
 * sits in — the TLDR the two flat tables never gave anyone.
 */
function TotalCard({
  report,
  headline,
}: {
  report: Report;
  headline: NonNullable<Report["headline"]>;
}) {
  const t = useTranslations("salesData.opportunityReport");
  const chains = chainsOf(report);
  const largest = chains[0]?.totalGBP ?? 0;

  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl p-5 flex flex-col gap-5">
      <div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="text-[12px] text-secondary">{t("totalTitle")}</span>
          <span className="text-[12px] text-muted">{t("totalSub")}</span>
        </div>
        <div className="text-4xl lg:text-5xl font-semibold tracking-tight text-foreground tabular-nums mt-2">
          {formatPounds(headline.totalOpportunityGBP)}
        </div>
        <p className="text-[12.5px] text-muted mt-2">
          {t("totalSplit", {
            prospects: formatPounds(headline.prospectOpportunityGBP),
            gaps: formatPounds(headline.gapOpportunityGBP),
          })}
        </p>
      </div>

      <div className="border-t border-border-dim/60 pt-4">
        <h2 className="text-[13px] font-medium text-secondary mb-2">{t("methodTitle")}</h2>
        <ul className="flex flex-col gap-1 text-[12.5px] text-muted">
          {headline.prospectsSized > 0 && (
            <li>{t("methodSized", { count: headline.prospectsSized })}</li>
          )}
          {headline.prospectsUnsized > 0 && (
            <li>{t("methodUnsized", { count: headline.prospectsUnsized })}</li>
          )}
          {headline.prospectsUnpriced > 0 && (
            <li>{t("methodUnpriced", { count: headline.prospectsUnpriced })}</li>
          )}
        </ul>
      </div>

      <div className="border-t border-border-dim/60 pt-4">
        <h2 className="text-[13px] font-medium text-secondary mb-3">{t("leaderboardTitle")}</h2>
        <div className="flex flex-col gap-2.5">
          {chains.map((chain) => (
            <div
              key={chain.name}
              className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)_110px] items-center gap-3"
            >
              <div className="min-w-0">
                <div className="text-[13px] text-foreground truncate">{chain.name}</div>
                <div className="text-[11px] text-muted truncate">
                  {[
                    chain.prospects.length > 0
                      ? t("leaderboardSites", { count: chain.prospects.length })
                      : null,
                    chain.gaps.length > 0
                      ? t("leaderboardGaps", { count: chain.gaps.length })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </div>
              </div>
              <div className="h-2.5 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full"
                  style={{ width: `${largest > 0 ? Math.max((chain.totalGBP / largest) * 100, 1) : 0}%` }}
                />
              </div>
              <span className="text-right text-[13px] text-foreground tabular-nums">
                {formatPounds(chain.totalGBP)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Each gap's order sheet, keyed the way the gap rows are keyed. */
function productsMapOf(report: Report): Map<string, GapProductLine[]> {
  return new Map(
    report.gapProducts.map((entry) => [
      `${entry.accountNameKey} ${entry.categoryKey}`,
      entry.products,
    ])
  );
}

/**
 * A workbook description, read aloud: "KATRIN PLUS Z-FOLD 2PLY 135SHTS"
 * shouts, so plain words lose their capitals — but a token with a digit in
 * it is a size or a code, and rewriting those would corrupt the one part a
 * buyer needs verbatim to place an order.
 */
function humaniseProduct(description: string): string {
  return description
    .split(/\s+/)
    .map((word) =>
      /\d/.test(word) ? word : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
    )
    .join(" ");
}

/**
 * One chain's card: a plain sentence saying what is on the table, then the
 * sites to win and the product gaps. What is identical across rows — the
 * comparison pool, the "no size on file" story — is said once above or below
 * the table, so the rows only carry what differs: site, size, price.
 */
function ChainCard({
  chain,
  productsFor,
  exporting,
}: {
  chain: Chain;
  productsFor: Map<string, GapProductLine[]>;
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");

  const summary =
    chain.prospects.length > 0 && chain.gaps.length > 0
      ? t("chainSummaryBoth", {
          sites: chain.prospects.length,
          sitesValue: formatPounds(chain.prospectTotalGBP),
          gaps: chain.gaps.length,
          gapsValue: formatPounds(chain.gapTotalGBP),
        })
      : chain.prospects.length > 0
        ? t("chainSummaryProspectsOnly", {
            sites: chain.prospects.length,
            sitesValue: formatPounds(chain.prospectTotalGBP),
          })
        : t("chainSummaryGapsOnly", {
            gaps: chain.gaps.length,
            gapsValue: formatPounds(chain.gapTotalGBP),
          });

  return (
    <section className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl p-5 flex flex-col gap-5">
      <div>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-[16px] font-semibold text-foreground">{chain.name}</h2>
          <span className="text-[16px] font-semibold text-foreground tabular-nums">
            {formatPounds(chain.totalGBP)}
          </span>
        </div>
        <p className="text-[13px] text-secondary mt-1">{summary}</p>
      </div>

      {chain.prospects.length > 0 && <ChainProspects chain={chain} />}
      {chain.gaps.length > 0 && (
        <ChainGaps chain={chain} productsFor={productsFor} exporting={exporting} />
      )}
    </section>
  );
}

/** Every prospect, every price: management reads this list, so none hide. */
function ChainProspects({ chain }: { chain: Chain }) {
  const t = useTranslations("salesData.opportunityReport");

  const unsized = chain.prospects.filter(
    (prospect) =>
      prospect.confidence === "GROUP_AVERAGE" || prospect.confidence === "TYPE_AVERAGE"
  );
  const allUnsized = unsized.length === chain.prospects.length;
  const comparedNames = [
    ...new Set(
      chain.prospects.flatMap((prospect) =>
        prospect.comparedTo.map((entry) => entry.accountName)
      )
    ),
  ];

  return (
    <div className="border-t border-border-dim/60 pt-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="text-[14px] font-medium text-foreground flex items-center gap-2">
          <Building2 className="w-4 h-4 text-brand" />
          {t("chainProspectsTitle")}
        </h3>
        <span className="text-[14px] font-medium text-foreground tabular-nums">
          {formatPounds(chain.prospectTotalGBP)}
        </span>
      </div>
      {allUnsized && unsized[0] ? (
        <p className="text-[12.5px] text-muted mb-3">
          {t("allUnsizedNote", { count: unsized[0].comparedTo.length })}
        </p>
      ) : unsized.length > 0 ? (
        <p className="text-[12.5px] text-muted mb-3">
          {t("someUnsizedNote", { count: unsized.length })}
        </p>
      ) : (
        <div className="mb-3" />
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr>
              <Th>{t("thSite")}</Th>
              <Th>{t("thSize")}</Th>
              <Th>{t("thPricing")}</Th>
              <Th className="text-right">{t("thEstimate")}</Th>
            </tr>
          </thead>
          <tbody>
            {chain.prospects.map((prospect) => (
              <tr
                key={prospect.prospectKey}
                title={prospect.basis}
                className="border-t border-border-dim/60"
              >
                <Td className="text-foreground">{prospect.siteName}</Td>
                <Td>
                  {prospect.size !== null && prospect.sizeUnit
                    ? t(prospect.sizeUnit === "bedrooms" ? "beds" : "pupils", {
                        count: prospect.size,
                      })
                    : "—"}
                </Td>
                <Td>
                  <PricingCell prospect={prospect} />
                </Td>
                <Td className="text-right tabular-nums text-foreground">
                  {prospect.estimateGBP !== null ? formatPounds(prospect.estimateGBP) : "—"}
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {comparedNames.length > 0 && (
        <p className="text-[11.5px] text-muted mt-2">
          {t("comparedAgainst", { names: comparedNames.join(", ") })}
        </p>
      )}
    </div>
  );
}

/**
 * How one prospect was priced, in the words a customer would use — "based
 * on…", never method codes. The first live reading proved why: Anthony saw
 * "Compared against SOUTH LODGE" beside "12 beds" and asked why South Lodge
 * was in the opportunity at all (2026-08-03). The sentence leads, the
 * arithmetic follows underneath, and the dot keeps firm (sized, brand) and
 * rough (average, grey) tellable apart at a glance.
 */
function PricingCell({ prospect }: { prospect: Prospect }) {
  const t = useTranslations("salesData.opportunityReport");
  const sized = prospect.confidence === "GROUP_SIZED" || prospect.confidence === "TYPE_SIZED";
  const unit = prospect.sizeUnit === "pupils" ? "Pupils" : "Beds";
  const label = sized
    ? t(prospect.confidence === "GROUP_SIZED" ? `pricingSizedChain${unit}` : `pricingSizedType${unit}`)
    : prospect.confidence === "GROUP_AVERAGE"
      ? t("pricingChainAverage")
      : prospect.confidence === "TYPE_AVERAGE"
        ? t("pricingTypeAverage")
        : t("pricingNone");
  return (
    <div className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 text-[12.5px] text-secondary">
        <span
          className={`w-1.5 h-1.5 rounded-full shrink-0 ${sized ? "bg-brand" : "bg-white/25"}`}
        />
        {label}
      </span>
      {sized && (
        <span className="text-[11.5px] text-muted pl-3.5">
          {t(`pricingMath${unit}`, {
            count: prospect.size ?? 0,
            rate: formatPounds(prospect.ratePerUnitGBP ?? 0),
          })}
        </span>
      )}
    </div>
  );
}

/**
 * The chain's product gaps, account by account, every gap on show. Each gap
 * is a visible accordion — the chevron and the product count say there is an
 * order sheet inside, one press opens it, and the export opens every one.
 * Only the category wears the bright foreground: "they don't need to be in
 * white, maybe only the product category is" (Anthony, 2026-08-03).
 */
function ChainGaps({
  chain,
  productsFor,
  exporting,
}: {
  chain: Chain;
  productsFor: Map<string, GapProductLine[]>;
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");

  // chain.gaps arrive sorted by estimate, so each account's list inherits it.
  const byAccount = new Map<string, { accountName: string; gaps: Gap[]; totalGBP: number }>();
  for (const gap of chain.gaps) {
    const entry = byAccount.get(gap.accountNameKey) ?? {
      accountName: gap.accountName,
      gaps: [],
      totalGBP: 0,
    };
    entry.gaps.push(gap);
    entry.totalGBP += gap.estimateGBP;
    byAccount.set(gap.accountNameKey, entry);
  }
  const accounts = [...byAccount.values()].sort((a, b) => b.totalGBP - a.totalGBP);

  return (
    <div className="border-t border-border-dim/60 pt-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="text-[14px] font-medium text-foreground flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-brand" />
          {t("chainGapsTitle")}
        </h3>
        <span className="text-[14px] font-medium text-foreground tabular-nums">
          {formatPounds(chain.gapTotalGBP)}
        </span>
      </div>
      <p className="text-[12.5px] text-muted mb-4">{t("gapsPricingNote")}</p>

      <div className="flex flex-col gap-6">
        {accounts.map((account) => (
          <div key={account.accountName}>
            <div className="flex items-baseline justify-between gap-3 border-b border-border-dim/60 pb-2 mb-3">
              <span className="text-[13px] font-medium text-secondary">
                {account.accountName}
              </span>
              <span className="text-[13px] font-medium text-secondary tabular-nums">
                {formatPounds(account.totalGBP)}
              </span>
            </div>
            <div className="flex flex-col gap-3">
              {account.gaps.map((gap) => (
                <GapRow
                  key={gap.categoryKey}
                  gap={gap}
                  products={productsFor.get(`${gap.accountNameKey} ${gap.categoryKey}`) ?? []}
                  exporting={exporting}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One gap: a category, its worth, and the order sheet folded underneath. */
function GapRow({
  gap,
  products,
  exporting,
}: {
  gap: Gap;
  products: GapProductLine[];
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");
  const [open, setOpen] = useState(false);
  const expanded = (open || exporting) && products.length > 0;

  return (
    <div title={gap.basis}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        disabled={products.length === 0}
        className="w-full text-left rounded-[8px] -mx-1.5 px-1.5 py-0.5 hover:bg-white/[0.03] transition-colors disabled:cursor-default"
      >
        <div className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="flex items-center gap-1.5 text-[13px] text-foreground">
            {products.length > 0 && (
              <ChevronRight
                className={`w-3.5 h-3.5 text-brand shrink-0 transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
              />
            )}
            {gap.category}
          </span>
          <span className="text-[13px] text-secondary tabular-nums">
            {formatPounds(gap.estimateGBP)}
          </span>
        </div>
        <div className={`text-[11.5px] text-muted ${products.length > 0 ? "pl-5" : ""}`}>
          {[
            t("sistersBuyThis", { buyers: gap.buyersCount, siblings: gap.siblingCount }),
            products.length > 0 ? t("productCount", { count: products.length }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </button>
      {expanded && (
        <div className="mt-1.5 ml-1.5 border-l-2 border-brand/25 pl-4 flex flex-col gap-1 pb-1">
          {products.map((product) => (
            <div
              key={product.description}
              className="flex items-baseline justify-between gap-3"
            >
              <span className="text-[12.5px] text-secondary">
                {humaniseProduct(product.description)}
              </span>
              <span className="text-[12px] text-muted tabular-nums shrink-0">
                {formatPounds(product.spendGBP)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The one chart that survived the redesign: gaps rolled up by product,
 * because "which products keep going unsold" crosses chain lines and no
 * card above can say it. Grouping sums stored rows; nothing new is priced.
 *
 * Drawn in the leaderboard's own idiom — name, bar, exact pounds on the end
 * of every line — not recharts, whose end-of-bar labels collapsed the bars
 * to slivers under v3 and whose axis ticks made the reader do the reading.
 */
function CategoryChart({ report }: { report: Report }) {
  const t = useTranslations("salesData.opportunityReport");

  const byCategory = new Map<string, number>();
  for (const gap of report.gaps) {
    byCategory.set(gap.category, (byCategory.get(gap.category) ?? 0) + gap.estimateGBP);
  }
  // Every category, not a top slice, and the grand total beside the title —
  // "why is this not grand totalled" (Anthony, 2026-08-03). The sum equals
  // the headline's gap figure because nothing is left out of the list.
  const data = [...byCategory.entries()]
    .map(([name, value]) => ({ name, value: Number(value.toFixed(2)) }))
    .sort((a, b) => b.value - a.value);
  if (data.length === 0) return null;
  const largest = data[0].value;
  const totalGBP = data.reduce((sum, row) => sum + row.value, 0);

  return (
    <ChartExportWrapper exportName="gap-revenue-by-category">
      <div className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl p-5 flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h3 className="text-[13px] font-medium text-secondary">{t("chartByCategory")}</h3>
          <span className="text-[14px] font-medium text-foreground tabular-nums">
            {formatPounds(totalGBP)}
          </span>
        </div>
        <div className="flex flex-col gap-3.5">
          {data.map((row) => (
            <div
              key={row.name}
              className="grid grid-cols-[minmax(140px,220px)_minmax(0,1fr)_110px] items-center gap-3"
            >
              <span className="text-[13px] text-foreground truncate">{row.name}</span>
              <div className="h-4 rounded-full bg-white/[0.06] overflow-hidden">
                <div
                  className="h-full bg-brand rounded-full"
                  style={{ width: `${Math.max((row.value / largest) * 100, 1)}%` }}
                />
              </div>
              <span className="text-right text-[13px] text-foreground tabular-nums">
                {formatPounds(row.value)}
              </span>
            </div>
          ))}
        </div>
      </div>
    </ChartExportWrapper>
  );
}

/**
 * The agent's prose, folded away at the bottom. It retells the sections
 * above — useful as a narrated take, deadly as an opener, which is where it
 * used to sit. The export unfolds it so the PNG carries the narration.
 */
function AgentSummary({ summary, exporting }: { summary: string; exporting: boolean }) {
  const t = useTranslations("salesData.opportunityReport");
  const [open, setOpen] = useState(false);
  const expanded = open || exporting;

  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl p-5">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-[15px] font-semibold text-foreground">{t("summaryTitle")}</h2>
          <p className="text-[12px] text-muted mt-0.5">{t("summaryNote")}</p>
        </div>
        {!exporting && (
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="px-2.5 py-1 rounded-[10px] border border-border-dim text-[12px] text-secondary hover:bg-white/[0.04] transition-colors"
          >
            {open ? t("summaryHide") : t("summaryShow")}
          </button>
        )}
      </div>
      {expanded && (
        <div className="text-secondary text-[14px] leading-relaxed max-w-4xl prose prose-invert prose-brand mt-4">
          <SonaeMarkdown content={summary} />
        </div>
      )}
    </div>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      className={`py-2 pr-4 text-left text-[11px] tracking-wide uppercase text-muted ${className}`}
    >
      {children}
    </th>
  );
}

function Td({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <td className={`py-2.5 pr-4 align-top text-secondary ${className}`}>{children}</td>;
}

function Exceptions({ exceptions }: { exceptions: string[] }) {
  const t = useTranslations("salesData.opportunityReport");
  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl p-5">
      <h3 className="text-[15px] font-semibold text-foreground mb-3">{t("exceptionsTitle")}</h3>
      <ul className="flex flex-col gap-1.5 text-[13px] text-muted list-disc list-inside">
        {exceptions.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
    </div>
  );
}
