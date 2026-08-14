"use client";

import { WikiPagesListScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiPagesListScreen";

/** The workspace's own wiki (wiki plan, phase 3). */
export default function WikiPagesPage() {
  return <WikiPagesListScreen basePath="/admin/ai/pages" showWorkspaceNav />;
}
