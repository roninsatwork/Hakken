"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WikiAddScreen } from "@/src/app/(dashboard)/admin/_features/wiki/WikiAddScreen";

/** Add to this company's wiki alone: a website, a file, some text or a vault (S6). */
export default function CompanyWikiAddPage() {
  return <WikiAddScreen companyId={useParams().id as Id<"companies">} />;
}
