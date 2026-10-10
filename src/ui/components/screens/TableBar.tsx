"use client";

import type { ReactNode } from "react";
import { useTranslations } from "next-intl";
import type { PagedFooterSpec } from "./DataTable";

/** What a table's rows are, for its count: "807 keywords", "531 linking websites". */
export type TableNoun =
  | "keywords" | "searches" | "pages" | "websites" | "linkingWebsites" | "links" | "anchors" | "addresses"
  | "results" | "answers" | "queries" | "problems" | "sections" | "folders" | "checks" | "days" | "weeks" | "months" | "groups" | "adverts"
  | "questionsAndSearches" | "updates" | "positions" | "kinds"
  /** A credit statement's lines (docs/plans/active/usage-credits-plan.md). */
  | "lines"
  // Search Console's countries and devices tables (docs/plans/active/search-console-plan.md §5).
  | "countries" | "devices"
  // The fan-out searches grouped into angles (docs/plans/active/fan-out-angles-plan.md, FA5).
  | "angles"
  // The fan-out queries ticked to check on Google every run: Sites' Tracked fan-out queries (2026-10-03).
  | "fanOutQueries"
  // A website's own classifications of its pages: admin › Page classification's Classifications view (page-groups-plan.md).
  | "classifications"
  // Keyword research (keyword-research-plan.md): research lists (board 1), keyword ideas (board 5), and the AI assistants asked (board 4).
  | "lists" | "ideas" | "assistants"
  // Admin → Content → Library's articles (content-library-plan.md).
  | "articles"
  // Who to follow's people, a couple of hundred of them (insights-helpful-content-plan.md, IH14).
  | "people"
  // A person's Hakken tasks, and a company's (hakken-tasks-plan.md, 1.5).
  | "tasks"
  // Discovery's Local pages (discovery-local-reputation-ai-plan.md): profiles, businesses, a profile's details and review topics, what rivals did, questions.
  | "listings" | "businesses" | "offices" | "rivals" | "details" | "topics" | "rivalActions" | "questions" | "found"
  // Discovery's Reviews pages: a listing's reviews (step 2); Your assets (step 5).
  | "reviews" | "assets"
  // Web mentions (step 6): pages naming a business, and places to get listed.
  | "mentions" | "places"
  // Google Analytics (google-analytics-plan.md §5): channels, a channel's sources, landing pages, kinds of conversion.
  | "channels" | "sources" | "landingPages" | "conversionKinds"
  // Admin → Content → News (content-people-knowledge-plan.md, board 4): it pages by cursor, so "so far" until the last page is in.
  | "stories" | "storiesSoFar"
  // Admin → Content → Analytics (content-people-knowledge-plan.md, boards 8, 9, 11, 12).
  | "articlesAndStories" | "companies" | "peopleRead";

/**
 * The bar across the top of every Sites table, inside its card (`DataTable`'s
 * `cardHeader`): how many rows the list holds after its search and filters —
 * the footer's own exact total — then anything the list is compared with,
 * and its download on the right. The row above the card holds only the search
 * box and the filters, on one line (Anthony, 2026-09-26, showing Ahrefs'
 * Organic keywords; then "yes please to both" for every Sites table).
 *
 * A table inside a record's screen keeps its title here, with the count
 * beside it. The page's own header is above the card either way.
 */
export function TableBar({
  footer,
  noun,
  title,
  description,
  children,
  actions,
}: {
  /** The table's footer: its total, and whether the list is still on its way. */
  footer: Pick<PagedFooterSpec, "isLoading" | "totalCount">;
  noun: TableNoun;
  /** A table on a record's screen: what it lists. */
  title?: ReactNode;
  description?: ReactNode;
  /** Beside the count: what the list is compared with. */
  children?: ReactNode;
  /** On the right: the download. */
  actions?: ReactNode;
}) {
  const t = useTranslations("ui.tableBar");
  const count = footer.isLoading ? "…" : t(noun, { count: footer.totalCount });
  return (
    <div data-part="table-bar" className="flex flex-wrap items-center justify-between gap-3 border-b border-border-dim/50 bg-background/50 px-4 py-3">
      {title ? (
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <h3 data-part-title className="text-[14px] font-medium tracking-wide text-foreground">{title}</h3>
            {/* Read out when a filter changes it. */}
            <span aria-live="polite" className="text-[12px] text-secondary">{count}</span>
          </div>
          {description ? <p className="mt-0.5 text-[12px] text-secondary">{description}</p> : null}
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-3">
          <span aria-live="polite" className="text-[13px] font-medium text-foreground">{count}</span>
          {children}
        </div>
      )}
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}
