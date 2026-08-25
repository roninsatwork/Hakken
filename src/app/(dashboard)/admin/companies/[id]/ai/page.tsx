"use client";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { lazy, Suspense } from "react";
import type { CompanyAiReadiness } from "./CompanyAiOverviewContent";
import CompanyAiOverviewLoading from "./CompanyAiOverviewLoading";

const CompanyAiOverviewContent = lazy(() => import("./CompanyAiOverviewContent"));

export default function CompanyAiOverviewPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const readiness = useQuery(api.companyReadiness.getCompanyAiReadiness, { companyId });

  return (
    <div className="flex w-full flex-col gap-6 pb-10">
      {readiness === undefined ? (
        <CompanyAiOverviewLoading />
      ) : (
        <Suspense fallback={<CompanyAiOverviewLoading />}>
          <CompanyAiOverviewContent companyId={companyId} readiness={readiness as CompanyAiReadiness} />
        </Suspense>
      )}
    </div>
  );
}
