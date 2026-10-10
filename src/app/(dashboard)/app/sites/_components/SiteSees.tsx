"use client";

import { useTranslations } from "next-intl";
import { HakkenSees, type HakkenSeesStep } from "@/src/ui/components/screens/HakkenSees";
import { useEngineLabel } from "@/src/ui/components/seo/engineLabel";
import type { Seen, SeenPhrase, SeenTarget } from "@/convex/utils/hakkenSees";
import { formatNumber } from "./siteFormat";
import { siteRecordOf, useSiteListHref, useSiteRecordHref } from "./siteRecordLinks";
import { useSiteId } from "./useSite";

/**
 * Where a box's step leads, as an address with the way back: a record or a
 * page of this site, or a page by its own address — one of Hakken's ("/app/…")
 * opened in place, one elsewhere in a new tab. Also for a screen whose rows
 * open the same places as its box (Your assets).
 */
export function useSeenHref() {
  const siteId = useSiteId();
  const recordHref = useSiteRecordHref(siteId);
  const listHref = useSiteListHref(siteId);
  return (to: SeenTarget): { href: string; external?: boolean } => {
    if (to.url) return to.url.startsWith("/") ? { href: to.url } : { href: to.url, external: true };
    if (to.record && to.key !== undefined) {
      const record = siteRecordOf(to.record, to.key);
      if (record) return { href: recordHref(record) };
    }
    return { href: listHref(to.segment ?? "", to.filters ?? {}) };
  };
}

/**
 * A Discovery screen's What Hakken sees box (discovery-detail-and-hakken-sees-
 * plan.md §6): the codes its query worked out, in this screen's words
 * (`sites.seen.<screen>`), each step's link (`sites.seen.links`) leading to a
 * record or a page of this site with the way back to here. Nothing while the
 * query is loading, so the page's title never jumps.
 */
export function SiteSees({ screen, seen }: { screen: string; seen: Seen | null | undefined }) {
  const t = useTranslations("sites.seen");
  const hrefOf = useSeenHref();
  const engineLabel = useEngineLabel();
  if (!seen || seen.says.length === 0) return null;

  // A sentence's code and numbers as words: `a`, `b` and `c` formatted — a
  // rating keeps its one decimal, as Local shows it — `count` for a plural,
  // names as written, an engine by its name.
  const coded = t as unknown as (key: string, values: Record<string, string | number>) => string;
  const number = (value = 0) => (Number.isInteger(value) ? formatNumber(value) : value.toFixed(1));
  const words = (phrase: SeenPhrase) => coded(`${screen}.${phrase.code}`, {
    a: number(phrase.a),
    b: number(phrase.b),
    c: number(phrase.c),
    count: phrase.a ?? 0,
    text: phrase.text ?? "",
    more: phrase.more ?? "",
    engine: phrase.engine ? engineLabel(phrase.engine) : "",
  });
  const steps: HakkenSeesStep[] = seen.steps.map((step) => ({ words: words(step), link: coded(`links.${step.link}`, {}), ...hrefOf(step.to) }));

  return <HakkenSees says={seen.says.map(words)} steps={steps} />;
}
