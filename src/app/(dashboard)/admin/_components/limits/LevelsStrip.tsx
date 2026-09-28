"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { cn } from "@/src/ui/lib/utils";

export type LimitLevel = "platform" | "company" | "website";

const LEVELS: readonly LimitLevel[] = ["platform", "company", "website"];

/**
 * The three levels a limit is read through — platform, company, website —
 * with the page's own lit (docs/plans/active/platform-limits-plan.md). The
 * same strip heads the platform's Limits, a company's and a website's, so an
 * admin always sees where the number on the page comes from and what it
 * reaches.
 */
export function LevelsStrip({ level, companyHref }: {
  level: LimitLevel;
  /** A website's company Limits, so the middle step can be followed from a website. */
  companyHref?: string;
}) {
  const t = useTranslations("admin.limits.levels");

  const where = (step: LimitLevel) => {
    if (step === level) return t("thisPage");
    if (step === "platform") return <Link href="/admin/settings/limits" className="text-brand hover:underline">{t("platformPage")}</Link>;
    if (step === "company" && companyHref) return <Link href={companyHref} className="text-brand hover:underline">{t("itsLimits")}</Link>;
    return t("itsLimits");
  };

  return (
    <div className="flex flex-col gap-3.5 rounded-[16px] border border-border-dim bg-card/30 p-5">
      <ol className="grid grid-cols-1 items-center gap-3.5 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        {LEVELS.map((step, index) => (
          <li key={step} className="contents">
            {index > 0 ? <ArrowRight className="hidden h-[18px] w-[18px] text-muted sm:block" aria-hidden="true" /> : null}
            <div
              aria-current={step === level ? "step" : undefined}
              className={cn(
                "flex flex-col gap-1 rounded-[12px] border px-4 py-3.5",
                step === level ? "border-foreground/25 bg-foreground/5" : "border-border-dim bg-black/20",
              )}
            >
              <span className="font-mono text-[10.5px] font-medium uppercase tracking-[0.16em] text-muted">
                {t(`${step}.name`, { number: index + 1 })}
              </span>
              <span className="text-[14px] font-semibold text-foreground">{where(step)}</span>
              <span className="text-[12px] leading-relaxed text-secondary">{t(`${step}.text`)}</span>
            </div>
          </li>
        ))}
      </ol>
      <p className="text-[12px] leading-relaxed text-muted">{t(`${level}.note`)}</p>
    </div>
  );
}
