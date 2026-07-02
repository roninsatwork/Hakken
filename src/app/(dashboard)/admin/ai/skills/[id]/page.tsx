import { AiWorkspaceNav } from "../../_components/AiWorkspaceNav";
import { AgentSkillDetail } from "../../../agents/skills/[id]/page";

export default function GlobalAiSkillDetailPage() {
  return (
    <>
      <AiWorkspaceNav />
      <AgentSkillDetail basePath="/admin/ai/skills" />
    </>
  );
}
