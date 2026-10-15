"use client";

import { useParams } from "next/navigation";

import { ClassificationTypeEditor } from "../ClassificationTypeEditor";

/** One type's own page: its name, and who uses it (classification-types-plan.md, CT4). */
export default function ClassificationTypePage() {
  const params = useParams();
  return <ClassificationTypeEditor typeKey={decodeURIComponent(params.typeKey as string)} />;
}
