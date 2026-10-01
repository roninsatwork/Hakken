"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { Check, ChevronDown, LayoutGrid, Pin, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { wordStartMatcher } from "@/convex/utils/wordStarts";
import { Button } from "@/src/ui/components/screens/Button";
import { Field } from "@/src/ui/components/screens/Field";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";
import { SiteMark } from "./SiteMark";
import { groupHolds } from "./siteGroups";

export type PickerHold = {
  siteId: string;
  host: string;
  relationship: "OWNED" | "TRACKED";
  ofSiteId: string | null;
  /** The website's icon, or null to draw its letter (`SiteMark`). */
  iconUrl?: string | null;
};

/** Competitors listed under a website before "Show N more". */
const SHOWN = 5;

/** The width at which the list hangs under its button rather than rising as a sheet (Tailwind's `sm`). */
const WIDE = "(min-width:640px)";

/**
 * Choosing one of a company's websites (docs/plans/active/
 * sites-website-switcher-plan.md, W2 and W6): a search, the way to every
 * website, then each website the company owns with its competitors folded
 * beneath it — the open one's unfolded — and any competitor watched against
 * none of them. On a phone the list rises from the bottom as a sheet.
 *
 * One list for both doors onto a company's websites: the site header on the
 * client's Sites pages (`SiteSwitcher`) and the chooser in the admin's
 * Websites section — a native drop-down could neither search nor fold, and
 * read as one long column once a company held a few websites with their
 * competitors (Anthony, 2026-10-01). Each door says where a choice goes
 * (`hrefFor`) and draws its own button.
 *
 * The list is drawn at the foot of the page and placed under the button from
 * where it sits when it opens: the client's button is inside a heading, and
 * everything in the list would otherwise be read as part of it.
 */
export function WebsitePicker({
  holds,
  currentId,
  hrefFor,
  all,
  footer,
  triggerId,
  triggerLabel,
  triggerClassName,
  renderTrigger,
}: {
  holds: readonly PickerHold[];
  /** The site open, or null when every website is. */
  currentId: string | null;
  hrefFor: (hold: PickerHold) => string;
  /** The way to every website at once: "Your sites" on the client, "All websites" in the admin. */
  all: { label: string; href: string };
  /** A line at the foot of the list, about what choosing does. */
  footer?: ReactNode;
  triggerId?: string;
  /** The button's name, when no label on the page names it. */
  triggerLabel?: string;
  triggerClassName: string;
  renderTrigger: (isOpen: boolean) => ReactNode;
}) {
  const t = useTranslations("sites.switcher");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const [term, setTerm] = useState("");
  const [unfolded, setUnfolded] = useState<ReadonlySet<string>>(new Set());
  const [whole, setWhole] = useState<ReadonlySet<string>>(new Set());

  const isOpen = place !== null;
  const { groups, alone } = groupHolds(holds);
  const current = holds.find((hold) => hold.siteId === currentId);
  const currentOwner = current?.relationship === "OWNED" ? current.siteId : current?.ofSiteId ?? null;
  const competitorCount = holds.length - groups.length;

  const open = () => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    setTerm("");
    setUnfolded(new Set(currentOwner ? [currentOwner] : []));
    setWhole(new Set());
    setPlace({ top: rect.bottom + 8, left: rect.left });
  };
  const close = () => setPlace(null);

  useEffect(() => {
    if (!isOpen) return;
    // A phone's keyboard would cover the sheet it has only just opened.
    if (window.matchMedia?.(WIDE).matches) findRef.current?.focus();
    const inside = (target: EventTarget | null) =>
      target instanceof Node && Boolean(panelRef.current?.contains(target) || buttonRef.current?.contains(target));
    const onPress = (event: MouseEvent) => {
      if (!inside(event.target)) setPlace(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPlace(null);
      buttonRef.current?.focus();
    };
    // The list is placed where the button was: once the page moves it would hang in the wrong place.
    const onMove = (event: Event) => {
      if (!inside(event.target)) setPlace(null);
    };
    document.addEventListener("mousedown", onPress);
    document.addEventListener("keydown", onKey);
    document.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("mousedown", onPress);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [isOpen]);

  const matches = wordStartMatcher(term.trim().toLowerCase());
  const shown = groups.flatMap(({ owner, competitors }) => {
    const found = matches ? competitors.filter((rival) => matches(rival.host)) : competitors;
    if (matches && !matches(owner.host) && found.length === 0) return [];
    const isUnfolded = matches ? found.length > 0 : unfolded.has(owner.siteId);
    const listed = matches || whole.has(owner.siteId) ? found : found.slice(0, SHOWN);
    return [{ owner, competitors, isUnfolded, listed, hidden: found.length - listed.length }];
  });
  const shownAlone = matches ? alone.filter((rival) => matches(rival.host)) : alone;

  const toggle = (ownerId: string) =>
    setUnfolded((before) => {
      const next = new Set(before);
      if (next.has(ownerId)) next.delete(ownerId);
      else next.add(ownerId);
      return next;
    });

  const competitorLink = (rival: PickerHold) => {
    const isCurrent = rival.siteId === currentId;
    return (
      <Link
        key={rival.siteId}
        href={hrefFor(rival)}
        onClick={close}
        aria-current={isCurrent ? "page" : undefined}
        className={cn(
          "flex min-h-10 items-center gap-2.5 rounded-[8px] pl-[52px] pr-3 text-[13px] text-foreground/90 transition-colors hover:bg-foreground/5",
          isCurrent && "bg-foreground/[0.07]",
        )}
      >
        <SiteMark host={rival.host} iconUrl={rival.iconUrl} owned={false} small />
        <span className="min-w-0 flex-1 truncate">{rival.host}</span>
        {isCurrent ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
      </Link>
    );
  };

  const list = (
    <>
      {/* The page under it: everything outside the sheet is out of reach on a phone. */}
      <div aria-hidden="true" className={cn("fixed inset-0 bg-black/60 sm:hidden", LAYER.OVERLAY)} />
      <div
        ref={panelRef}
        role="dialog"
        aria-label={t("title")}
        style={{ "--switcher-top": `${place?.top ?? 0}px`, "--switcher-left": `${place?.left ?? 0}px` } as CSSProperties}
        className={cn(
          LAYER.OVERLAY,
          "fixed inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[20px] border-t border-border-dim bg-card shadow-2xl",
          "sm:inset-x-auto sm:bottom-auto sm:left-[var(--switcher-left)] sm:top-[var(--switcher-top)] sm:max-h-[calc(100vh-var(--switcher-top)-16px)] sm:w-[420px] sm:rounded-[14px] sm:border",
        )}
      >
        <div className="flex items-center justify-between pl-4 pr-1 pt-2 sm:hidden">
          <h2 className="text-[17px] font-bold text-foreground">{t("title")}</h2>
          <Button variant="icon" aria-label={t("close")} onClick={close} className="flex h-11 w-11 items-center justify-center">
            <X className="h-[18px] w-[18px]" aria-hidden="true" />
          </Button>
        </div>
        <div className="p-3 pb-2">
          <Field
            label={t("findLabel")}
            labelHidden
            placeholder={t("findPlaceholder")}
            value={term}
            onChange={(event) => setTerm(event.target.value)}
            inputRef={findRef}
            autoComplete="off"
          />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-2">
          <Link
            href={all.href}
            onClick={close}
            aria-current={currentId === null ? "page" : undefined}
            className={cn("flex min-h-12 items-center gap-3 rounded-[10px] px-3 transition-colors hover:bg-foreground/5", currentId === null && "bg-foreground/[0.07]")}
          >
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] border border-border-dim text-secondary">
              <LayoutGrid className="h-4 w-4" />
            </span>
            <span className="flex-1 text-[14px] font-medium text-foreground">{all.label}</span>
            <span className="text-[12px] text-secondary">{t("totals", { sites: groups.length, competitors: competitorCount })}</span>
            {currentId === null ? <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
          </Link>
          <div className="mx-2 my-1 h-px bg-border-dim" />

          {shown.length > 0 ? (
            <span className="px-3 pb-1 pt-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("websites")}</span>
          ) : null}
          {shown.map(({ owner, competitors, isUnfolded, listed, hidden }) => {
            const isCurrent = owner.siteId === currentId;
            return (
              <div key={owner.siteId} className="flex flex-col">
                <div className={cn("flex items-center rounded-[10px]", isCurrent && "bg-foreground/[0.07]")}>
                  <Link
                    href={hrefFor(owner)}
                    onClick={close}
                    aria-current={isCurrent ? "page" : undefined}
                    className="flex min-h-12 min-w-0 flex-1 items-center gap-3 rounded-[10px] px-3 transition-colors hover:bg-foreground/5"
                  >
                    <SiteMark host={owner.host} iconUrl={owner.iconUrl} owned />
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate text-[14px] font-medium text-foreground">{owner.host}</span>
                      <span className="text-[12px] text-secondary">{t("competitors", { count: competitors.length })}</span>
                    </span>
                    {isCurrent ? <Check className="h-4 w-4 shrink-0 text-foreground" aria-hidden="true" /> : null}
                  </Link>
                  {competitors.length > 0 && !matches ? (
                    <Button
                      variant="icon"
                      onClick={() => toggle(owner.siteId)}
                      aria-expanded={isUnfolded}
                      aria-label={t(isUnfolded ? "hideCompetitors" : "showCompetitors", { host: owner.host })}
                      className="mr-1 flex h-10 w-10 items-center justify-center rounded-[8px]"
                    >
                      <ChevronDown className={cn("h-4 w-4 transition-transform", isUnfolded && "rotate-180")} aria-hidden="true" />
                    </Button>
                  ) : null}
                </div>
                {isUnfolded ? (
                  <div className="flex flex-col gap-0.5 py-1">
                    {listed.map(competitorLink)}
                    {hidden > 0 ? (
                      <Button
                        variant="ghost"
                        onClick={() => setWhole((before) => new Set(before).add(owner.siteId))}
                        className="self-start py-1.5 pl-[52px] pr-3 text-[12.5px] underline underline-offset-4"
                      >
                        {t("more", { count: hidden })}
                      </Button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}

          {shownAlone.length > 0 ? (
            <>
              <span className="px-3 pb-1 pt-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-muted">{t("alone")}</span>
              {shownAlone.map(competitorLink)}
            </>
          ) : null}

          {shown.length === 0 && shownAlone.length === 0 ? (
            <p className="px-3 py-4 text-[13px] text-secondary">{t("noMatch")}</p>
          ) : null}
        </div>

        {footer ? (
          <p className="flex items-center gap-2 border-t border-border-dim px-4 py-3 text-[12px] text-secondary">
            <Pin className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {footer}
          </p>
        ) : null}
      </div>
    </>
  );

  return (
    <>
      <Button
        variant="ghost"
        id={triggerId}
        ref={buttonRef}
        onClick={() => (isOpen ? close() : open())}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-label={triggerLabel}
        className={triggerClassName}
      >
        {renderTrigger(isOpen)}
      </Button>
      {isOpen && typeof document !== "undefined" ? createPortal(list, document.body) : null}
    </>
  );
}
