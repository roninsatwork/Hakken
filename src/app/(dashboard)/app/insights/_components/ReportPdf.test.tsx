// @vitest-environment node
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { renderToBuffer } from "@react-pdf/renderer";
import { reportDocument, type PdfWords, type ReportView } from "./ReportPdf";

/**
 * The reports' PDFs (docs/plans/active/insights-analyst-plan.md §4.2): the
 * board report draws five A4 pages and the monthly report two, from the
 * report as written, with no network and nothing stored. A sample of real
 * reports can be drawn into a folder to look at (`INSIGHTS_PDF_SAMPLE` and
 * `INSIGHTS_PDF_OUT`); the suite draws its own.
 */

const WORDS: PdfWords = {
  boardReport: "Board report", monthlyReport: "Monthly report", summary: "Summary", market: "Market position", quarter: "The quarter", plan: "The plan", month: "The month",
  inOneMinute: "In one minute", scorecard: "Scorecard", measure: "Measure", now: "This period", year: "Same weeks last year", change: "Change", status: "Status",
  shareTitle: "Our share of our market's Google visitors", enquiriesTitle: "Enquiries a month", findings: "What Hakken found", risks: "Risks", opportunities: "Opportunities",
  next: "Next quarter's priorities", decision: "The decision we recommend", whatHappened: "What happened", whatsNext: "What's next", did: "What Hakken did",
  writtenBy: "Written by Hakken", confidential: "Confidential to the board of Acme", footer: "Written by Hakken, to 10 Oct 2026.",
  measures: {
    enquiries: "Enquiries", visitors: "Visitors", visitorsPerEnquiry: "Visitors for each enquiry", googleVisits: "Visits from Google", googleClicksPerEnquiry: "Google clicks for each enquiry",
    googleEnquiries: "Enquiries from Google", aiVisits: "Visits from AI assistants", marketShare: "Share of your market's Google visitors", aiMentions: "Times AI answers name you",
    strength: "Strength in Google's eyes", reviews: "Google reviews", visits: "Visits", googleClicks: "Google clicks",
  },
  statuses: { ON_TRACK: "On track", WATCH: "Watch", BEHIND: "Behind" },
  work: { findings: "Findings", facts: "Figures read" },
  page: (page, of) => `${page} / ${of}`, covers: "Marketing report to the board, 13 Jul to 10 Oct 2026", points: "pts", author: "Hakken",
};

function report(kind: "BOARD" | "MONTHLY"): ReportView {
  return {
    reportId: "report_1" as ReportView["reportId"], host: "acme.test", company: "Acme", kind, title: kind === "BOARD" ? "Board report" : "Monthly report: September 2026",
    period: kind === "BOARD" ? "2026-Q4" : "2026-09", from: "2026-07-13", to: "2026-10-10", status: "WRITTEN", createdAt: Date.parse("2026-10-11T07:00:00Z"),
    body: {
      headline: "Winning the market, losing the enquiries", summary: "Enquiries fell to 26 from 74 while our share of the market rose.",
      points: ["Enquiries fell.", "Our share rose.", "Reviews stopped."], next: ["Rebuild the service pages."], risks: ["Fewer enquiries."], opportunities: ["Pages near page one."],
      decision: kind === "BOARD" ? "Move effort to the pages that win work." : null,
      scorecard: [{ measure: "enquiries", now: 26, before: 74, unit: "count", lowerIsBetter: false, place: null, places: null, status: "BEHIND" }],
      findings: [{ findingId: null, headline: "Same visitors, fewer enquiries.", action: "Give the guides a way to enquire." }],
      did: [{ work: "findings", count: 9 }],
      enquiriesByMonth: [{ month: "2026-08", visits: 300, conversions: 7 }, { month: "2026-09", visits: 320, conversions: 10 }],
      shareByMonth: [{ month: "2026-08", you: 900, total: 6000 }, { month: "2026-09", you: 1054, total: 6645 }],
      facts: [{ key: "month.enquiries.now", label: "enquiries", value: 10, unit: "count" }],
    },
  };
}

const pagesOf = (buffer: Buffer) => (buffer.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

describe("the reports' PDFs", () => {
  it("draws the board report as five pages and the monthly report as two", async () => {
    const board = await renderToBuffer(reportDocument(report("BOARD"), WORDS, "11 Oct 2026"));
    const month = await renderToBuffer(reportDocument(report("MONTHLY"), WORDS, "11 Oct 2026"));
    expect(board.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pagesOf(board)).toBe(5);
    expect(pagesOf(month)).toBe(2);
  });

  it.runIf(Boolean(process.env.INSIGHTS_PDF_SAMPLE && process.env.INSIGHTS_PDF_OUT))("draws a sample of real reports to look at", async () => {
    const lines = fs.readFileSync(process.env.INSIGHTS_PDF_SAMPLE!, "utf8").split("\n").filter(Boolean).map((line) => JSON.parse(line));
    for (const stored of lines.filter((line) => line.kind !== "WEEKLY")) {
      const view = { ...report(stored.kind), ...stored, reportId: stored._id, host: "ronins.co.uk", company: "Ronins Agency" } as ReportView;
      const buffer = await renderToBuffer(reportDocument(view, { ...WORDS, confidential: "Confidential to the board of Ronins Agency" }, "11 Oct 2026"));
      fs.writeFileSync(path.join(process.env.INSIGHTS_PDF_OUT!, `${stored.kind.toLowerCase()}.pdf`), buffer);
    }
  });
});
