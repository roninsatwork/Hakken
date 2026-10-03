"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";

import { Meter } from "@/src/ui/components/screens/Meter";
import { cn } from "@/src/ui/lib/utils";

/**
 * How many prompts a website asks against its limit, where prompts are added
 * (Anthony, 2026-09-28: "this screen needs to show the limit and our number /
 * In this case we are 6 out of 10 of our allowance"). Asking and paused alike
 * count, as adding one checks. At the limit the add box takes no more; past it
 * — the limit was lowered — only the first that many are asked. The limit is
 * the website's Prompts per website, changed on its Limits page.
 */
export function PromptAllowance({
  host,
  used,
  paused,
  limit,
  limitsHref,
}: {
  host: string;
  used: number;
  paused: number;
  limit: number;
  limitsHref: string;
}) {
  const t = useTranslations("admin.companyAiLists.questions.allowance");
  const full = used >= limit;
  const line = used > limit
    ? t("over", { count: used, limit, extra: used - limit })
    : full
      ? t("full", { limit })
      : [t("left", { count: limit - used }), paused > 0 ? t("paused", { count: paused }) : ""].filter(Boolean).join(" ");
  const share = limit > 0 ? Math.min(1, used / limit) : 1;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border-dim/60 pb-4">
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="text-[13px] font-semibold text-foreground">{t("title", { host })}</span>
        <span className={cn("text-[12px]", full ? "text-warning" : "text-secondary")}>{line}</span>
      </div>
      <div className="flex items-center gap-4">
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="font-mono text-[20px] font-semibold text-foreground">{used}</span>
          <span className="text-[13px] text-secondary">{t("of", { limit })}</span>
        </span>
        {/* The kit's share bar draws itself hidden from a screen reader; the meter's reading is said here. */}
        <span role="meter" aria-label={t("meter")} aria-valuemin={0} aria-valuemax={limit} aria-valuenow={used}>
          <Meter value={share} colour={full ? "var(--color-warning)" : undefined} />
        </span>
        <Link
          href={limitsHref}
          title={t("changeTip", { host })}
          className="flex w-fit items-center gap-1.5 whitespace-nowrap text-[13px] text-brand hover:underline"
        >
          {t("change")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
