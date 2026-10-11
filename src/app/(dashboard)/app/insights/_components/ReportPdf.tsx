"use client";

import { Document, Font, Page, Rect, StyleSheet, Svg, Text, View, pdf } from "@react-pdf/renderer";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@/convex/_generated/api";
import { PRINT_PALETTE as C } from "@/src/ui/components/charts/chartPalette";

/**
 * A report as a PDF (docs/plans/active/insights-analyst-plan.md §4.2): drawn
 * in the browser when Download is pressed, from the report as it was written —
 * never stored, never emailed (Anthony, 2026-10-11: "please don't email it
 * anywhere, we just want it downloadable at the moment"). The board report is
 * five A4 pages — a dark cover, the summary, the market, the quarter, the
 * plan — and the monthly report two. Loaded only when someone downloads, so
 * no screen carries it. How the PDF is made is revisited with Anthony after
 * the build (§4.2).
 */

export type ReportView = NonNullable<FunctionReturnType<typeof api.insightsReads.insightsReport>>;

/** The words the PDF prints, from the screen's language. */
export type PdfWords = {
  boardReport: string;
  monthlyReport: string;
  summary: string;
  market: string;
  quarter: string;
  plan: string;
  month: string;
  inOneMinute: string;
  scorecard: string;
  measure: string;
  now: string;
  year: string;
  change: string;
  status: string;
  shareTitle: string;
  enquiriesTitle: string;
  findings: string;
  risks: string;
  opportunities: string;
  next: string;
  decision: string;
  whatHappened: string;
  whatsNext: string;
  did: string;
  writtenBy: string;
  confidential: string;
  footer: string;
  measures: Record<string, string>;
  statuses: Record<string, string>;
  work: Record<string, string>;
  page: (page: number, of: number) => string;
  covers: string;
  points: string;
  author: string;
};

// Whole words only: a board report never breaks "commercial" across two lines.
Font.registerHyphenationCallback((word) => [word]);

const s = StyleSheet.create({
  page: { backgroundColor: C.paper, color: C.ink, padding: 48, fontFamily: "Helvetica", fontSize: 10, lineHeight: 1.5 },
  cover: { backgroundColor: C.cover, color: C.coverInk, padding: 56, fontFamily: "Helvetica", justifyContent: "space-between" },
  strip: { flexDirection: "row", justifyContent: "space-between", fontSize: 8, color: C.muted, borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingBottom: 8, marginBottom: 24 },
  kicker: { fontSize: 9, color: C.muted, letterSpacing: 1, textTransform: "uppercase", marginBottom: 6 },
  title: { fontSize: 22, fontFamily: "Helvetica-Bold", marginBottom: 12, lineHeight: 1.25 },
  heading: { fontSize: 12, fontFamily: "Helvetica-Bold", marginTop: 18, marginBottom: 8 },
  body: { fontSize: 10.5, color: C.ink, marginBottom: 10 },
  quiet: { fontSize: 9, color: C.secondary },
  figures: { flexDirection: "row", gap: 12, marginTop: 8, marginBottom: 8 },
  figure: { flex: 1, borderTopWidth: 1.5, borderTopColor: C.ink, paddingTop: 8 },
  figureValue: { fontSize: 20, fontFamily: "Courier-Bold", lineHeight: 1.2, marginTop: 4, marginBottom: 4 },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderBottomColor: C.rule, paddingVertical: 5 },
  cell: { flex: 1, fontSize: 9 },
  numberCell: { flex: 1, fontSize: 9, fontFamily: "Courier", textAlign: "right" },
  point: { flexDirection: "row", gap: 10, marginBottom: 8 },
  pointNumber: { fontSize: 14, fontFamily: "Helvetica-Bold", color: C.you, width: 18 },
  footer: { position: "absolute", left: 48, right: 48, bottom: 28, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted },
  decision: { marginTop: 18, padding: 14, borderLeftWidth: 3, borderLeftColor: C.you },
});

const COUNT = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 1 });
const n = (value: number | null) => (value === null ? "–" : COUNT.format(value));

/** The words for a share's move in points ("+3 pts"), set by the screen's language. */
let POINTS = "pts";

function changeOf(now: number | null, before: number | null, unit: string): string {
  if (now === null || before === null) return "–";
  // The built-in fonts hold no minus sign: a hyphen stands in.
  if (unit === "percent") return `${now >= before ? "+" : "-"}${COUNT.format(Math.abs(now - before))} ${POINTS}`;
  if (before === 0) return "–";
  const percent = Math.round(((now - before) / before) * 100);
  return `${percent >= 0 ? "+" : "-"}${Math.abs(percent)}%`;
}

const STATUS_COLOUR: Record<string, string> = { ON_TRACK: C.good, WATCH: C.watch, BEHIND: C.bad };

/** Bars over months, the newest last, as the board drawing's charts: orange for the website's own figure. */
function MonthBars({ values, width, height, colour, labels }: { values: number[]; width: number; height: number; colour: string; labels: string[] }) {
  const most = Math.max(1, ...values);
  const gap = 3;
  const bar = values.length > 0 ? (width - gap * (values.length - 1)) / values.length : 0;
  return (
    <View>
      <Svg width={width} height={height}>
        {values.map((value, index) => {
          const h = Math.max(1, (value / most) * (height - 4));
          return <Rect key={index} x={index * (bar + gap)} y={height - h} width={bar} height={h} fill={colour} />;
        })}
      </Svg>
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4 }}>
        <Text style={s.quiet}>{labels[0] ?? ""}</Text>
        <Text style={s.quiet}>{labels[labels.length - 1] ?? ""}</Text>
      </View>
    </View>
  );
}

function Strip({ report, words, page, of, section }: { report: ReportView; words: PdfWords; page: number; of: number; section: string }) {
  return (
    <>
      <View style={s.strip} fixed>
        <Text>{`${report.company} · ${report.kind === "BOARD" ? words.boardReport : words.monthlyReport}, ${report.period}`}</Text>
        <Text>{section}</Text>
      </View>
      <View style={s.footer} fixed>
        <Text>{words.footer}</Text>
        <Text>{words.page(page, of)}</Text>
      </View>
    </>
  );
}

function Scorecard({ report, words, rows }: { report: ReportView; words: PdfWords; rows?: number }) {
  return (
    <View>
      <View style={[s.row, { borderBottomColor: C.ink }]}>
        <Text style={[s.cell, { flex: 2, color: C.muted }]}>{words.measure}</Text>
        <Text style={[s.cell, { color: C.muted, textAlign: "right" }]}>{words.now}</Text>
        <Text style={[s.cell, { color: C.muted, textAlign: "right" }]}>{words.year}</Text>
        <Text style={[s.cell, { color: C.muted, textAlign: "right" }]}>{words.change}</Text>
        <Text style={[s.cell, { color: C.muted, textAlign: "right" }]}>{words.status}</Text>
      </View>
      {report.body.scorecard.slice(0, rows ?? 12).map((score) => (
        <View key={score.measure} style={s.row}>
          <Text style={[s.cell, { flex: 2 }]}>{words.measures[score.measure] ?? score.measure}</Text>
          <Text style={s.numberCell}>{score.unit === "percent" && score.now !== null ? `${n(score.now)}%` : n(score.now)}</Text>
          <Text style={s.numberCell}>{score.unit === "percent" && score.before !== null ? `${n(score.before)}%` : n(score.before)}</Text>
          <Text style={s.numberCell}>{changeOf(score.now, score.before, score.unit)}</Text>
          <Text style={[s.cell, { textAlign: "right", color: STATUS_COLOUR[score.status] }]}>{words.statuses[score.status] ?? score.status}</Text>
        </View>
      ))}
    </View>
  );
}

function Points({ items }: { items: string[] }) {
  return (
    <View>
      {items.map((item, index) => (
        <View key={index} style={s.point}>
          <Text style={s.pointNumber}>{index + 1}</Text>
          <Text style={[s.body, { flex: 1, marginBottom: 0 }]}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

function bigFigures(report: ReportView, words: PdfWords) {
  const pick = ["enquiries", "visitors", "marketShare", "visitorsPerEnquiry"]
    .map((measure) => report.body.scorecard.find((score) => score.measure === measure))
    .filter((score): score is ReportView["body"]["scorecard"][number] => Boolean(score));
  return (
    <View style={s.figures}>
      {pick.map((score) => (
        <View key={score.measure} style={s.figure}>
          <Text style={s.quiet}>{words.measures[score.measure] ?? score.measure}</Text>
          <Text style={s.figureValue}>{score.unit === "percent" && score.now !== null ? `${n(score.now)}%` : n(score.now)}</Text>
          <Text style={s.quiet}>{`${changeOf(score.now, score.before, score.unit)} · ${words.year} ${score.unit === "percent" && score.before !== null ? `${n(score.before)}%` : n(score.before)}`}</Text>
        </View>
      ))}
    </View>
  );
}

function BoardReport({ report, words, written }: { report: ReportView; words: PdfWords; written: string }) {
  const share = report.body.shareByMonth.map((month) => (month.total > 0 ? Math.round((month.you / month.total) * 1000) / 10 : 0));
  const shareLabels = report.body.shareByMonth.map((month) => month.month);
  const months = report.body.enquiriesByMonth;
  return (
    <Document title={report.title} author={words.author}>
      <Page size="A4" style={s.cover}>
        <View>
          <Text style={{ fontSize: 11, color: C.coverMuted }}>{report.company}</Text>
          <Text style={{ fontSize: 11, color: C.coverMuted }}>{`${words.boardReport} · ${report.period}`}</Text>
        </View>
        <View>
          <Text style={{ fontSize: 34, fontFamily: "Helvetica-Bold", color: C.coverAccent, lineHeight: 1.15, marginBottom: 18 }}>{report.body.headline}</Text>
          <Text style={{ fontSize: 12, color: C.coverInk, lineHeight: 1.5 }}>{report.body.summary}</Text>
        </View>
        <View>
          {share.length > 1 ? (
            <View style={{ marginBottom: 24 }}>
              <Text style={{ fontSize: 9, color: C.coverMuted, marginBottom: 8 }}>{words.shareTitle}</Text>
              <MonthBars values={share} width={483} height={70} colour={C.you} labels={shareLabels} />
            </View>
          ) : null}
          <Text style={{ fontSize: 10, color: C.coverInk }}>{words.covers}</Text>
          <Text style={{ fontSize: 9, color: C.coverMuted, marginTop: 4 }}>{`${words.writtenBy} · ${written}`}</Text>
          <Text style={{ fontSize: 9, color: C.coverMuted, marginTop: 4 }}>{words.confidential}</Text>
        </View>
      </Page>
      <Page size="A4" style={s.page}>
        <Strip report={report} words={words} page={2} of={5} section={words.summary} />
        <Text style={s.kicker}>{`01 · ${words.summary}`}</Text>
        <Text style={s.title}>{report.body.headline}</Text>
        <Text style={s.body}>{report.body.summary}</Text>
        {bigFigures(report, words)}
        <Text style={s.heading}>{words.scorecard}</Text>
        <Scorecard report={report} words={words} rows={7} />
        <Text style={s.heading}>{words.inOneMinute}</Text>
        <Points items={report.body.points} />
      </Page>
      <Page size="A4" style={s.page}>
        <Strip report={report} words={words} page={3} of={5} section={words.market} />
        <Text style={s.kicker}>{`02 · ${words.market}`}</Text>
        <Text style={s.title}>{words.shareTitle}</Text>
        {share.length > 1 ? <MonthBars values={share} width={499} height={160} colour={C.you} labels={shareLabels} /> : null}
        <Text style={s.heading}>{words.scorecard}</Text>
        <Scorecard report={report} words={words} />
      </Page>
      <Page size="A4" style={s.page}>
        <Strip report={report} words={words} page={4} of={5} section={words.quarter} />
        <Text style={s.kicker}>{`03 · ${words.quarter}`}</Text>
        <Text style={s.title}>{words.enquiriesTitle}</Text>
        {months.length > 1 ? <MonthBars values={months.map((month) => month.conversions)} width={499} height={140} colour={C.you} labels={months.map((month) => month.month)} /> : null}
        <Text style={s.heading}>{words.findings}</Text>
        {report.body.findings.slice(0, 6).map((finding, index) => (
          <View key={index} style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{finding.headline}</Text>
            <Text style={s.quiet}>{finding.action}</Text>
          </View>
        ))}
      </Page>
      <Page size="A4" style={s.page}>
        <Strip report={report} words={words} page={5} of={5} section={words.plan} />
        <Text style={s.kicker}>{`04 · ${words.plan}`}</Text>
        <Text style={s.title}>{words.next}</Text>
        <Points items={report.body.next} />
        <View style={{ flexDirection: "row", gap: 24, marginTop: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>{words.risks}</Text>
            {report.body.risks.map((risk, index) => <Text key={index} style={s.body}>{risk}</Text>)}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.heading}>{words.opportunities}</Text>
            {report.body.opportunities.map((opportunity, index) => <Text key={index} style={s.body}>{opportunity}</Text>)}
          </View>
        </View>
        {report.body.decision ? (
          <View style={s.decision}>
            <Text style={s.kicker}>{words.decision}</Text>
            <Text style={{ fontSize: 13, fontFamily: "Helvetica-Bold", lineHeight: 1.35 }}>{report.body.decision}</Text>
          </View>
        ) : null}
      </Page>
    </Document>
  );
}

function MonthlyReport({ report, words, written }: { report: ReportView; words: PdfWords; written: string }) {
  const months = report.body.enquiriesByMonth;
  const fact = (key: string) => report.body.facts.find((entry) => entry.key === key)?.value ?? null;
  const figures = [
    { label: words.measures.enquiries, now: fact("month.enquiries.now"), before: fact("month.enquiries.before") },
    { label: words.measures.visits, now: fact("month.visits.now"), before: fact("month.visits.before") },
    { label: words.measures.googleClicks, now: fact("month.googleClicks.now"), before: fact("month.googleClicks.before") },
  ];
  return (
    <Document title={report.title} author={words.author}>
      <Page size="A4" style={s.page}>
        <Strip report={report} words={words} page={1} of={2} section={words.month} />
        <Text style={s.kicker}>{`${words.monthlyReport} · ${report.period}`}</Text>
        <Text style={s.title}>{report.body.headline}</Text>
        <Text style={s.body}>{report.body.summary}</Text>
        <View style={s.figures}>
          {figures.map((figure) => (
            <View key={figure.label} style={s.figure}>
              <Text style={s.quiet}>{figure.label}</Text>
              <Text style={s.figureValue}>{n(figure.now)}</Text>
              <Text style={s.quiet}>{`${changeOf(figure.now, figure.before, "count")} · ${n(figure.before)}`}</Text>
            </View>
          ))}
        </View>
        <Text style={s.heading}>{words.enquiriesTitle}</Text>
        {months.length > 1 ? <MonthBars values={months.map((month) => month.conversions)} width={499} height={150} colour={C.you} labels={months.map((month) => month.month)} /> : null}
        <Text style={s.heading}>{words.whatHappened}</Text>
        <Points items={report.body.points} />
      </Page>
      <Page size="A4" style={s.page}>
        <Strip report={report} words={words} page={2} of={2} section={words.month} />
        <Text style={s.heading}>{words.whatsNext}</Text>
        <Points items={report.body.next} />
        <Text style={s.heading}>{words.findings}</Text>
        {report.body.findings.slice(0, 6).map((finding, index) => (
          <View key={index} style={{ marginBottom: 10 }}>
            <Text style={{ fontSize: 10.5, fontFamily: "Helvetica-Bold" }}>{finding.headline}</Text>
            <Text style={s.quiet}>{finding.action}</Text>
          </View>
        ))}
        <Text style={s.heading}>{words.did}</Text>
        {report.body.did.map((entry) => (
          <View key={entry.work} style={s.row}>
            <Text style={[s.cell, { flex: 3 }]}>{words.work[entry.work] ?? entry.work}</Text>
            <Text style={s.numberCell}>{n(entry.count)}</Text>
          </View>
        ))}
        <Text style={[s.quiet, { marginTop: 18 }]}>{`${words.writtenBy} · ${written}`}</Text>
      </Page>
    </Document>
  );
}

/** The report's PDF document: the board report's five pages, or the monthly report's two. */
export function reportDocument(report: ReportView, words: PdfWords, written: string) {
  POINTS = words.points;
  return report.kind === "BOARD" ? <BoardReport report={report} words={words} written={written} /> : <MonthlyReport report={report} words={words} written={written} />;
}

/** Draw the report and save it as a PDF file, named after the website, the kind and the period. */
export async function downloadReportPdf(report: ReportView, words: PdfWords, written: string): Promise<void> {
  const blob = await pdf(reportDocument(report, words, written)).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = `${report.host}-${report.kind === "BOARD" ? "board-report" : "monthly-report"}-${report.period}.pdf`;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
