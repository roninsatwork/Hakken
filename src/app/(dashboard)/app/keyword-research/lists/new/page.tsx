"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import Header from "@/src/ui/components/layout/Header";
import { ListForm } from "../../_components/ListForm";
import { KEYWORD_RESEARCH_HREF, listHref, lookupHref } from "../../_components/useLookup";

/**
 * New list (keyword-research-plan.md, board 7): a research list's name and
 * the website it is measured against. Opened from Research lists' New list,
 * or from "A new list…" — a lookup's, with its keyword, or Keyword ideas' and
 * Start from a competitor's, with the keywords ticked — which then go into
 * the list as it is made. Save opens the new list.
 */
export default function NewResearchListPage() {
  const t = useTranslations("keywordResearch.listForm");
  const router = useRouter();
  const params = useSearchParams();
  const setup = useQuery(api.keywordResearch.researchSetup, {});
  const add = useMutation(api.keywordResearch.addToResearchList);
  const { run, isBusy, error } = useAdminAction({ scope: "keyword-research-new-list" });

  // One keyword from a lookup's "A new list…", or the ticked ones from Keyword ideas or Start from a competitor.
  const keywords = params.getAll("keyword").map((entry) => entry.trim()).filter(Boolean);
  const country = Number(params.get("country"));
  const lookup = params.get("lookup");
  const asked = params.get("site");
  const back = backOf(params, (key) => t(key));

  if (setup === undefined) {
    return (
      <>
        <Header />
        <div className="h-24 animate-pulse rounded-2xl bg-sidebar/30" aria-busy="true" />
      </>
    );
  }

  const websites = setup?.websites ?? [];
  // The lookup's own website, or the company's first; "No website" when asked for none.
  const initialSiteId = asked !== null ? (websites.some((website) => website.siteId === asked) ? asked : "") : websites[0]?.siteId ?? "";
  const items = Number.isFinite(country) && country > 0 ? keywords.map((keyword) => ({ keyword, locationCode: country })) : [];

  return (
    <ListForm
      back={lookup && !back ? { label: keywords[0] || t("backToLookup"), href: lookupHref(lookup) } : back ?? { label: t("back"), href: KEYWORD_RESEARCH_HREF }}
      title={t("newTitle")}
      description={
        items.length === 1 ? t("newWithKeyword", { keyword: items[0].keyword })
          : items.length > 1 ? t("newWithKeywords", { count: items.length })
            : t("newDescription")
      }
      websites={websites}
      initialSiteId={initialSiteId}
      canChange={setup?.canLookUp === true}
      isSaving={isBusy()}
      error={error}
      onSave={async (name, siteId) => {
        const outcome = await run(
          () => add({ newList: { name, ...(siteId ? { siteId: siteId as Id<"companyWebsites"> } : {}) }, items }),
          { fallbackMessage: t("failed"), suppressErrorToast: true },
        );
        if (outcome.ok) router.push(listHref(outcome.data.listId));
      }}
    />
  );
}

/**
 * The way back to the page "A new list…" was chosen on: only one of Keyword
 * research's own (`back`), named for what it is; null for a lookup's header
 * or Research lists, which the page knows how to name.
 */
function backOf(params: URLSearchParams, t: (key: "backToIdeas" | "backToCompetitor" | "back") => string) {
  const back = params.get("back");
  if (!back || !back.startsWith("/app/keyword-research/")) return null;
  const label = back.includes("/competitor/") ? t("backToCompetitor") : back.includes("/ideas") ? t("backToIdeas") : t("back");
  return { label, href: back };
}
