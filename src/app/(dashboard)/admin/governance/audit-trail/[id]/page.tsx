"use client";

import { lazy, Suspense, use } from "react";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

function AuditEntryLoading() {
  return (
    <div className="flex items-center justify-center rounded-[16px] border border-border-dim bg-sidebar/40 p-10">
      <Loader2 className="h-5 w-5 animate-spin text-brand" aria-hidden="true" />
    </div>
  );
}

const AuditEntryContent = lazy(() => import("./AuditEntryContent"));

export default function AuditEntryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const entry = useQuery(api.auditLogs.getAuditEntry, { id: id as Id<"auditLogs"> });

  if (entry === undefined) return <AuditEntryLoading />;

  return (
    <Suspense fallback={<AuditEntryLoading />}>
      <AuditEntryContent entry={entry} />
    </Suspense>
  );
}
