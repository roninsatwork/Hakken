"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompanyFanOut } from "../../../ai-searches/_components/CompanyFanOut";

/** AI searches for one website: the company's list, narrowed to it (docs/plans/active/websites-section-menu-plan.md). */
export default function WebsiteFanOutPage() {
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  if (!header) return null;
  return <CompanyFanOut companyWebsiteId={companyWebsiteId} host={header.displayHost} />;
}
