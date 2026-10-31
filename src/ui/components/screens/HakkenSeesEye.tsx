"use client";

import { useEffect, useId, useMemo, useRef, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { seesKey } from "@/convex/utils/seesAsk";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "./Button";
import { SeesPanel } from "./SeesPanel";
import { SeesChatFoot, SeesChatLog, useSeesChat } from "./SeesChat";
import { findingWords } from "@/convex/utils/sees/findings";
import { pageDataFor, pageFigureLines } from "@/convex/utils/sees/pageData";
import { pageFindings } from "@/convex/utils/sees/pageFindings";
import { seesScreenFor, seesWrites } from "@/convex/utils/sees/screens";
import type { SeesAsk } from "./HakkenSees";
import { claimEye, closeSees, noteAsked, toggleSees, useDrawsEye, useSeesAsked, useSeesBox, useSeesNew, useSeesOpen } from "./hakkenSeesStore";

/**
 * The eye in the top bar that opens What Hakken sees — option 7 on the
 * canvas of 2026-10-29 (sees-header-and-rolling-dates-plan.md, part one;
 * Anthony: "i think i like the eyes"), moved from beside the page title to
 * the top bar on 2026-10-30 (the Conversions canvas: "could the What Hakken
 * sees icon sit here and have page context"): a bordered 38px button with
 * the eye in the brand colour, then how many of the box's steps are new
 * ("2 new") until the bubble has been opened on this advice. No tooltip
 * (Anthony, 2026-10-30, "remove it": at the top of the page it opened under
 * the browser's toolbar); clicking it opens the panel over the page (`SeesPanel`, in place of the bubble since 2026-10-31)
 * (`SeesBubble`) and leaves the eye pressed; clicking again, a click
 * anywhere else or Escape closes it.
 *
 * A page that hands over its figures (`SeesBox.ask`) has them sent to the
 * Insights team when the bubble opens (sees-conversion-specialist-plan-2026-10-30.md
 * S2, S11, S12): the bubble says "Hakken is researching…" while the team
 * writes, then the team's words, kept three hours; a team that could not
 * answer leaves the rule's words standing. Every other page shows the
 * rule's words at once.
 *
 * The top bar (`Header`) is the one place that draws it, and it draws itself
 * only once the screen's box has published something — so no screen wires it
 * up, and a screen with nothing to say has no eye. `claimEye` keeps one eye
 * on screen should two bars ever mount. The words and the look are read only
 * once there is a box, so a screen without one costs nothing.
 */
export function HakkenSeesEye() {
  const id = useId();
  useEffect(() => claimEye(id), [id]);
  const draws = useDrawsEye(id);
  const box = useSeesBox();
  const open = useSeesOpen();
  const fresh = useSeesNew();
  const holder = useRef<HTMLSpanElement>(null);
  const askSees = useMutation(api.seesAsk.askSees);
  const pathname = usePathname() ?? "";
  // A page that handed over its own figures (sees-every-page-plan-2026-10-31.md): cut to what it shows first, and —
  // where pressing writes — asked of the team as a press, its links the rule's own steps and the page's.
  const page = box?.page;
  const data = page?.data;
  const pageData = useMemo(() => (data !== undefined ? pageDataFor(data) : null), [data]);
  const derivedAsk = useMemo<SeesAsk | undefined>(() => {
    if (!page?.siteId || pageData === null || !seesWrites(page.screen)) return undefined;
    const links = new Map<string, { label: string; href: string }>();
    for (const step of box?.steps ?? []) if (step.href.startsWith("/app/") && !step.external) links.set(step.href, { label: step.link, href: step.href });
    for (const link of page.links ?? []) links.set(link.href, { label: link.label, href: link.href });
    return {
      siteId: page.siteId, screen: page.screen, about: "", path: pathname, period: page.period ?? "", country: page.country ?? "", device: page.device ?? "",
      ...(page.from ? { from: page.from } : {}), ...(page.to ? { to: page.to } : {}),
      facts: [], links: [...links.values()].slice(0, 12), data: pageData,
    };
  }, [page, pageData, pathname, box?.steps]);
  const ask = box?.ask ?? derivedAsk;
  const key = ask ? seesKey(ask) : null;
  // What the team said when asked for this key (the store's, outside React): "RESEARCHING" until its answer is saved,
  // "FAILED" when there is no team. Asked once per key, the first time the bubble opens on it.
  const asked = useSeesAsked();
  useEffect(() => {
    if (!open || !ask || !key || asked?.key === key) return;
    noteAsked(key, "RESEARCHING");
    // Nobody waits on the page: the answer arrives through the store, and a refusal leaves the rule's words standing.
    askSees(ask).catch(() => null).then((reply) => noteAsked(key, reply?.status ?? "FAILED"));
  }, [open, key, asked?.key, ask, askSees]);
  const noCredits = Boolean(ask && asked?.key === key && asked.status === "NO_CREDITS");
  const answer = useQuery(api.seesAsk.seesAnswer, open && ask && key && asked?.key === key && asked.status !== "FAILED" && !noCredits ? { siteId: ask.siteId, key } : "skip");
  // The panel closes itself: Escape, its close button, or a click on the page behind it (SidePanel).
  // What the figures show: read at once on the Conversions screens; worked out here from any other page's own figures;
  // the words' own order once the team has written them.
  const conversionsPage = Boolean(box?.ask && box.ask.screen.startsWith("googleAnalytics."));
  const readsFindings = open && conversionsPage && box?.ask && !answer?.findings;
  const live = useQuery(api.seesFindings.seesFindings, readsFindings && box?.ask ? { siteId: box.ask.siteId, period: box.ask.period, device: box.ask.device, ...(box.ask.country ? { country: box.ask.country } : {}) } : "skip");
  const local = useMemo(() => (page && !conversionsPage && pageData !== null ? pageFindings(page.screen, pageData) : undefined), [page, conversionsPage, pageData]);
  const read = answer?.status === "WRITTEN" && answer.findings ? answer.findings : conversionsPage ? live : local;
  const findings = Array.isArray(read) ? read : undefined;
  // Asking about the page: an Ask Hakken conversation for its website, started with the page as its starting point —
  // its address, what it is, its dates and, for a page Ask Hakken has no tool to read, its own figures.
  const shown = answer?.status === "WRITTEN" ? answer : null;
  const figures = useMemo(() => (page && pageData !== null ? pageFigureLines(page.screen, pageData) : []), [page, pageData]);
  const where = ask ?? (page ? { period: page.period ?? "", from: page.from ?? undefined, to: page.to ?? undefined, country: page.country ?? "", device: page.device ?? "" } : null);
  const chat = useSeesChat({
    pageKey: key ?? box?.screen ?? null,
    ...(ask ? { siteId: ask.siteId } : page?.siteId ? { siteId: page.siteId } : {}),
    startedOn: {
      path: ask?.path || pathname || box?.screen || "",
      about: ask?.about || (page ? seesScreenFor(page.screen)?.about ?? page.screen : box?.screen ?? ""),
      dates: where ? [where.from && where.to ? `${where.from} to ${where.to}` : where.period, where.country || null, where.device || null].filter(Boolean).join(", ") : "",
      findings: (findings ?? []).map(findingWords),
      said: shown ? [...shown.says, ...shown.steps.map((step) => step.words)] : [...(box?.says ?? []), ...(box?.steps ?? []).map((step) => step.words)],
      ...(figures.length > 0 ? { figures } : {}),
    },
  });
  if (!draws || !box) return null;
  // The team's words when it has written them; "researching" while it writes; the rule's words otherwise.
  const team = answer?.status === "WRITTEN" ? answer : null;
  const researching = Boolean(ask && asked?.key === key && asked.status !== "FAILED" && !noCredits && !team && answer?.status !== "FAILED");
  const says = team ? team.says : box.says;
  const steps = team ? team.steps : box.steps;
  return (
    <SeesEye
      ref={holder}
      open={open}
      fresh={fresh}
      count={box.steps.length}
      onClick={toggleSees}
      bubbleId={`${id}-bubble`}
      bubble={<SeesPanel id={`${id}-bubble`} open={open} onClose={closeSees} says={says} steps={steps} researching={researching} noCredits={noCredits} {...(box.name ? { name: box.name } : {})} {...(findings ? { findings } : {})} chat={<SeesChatLog chat={chat} />} foot={<SeesChatFoot chat={chat} />} onAskAbout={(words) => chat.setDraft(words)} />}
    />
  );
}

/** The eye as drawn: pressed while the bubble is open, the count beside it while its steps are new, the bubble under it. */
export function SeesEye({ ref, open, fresh, count, onClick, bubble, bubbleId }: {
  ref?: React.Ref<HTMLSpanElement>;
  open: boolean;
  fresh: boolean;
  count: number;
  onClick: () => void;
  /** The open bubble, drawn under the eye; the kit draws one to show it. */
  bubble?: ReactNode;
  bubbleId?: string;
}) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  return (
    <span ref={ref} data-part="sees-eye" className="relative inline-flex shrink-0 items-center gap-3 text-[13px] font-normal tracking-normal">
      <Button
        variant="ghost"
        aria-label={t("title", { platformName })}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? bubbleId : undefined}
        onClick={onClick}
        className={cn(
          "inline-flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] border p-0 transition-colors",
          open ? "border-secondary/40 bg-hover" : "border-border-dim bg-background hover:bg-hover/40",
        )}
      >
        <Eye className="h-5 w-5 text-brand" aria-hidden="true" />
      </Button>
      {fresh ? <span className="text-foreground">{t("new", { count })}</span> : null}
      {bubble}
    </span>
  );
}
