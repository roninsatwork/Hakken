"use client";

import { WikiPagesScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPagesScreen";
import { AI_PATHS } from "@/src/app/(dashboard)/admin/ai/_components/aiMenu";

/** The platform's own wiki (global-wiki-plan.md, phase 3): knowledge every
 * company can draw on, and nothing else. Company wikis are never shown
 * here; each lives with its company (Anthony's ruling, 2026-08-16). Adding,
 * what's waiting, Ask and the check-up each have a page of their own in the
 * AI menu (wiki-sonae-catch-up-plan-2026-11-21.md, S6). */
export default function PlatformWikiPage() {
  return <WikiPagesScreen basePath={AI_PATHS.wiki} />;
}
