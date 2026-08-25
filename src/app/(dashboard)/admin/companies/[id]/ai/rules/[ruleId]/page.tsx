import type { Id } from "@/convex/_generated/dataModel";
import { EditRuleScreen } from "@/src/app/(dashboard)/admin/_features/rules/EditRuleScreen";

/** Editing one of this company's rules. */
export default async function EditCompanyRulePage({ params }: { params: Promise<{ id: Id<"companies">; ruleId: Id<"aiRules"> }> }) {
  const { id, ruleId } = await params;
  return <EditRuleScreen ruleId={ruleId} companyId={id} />;
}
