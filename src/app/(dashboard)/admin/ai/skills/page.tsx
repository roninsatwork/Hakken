import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { AgentSkillsCatalog } from "../../agents/skills/page";

export default function GlobalAiSkillsPage() {
  // The nav goes *inside* the catalogue, below its title, because that is where
  // it sits on every other page in this section. Rendering it here, before the
  // component, put the tab bar above the page title on this screen alone.
  return <AgentSkillsCatalog nav={<AiWorkspaceNav />} />;
}
