"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";

import { LevelsStrip } from "../LevelsStrip";

export type LimitLevel = "platform" | "company" | "website";

const LEVELS: readonly LimitLevel[] = ["platform", "company", "website"];

/**
 * The three levels a limit is read through — platform, company, website —
 * with the page's own lit (docs/plans/active/platform-limits-plan.md). The
 * same strip heads the platform's Limits, a company's and a website's, so an
 * admin always sees where the number on the page comes from and what it
 * reaches. Drawn by the shared `LevelsStrip` since 2026-11-21, which Features
 * uses too.
 */
export function LimitLevelsStrip({ level, companyHref }: {
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
    <LevelsStrip
      steps={LEVELS.map((step, index) => ({
        name: t(`${step}.name`, { number: index + 1 }),
        where: where(step),
        text: t(`${step}.text`),
        current: step === level,
      }))}
      note={t(`${level}.note`)}
    />
  );
}
