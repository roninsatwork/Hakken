"use client";

import { useParams } from "next/navigation";

import type { Id } from "@/convex/_generated/dataModel";
import { ClassificationEditor } from "../ClassificationEditor";

/** A new classification, on a page of its own — it has fields, so never a pop-up (page-groups-plan.md, decision 6). */
export default function NewClassificationPage() {
  const params = useParams();
  return (
    <ClassificationEditor
      companyId={params.id as Id<"companies">}
      companyWebsiteId={params.companyWebsiteId as Id<"companyWebsites">}
      classificationId={null}
    />
  );
}
