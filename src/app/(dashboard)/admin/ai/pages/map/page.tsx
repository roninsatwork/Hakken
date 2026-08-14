"use client";

import { WikiMapScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiMapScreen";

/** The workspace's own map (wiki plan, phase 6). */
export default function WikiMapPage() {
  return <WikiMapScreen basePath="/admin/ai/pages" showWorkspaceNav />;
}
