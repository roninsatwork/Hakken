"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { SettingsCard } from "./SettingsCard";
import { publishSees, toggleSees, useSeesOpen } from "./hakkenSeesStore";

/** One "Do first" step: its sentence, its link's words and where the link leads. */
export type HakkenSeesStep = { words: string; link: string; href: string; external?: boolean };

/**
 * What Hakken sees: the box under the title of every Visibility screen
 * (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §2), saying in
 * two or three sentences what the page means for the business, then the
 * first things to do, each with a quiet link to where it is done. Anthony,
 * 2026-10-10: "I love the what hakken sees addition".
 *
 * A `SettingsCard` with fixed contents, so it cannot drift page by page: the
 * sentences at prose width, then "Do first" and up to three numbered steps.
 * With nothing to do it shows the sentences alone.
 *
 * It opens from the eye in the header (`HakkenSeesEye`;
 * sees-header-and-rolling-dates-plan.md, part one; Anthony, 2026-10-29: the
 * box "takes up a lot of screen real estate when all I want to see is the
 * graphs and data"): closed on every screen until the eye opens it, and
 * closed again by its own chevron or the eye. The box publishes what it holds
 * to `hakkenSeesStore` so the header can draw the eye and count its steps as
 * new — `advice` names the box's sentences and steps as codes (`seenAdvice`),
 * so the same advice with today's numbers is not new again; without it, the
 * sentences themselves are the advice.
 */
export function HakkenSees({ says, steps, advice }: { says: string[]; steps: HakkenSeesStep[]; advice?: string }) {
  const screen = usePathname() ?? "";
  const held = advice ?? says.join(" ");
  // Published once per change of words, not per render: the arrays are new each time.
  const words = JSON.stringify({ says, steps });
  useEffect(() => {
    publishSees({ screen, says, steps, advice: held });
    return () => publishSees(null, screen);
  }, [screen, words, held]); // eslint-disable-line react-hooks/exhaustive-deps
  const open = useSeesOpen();
  if (!open) return null;
  return <HakkenSeesCard says={says} steps={steps} onClose={toggleSees} />;
}

/** The box itself, open: drawn by `HakkenSees` once the eye opens it, and by the drawing kit. */
export function HakkenSeesCard({ says, steps, onClose }: { says: string[]; steps: HakkenSeesStep[]; onClose: () => void }) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  return (
    <SettingsCard title={t("title", { platformName })} fold={{ open: true, summary: says[0], onToggle: onClose }}>
      <p className="max-w-[75ch] text-[13px] leading-[1.6] text-secondary">{says.join(" ")}</p>
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
    </SettingsCard>
  );
}
