"use client";

import { lazy, Suspense, use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Loader2 } from "lucide-react";
import { AiRuleSafetyWarningPanel } from "@/src/app/(dashboard)/admin/_components/AiRuleSafetyWarning";

const AgentRuleEditContent = lazy(() => import("./AgentRuleEditContent"));

function LoadingState() {
  return (
    <div className="flex-1 w-full h-full flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-muted" />
    </div>
  );
}

export default function EditAgentRulePage({ params }: { params: Promise<{ id: Id<"agents">, ruleId: Id<"aiRules"> }> }) {
  const { id: agentId, ruleId } = use(params);
  const rule = useQuery(api.aiRules.getRuleById, { id: ruleId });

  if (rule === undefined) {
    return <LoadingState />;
  }

  if (!rule) {
    return null;
  }

  const renderSafetyWarning = (trigger: string, instruction: string) => (
    <AiRuleSafetyWarningPanel trigger={trigger} instruction={instruction} />
  );

  return (
    <Suspense fallback={<LoadingState />}>
      <AgentRuleEditContent
        agentId={agentId}
        ruleId={ruleId}
        rule={rule}
        renderSafetyWarning={renderSafetyWarning}
      />
    </Suspense>
  );
}
