"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { matchesWorkspace } from "@/src/lib/workspaceSlug";

/**
 * The gate on the whole section.
 *
 * Two things have to be true to be here: the workspace has the module switched
 * on, and the name in the URL is this workspace's own. A workspace without the
 * module has no business on these routes even by typing the URL, and someone
 * who lands here through a stale link should be moved on rather than shown an
 * error. The data behind it is protected separately — every query re-checks the
 * flag and resolves the company from the signed-in user — so this is about not
 * showing a dead screen, not about keeping anyone out.
 *
 * The segment is matched, never trusted: it names the workspace but it does not
 * select it. Typing another company's name gets you your own section or
 * nothing, never theirs.
 *
 * `undefined` means the query has not answered yet. Redirecting on that would
 * bounce a legitimate user out of their own section on every page load, so it
 * renders nothing until the answer arrives.
 */
export default function WorkspaceSectionLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams<{ workspace: string }>();
  const overview = useQuery(api.salesData.getSectionOverview);

  const segment = params?.workspace ?? "";
  const isThisWorkspace = Boolean(
    overview?.companyName && matchesWorkspace(segment, overview.companyName)
  );

  useEffect(() => {
    if (!overview) return;
    if (!overview.enabled || !isThisWorkspace) router.replace("/app");
  }, [overview, isThisWorkspace, router]);

  if (!overview || !overview.enabled || !isThisWorkspace) return null;

  return <>{children}</>;
}
