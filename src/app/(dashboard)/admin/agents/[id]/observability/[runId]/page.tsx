"use client";

import { lazy, Suspense, type ButtonHTMLAttributes } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { useParams } from "next/navigation";

import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";

const AgentJobDetailContent = lazy(() =>
  import("./AgentJobDetailContent").then((module) => ({
    default: module.AgentJobDetailContent,
  })),
);

export function AgentJobDetailLoading() {
  return (
    <div className="w-full py-24 flex items-center justify-center text-muted">
      <Loader2 className="w-6 h-6 animate-spin" />
    </div>
  );
}

export function RawButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return <button {...props} />;
}

export default function AgentJobDetailPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const runId = params.runId as Id<"agentRuns">;
  const detail = useQuery(api.agentRuns.getRunDetail, { runId });
  const logs = useQuery(api.agentLogs.getForRun, { runId }) as Doc<"agentLogs">[] | undefined;

  if (detail === undefined) {
    return <AgentJobDetailLoading />;
  }

  return (
    <Suspense fallback={<AgentJobDetailLoading />}>
      <AgentJobDetailContent
        agentId={agentId}
        runId={runId}
        detail={detail}
        logs={logs}
        RawButton={RawButton}
      />
    </Suspense>
  );
}
