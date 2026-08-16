import { redirect } from "next/navigation";

/** The old Global Knowledge Base address. The screen it held was folded
 * into the platform wiki (global-wiki-plan.md, phase 3). */
export default function GlobalKnowledgeBasePage() {
  redirect("/admin/ai/knowledge");
}
