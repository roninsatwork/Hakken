import { WikiMapScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiMapScreen";

/** The platform wiki's map (global-wiki-plan.md, phase 3). */
export default function PlatformWikiMapPage() {
  return <WikiMapScreen basePath="/admin/ai/knowledge" showWorkspaceNav />;
}
