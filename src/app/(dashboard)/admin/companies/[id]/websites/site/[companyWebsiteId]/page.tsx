"use client";

import { useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Compass, Link2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { formatDate } from "@/src/lib/dates";
import { SiteDataLimits } from "./SiteDataLimits";
import { SiteMoves } from "./SiteMoves";
import { TrackedPairing } from "./TrackedPairing";
import { siteBase } from "./siteView";

/**
 * The Overview: how this site is doing, and what to do next.
 *
 * Three cards — Google searches, AI questions, competitors — each a count and
 * one plain line, opening the results behind it; then the next steps each
 * collection draws. Searches and questions belong to the website and are
 * shared by every company watching it, so one line under the cards says so
 * and opens the website record, the only place they are edited.
 * No prices here: cost is a setting's business, not a reason to read a page.
 * Last, how much is kept about the site (`SiteDataLimits`).
 *
 * A tracked site has no lists of its own, so this route is its overview
 * instead: what it is compared with, how it is collected, and how much of it
 * is kept.
 */
export default function CompanySiteOverviewPage() {
  const t = useTranslations("admin.siteView");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  const owned = header?.relationship === "OWNED";
  const portfolio = useQuery(
    api.websiteClientView.getSitePortfolio,
    owned ? { companyWebsiteId } : "skip",
  );

  if (!header) return null;
  const base = siteBase(companyId, companyWebsiteId);

  if (!owned) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          icon={<Link2 className="h-5 w-5 text-brand" />}
          title={t("paired.title")}
          description={t("paired.subtitle")}
        />
        <TrackedPairing
          companyId={companyId}
          companyWebsiteId={companyWebsiteId}
          pairedWith={header.pairedWith ? { ...header.pairedWith, locationLabel: header.placeLabel } : null}
          nextRunAt={header.schedule.nextRunAt}
        />
        {header.pairedWith ? (
          <Link
            href={`${siteBase(companyId, header.pairedWith.companyWebsiteId)}/competitors`}
            className="flex w-fit items-center gap-2 text-[13px] text-brand hover:underline"
          >
            {t("paired.compare", { host: header.pairedWith.displayHost })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="text-[13px] text-secondary">{t("paired.alone")}</p>
        )}
        <SiteDataLimits companyWebsiteId={companyWebsiteId} />
      </div>
    );
  }

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

  const record = `/admin/websites/${header.websiteId}`;
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
        icon={<Compass className="h-5 w-5 text-brand" />}
        title={t("overview.title")}
        description={header.lastCollectedAt
          ? t("overview.lastChecked", { when: formatDate(header.lastCollectedAt) })
          : t("overview.neverChecked")}
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

      <p className="-mt-4 flex flex-wrap items-center gap-x-2 text-[13px] text-secondary">
        {t("overview.sharedLists", { host: header.displayHost })}
        <Link href={record} className="flex items-center gap-1 text-foreground hover:text-brand">
          {t("overview.editLists")}
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </p>

      <SiteMoves companyId={companyId} companyWebsiteId={companyWebsiteId} websiteId={header.websiteId} />

      <SiteDataLimits companyWebsiteId={companyWebsiteId} />
    </div>
  );
}
