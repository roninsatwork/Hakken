"use client";

import { RetentionRulesSection } from "../../../_components/RetentionRulesSection";
import { SettingsScreen } from "../../../_components/SettingsScreen";

/**
 * Retention rules only. The purge ledger lives on its own screen
 * (security/purge-history) — rules are configuration, the ledger is
 * evidence, and one very long page answered neither question well.
 */
export default function RetentionRulesPage() {
  return (
    <SettingsScreen>
      <RetentionRulesSection />
    </SettingsScreen>
  );
}
