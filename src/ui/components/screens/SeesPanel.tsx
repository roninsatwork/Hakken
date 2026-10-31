"use client";

import type { ReactNode } from "react";
import type { FunctionReturnType } from "convex/server";
import { AlertTriangle, ArrowRight, Clock, Eye, TrendingDown, TrendingUp } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { cn } from "@/src/ui/lib/utils";
import { SeesWords, type HakkenSeesStep } from "./HakkenSees";
import { Button } from "./Button";
import { SidePanel } from "./SidePanel";

type Finding = FunctionReturnType<typeof api.seesFindings.seesFindings>[number];

/**
 * What Hakken sees, as a panel sliding over the page (docs/plans/active/sees-side-panel-plan-2026-10-31.md; canvas
 * "Conversions page, four ways", board "Panel"; Anthony: "The eye slides a panel over any page"). Built inside the
 * reusable `SidePanel`. Top to bottom: what the figures show — code's findings, at once, on a screen that has them
 * (`seesFindings`); what it means — the team's words and steps, or the page's own rule's words; and, below them,
 * asking about the page (`chat`, given by the eye). It replaces the speech bubble.
 */
export function SeesPanel({ open, onClose, says, steps, researching, name, findings: given, chat, foot, onAskAbout, id }: {
  open: boolean;
  onClose: () => void;
  says: string[];
  steps: HakkenSeesStep[];
  researching: boolean;
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
  const { platformName } = useSystemSettings();
  const findings = given;
  return (
    <SidePanel open={open} onClose={onClose} id={id} title={t("title", { platformName })} icon={<Eye className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />} foot={foot}>
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
          <SectionHead title={t("means")} note={researching ? undefined : t("meansNote", { platformName })} />
          {researching ? (
            <p className="text-[13px] leading-[1.6] text-secondary" aria-live="polite">{t("researching", { platformName })}</p>
          ) : (
            <SeesWords says={says} steps={steps} />
          )}
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
};

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
        if (p.lost !== undefined) return t.rich("stepLost", { ...rich, from: event(p.from), to: event(p.to), fromShare: percent(p.fromShare), toShare: percent(p.toShare), lost: one(p.lost) });
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
    }
  })();
  const { icon: Icon, tone } = ICONS[finding.kind];
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
