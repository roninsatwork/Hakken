"use client";

import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";

import { api } from "@/convex/_generated/api";

function AuditLogDetailLoading() {
  return (
    <div className="p-12 flex justify-center mt-20">
      <Loader2 className="w-8 h-8 animate-spin text-brand" />
    </div>
  );
}

const AuditLogDetailContent = dynamic(() => import("./AuditLogDetailContent"), {
  loading: AuditLogDetailLoading,
});

export default function AuditLogDetail() {
  const params = useParams();
  const id = params.id as string;
  const logs = useQuery(api.auditLogs.getRecentLogs);

  return logs === undefined ? (
    <AuditLogDetailLoading />
  ) : (
    <AuditLogDetailContent id={id} logs={logs} />
  );
}
