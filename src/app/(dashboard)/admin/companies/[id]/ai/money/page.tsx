"use client";

import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import { MoneyViewScreen } from "@/src/app/(dashboard)/admin/_features/wiki/MoneyViewScreen";

/** This company's handled work (money view, 2026-08-17). */
export default function CompanyMoneyPage() {
  const params = useParams();
  return <MoneyViewScreen companyId={params.id as Id<"companies">} />;
}
