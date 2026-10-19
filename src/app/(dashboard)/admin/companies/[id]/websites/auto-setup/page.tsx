"use client";

import { useParams } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { AutoSetupScreen } from "./AutoSetupScreen";

/**
 * Auto Setup's own page, under Setup in the Websites section's menu
 * (docs/plans/active/auto-setup-plan.md; Anthony, 2026-10-19: the button on
 * All websites was "a bit hidden", so "add this to the left hand nav"). One
 * press covers the whole company.
 */
export default function AutoSetupPage() {
  const params = useParams();
  return <AutoSetupScreen companyId={params.id as Id<"companies">} />;
}
