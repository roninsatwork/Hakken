import { redirect } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";

export default async function NewCompanySkillPage({ params }: { params: Promise<{ id: Id<"companies"> }> }) {
  const { id } = await params;
  redirect(`/admin/companies/${id}/ai/skills`);
}
