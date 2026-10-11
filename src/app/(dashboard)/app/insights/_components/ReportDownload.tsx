"use client";

import { useState } from "react";
import { usePlatformTranslations } from "@/src/hooks/usePlatformTranslations";
import { Download } from "lucide-react";
import { PagePrimaryAction } from "@/src/ui/components/screens/PageHeader";
import { formatDay } from "../../sites/_components/siteFormat";
import type { PdfWords, ReportView } from "./ReportPdf";

/** The PDF's words, in the screen's language. */
function usePdfWords(report: ReportView | null): PdfWords {
  const t = usePlatformTranslations("insights.pdf");
  const tm = usePlatformTranslations("insights.summary.measures");
  const ts = usePlatformTranslations("insights.summary.status");
  const tw = usePlatformTranslations("insights.reports.work");
  const measures = ["enquiries", "visitors", "visitorsPerEnquiry", "googleVisits", "googleClicksPerEnquiry", "googleEnquiries", "aiVisits", "marketShare", "aiMentions", "strength", "reviews"];
  return {
    boardReport: t("boardReport"), monthlyReport: t("monthlyReport"), summary: t("summary"), market: t("market"), quarter: t("quarter"), plan: t("plan"), month: t("month"),
    inOneMinute: t("inOneMinute"), scorecard: t("scorecard"), measure: t("measure"), now: t("now"), year: t("year"), change: t("change"), status: t("status"),
    shareTitle: t("shareTitle"), enquiriesTitle: t("enquiriesTitle"), findings: t("findings"), risks: t("risks"), opportunities: t("opportunities"), next: t("next"),
    decision: t("decision"), whatHappened: t("whatHappened"), whatsNext: t("whatsNext"), did: t("did"), writtenBy: t("writtenBy"),
    confidential: t("confidential", { company: report?.company ?? "" }),
    footer: t("footer", { day: report ? formatDay(report.to) : "" }),
    measures: { ...Object.fromEntries(measures.map((measure) => [measure, tm(measure)])), visits: t("visits"), googleClicks: t("googleClicks") },
    statuses: { ON_TRACK: ts("ON_TRACK"), WATCH: ts("WATCH"), BEHIND: ts("BEHIND") },
    work: Object.fromEntries(["findings", "facts", "rivals", "pages", "aiAnswers"].map((work) => [work, tw(work)])),
    page: (page, of) => t("page", { page, of }),
    covers: report ? t("covers", { from: formatDay(report.from), to: formatDay(report.to) }) : "",
    points: t("points"),
    author: t("author"),
  };
}

/**
 * Download a report as a PDF (insights-analyst-plan.md §4.2): the page's one
 * action, drawing the PDF in the browser from the report as written — the
 * library loaded only now, so no screen carries it. Never emailed (I17).
 */
export function ReportDownloadAction({ report, label }: { report: ReportView | null | undefined; label: string }) {
  const t = usePlatformTranslations("insights.pdf");
  const words = usePdfWords(report ?? null);
  const [busy, setBusy] = useState(false);
  if (!report || report.kind === "WEEKLY") return null;
  const download = async () => {
    setBusy(true);
    try {
      const { downloadReportPdf } = await import("./ReportPdf");
      await downloadReportPdf(report, words, formatDay(new Date(report.createdAt).toISOString().slice(0, 10)));
    } finally {
      setBusy(false);
    }
  };
  return (
    <PagePrimaryAction variant="brand" icon={<Download className="h-3.5 w-3.5" />} onClick={download} disabled={busy}>
      {busy ? t("drawing") : label}
    </PagePrimaryAction>
  );
}
