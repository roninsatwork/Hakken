"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { workspaceSlug } from "@/src/lib/workspaceSlug";

/**
 * Forwards a link written against the old `/app/sales-data` paths to wherever
 * this workspace's section now lives, keeping the query string so `?tab=` still
 * opens the tab it names.
 *
 * A workspace without the module goes to the dashboard rather than to a section
 * it cannot see.
 */
export function LegacySalesDataRedirect({ to }: { to: "spreadsheet-import" | "import-data" }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const overview = useQuery(api.salesData.getSectionOverview);

  useEffect(() => {
    if (!overview) return;

    if (!overview.enabled || !overview.companyName) {
      router.replace("/app");
      return;
    }

    const query = searchParams.toString();
    const slug = workspaceSlug(overview.companyName);
    router.replace(`/app/${slug}/${to}${query ? `?${query}` : ""}`);
  }, [overview, router, searchParams, to]);

  return null;
}
