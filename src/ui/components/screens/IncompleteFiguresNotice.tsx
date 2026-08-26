"use client";

import { AlertTriangle } from "lucide-react";
import { useTranslations } from "next-intl";

import type { ReadCoverage } from "@/convex/utils/readCoverage";

/**
 * Says so when a figure on the screen is a floor rather than a total.
 *
 * Analytics figures are worked out by reading a batch of rows under a cap, and
 * a period busier than the cap used to come back short with nothing anywhere
 * saying so — a busy month was indistinguishable from a quiet one. The queries
 * now read one row past their cap and report whether they ran out of room;
 * this is where the reader is told.
 *
 * Deliberately not an error state. The figures are still worth showing and are
 * still directionally true; what has gone is the claim that they are exact.
 * Nothing is hidden and nothing is blocked.
 */
export function IncompleteFiguresNotice({ coverage }: { coverage?: ReadCoverage }) {
  const t = useTranslations("common.coverage");

  if (!coverage || coverage.complete) return null;

  return (
    <div className="flex items-start gap-3 rounded-[10px] border border-border-dim bg-card/40 px-4 py-3">
      <AlertTriangle className="mt-[2px] h-[18px] w-[18px] shrink-0 text-secondary" />
      <div>
        <div className="text-[13px] font-semibold text-foreground">{t("title")}</div>
        <div className="mt-1 text-[12px] text-secondary">{t("body")}</div>
      </div>
    </div>
  );
}
