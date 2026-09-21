"use client";

import { DecisionsScreen } from "@/src/app/(dashboard)/admin/_features/decisions/DecisionsScreen";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";

/** Every Decision the platform can make, and its mode for everyone. */
export default function DecisionsPage() {
  return <DecisionsScreen nav={<AiWorkspaceNav />} />;
}
