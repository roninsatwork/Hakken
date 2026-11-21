"use client";

import { CapabilityGate } from "../_components/CapabilityGate";
import { MENU_FEATURES } from "@/convex/utils/coreModules";

/**
 * Search Console closes when it is switched off for this company, for everyone or for
 * the company alone (docs/plans/active/features-switches-plan-2026-11-21.md):
 * its pages send people to the Dashboard, as Tasks and Calls do.
 */
export default function GatedSectionLayout({ children }: { children: React.ReactNode }) {
  return <CapabilityGate moduleKey={MENU_FEATURES.searchConsole}>{children}</CapabilityGate>;
}
