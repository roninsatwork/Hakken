"use client";

import { lazy, Suspense, use } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const AdminCallDetailContent = lazy(() => import("./AdminCallDetailContent"));

/**
 * One call, in full, from the admin's seat (seven-gaps plan, phase 1).
 * Mirrors the tenant call page: this is the only admin surface where the
 * caller's whole number appears — the list carries the masked form.
 */
export default function AdminCallDetailPage({
  params,
}: {
  params: Promise<{ id: string; callId: string }>;
}) {
  const { id, callId } = use(params);
  const companyId = id as Id<"companies">;
  const call = useQuery(api.telephony.getCallForCompany, { companyId, callId });

  if (call === undefined) return <div />;

  return (
    <Suspense fallback={<div />}>
      <AdminCallDetailContent call={call} />
    </Suspense>
  );
}
