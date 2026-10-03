"use client";

import type { ReactNode } from "react";
import { useParams } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { WebsitesMenu } from "./_components/WebsitesMenu";

/**
 * The company's Websites section: its menu down the left, the page on the
 * right (docs/plans/active/websites-section-menu-plan.md). Every page of the
 * section — the company's and each website's — sits in it, so the menu and
 * its website chooser are always where they were.
 */
export default function CompanyWebsitesLayout({ children }: { children: ReactNode }) {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  return (
    <div className="grid w-full grid-cols-1 gap-8 lg:grid-cols-[240px_minmax(0,1fr)]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <WebsitesMenu companyId={companyId} />
      </aside>
      <section className="flex min-w-0 flex-col">{children}</section>
    </div>
  );
}
