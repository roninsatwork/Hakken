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
import { TrackedPairing } from "./TrackedPairing";
import { formatMonthly, siteBase } from "./siteView";

/**
 * The Brief: how this site is doing, at a glance, and where to go next.
 *
 * Four cards, one per thing this client pays to watch, each with its count,
 * what it costs a month and how it is doing in words — "3 on page one, 1 never
 * ranked" rather than a percentage, because the words say what to do. Every
 * card opens the list it summarises. The moves drawn from each collection sit
 * above them once stage 3 lands.
 *
 * **Day one is the same screen with nothing in it.** No setup wizard and no
 * progress bar — Anthony, 2026-09-22: *"setting up keywords, prompts and
 * competitors is not a one time job."* A site with nothing tracked says what
 * the first search or question would do, in the card it would fill.
 *
 * A tracked site has no lists of its own, so this route is its overview
 * instead: what it is compared with, and how it is collected.
 */
export default function CompanySiteBriefPage() {
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
  const unknown = t("priceUnknown");

  if (!owned) {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          icon={<Link2 className="h-5 w-5 text-brand" />}
          title={t("overview.title")}
          description={t("overview.subtitle")}
        />
        <TrackedPairing
          companyId={companyId}
          companyWebsiteId={companyWebsiteId}
          pairedWith={header.pairedWith ? { ...header.pairedWith, locationLabel: header.placeLabel } : null}
          nextRunAt={header.schedule.nextRunAt}
        />
        {header.pairedWith ? (
          <Link
            href={`${siteBase(companyId, header.pairedWith.companyWebsiteId)}/tracking?list=competitors`}
            className="flex w-fit items-center gap-2 text-[13px] text-brand hover:underline"
          >
            {t("overview.compare", { host: header.pairedWith.displayHost })}
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        ) : (
          <p className="text-[13px] text-secondary">{t("overview.alone")}</p>
        )}
      </div>
    );
  }

  /*
    Only what is true, in the order somebody would act on it. A line of zeros
    — "0 on page one · 0 slipping · 0 never ranked" — says nothing and reads as
    failure on a site that simply has not been collected yet.
  */
  const describe = (
    tally: Record<string, number> | undefined,
    parts: ReadonlyArray<readonly [string, readonly string[]]>,
  ) => parts.flatMap(([key, verdicts]) => {
    const total = verdicts.reduce((sum, verdict) => sum + (tally?.[verdict] ?? 0), 0);
    return total > 0 ? [t(`brief.parts.${key}`, { count: total })] : [];
  }).join(" · ");

  const searchLine = header.counts.searches === 0
    ? t("brief.searchesEmpty")
    : describe(portfolio?.searches, [
      ["slipping", ["SLIPPING"]],
      ["pageOne", ["TOP_THREE", "PAGE_ONE"]],
      ["offPageOne", ["RANKING"]],
      ["neverRanked", ["NEVER_RANKED"]],
      ["notFound", ["NOT_FOUND"]],
      ["tooNew", ["TOO_NEW"]],
      ["notChecked", ["NOT_CHECKED"]],
    ]);
  const questionLine = header.counts.questions === 0
    ? t("brief.questionsEmpty")
    : describe(portfolio?.questions, [
      ["warned", ["WARNED"]],
      ["earning", ["EARNING"]],
      ["thin", ["THIN"]],
      ["neverLanded", ["NEVER_LANDED"]],
      ["tooNew", ["TOO_NEW"]],
      ["notAsked", ["NOT_ASKED"]],
    ]);
  const suggested = portfolio?.untrackedNamed ?? 0;
  const rivalLine = [
    header.counts.rivals === 0
      ? t("brief.rivalsEmpty")
      : describe(portfolio?.rivals, [
        ["ahead", ["AHEAD"]],
        ["level", ["LEVEL"]],
        ["behind", ["BEHIND"]],
        ["goneQuiet", ["GONE_QUIET"]],
        ["tooNew", ["TOO_NEW"]],
        ["notCompared", ["NOT_CHECKED"]],
      ]),
    suggested > 0 ? t("brief.parts.suggested", { count: suggested }) : null,
  ].filter(Boolean).join(" · ");

  const cards = [
    {
      key: "searches",
      href: `${base}/tracking?list=searches`,
      label: t("brief.searches"),
      value: header.counts.searches,
      cost: header.monthly.searches,
      line: searchLine,
    },
    {
      key: "questions",
      href: `${base}/tracking?list=questions`,
      label: t("brief.questions"),
      value: header.counts.questions,
      cost: header.monthly.questions,
      line: questionLine,
    },
    {
      key: "rivals",
      href: `${base}/tracking?list=competitors`,
      label: t("brief.rivals"),
      value: header.counts.rivals,
      cost: header.monthly.rivals,
      line: rivalLine,
    },
    {
      key: "brands",
      href: `/admin/websites/${header.websiteId}`,
      label: t("brief.brands"),
      value: header.counts.brandNames,
      cost: undefined,
      line: header.counts.brandNames <= 1 ? t("brief.brandsFew") : t("brief.brandsLine"),
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        icon={<Compass className="h-5 w-5 text-brand" />}
        title={t("brief.title")}
        description={header.lastCollectedAt
          ? t("brief.lastCollected", { when: formatDate(header.lastCollectedAt) })
          : t("brief.neverCollected")}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Link
            key={card.key}
            href={card.href}
            className="flex flex-col gap-2 rounded-[13px] border border-border-dim bg-card/40 p-4 transition-colors hover:border-brand/40"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.13em] text-muted">{card.label}</h2>
              {card.cost !== undefined ? (
                <span className="font-mono text-[11px] text-muted">
                  {card.cost === null ? t("priceUnknownShort") : t("perMonthShort", { cost: formatMonthly(card.cost, unknown) })}
                </span>
              ) : (
                <span className="text-[11px] text-warning">{t("brief.shared")}</span>
              )}
            </div>
            <span className="font-mono text-[22px] text-foreground">{card.value}</span>
            <span className="text-[12px] leading-relaxed text-secondary">{card.line}</span>
          </Link>
        ))}
      </div>

      <p className="text-[12px] text-muted">{t("brief.costNote")}</p>
    </div>
  );
}
