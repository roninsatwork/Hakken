"use client";

import { lazy, Suspense } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";

const CompanyOverviewContent = lazy(() => import("./CompanyOverviewContent"));

function CompanyOverviewLoading() {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[400px]">
      <Loader2 className="w-6 h-6 animate-spin text-brand" />
    </div>
  );
}

export default function CompanyOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const planStatus = useQuery(api.plans.getCompanyPlanStatus, { companyId });
  const user = useQuery(api.users.getMe);
  const activePlans = (useQuery(api.plans.getActivePlans) || []) as Doc<"plans">[];

  if (!company) {
    return <CompanyOverviewLoading />;
  }

  return (
    <Suspense fallback={<CompanyOverviewLoading />}>
      <CompanyOverviewContent
        companyId={companyId}
        company={company}
        planStatus={planStatus}
        user={user}
        activePlans={activePlans}
      />
    </Suspense>
  );
}
