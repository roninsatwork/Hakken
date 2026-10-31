"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import type { FunctionArgs } from "convex/server";
import type { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { LAYER } from "@/src/ui/lib/layers";
import { cn } from "@/src/ui/lib/utils";
import { publishSees } from "./hakkenSeesStore";

/** One "Do first" step: its sentence, its link's words and where the link leads. */
export type HakkenSeesStep = { words: string; link: string; href: string; external?: boolean };

/**
 * What a page hands the Insights team when the eye is pressed
 * (sees-conversion-specialist-plan-2026-10-30.md S4): its figures as facts,
 * where its steps may lead, and the dates and filters it is on. Nothing else
 * reaches the team, and nothing is asked of Google.
 */
export type SeesAsk = FunctionArgs<typeof api.seesAsk.askSees>;

/**
 * A page's own figures for the eye (docs/plans/active/sees-every-page-plan-2026-10-31.md, phase 1): its key in the
 * screen list ("searchConsole.keywords"), its website and dates, and the answer of the query that draws it. From
 * these the eye shows what code finds in the figures, hands them to the writer when pressed, and gives them to the
 * chat — the figures the reader sees, never a second read. A section's wrapper fills everything but `data`.
 */
export type SeesPage = {
  screen: string;
  siteId?: Id<"companyWebsites">;
  data: unknown;
  period?: string;
  from?: string | null;
  to?: string | null;
  country?: string;
  device?: string;
  /** Places a step may link to beyond the rule's own steps: the section's other screens. */
  links?: ReadonlyArray<{ label: string; href: string }>;
};

/**
 * What Hakken sees: what the page means for the business, in two or three
 * sentences, then the first things to do, each with a quiet link to where it
 * is done (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §2;
 * Anthony, 2026-10-10: "I love the what hakken sees addition").
 *
 * Since 2026-10-30 (the Conversions canvas, board "Sees") it is a speech
 * bubble hanging from the eye in the top bar, over the page — "another
 * layer above the rest, close to the eye" — not a box in the page: this
 * part draws nothing itself. It publishes the screen's words to
 * `hakkenSeesStore` as it mounts, so the top bar's eye can draw, count the
 * steps as new, and open the bubble (`SeesBubble`) with them. `advice`
 * names the words as codes (`seenAdvice`), so the same advice with today's
 * numbers is not new again; without it, the sentences themselves are the
 * advice.
 */
export function HakkenSees({ says, steps, advice, ask, name, page }: { says: string[]; steps: HakkenSeesStep[]; advice?: string; ask?: SeesAsk; name?: (eventName: string) => string; page?: SeesPage }) {
  const screen = usePathname() ?? "";
  const held = advice ?? says.join(" ");
  // Published once per change of words, not per render: the arrays are new each time. The page's figures by the
  // query's own answer, which stays the same object until its figures change — never written out on every render.
  const words = JSON.stringify({ says, steps, ask, page: page ? { ...page, data: undefined } : null });
  const data = page?.data;
  useEffect(() => {
    publishSees({ screen, says, steps, advice: held, ...(ask ? { ask } : {}), ...(name ? { name } : {}), ...(page ? { page } : {}) });
    return () => publishSees(null, screen);
  }, [screen, words, held, data]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/**
 * The speech bubble, open under the eye: the heading, the sentences at the
 * app's 13px, then "Do first" and up to three numbered steps. It has no
 * fixed height — it grows with the words and scrolls inside itself past
 * the screen (Anthony, 2026-10-30: "assume the bubble gets deeper to suit
 * the reply from the agents") — and a tail pointing up at the eye, 22px
 * above it. `researching` is the one other thing it says: while the
 * Insights team writes the words (sees-conversion-specialist-plan-2026-10-30.md,
 * S11), "Hakken is researching…" and nothing else.
 */
export function SeesBubble({ says, steps, researching = false, id }: { says: string[]; steps: HakkenSeesStep[]; researching?: boolean; id?: string }) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  return (
    <div
      id={id}
      role="dialog"
      aria-label={t("title", { platformName })}
      data-part="sees-bubble"
      className={cn(
        "absolute right-0 top-full mt-[22px] flex w-[min(520px,calc(100vw-32px))] flex-col gap-3 rounded-[14px] border border-border-dim bg-card p-5 text-left shadow-2xl sm:-right-6",
        "max-h-[min(70vh,720px)] overflow-y-auto",
        LAYER.HEADER,
      )}
    >
      {/* The tail, centred under the eye: the eye is 38px wide and the bubble reaches 24px past it on a wide screen. */}
      <span aria-hidden="true" className="absolute -top-[9px] right-[11px] h-4 w-4 rotate-45 border-l border-t border-border-dim bg-card sm:right-[35px]" />
      <span className="shrink-0 text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">{t("title", { platformName })}</span>
      {researching ? (
        <p className="text-[13px] leading-[1.6] text-secondary" aria-live="polite">{t("researching", { platformName })}</p>
      ) : (
        <SeesWords says={says} steps={steps} />
      )}
    </div>
  );
}

/** The bubble's words: the sentences, then "Do first" and the steps, each with its quiet link. */
export function SeesWords({ says, steps }: { says: string[]; steps: HakkenSeesStep[] }) {
  const t = useTranslations("ui.hakkenSees");
  return (
    <>
      {/* A page with nothing to say by its rule yet still has the chat below (sees-every-page-plan-2026-10-31.md). */}
      <p className="text-[13px] leading-[1.6] text-secondary">{says.length > 0 ? says.join(" ") : t("askBelow")}</p>
      {steps.length > 0 ? (
        <div className="mt-1 flex flex-col gap-2">
          <div className="text-[12px] text-muted">{t("doFirst")}</div>
          {steps.map((step, at) => (
            <div key={`${at}-${step.href}`} className="flex flex-wrap items-center gap-3">
              <span className="text-[13px] text-foreground">{at + 1}. {step.words}</span>
              <Link
                href={step.href}
                {...(step.external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
                className="inline-flex items-center gap-1.5 text-[12px] text-secondary hover:text-foreground"
              >
                {step.link}
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}
