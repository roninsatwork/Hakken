"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * The gate on a capability's whole section, shared by every gated layout.
 *
 * The same shape as the Sales Data section's gate, for the same reasons: the
 * data behind the section is protected separately — every server function
 * re-checks the switch — so this is about not showing a dead screen, not
 * about keeping anyone out. Someone who lands here with the capability
 * withheld is moved on to the dashboard rather than shown an error.
 *
 * `undefined` means the query has not answered. Redirecting on that would
 * bounce a legitimate person out of their own section on every load, so it
 * renders nothing until the answer arrives.
 *
 * The sidebar reads the same query, so what a workspace sees in its menu and
 * what it can reach by URL cannot disagree.
 */
export function CapabilityGate({
  moduleKey,
  children,
}: {
  moduleKey: string;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const workspace = useQuery(api.companies.getMyWorkspaceModules);

  const isOn = Boolean(workspace?.enabledModules?.includes(moduleKey));

  useEffect(() => {
    if (!workspace) return;
    if (!isOn) router.replace("/app");
  }, [workspace, isOn, router]);

  if (!workspace || !isOn) return null;

  return <>{children}</>;
}
