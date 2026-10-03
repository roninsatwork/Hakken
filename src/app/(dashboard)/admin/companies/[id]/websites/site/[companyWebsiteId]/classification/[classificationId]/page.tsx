"use client";

import { useParams } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { ClassificationEditor } from "../ClassificationEditor";

/** One classification's own page: its name, type, lines and pages (page-groups-plan.md, decision 6). */
export default function ClassificationPage() {
  const params = useParams();
  return (
    <ClassificationEditor
      companyId={params.id as Id<"companies">}
      companyWebsiteId={params.companyWebsiteId as Id<"companyWebsites">}
      classificationId={params.classificationId as Id<"pageClassifications">}
    />
  );
}
