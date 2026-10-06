"use client";

import Link from "next/link";
import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Lookup } from "@/convex/utils/assistantLookups";

/**
 * What the Assistant looked up for an answer, as a quiet line under it
 * (docs/plans/active/assistant-foundation-plan.md, item 7, as drawn and
 * approved 2026-10-06): plain grey words, each look-up a link to the screen
 * its figures came from, so anyone can check them. No box: words, not a chip.
 */
export function LookedUpLine({ lookups }: { lookups: Lookup[] | undefined }) {
  const t = useTranslations("ai.assistant.lookedUp");
  if (!lookups || lookups.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
      <Search aria-hidden className="h-3 w-3 flex-shrink-0" />
      <span>{t("label")}</span>
      {lookups.map((lookup, index) => (
        <span key={`${lookup.kind}-${lookup.link}-${index}`} className="inline-flex items-center gap-1.5">
          {index > 0 && <span aria-hidden>·</span>}
          <Link href={lookup.link} className="text-secondary hover:text-foreground transition-colors">
            {lookupLabel(t, lookup, lookups[index - 1])}
          </Link>
        </span>
      ))}
    </div>
  );
}

type Translate = ReturnType<typeof useTranslations<"ai.assistant.lookedUp">>;

/**
 * One look-up in words. A second Search Console read of the same website and
 * pages says only its days ("last 30 days"), as the line was drawn.
 */
export function lookupLabel(t: Translate, lookup: Lookup, previous?: Lookup): string {
  const website = lookup.website ?? "";
  switch (lookup.kind) {
    case "websites":
      return t("websites");
    case "overview":
      return t("overview", { website });
    case "aiMentions":
      return t("aiMentions", { website });
    case "tasks":
      return t("tasks");
    case "searchConsole": {
      const days = lookup.days ?? 0;
      if (previous?.kind === "searchConsole" && previous.website === lookup.website && previous.page === lookup.page) {
        return t("searchConsoleDays", { days });
      }
      return lookup.page
        ? t("searchConsolePages", { website, page: lookup.page, days })
        : t("searchConsole", { website, days });
    }
  }
}
