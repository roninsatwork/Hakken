"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { CompanyQuestions } from "../../../ai-searches/_components/CompanyQuestions";

/** AI questions for one website: the company's list, narrowed to it (docs/plans/active/websites-section-menu-plan.md). */
export default function WebsiteQuestionsPage() {
  const params = useParams();
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;
  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  if (!header) return null;
  return <CompanyQuestions companyWebsiteId={companyWebsiteId} host={header.displayHost} />;
}
