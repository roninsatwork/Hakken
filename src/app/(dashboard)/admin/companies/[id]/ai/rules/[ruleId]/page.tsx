"use client";

import { use } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { EditRuleScreen } from "@/src/app/(dashboard)/admin/_features/rules/EditRuleScreen";

/** Editing one of this company's rules. */
export default function EditCompanyRulePage({ params }: { params: Promise<{ id: Id<"companies">; ruleId: Id<"aiRules"> }> }) {
  const unwrappedParams = use(params);
  return <EditRuleScreen ruleId={unwrappedParams.ruleId} companyId={unwrappedParams.id} />;
}
