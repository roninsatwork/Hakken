import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";
import { AgentSkillsCatalog } from "../../agents/skills/page";

export default function GlobalAiSkillsPage() {
  return (
    <>
      <AiWorkspaceNav />
      <AgentSkillsCatalog basePath="/admin/ai/skills" />
    </>
  );
}
