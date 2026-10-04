"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { TextSearch } from "lucide-react";
import { useTranslations } from "next-intl";
import HakkenEmptyState from "@/src/ui/components/feedback/HakkenEmptyState";
import Header from "@/src/ui/components/layout/Header";
import { BackRow } from "@/src/ui/components/screens/PageHeader";
import { SectionMenu } from "../../_components/SectionMenu";
import { formatNumber } from "../../sites/_components/siteFormat";
import { LookUpAnother, LookupHeader } from "../_components/LookupHeader";
import { useSiteParam } from "../../sites/_components/useSiteParam";
import { IDEA_KEYS, IDEA_KINDS, type IdeaKey } from "../_components/researchWords";
import { KEYWORD_RESEARCH_HREF, ideasHref, lookupHref, useLookupAnswers, useLookupIdeas, useLookupOverview } from "../_components/useLookup";

/**
 * One lookup (boards 2 to 5 of the approved drawings, docs/plans/active/
 * keyword-research-plan.md): the header every one of its screens wears, the
 * menu of its screens down the left — "This keyword": Overview, Google's
 * results and What the AI says; "Ideas": the three kinds of idea, each with
 * its number once it is held — and the screen itself on the right, as a
 * website's screens sit in Websites. A lookup that is not the company's
 * reads as one not found.
 */
export default function LookupLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("keywordResearch.lookup");
  const pathname = usePathname();
  const lookup = useLookupOverview();
  // The menu's numbers: how many ideas of each kind, and how many assistants name the website. Reading them buys nothing.
  const ideas = useLookupIdeas("TERMS");
  const answers = useLookupAnswers();
  const [kindKey] = useSiteParam<IdeaKey>("kind", "terms", IDEA_KEYS);

  if (lookup === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }

  if (lookup === null) {
    return (
      <>
        <Header />
        <div className="flex flex-col gap-6 pb-8">
          <BackRow label={t("back")} href={KEYWORD_RESEARCH_HREF} />
          <HakkenEmptyState icon={TextSearch} title={t("notFoundTitle")} description={t("notFoundBody")} />
        </div>
      </>
    );
  }

  const current = pathname.endsWith("/results") ? "results"
    : pathname.endsWith("/ai") ? "ai"
      : pathname.endsWith("/ideas") ? `ideas-${kindKey}`
        : "overview";
  const counts = ideas?.counts ?? null;
  const figures = answers?.figures ?? null;

  return (
    <>
      <Header />
      <div className="flex flex-col gap-6 pb-8">
        <LookupHeader lookup={lookup} />
        <div className="grid grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:self-start">
            <div className="flex flex-col gap-3">
              {lookup.canLookUp ? <LookUpAnother lookup={lookup} /> : null}
              <SectionMenu
                label={t("menu")}
                currentId={current}
                openAtFirst={["keyword", "ideas"]}
                groups={[
                  {
                    id: "keyword",
                    label: t("menu"),
                    items: [
                      { id: "overview", label: t("overview"), href: lookupHref(lookup.lookupId) },
                      {
                        id: "results",
                        label: t("results"),
                        href: lookupHref(lookup.lookupId, "results"),
                        count: lookup.resultsCount ? formatNumber(lookup.resultsCount) : null,
                      },
                      {
                        id: "ai",
                        label: t("ai"),
                        href: lookupHref(lookup.lookupId, "ai"),
                        // How many of the assistants that answered name the website: "1/4".
                        count: figures && figures.answered > 0 ? `${figures.nameYou}/${figures.answered}` : null,
                      },
                    ],
                  },
                  {
                    id: "ideas",
                    label: t("ideas"),
                    items: IDEA_KINDS.map(({ kind, key }) => ({
                      id: `ideas-${key}`,
                      label: t(`ideaKinds.${key}`),
                      href: ideasHref(lookup.lookupId, key),
                      count: counts?.[kind] !== null && counts?.[kind] !== undefined ? formatNumber(counts[kind]) : null,
                    })),
                  },
                ]}
              />
            </div>
          </aside>
          <section className="flex min-w-0 flex-col gap-3">{children}</section>
        </div>
      </div>
    </>
  );
}
