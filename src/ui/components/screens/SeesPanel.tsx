"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, ArrowDownUp, ArrowRight, Clock, Eye, PieChart, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { cn } from "@/src/ui/lib/utils";
import type { HakkenSeesStep } from "./HakkenSees";
import { SeesProgress, SeesWords } from "./SeesWriting";
import { Button } from "./Button";
import { SidePanel } from "./SidePanel";
import { MEASURES } from "@/convex/utils/sees/measures";
import type { SeesStageRow } from "@/convex/utils/sees/stages";

type Finding = FunctionReturnType<typeof api.seesFindings.seesFindings>[number];

/**
 * What Hakken sees, as a panel sliding over the page (docs/plans/active/sees-side-panel-plan-2026-10-31.md; canvas
 * "Conversions page, four ways", board "Panel"; Anthony: "The eye slides a panel over any page"). Built inside the
 * reusable `SidePanel`. Top to bottom: what the figures show — code's findings, at once, on a screen that has them
 * (`seesFindings`); what it means — what the press is doing as it writes, then the team's words coming in like a
 * teleprompter, or the page's own rule's words at once (`SeesWriting.tsx`); and, below them, asking about the page
 * (`chat`, given by the eye). It replaces the speech bubble.
 */
export function SeesPanel({ open, onClose, says, steps, researching, stages = [], onRefresh, noCredits = false, written = true, writtenAt, name, findings: given, chat, foot, onAskAbout, id }: {
  open: boolean;
  onClose: () => void;
  says: string[];
  steps: HakkenSeesStep[];
  researching: boolean;
  /** What the press has done so far while `researching`, the last being what it is doing now. */
  stages?: readonly SeesStageRow[];
  /** A super admin's refresh: writes the words again now, kept three hours or not. No button without it. */
  onRefresh?: () => void;
  /** The company has fewer credits than a press costs: nothing new is written, and it says so (Anthony, 2026-10-31: "stop"). */
  noCredits?: boolean;
  /** The words are the team's, written for this page: only then does it say so; a rule's words carry no such note. */
  written?: boolean;
  /**
   * When the words were written, said beside them on a page whose figures change by the minute (Live, decision 3 of
   * ask-hakken-every-chart-page-plan-2026-11-03.md: "with the time it was written shown above it"), so they never read
   * as wrong a minute later.
   */
  writtenAt?: number | null;
  /** An event's own name on the page, for the findings: "add_to_cart" → "Added to basket". */
  name?: (eventName: string) => string;
  /** What the figures show: as Jev ordered them when the words were written, or code's own, read at once (the eye's). */
  findings?: Finding[];
  /** The conversation about the page, drawn under the words. */
  chat?: ReactNode;
  /** The box to ask in, fixed at the foot. */
  foot?: ReactNode;
  /** A finding clicked: what to ask about it. */
  onAskAbout?: (words: string) => void;
  id?: string;
}) {
  const t = useTranslations("ui.hakkenSees");
  const locale = useLocale();
  const { platformName } = useSystemSettings();
  const findings = given;
  const time = writtenAt ? new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(writtenAt) : null;
  // The team's words come in once for each answer: closing the panel and opening it again shows them whole.
  const shownWords = says.join(" ");
  const [revealed, setRevealed] = useState<string | null>(null);
  const refresh = onRefresh ? (
    <Button
      variant="ghost"
      data-part="sees-refresh"
      disabled={researching}
      onClick={() => {
        setRevealed(null);
        onRefresh();
      }}
      aria-label={t("refresh")}
      title={t("refresh")}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] p-0 text-secondary hover:bg-hover hover:text-foreground"
    >
      <RefreshCw className={cn("h-4 w-4", researching && "animate-spin motion-reduce:animate-none")} aria-hidden="true" />
    </Button>
  ) : null;
  return (
    <SidePanel open={open} onClose={onClose} id={id} title={t("title", { platformName })} icon={<Eye className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />} actions={refresh} foot={foot}>
      <div data-part="sees-panel" className="flex flex-col gap-6">
        {findings && findings.length > 0 ? (
          <section data-part="sees-findings" className="flex flex-col gap-2">
            <SectionHead title={t("figures")} note={t("figuresNote")} />
            <div className="-mx-2 flex flex-col">
              {findings.map((finding) => <FindingLine key={finding.id} finding={finding} name={name} onAsk={onAskAbout} />)}
            </div>
          </section>
        ) : null}
        <section data-part="sees-means" className="flex flex-col gap-3">
          <SectionHead title={t("means")} note={researching || !written ? undefined : time ? t("meansNoteAt", { platformName, time }) : t("meansNote", { platformName })} />
          {noCredits ? (
            <p data-part="sees-no-credits" className="text-[13px] leading-[1.6] text-secondary">
              {t.rich("noCredits", { platformName, billing: (chunks) => <Link href="/app/settings/billing" className="text-foreground underline underline-offset-2 hover:text-brand">{chunks}</Link> })}
            </p>
          ) : null}
          <div aria-live="polite" className="flex flex-col gap-3">
            {researching ? (
              <SeesProgress stages={stages} />
            ) : (
              <SeesWords key={shownWords} says={says} steps={steps} reveal={written && revealed !== shownWords} onRevealed={() => setRevealed(shownWords)} />
            )}
          </div>
        </section>
        {chat}
      </div>
    </SidePanel>
  );
}

function SectionHead({ title, note }: { title: string; note?: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{title}</span>
      {note ? <span className="text-[11px] text-muted">{note}</span> : null}
    </div>
  );
}

/** Each kind's line icon and tone: the shape carries the meaning as well as the colour. */
const ICONS: Record<Finding["kind"], { icon: typeof Clock; tone: string }> = {
  visitsForOne: { icon: Clock, tone: "text-secondary" },
  step: { icon: ArrowRight, tone: "text-secondary" },
  groupAbove: { icon: TrendingUp, tone: "text-success" },
  rose: { icon: TrendingUp, tone: "text-success" },
  groupBelow: { icon: TrendingDown, tone: "text-warning" },
  fell: { icon: TrendingDown, tone: "text-warning" },
  trackingGap: { icon: AlertTriangle, tone: "text-warning" },
  // Every other page's (sees-every-page-plan-2026-10-31.md): up and down by their arrow; good or bad by their colour,
  // turned round for a figure where less is better (`lessIsBetter`), so the shape always says which way it went.
  wholeUp: { icon: TrendingUp, tone: "text-success" },
  rowUp: { icon: TrendingUp, tone: "text-success" },
  rowAbove: { icon: TrendingUp, tone: "text-success" },
  wholeDown: { icon: TrendingDown, tone: "text-warning" },
  rowDown: { icon: TrendingDown, tone: "text-warning" },
  rowBelow: { icon: TrendingDown, tone: "text-warning" },
  holdsMost: { icon: PieChart, tone: "text-secondary" },
  // A page's own (pageOwnFindings.ts): a figure that moved, by its arrow, its colour turned where less is better.
  movedUp: { icon: TrendingUp, tone: "text-success" },
  movedDown: { icon: TrendingDown, tone: "text-warning" },
  // Every section's (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 7): a climb up the results is good news;
  // a rival rising is the news to watch, a rival falling only news.
  placeUp: { icon: TrendingUp, tone: "text-success" },
  placeDown: { icon: TrendingDown, tone: "text-warning" },
  rivalUp: { icon: TrendingUp, tone: "text-warning" },
  rivalDown: { icon: TrendingDown, tone: "text-secondary" },
  newLost: { icon: ArrowDownUp, tone: "text-secondary" },
  shareMoved: { icon: PieChart, tone: "text-secondary" },
  // Page views that look counted differently (`viewsCounted.ts`): a warning about the figures, not a move.
  countedDifferently: { icon: AlertTriangle, tone: "text-warning" },
  // All pages: how few pages make half the views, and how many busy pages had fewer.
  halfOfViews: { icon: PieChart, tone: "text-secondary" },
  busyFewer: { icon: TrendingDown, tone: "text-secondary" },
  // Funnel: the busy pages people leave, the biggest route on, and the visits with no page known.
  busyLeaving: { icon: TrendingDown, tone: "text-secondary" },
  routeOn: { icon: ArrowDownUp, tone: "text-secondary" },
  noPageKnown: { icon: AlertTriangle, tone: "text-warning" },
};
/** A figure where less is better, by the page's own measures: its rise is the bad news. */
const LESS_IS_BETTER = new Set(Object.entries(MEASURES).filter(([, measure]) => measure.lessIsBetter).map(([field]) => field));

/** One finding in the reader's words: its line icon, then a plain sentence with its figures in the numbers' font. */
function FindingLine({ finding, name, onAsk }: { finding: Finding; name?: (eventName: string) => string; onAsk?: (words: string) => void }) {
  const t = useTranslations("ui.hakkenSees.findings");
  const locale = useLocale();
  const p = finding.params;
  const percent = (value: string | number | undefined) => `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value ?? 0))}%`;
  const whole = (value: string | number | undefined) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value ?? 0));
  const one = (value: string | number | undefined) => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(Number(value ?? 0));
  const two = (value: string | number | undefined) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(Number(value ?? 0));
  const event = (value: string | number | undefined) => (name ? name(String(value)) : String(value));
  // A page's own figure by its name in the reader's words, and its value as a count or a percentage.
  const tm = useTranslations("ui.hakkenSees.measures");
  const measure = (field: string | number | undefined) => (MEASURES[String(field)] ? tm(String(field) as "clicks") : String(field));
  // A place or a score keeps its tenth (4.3rd on Google, 4.6 stars); a count is whole.
  const figure = (field: string | number | undefined, value: string | number | undefined) => {
    const kind = MEASURES[String(field)]?.kind;
    return kind === "percent" ? percent(value) : kind === "place" || kind === "score" ? one(value) : whole(value);
  };
  const device = (value: string | number | undefined) => (["mobile", "desktop", "tablet"].includes(String(value)) ? t(`devices.${String(value)}` as "devices.mobile") : String(value));
  const group = () => (p.by === "kind" ? t("kindPages", { group: String(p.group) }) : p.by === "device" ? device(p.group) : String(p.group));
  const rich = { n: (chunks: ReactNode) => <span className="font-mono text-foreground">{chunks}</span>, b: (chunks: ReactNode) => <span className="text-foreground">{chunks}</span> };
  const words = (() => {
    switch (finding.kind) {
      case "visitsForOne":
        return p.visitsBefore !== undefined
          ? t.rich("visitsForOne", { ...rich, event: event(p.event), visits: whole(p.visits), before: whole(p.visitsBefore) })
          : t.rich("visitsForOneNow", { ...rich, event: event(p.event), visits: whole(p.visits) });
      case "step":
        // Read down the map's column, as people do: of every visit, the share at each step and the visits lost between.
        if (p.lost !== undefined) {
          const shares = { ...rich, from: event(p.from), to: event(p.to), fromShare: percent(p.fromShare), toShare: percent(p.toShare), lost: one(p.lost) };
          return p.lostBefore !== undefined ? t.rich("stepLostBefore", { ...shares, before: one(p.lostBefore) }) : t.rich("stepLost", shares);
        }
        return p.wentOnBefore !== undefined
          ? t.rich("step", { ...rich, from: event(p.from), to: event(p.to), wentOn: percent(p.wentOn), before: percent(p.wentOnBefore) })
          : t.rich("stepNow", { ...rich, from: event(p.from), to: event(p.to), wentOn: percent(p.wentOn) });
      case "groupAbove":
      case "groupBelow":
        return p.event === "*"
          ? t.rich("together", { ...rich, group: group(), perVisit: two(p.perVisit), sitePerVisit: two(p.sitePerVisit) })
          : t.rich("group", { ...rich, group: group(), event: event(p.event), rate: percent(p.rate), siteRate: percent(p.siteRate) });
      case "rose":
      case "fell":
        return t.rich(finding.kind, { ...rich, group: group(), event: event(p.event), rate: percent(p.rate), before: percent(p.rateBefore) });
      case "trackingGap":
        return t.rich(p.tracking === "behaviour" ? "trackingBehaviour" : "trackingCheck", { ...rich, event: event(p.event), low: device(p.low), lowRate: percent(p.lowRate), high: device(p.high), highRate: percent(p.highRate) });
      case "wholeUp":
      case "wholeDown": {
        const named = measure(p.measure);
        return t.rich(finding.kind, { ...rich, measure: named.charAt(0).toUpperCase() + named.slice(1), now: figure(p.measure, p.now), before: figure(p.measure, p.before) });
      }
      case "rowUp":
      case "rowDown":
        return t.rich(finding.kind, { ...rich, name: String(p.name), measure: measure(p.measure), now: figure(p.measure, p.now), before: figure(p.measure, p.before) });
      case "holdsMost":
        return t.rich("holdsMost", { ...rich, name: String(p.name), measure: measure(p.measure), share: percent(p.share) });
      case "rowAbove":
      case "rowBelow": {
        // Against its own reference where the figures carry one (the whole website, similar pages, another group named
        // by a page's own rules), else the list's average. A place reads as one: "place 3 … Google: place 24.8".
        const place = MEASURES[String(p.measure)]?.kind === "place";
        const key = p.against === "website" ? "apartWebsite" : p.against === "group" ? "apartGroup" : p.against === "other" ? "apartOther" : "rowApart";
        if (place) return t.rich(key === "rowApart" ? "placeApart" : (`place${key.charAt(0).toUpperCase()}${key.slice(1)}` as "placeApartOther"), { ...rich, name: p.whole ? t("thisPage") : String(p.name), value: figure(p.measure, p.value), mean: figure(p.measure, p.mean), other: String(p.other ?? "") });
        return t.rich(key, { ...rich, name: p.whole ? t("thisPage") : String(p.name), measure: measure(p.measure), value: figure(p.measure, p.value), mean: figure(p.measure, p.mean), other: String(p.other ?? "") });
      }
      case "movedUp":
      case "movedDown":
        // A rate's move in points, never a change of a change ("up 21.5 points, to 61.9% from 40.4%"; Insights' builder,
        // 2026-11-03), where no other group's change is set beside it.
        if (MEASURES[String(p.measure)]?.kind === "percent" && p.other === undefined) {
          return t.rich(`${finding.kind}Points`, { ...rich, name: String(p.name), measure: measure(p.measure), points: one(Math.abs(Number(p.now) - Number(p.before))), now: figure(p.measure, p.now), before: figure(p.measure, p.before) });
        }
        return t.rich(p.other !== undefined ? `${finding.kind}Against` : finding.kind, {
          ...rich, name: String(p.name), measure: measure(p.measure), change: percent(p.change), now: figure(p.measure, p.now), before: figure(p.measure, p.before),
          other: String(p.other ?? ""), otherChange: percent(p.otherChange), otherWay: String(p.otherWay ?? "down"),
        });
      case "placeUp":
      case "placeDown":
        // One record's own place (`single`): it moved, with no list to be the biggest on.
        return t.rich(p.single ? "placeMoved" : finding.kind, { ...rich, name: String(p.name), measure: measure(p.measure), now: figure(p.measure, p.now), before: figure(p.measure, p.before) });
      case "rivalUp":
      case "rivalDown":
        return t.rich(finding.kind, { ...rich, name: String(p.name), measure: measure(p.measure), now: figure(p.measure, p.now), before: figure(p.measure, p.before), you: figure(p.measure, p.you), youBefore: figure(p.measure, p.youBefore) });
      case "newLost": {
        const named = measure(p.measure);
        const counts = { ...rich, measure: named.charAt(0).toUpperCase() + named.slice(1), gained: whole(p.gained), lost: whole(p.lost) };
        return p.gainedBefore !== undefined ? t.rich("newLostBefore", { ...counts, gainedBefore: whole(p.gainedBefore), lostBefore: whole(p.lostBefore) }) : t.rich("newLost", counts);
      }
      case "countedDifferently":
        return t.rich("countedDifferently", { ...rich, now: one(Number(p.now)), before: one(Number(p.before)) });
      case "halfOfViews":
        return t.rich("halfOfViews", { ...rich, pages: whole(p.pages), before: whole(p.pagesBefore) });
      case "busyFewer":
        return t.rich(p.name !== undefined ? "busyFewerNamed" : "busyFewer", { ...rich, fewer: whole(p.fewer), busy: whole(p.busy), visits: whole(p.visits), name: String(p.name ?? "") });
      case "busyLeaving":
        return t.rich(p.name !== undefined ? "busyLeavingNamed" : "busyLeaving", { ...rich, losing: whole(p.losing), busy: whole(p.busy), visits: whole(p.visits), name: String(p.name ?? "") });
      case "routeOn":
        return t.rich("routeOn", { ...rich, reached: whole(p.reached), on: whole(p.on), name: String(p.name), next: String(p.next) });
      case "noPageKnown":
        return t.rich("noPageKnown", { ...rich, visits: whole(p.visits), share: percent(p.share) });
      case "shareMoved":
        return t.rich("shareMoved", { ...rich, name: String(p.name), measure: measure(p.measure), share: percent(p.share), before: percent(p.shareBefore) });
    }
  })();
  const { icon: drawnIcon, tone: usual } = ICONS[finding.kind];
  // A rise in errors or angry clicks is bad news, and a fall good: the colour turns round, the arrow does not.
  const turned = LESS_IS_BETTER.has(String(p.measure)) && ["wholeUp", "wholeDown", "rowUp", "rowDown", "rowAbove", "rowBelow", "movedUp", "movedDown", "rivalUp", "rivalDown"].includes(finding.kind);
  // A place set beside another's reads by which is the better place, the lower number (3rd beats 24th), whichever way a
  // page's rules named the finding (ask-hakken-every-chart-page-plan-2026-11-03.md: a worse place showed a green arrow).
  const placeApart = (finding.kind === "rowAbove" || finding.kind === "rowBelow") && MEASURES[String(p.measure)]?.kind === "place" && p.value !== p.mean;
  const better = placeApart && Number(p.value) < Number(p.mean);
  const Icon = placeApart ? (better ? TrendingUp : TrendingDown) : drawnIcon;
  const tone = placeApart ? (better ? "text-success" : "text-warning") : turned ? (usual === "text-success" ? "text-warning" : "text-success") : usual;
  const content = (
    <>
      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", tone)} aria-hidden="true" />
      <span className="text-[13px] leading-[1.55] text-secondary">{words}</span>
    </>
  );
  if (!onAsk) return <div data-part="sees-finding" className="flex items-start gap-3 px-2 py-2.5">{content}</div>;
  return (
    <Button
      variant="ghost"
      data-part="sees-finding"
      onClick={(event) => onAsk((event.currentTarget as HTMLElement).innerText)}
      className="flex h-auto w-full items-start justify-start gap-3 whitespace-normal rounded-[10px] px-2 py-2.5 text-left font-normal hover:bg-hover/50"
    >
      {content}
    </Button>
  );
}
