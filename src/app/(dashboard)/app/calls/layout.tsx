"use client";

import { CapabilityGate } from "../_components/CapabilityGate";
import { CORE_MODULES } from "@/convex/utils/coreModules";

export default function GatedSectionLayout({ children }: { children: React.ReactNode }) {
  return <CapabilityGate moduleKey={CORE_MODULES.calls}>{children}</CapabilityGate>;
}
