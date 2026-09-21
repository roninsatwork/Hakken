"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * What this company costs to serve.
 *
 * **Two figures, because one of them lies when asked about pricing.** Paid is
 * money out. Standalone is what this company would have cost on its own, and it
 * is the number a price has to clear: one host is fetched once for everyone
 * watching it, so a company whose rival happens to trigger the pulls looks
 * almost free to serve right up until that rival leaves.
 *
 * Super admin only. Hakken absorbs DataForSEO spend and no customer ever sees
 * it, so every number here is a margin question, never a line on anyone's bill.
 */
export function CollectionCost({ companyId }: { companyId: Id<"companies"> }) {
  const t = useTranslations("admin.companyDataCollection.cost");
  const spend = useQuery(api.seoCollectionReports.readSeoSpend, { companyId });

  if (!spend) return null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-[13px] font-semibold uppercase tracking-[0.12em] text-muted">
          {t("title")}
        </h2>
        <p className="max-w-3xl text-[13px] text-secondary">{t("subtitle")}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Figure
          label={t("paid")}
          value={`$${spend.paidUsd.toFixed(2)}`}
          hint={t("paidHint", { pulls: spend.totalPulls })}
        />
        <Figure
          label={t("standalone")}
          value={`$${spend.standaloneUsd.toFixed(2)}`}
          hint={t("standaloneHint")}
          emphasis
        />
        <Figure
          label={t("saving")}
          value={`$${spend.reusedValueUsd.toFixed(2)}`}
          hint={t("savingHint")}
        />
      </div>
    </div>
  );
}

function Figure({
  label,
  value,
  hint,
  emphasis = false,
}: {
  label: string;
  value: string;
  hint: string;
  emphasis?: boolean;
}) {
  return (
    <div
      className={`flex flex-col gap-1 rounded-[12px] border px-4 py-3 ${
        // The standalone figure is the one a price has to clear, so it is the
        // one the eye should land on.
        emphasis ? "border-brand/40 bg-brand/5" : "border-border-dim bg-card/40"
      }`}
    >
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</span>
      <span className="font-mono text-[20px] leading-none text-foreground">{value}</span>
      <span className="text-[11px] leading-relaxed text-muted">{hint}</span>
    </div>
  );
}
