"use client";

import { WikiPagesListScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPagesListScreen";

/** The platform's own wiki (global-wiki-plan.md, phase 3): knowledge every
 * company can draw on, and nothing else. Company wikis are never shown
 * here — each lives with its company (Anthony's ruling, 2026-08-16). */
export default function PlatformWikiPage() {
  return <WikiPagesListScreen basePath="/admin/ai/knowledge" showWorkspaceNav />;
}
