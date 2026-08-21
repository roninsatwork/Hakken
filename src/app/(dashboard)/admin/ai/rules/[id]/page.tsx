"use client";

import { use } from "react";
import type { Id } from "@/convex/_generated/dataModel";
import { EditRuleScreen } from "@/src/app/(dashboard)/admin/_features/rules/EditRuleScreen";

/** Editing one of the global AI's rules. */
export default function EditRulePage({ params }: { params: Promise<{ id: Id<"aiRules"> }> }) {
  const unwrappedParams = use(params);
  return <EditRuleScreen ruleId={unwrappedParams.id} />;
}
