"use client";

import { useTranslations } from "next-intl";

/**
 * What last changed a wiki page, in words: "Phone call", "Edited by staff", "Nightly check-up". Shared by the pages list
 * and a page's own screen (Sonae `2abec11e`; wiki-sonae-catch-up-plan-2026-11-21.md, S1). Never the raw reference itself,
 * which read as gibberish on screen ("DOCUMENT:k57…").
 */
export function useDescribeWikiSource() {
  const t = useTranslations("aiPages.sources");
  return (source: string) => {
    if (source.startsWith("PHONE_CALL:")) return t("phone");
    if (source.startsWith("EMAIL:")) return t("email");
    if (source.startsWith("HUMAN:")) return t("human");
    if (source.startsWith("CHAT:")) return t("chat");
    if (source === "TENDING") return t("tending");
    // The nightly check-up's fixes carry the rule that decided them.
    if (source.startsWith("CHECKUP:")) return t("checkup");
    if (source.startsWith("DOCUMENT:")) return t("document");
    return t("other");
  };
}

/** A source page is named by its web address; it reads better without the "https://www." in front. */
export function shortPageTitle(title: string) {
  return title.replace(/^https?:\/\/(www\.)?/, "");
}
