"use client";

import { ApprovalExpirySection } from "../../../_components/ApprovalExpirySection";
import { SettingsScreen } from "../../../_components/SettingsScreen";

/**
 * How long a paused agent run waits for a person. It sat under log retention,
 * grouped there as "how long the platform waits before acting" — which put a
 * setting about agent behaviour on a screen about deleting records.
 */
export default function AgentApprovalWindowPage() {
  return (
    <SettingsScreen>
      <ApprovalExpirySection />
    </SettingsScreen>
  );
}
