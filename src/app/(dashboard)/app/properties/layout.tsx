"use client";

import { CapabilityGate } from "../_components/CapabilityGate";
import { PROPERTIES_MODULE_KEY } from "@/convex/utils/coreModules";

export default function GatedSectionLayout({ children }: { children: React.ReactNode }) {
  return <CapabilityGate moduleKey={PROPERTIES_MODULE_KEY}>{children}</CapabilityGate>;
}
