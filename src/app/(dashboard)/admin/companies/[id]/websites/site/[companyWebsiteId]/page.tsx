"use client";

import { useEffect } from "react";
import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, ListChecks } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDate } from "@/src/lib/dates";
import { SiteMoves } from "./SiteMoves";
import { siteBase } from "./siteView";

/**
 * To do: how this site is doing, and what to do next
 * (docs/plans/active/websites-section-menu-plan.md).
 *
 * Three cards — Google searches, AI questions, competitors — each a count and
 * one plain line, opening the results behind it; then the next steps each
 * collection draws. No prices here: cost is a setting's business, not a
 * reason to read a page. How much is kept about the site moved to its
 * Schedule and limits on 2026-09-28, with the rest of its settings.
 *
 * A competitor has no lists of its own and no next steps, so its address
 * opens its rankings instead.
 */
export default function CompanySiteTodoPage() {
  const t = useTranslations("admin.siteView");
  const router = useRouter();
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const owned = header?.relationship === "OWNED";
  const portfolio = useQuery(
    api.websiteClientView.getSitePortfolio,
    owned ? { companyWebsiteId } : "skip",
  );
  const base = siteBase(companyId, companyWebsiteId);
  const isCompetitor = header !== undefined && header !== null && !owned;

  useEffect(() => {
    if (isCompetitor) router.replace(`${base}/keywords`);
  }, [isCompetitor, base, router]);

  if (!header || !owned) return null;

  /*
    Only what is true, in the order somebody would act on it. A line of zeros
    — "0 on page one · 0 dropping" — says nothing and reads as failure on a
    site that simply has not been checked yet.
  */
  const describe = (
    tally: Record<string, number> | undefined,
    parts: ReadonlyArray<readonly [string, readonly string[]]>,
  ) => parts.flatMap(([key, verdicts]) => {
    const total = verdicts.reduce((sum, verdict) => sum + (tally?.[verdict] ?? 0), 0);
    return total > 0 ? [t(`overview.parts.${key}`, { count: total })] : [];
  }).join(" · ");

  const cards = [
    {
      key: "searches",
      href: `${base}/searches`,
      label: t("overview.searches"),
      value: header.counts.searches,
      line: header.counts.searches === 0
        ? t("overview.searchesEmpty")
        : describe(portfolio?.searches, [
          ["dropping", ["SLIPPING"]],
          ["pageOne", ["TOP_THREE", "PAGE_ONE"]],
          ["belowPageOne", ["RANKING"]],
          ["notFound", ["NEVER_RANKED", "NOT_FOUND"]],
          ["tooEarly", ["TOO_NEW", "NOT_CHECKED"]],
        ]),
      go: t("overview.seeSearches"),
    },
    {
      key: "questions",
      href: `${base}/citations`,
      label: t("overview.questions"),
      value: header.counts.questions,
      line: header.counts.questions === 0
        ? t("overview.questionsEmpty")
        : describe(portfolio?.questions, [
          ["warned", ["WARNED"]],
          ["mentioned", ["EARNING"]],
          ["rarely", ["THIN"]],
          ["never", ["NEVER_LANDED"]],
          ["tooEarly", ["TOO_NEW", "NOT_ASKED"]],
        ]),
      go: t("overview.seeAnswers"),
    },
    {
      key: "rivals",
      href: `${base}/competitors`,
      label: t("overview.rivals"),
      value: header.counts.rivals,
      line: header.counts.rivals === 0
        ? t("overview.rivalsEmpty")
        : describe(portfolio?.rivals, [
          ["ahead", ["AHEAD"]],
          ["level", ["LEVEL"]],
          ["behind", ["BEHIND"]],
          ["quiet", ["GONE_QUIET"]],
          ["tooEarly", ["TOO_NEW", "NOT_CHECKED"]],
        ]),
      go: t("overview.seeCompetitors"),
    },
  ];

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        icon={<ListChecks className="h-6 w-6 text-brand" />}
        title={t("overview.title")}
        description={header.lastCollectedAt
          ? t("overview.lastChecked", { host: header.displayHost, when: formatDate(header.lastCollectedAt) })
          : t("overview.neverChecked", { host: header.displayHost })}
      />

      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="group flex flex-col gap-2 rounded-[13px] border border-border-dim bg-card/40 p-4 transition-colors hover:border-brand/40"
          >
            <h2 className="text-[13px] font-medium text-secondary">{card.label}</h2>
            <span className="font-mono text-[26px] leading-none text-foreground">{card.value}</span>
            <span className="text-[13px] leading-relaxed text-secondary">{card.line || t("overview.notCheckedYet")}</span>
            <span className="mt-auto flex items-center gap-1 pt-2 text-[12px] text-muted group-hover:text-brand">
              {card.go}
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </Link>
        ))}
      </div>

      {/* The lists are this company's own (docs/plans/active/private-tracking-lists-plan.md). */}
      <p className="-mt-4 flex flex-wrap items-center gap-x-2 text-[13px] text-secondary">
        {t("overview.ownLists", { host: header.displayHost })}
        <Link href={`${base}/searches`} className="flex items-center gap-1 text-foreground hover:text-brand">
          {t("overview.editLists")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>

      <SiteMoves companyId={companyId} companyWebsiteId={companyWebsiteId} />
    </div>
  );
}
