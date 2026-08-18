"use client";

import { CapabilityGate } from "../_components/CapabilityGate";
import { REPORTS_MODULE_KEY } from "@/convex/utils/coreModules";

export default function GatedSectionLayout({ children }: { children: React.ReactNode }) {
  return <CapabilityGate moduleKey={REPORTS_MODULE_KEY}>{children}</CapabilityGate>;
}
