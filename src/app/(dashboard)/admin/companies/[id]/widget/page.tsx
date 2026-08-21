"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { WidgetConfigScreen } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetConfigScreen";

/** This company's own embeddable widget. */
export default function CompanyWidgetPage() {
  const params = useParams();
  return <WidgetConfigScreen companyId={params.id as Id<"companies">} />;
}
