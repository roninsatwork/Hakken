"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { AlertTriangle, ArrowRight, Check, Loader2, Minus } from "lucide-react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";

import { GovernanceActivity } from "./GovernanceActivity";

/**
 * What needs a person, right now — and what the AI has actually been doing.
 *
 * Built last on purpose. A dashboard drawn over an empty register is a
 * screenshot rather than a product, so this waited until the register filled
 * itself and the ratings restrained something.
 *
 * Every figure links to the records behind it. A number with nowhere to go is
 * decoration, and decoration on a compliance screen is worse than a blank one —
 * it suggests a check nobody is actually doing.
 *
 * The checks alone were not enough to read. Every one of them counts a problem,
 * so a healthy estate rendered as a page of noughts and the screen looked like
 * it had failed to load — Anthony, 2026-08-06: *"its factual and boring."* The
 * activity above them is the same record read the other way round: not what is
 * wrong, but what happened. The checks stay where they are, below it, because
 * they are still the part that asks for something.
 *
 * See docs/plans/active/governance-and-trust-plan.md.
 */
export function GovernanceDashboard() {
  const t = useTranslations("admin.governance.dashboard");
  const dashboard = useQuery(api.governanceDashboard.getGovernanceDashboard);

  if (dashboard === undefined) {
    return (
      <div className="flex items-center justify-center rounded-[16px] border border-border-dim bg-sidebar/40 p-8">
        <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
      </div>
    );
  }

  const settled = dashboard.attention === 0;

  return (
    <div className="flex flex-col gap-3">
      <div
        className={`rounded-[16px] border p-5 ${
          /*
            Amber for attention, plain for settled. Never red against green:
            the label beside it is what carries the meaning, and the colour only
            draws the eye.
          */
          settled
            ? "border-border-dim bg-sidebar/40"
            : "border-[#fbbf24]/40 bg-[#fef3c7]/40 dark:bg-[#78350f]/20"
        }`}
      >
        <p className="text-[15px] font-medium text-foreground">
          {settled ? t("settled") : t("attention", { count: dashboard.attention })}
        </p>
        <p className="mt-1 text-[13px] text-secondary">
          {t("systems", { count: dashboard.systems })}
        </p>
      </div>

      <GovernanceActivity riskMix={dashboard.riskMix} systems={dashboard.systems} />

      <p className="mt-2 text-[13px] font-medium text-foreground">{t("checksTitle")}</p>

      <div className="grid gap-2 sm:grid-cols-2">
        {dashboard.checks.map((check) => {
          const needsAttention = check.state === "NEEDS_ATTENTION";
          const notSetUp = check.state === "NOT_SET_UP";

          return (
            <Link
              key={check.key}
              href={check.href}
              className="flex items-start justify-between gap-3 rounded-[12px] border border-border-dim bg-sidebar/40 p-4 transition-colors hover:border-foreground/30"
            >
              <span className="flex items-start gap-2.5">
                <span
                  className={`mt-0.5 ${
                    needsAttention ? "text-[#b45309] dark:text-[#fbbf24]" : "text-secondary"
                  }`}
                  aria-hidden="true"
                >
                  {needsAttention ? (
                    <AlertTriangle className="h-4 w-4" />
                  ) : notSetUp ? (
                    <Minus className="h-4 w-4" />
                  ) : (
                    <Check className="h-4 w-4" />
                  )}
                </span>
                <span className="flex flex-col">
                  <span className="text-[13px] font-medium text-foreground">{t(`checks.${check.key}.label`)}</span>
                  <span className="mt-0.5 text-[12px] leading-relaxed text-secondary">
                    {/* Three states and only one is a problem. "Nothing here
                        needs you" is not the same claim as "this is good". */}
                    {notSetUp
                      ? t(`checks.${check.key}.notSetUp`)
                      : needsAttention
                        ? t(`checks.${check.key}.attention`, { count: check.count ?? 0 })
                        : t(`checks.${check.key}.settled`)}
                  </span>
                  {check.key === "retention" && dashboard.retentionTooShort.length > 0 ? (
                    <span className="mt-1 text-[12px] text-[#b45309] dark:text-[#fbbf24]">
                      {dashboard.retentionTooShort.join(", ")}
                    </span>
                  ) : null}
                </span>
              </span>

              <span className="flex items-center gap-2 whitespace-nowrap">
                {typeof check.count === "number" ? (
                  <span
                    className={`text-[18px] font-medium ${
                      needsAttention ? "text-[#b45309] dark:text-[#fbbf24]" : "text-foreground"
                    }`}
                  >
                    {check.count}
                  </span>
                ) : null}
                <ArrowRight className="h-3.5 w-3.5 text-muted" aria-hidden="true" />
              </span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
