"use client";

import type { Id } from "@/convex/_generated/dataModel";
import { EvalCaseFormScreen } from "@/src/app/(dashboard)/admin/_features/evals/EditEvalScreen";

/** Writing an eval, at both heights. Without a company it is the global
 * AI's own — no skills to require, because skills belong to companies.
 * The form itself is EvalCaseFormScreen, shared with editing: the same
 * five questions asked either way. */
export function NewEvalScreen({ companyId }: { companyId?: Id<"companies"> }) {
  return <EvalCaseFormScreen companyId={companyId} />;
}
