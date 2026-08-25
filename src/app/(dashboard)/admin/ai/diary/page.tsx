import { WikiDiaryScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiDiaryScreen";

/** The global brain's diary — what the Platform Wiki learned, newest
 * first (watch-it-think plan, phase 4). */
export default function GlobalDiaryPage() {
  return <WikiDiaryScreen pageBasePath="/admin/ai/knowledge" showWorkspaceNav />;
}
