"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

/**
 * The gate on the whole section.
 *
 * A workspace without the module has no business on these routes even by
 * typing the URL, and someone who lands here through a stale link should be
 * moved on rather than shown an error. The data behind it is protected
 * separately — every query re-checks the flag — so this is about not showing
 * a dead screen, not about keeping anyone out.
 *
 * `undefined` means the query has not answered yet. Redirecting on that would
 * bounce a legitimate user out of their own section on every page load, so it
 * renders nothing until the answer arrives.
 */
export default function SalesDataLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const overview = useQuery(api.salesData.getSectionOverview);

  useEffect(() => {
    if (overview && !overview.enabled) router.replace("/app");
  }, [overview, router]);

  if (!overview || !overview.enabled) return null;

  return <>{children}</>;
}
