"use client";

import { use } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiCheckupScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiCheckupScreen";
import { PLATFORM_WIKI_PARAM } from "../platformWiki";

/**
 * One wiki's Check-up, opened from a row of Health, Wiki check-ups
 * (wiki-sonae-catch-up-plan-2026-11-21.md, S8): the table stays lean, and
 * what the last check-up did and "Check this wiki now" are a click through.
 * A record opened from a list, so it wears the header with its way back,
 * titled with the wiki's name from the same list.
 */
export default function HealthWikiCheckupPage({ params }: { params: Promise<{ wiki: string }> }) {
  const { wiki } = use(params);
  const t = useTranslations("admin.health.wikiCheckups");
  const companyId = wiki === PLATFORM_WIKI_PARAM ? undefined : (wiki as Id<"companies">);
  const wikis = useQuery(api.wikiCheckup.listCheckupHealth, companyId ? {} : "skip");
  const name = companyId ? wikis?.find((row) => row.companyId === companyId)?.name : t("platformWiki");

  return (
    <WikiCheckupScreen
      companyId={companyId}
      title={name}
      back={{ label: t("back"), href: "/admin/health/wikis" }}
    />
  );
}
