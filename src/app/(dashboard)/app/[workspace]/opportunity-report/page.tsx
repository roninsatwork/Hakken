"use client";

import { useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
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
import {
  CHART_EXPORT_BACKGROUND,
} from "@/src/ui/components/charts/chartPalette";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import Header from "@/src/ui/components/layout/Header";
import ChartExportWrapper from "@/src/ui/components/charts/ChartExportWrapper";
import SonaeEmptyState from "@/src/ui/components/feedback/SonaeEmptyState";
import { LAYER } from "@/src/ui/lib/layers";
import dynamic from "next/dynamic";

const SonaeMarkdown = dynamic(() =>
  import("@/src/ui/components/chat/SonaeMarkdown").then((module) => module.SonaeMarkdown)
);

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

/**
 * The two kinds of money, told apart at a glance: brand orange for winning
 * new sites, green for growing accounts already on the books. The same two
 * colours mark every badge, dot, chevron and rail on the page — "how do we
 * visually know which section is for prospects and which sections are for
 * upsells to existing clients?" (Anthony, 2026-08-03).
 */
function SectionBadge({ kind }: { kind: "new" | "upsell" }) {
  const t = useTranslations("salesData.opportunityReport");
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-[10.5px] font-medium uppercase tracking-wider border ${
        kind === "new"
          ? "border-brand/30 bg-brand/10 text-brand"
          : "border-[#10b981]/30 bg-[#10b981]/10 text-[#10b981]"
      }`}
    >
      {t(kind === "new" ? "badgeNewBusiness" : "badgeUpsell")}
    </span>
  );
}

export default function OpportunityReportPage() {
  const t = useTranslations("salesData.opportunityReport");
  const report = useQuery(api.salesOpportunityReports.getLatestOpportunityReport, {});
  const pdfRef = useRef<HTMLDivElement>(null);

  // The open tab lives in the address bar rather than in state, so a section
  // can be sent to somebody — "look at the suspects" is a link, not an
  // instruction to click twice.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeSection = parseSectionKey(searchParams?.get("section"));
  const openSection = (key: SectionKey) => {
    router.replace(`${pathname}?section=${key.toLowerCase()}`, { scroll: false });
  };

  // The export must carry everything the screen can show, so the capture
  // briefly forces every collapsed tail and the summary open, then lets go.
  const exportAction = useAdminAction({ scope: "app-opportunity-report-export" });
  const exporting = exportAction.isBusy("export");
  const handleExport = () => {
    const target = pdfRef.current;
    if (!target) return;
    return exportAction.run(
      async () => {
        const html2canvasPromise = import("html2canvas");
        await new Promise((resolve) => setTimeout(resolve, 150));
        const { default: html2canvas } = await html2canvasPromise;
        const canvas = await html2canvas(target, {
          scale: 2,
          useCORS: true,
          backgroundColor: CHART_EXPORT_BACKGROUND,
        });
        const link = document.createElement("a");
        link.download = `opportunity-report-${new Date().toISOString().split("T")[0]}.png`;
        link.href = canvas.toDataURL("image/png");
        link.click();
      },
      { key: "export", fallbackMessage: t("exportFailed") },
    );
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
  const basketFor = report ? basketMapOf(report) : new Map<string, TypeBasket>();

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
            <TotalCard headline={report.headline} exporting={exporting} />
            {/* The export carries the whole report, so every tab is rendered
                while capturing — the client's PDF is one document, not
                whichever third of it happened to be open. */}
            {!exporting && (
              <SectionTabs
                sections={sectionsOf(report)}
                active={activeSection}
                onOpen={openSection}
              />
            )}
            {sectionsOf(report)
              .filter((section) => exporting || section.key === activeSection)
              .map((section) => (
                <SectionBlock
                  key={section.key}
                  section={section}
                  report={report}
                  productsFor={productsFor}
                  basketFor={basketFor}
                  exporting={exporting}
                  showHeading={exporting}
                />
              ))}
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
  const action = useAdminAction({ scope: "app-opportunity-report-start" });
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
    const outcome = await action.run(() => startReport({}), {
      suppressErrorToast: true,
      fallbackMessage: t("startFailed"),
    });
    if (outcome.ok) {
      if (outcome.data.alreadyRunning) setMessage(t("alreadyRunning"));
    } else if (outcome.message) {
      setMessage(outcome.message);
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
 * The report's three kinds of money, in the order a salesperson works them.
 *
 * They used to be one list grouped by chain, which put a group nobody has ever
 * sold to in the same shape as a customer of ten years and ranked them against
 * each other — Barchester's two hundred homes outranking Colten Care, with a
 * small badge as the only clue. Anthony, 2026-08-05: three sections.
 *
 * The order is deliberate: closest money first. An upsell is to somebody
 * already buying, a prospect is a sister site of somebody already buying, and
 * a suspect is a company with no relationship at all.
 */
type SectionKey = "UPSELL" | "PROSPECTS" | "SUSPECTS";

type ReportSection = {
  key: SectionKey;
  chains: Chain[];
  totalGBP: number;
};

const SECTION_KEYS: SectionKey[] = ["UPSELL", "PROSPECTS", "SUSPECTS"];

/**
 * The tab's colour, matched to its dot in the total card.
 *
 * The same three colours carry the split from the headline into the tab bar
 * and down onto the section's own badges, so the reader learns them once.
 */
const SECTION_ACCENT: Record<
  SectionKey,
  { text: string; bar: string; dot: string; border: string }
> = {
  UPSELL: {
    text: "text-[#10b981]",
    bar: "bg-[#10b981]",
    dot: "bg-[#10b981]",
    border: "border-[#10b981]/25",
  },
  PROSPECTS: { text: "text-brand", bar: "bg-brand", dot: "bg-brand", border: "border-brand/25" },
  SUSPECTS: {
    text: "text-amber-300",
    bar: "bg-amber-400",
    dot: "bg-amber-400",
    border: "border-amber-400/25",
  },
};

/** `?section=suspects` in, `SUSPECTS` out — anything else is the first tab. */
function parseSectionKey(value: string | null | undefined): SectionKey {
  const upper = value?.toUpperCase();
  return SECTION_KEYS.find((key) => key === upper) ?? "UPSELL";
}

function sectionsOf(report: Report): ReportSection[] {
  const isSuspect = (prospect: Prospect) => prospect.origin === "MARKET_DISCOVERY";

  const build = (key: ReportSection["key"], prospects: Prospect[], gaps: Gap[]) => {
    const chains = chainsOf(prospects, gaps);
    return {
      key,
      chains,
      totalGBP: chains.reduce((sum, chain) => sum + chain.totalGBP, 0),
    };
  };

  return [
    build("UPSELL", [], report.gaps),
    build("PROSPECTS", report.prospects.filter((prospect) => !isSuspect(prospect)), []),
    build("SUSPECTS", report.prospects.filter(isSuspect), []),
  ];
}

/**
 * The stored rows regrouped under their chain, biggest chain first —
 * grouping and ordering only; every pound was priced upstream.
 */
function chainsOf(prospects: Prospect[], gaps: Gap[]): Chain[] {
  const byName = new Map<string, { prospects: Prospect[]; gaps: Gap[] }>();
  const chainFor = (name: string) => {
    let chain = byName.get(name);
    if (!chain) {
      chain = { prospects: [], gaps: [] };
      byName.set(name, chain);
    }
    return chain;
  };
  for (const prospect of prospects) chainFor(prospect.groupName).prospects.push(prospect);
  for (const gap of gaps) chainFor(gap.groupName).gaps.push(gap);

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
 * The one number management came for, and nothing else.
 *
 * This was a full-height card: the total, the three-way split, the pricing
 * method and a ranked leaderboard of every chain — about a screen and a half
 * before the reader reached any actual opportunity. Anthony, 2026-08-05: *"i
 * dont think we need this large hero section."*
 *
 * What went and why: the split is now the tab bar directly below, stated in
 * the same three colours, so printing it twice was repetition. The leaderboard
 * ranked chains across warm and cold together, which is the thing the three
 * sections exist to stop, and each section already lists its own chains
 * biggest-first. The pricing method stays — it is how the reader knows the
 * figures are honest — but folded away, because it is read once and never
 * again.
 */
function TotalCard({
  headline,
  exporting,
}: {
  headline: NonNullable<Report["headline"]>;
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");
  const [openMethod, setOpenMethod] = useState(false);
  const showMethod = openMethod || exporting;

  return (
    <div className="bg-sidebar/40 border border-border-dim rounded-[20px] backdrop-blur-xl px-5 py-4 flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-x-5 gap-y-1 flex-wrap">
        <div className="flex items-baseline gap-3 flex-wrap">
          <span className="text-3xl font-semibold tracking-tight text-foreground tabular-nums">
            {formatPounds(headline.totalOpportunityGBP)}
          </span>
          <span className="text-[12.5px] text-secondary">{t("totalTitle")}</span>
          <span className="text-[12px] text-muted">{t("totalSub")}</span>
        </div>
        {!exporting && (
          <button
            type="button"
            onClick={() => setOpenMethod((open) => !open)}
            className="text-[12px] text-secondary hover:text-foreground transition-colors"
          >
            {t("methodTitle")}
          </button>
        )}
      </div>

      {showMethod && (
        <ul className="flex flex-col gap-1 text-[12.5px] text-muted border-t border-border-dim/60 pt-3">
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
      )}
    </div>
  );
}

function SectionTabs({
  sections,
  active,
  onOpen,
}: {
  sections: ReportSection[];
  active: SectionKey;
  onOpen: (key: SectionKey) => void;
}) {
  const t = useTranslations("salesData.opportunityReport");

  return (
    <div
      role="tablist"
      className="grid grid-cols-1 sm:grid-cols-3 gap-2 bg-sidebar/40 border border-border-dim rounded-[16px] p-2 backdrop-blur-xl"
    >
      {sections.map((section) => {
        const isActive = section.key === active;
        const accent = SECTION_ACCENT[section.key];
        // An empty tab is shown, not hidden. A missing Suspects tab reads as a
        // feature nobody built; an empty one reads as a job nobody has run,
        // which is the true and actionable version.
        const isEmpty = section.chains.length === 0;

        return (
          <button
            key={section.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onOpen(section.key)}
            className={`text-left rounded-[12px] px-3.5 py-3 border transition-colors ${
              isActive
                ? "border-border bg-foreground/[0.04]"
                : "border-transparent hover:bg-foreground/[0.02]"
            }`}
          >
            <span className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full shrink-0 ${accent.dot} ${isEmpty ? "opacity-40" : ""}`} />
              <span
                className={`text-[13px] font-medium ${
                  isActive ? "text-foreground" : isEmpty ? "text-muted" : "text-secondary"
                }`}
              >
                {t(`section${section.key}Tab`)}
              </span>
            </span>
            <span
              className={`block mt-1 text-[17px] font-semibold tabular-nums ${
                isEmpty ? "text-muted" : isActive ? accent.text : "text-foreground"
              }`}
            >
              {formatPounds(section.totalGBP)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function SectionBlock({
  section,
  report,
  productsFor,
  basketFor,
  exporting,
  showHeading,
}: {
  section: ReportSection;
  report: Report;
  productsFor: Map<string, GapProductLine[]>;
  basketFor: Map<string, TypeBasket>;
  exporting: boolean;
  /** The tab bar names the open section, so the heading is for the export. */
  showHeading: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");
  const accent = SECTION_ACCENT[section.key];

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div className="flex items-start gap-2.5">
          <span className={`w-1 h-9 rounded-full shrink-0 mt-0.5 ${accent.bar}`} />
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">
              {t(`section${section.key}Title`)}
            </h2>
            <p className="text-[12.5px] text-secondary mt-0.5">
              {t(`section${section.key}Note`)}
            </p>
          </div>
        </div>
        {showHeading && (
          <span className="text-[18px] font-semibold text-foreground tabular-nums">
            {formatPounds(section.totalGBP)}
          </span>
        )}
      </div>

      {section.chains.length === 0 ? (
        <p className="text-[13px] text-muted">{t(`section${section.key}Empty`)}</p>
      ) : (
        section.chains.map((chain) => (
          <ChainCard
            key={chain.name}
            chain={chain}
            productsFor={productsFor}
            basketFor={basketFor}
            accent={accent}
            exporting={exporting}
          />
        ))
      )}

      {/* The category chart is upsell money broken down by product, so it
          belongs to the upsell section. It used to sit below all three, where
          it read as a summary of the whole report and was not one. */}
      {section.key === "UPSELL" && section.chains.length > 0 && (
        <CategoryChart report={report} />
      )}
    </section>
  );
}

type TypeBasket = Report["typeBaskets"][number];

/** What a customer of each type buys, keyed by the type a prospect carries. */
function basketMapOf(report: Report): Map<string, TypeBasket> {
  // Keyed by the display name, because that is what a priced prospect row
  // carries — both sides come from the same account rows, so they match.
  return new Map(report.typeBaskets.map((basket) => [basket.customerType, basket]));
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
  basketFor,
  accent,
  exporting,
}: {
  chain: Chain;
  productsFor: Map<string, GapProductLine[]>;
  basketFor: Map<string, TypeBasket>;
  accent: { text: string; border: string };
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

      {chain.prospects.length > 0 && (
        <ChainProspects
          chain={chain}
          basketFor={basketFor}
          accent={accent}
          exporting={exporting}
        />
      )}
      {chain.gaps.length > 0 && (
        <ChainGaps chain={chain} productsFor={productsFor} exporting={exporting} />
      )}
    </section>
  );
}

/** Every prospect, every price: management reads this list, so none hide. */
function ChainProspects({
  chain,
  basketFor,
  accent,
  exporting,
}: {
  chain: Chain;
  basketFor: Map<string, TypeBasket>;
  accent: { text: string; border: string };
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");

  const unsized = chain.prospects.filter(
    (prospect) =>
      prospect.confidence === "GROUP_AVERAGE" || prospect.confidence === "TYPE_AVERAGE"
  );
  const allUnsized = unsized.length === chain.prospects.length;
  // Every site in a chain shares one customer type, so one basket serves the
  // whole table rather than repeating itself on each row.
  const basket = basketFor.get(chain.prospects[0]?.customerType ?? "");
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
          <SectionBadge kind="new" />
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
                <Td className="text-foreground">
                  <span className="inline-flex items-center gap-2">
                    {prospect.siteName}
                    {prospect.origin === "MARKET_DISCOVERY" && (
                      <span className="px-1.5 py-0.5 rounded-[6px] bg-amber-500/10 text-[10px] uppercase tracking-wide text-amber-300">
                        {t("marketDiscovery")}
                      </span>
                    )}
                  </span>
                </Td>
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
      {basket && (
        <ProspectBasket
          basket={basket}
          totalGBP={chain.prospectTotalGBP}
          accent={accent}
          exporting={exporting}
        />
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
/**
 * What a site like this buys, and what that is worth here.
 *
 * A gap carries the sister accounts' real order sheet. A prospect had a single
 * pound figure and nothing else — four sites in a chain reading as four
 * identical guesses. This is the equivalent evidence for a site nobody
 * supplies: the category mix of the very customers the estimate was priced
 * against, applied to this chain's own estimate.
 *
 * Built as the upsell section's accordion rather than a table of its own, so
 * the two read as one report — Anthony, 2026-08-05: *"its the same ui style
 * across all tabs."* The share is stated on every line, so the arithmetic
 * stays checkable: the mix is the pool's, the total is this chain's, and
 * multiplying one by the other is the only step between them.
 */
function ProspectBasket({
  basket,
  totalGBP,
  accent,
  exporting,
}: {
  basket: TypeBasket;
  totalGBP: number;
  accent: { text: string; border: string };
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");

  if (basket.totalSpendGBP <= 0 || basket.categories.length === 0) return null;

  return (
    <div className="border-t border-border-dim/60 pt-4 mt-4">
      <div className="flex items-baseline justify-between gap-3 flex-wrap mb-1">
        <h3 className="text-[14px] font-medium text-foreground flex items-center gap-2">
          <ShoppingCart className={`w-4 h-4 ${accent.text}`} />
          {t("basketTitle")}
        </h3>
        <span className="text-[14px] font-medium text-foreground tabular-nums">
          {formatPounds(totalGBP)}
        </span>
      </div>
      <p className="text-[12.5px] text-muted mb-4">
        {t("basketNote", { count: basket.customerCount, type: basket.customerType })}
      </p>

      <div className="flex flex-col gap-3">
        {basket.categories.map((category) => (
          <BasketRow
            key={category.categoryKey}
            category={category}
            share={category.spendGBP / basket.totalSpendGBP}
            totalGBP={totalGBP}
            accent={accent}
            exporting={exporting}
          />
        ))}
      </div>
    </div>
  );
}

/** One category of the basket, opened the way a gap opens. */
function BasketRow({
  category,
  share,
  totalGBP,
  accent,
  exporting,
}: {
  category: TypeBasket["categories"][number];
  share: number;
  totalGBP: number;
  accent: { text: string; border: string };
  exporting: boolean;
}) {
  const t = useTranslations("salesData.opportunityReport");
  const [open, setOpen] = useState(false);
  const products = category.products;
  const expanded = (open || exporting) && products.length > 0;

  return (
    <div>
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
                className={`w-3.5 h-3.5 ${accent.text} shrink-0 transition-transform ${
                  expanded ? "rotate-90" : ""
                }`}
              />
            )}
            {category.category}
          </span>
          <span className="text-[13px] text-secondary tabular-nums">
            {formatPounds(totalGBP * share)}
          </span>
        </div>
        <div className={`text-[11.5px] text-muted ${products.length > 0 ? "pl-5" : ""}`}>
          {[
            t("basketShare", { share: Math.round(share * 100) }),
            products.length > 0 ? t("productCount", { count: products.length }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </button>
      {expanded && (
        <div className={`mt-1.5 ml-1.5 border-l-2 ${accent.border} pl-4 flex flex-col gap-1 pb-1`}>
          {products.map((product) => (
            <div key={product.description} className="flex items-baseline justify-between gap-3">
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
          <ShoppingCart className="w-4 h-4 text-[#10b981]" />
          {t("chainGapsTitle")}
          <SectionBadge kind="upsell" />
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
                className={`w-3.5 h-3.5 text-[#10b981] shrink-0 transition-transform ${
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
            t("sistersBuyThisNamed", {
              buyers: gap.buyersCount,
              siblings: gap.siblingCount,
              accounts: formatAccountList(gap.comparedTo.map((account) => account.accountName)),
            }),
            products.length > 0 ? t("productCount", { count: products.length }) : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </button>
      {expanded && (
        <div className="mt-1.5 ml-1.5 border-l-2 border-[#10b981]/25 pl-4 flex flex-col gap-1 pb-1">
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

function formatAccountList(accounts: string[]): string {
  return [...new Set(accounts.map((account) => account.trim()).filter(Boolean))].join(", ");
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
          <h3 className="text-[13px] font-medium text-secondary flex items-center gap-2">
            {t("chartByCategory")}
            <SectionBadge kind="upsell" />
          </h3>
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
                  className="h-full bg-[#10b981] rounded-full"
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
