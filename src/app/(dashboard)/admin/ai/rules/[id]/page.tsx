import type { Id } from "@/convex/_generated/dataModel";
import { EditRuleScreen } from "@/src/app/(dashboard)/admin/_features/rules/EditRuleScreen";

/** Editing one of the global AI's rules. */
export default async function EditRulePage({ params }: { params: Promise<{ id: Id<"aiRules"> }> }) {
  const { id } = await params;
  return <EditRuleScreen ruleId={id} />;
}
