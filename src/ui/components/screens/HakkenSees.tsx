"use client";

import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { SettingsCard } from "./SettingsCard";

/** One "Do first" step: its sentence, its link's words and where the link leads. */
export type HakkenSeesStep = { words: string; link: string; href: string; external?: boolean };

/**
 * What Hakken sees: the box under the title of every Discovery screen
 * (docs/plans/active/discovery-detail-and-hakken-sees-plan.md §2), saying in
 * two or three sentences what the page means for the business, then the
 * first things to do, each with a quiet link to where it is done. Anthony,
 * 2026-10-10: "I love the what hakken sees addition".
 *
 * A `SettingsCard` with fixed contents, so it cannot drift page by page: the
 * sentences at prose width, then "Do first" and up to three numbered steps.
 * With nothing to do it shows the sentences alone.
 */
export function HakkenSees({ says, steps }: { says: string[]; steps: HakkenSeesStep[] }) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  return (
    <SettingsCard title={t("title", { platformName })}>
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
