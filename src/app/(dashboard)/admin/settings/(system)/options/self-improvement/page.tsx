import { SelfImprovementSection } from "../../../_components/SelfImprovementSection";
import { SettingsScreen } from "../../../_components/SettingsScreen";

/**
 * Saves through its own mutation rather than the shared settings form: these
 * switches are `systemConfig`, not `systemSettings`, and changing learning
 * behaviour should never ride along with a branding save.
 */
export default function SelfImprovementPage() {
  return (
    <SettingsScreen>
      <SelfImprovementSection />
    </SettingsScreen>
  );
}
