import type { Id } from "@/convex/_generated/dataModel";
import { MoneyViewScreen } from "@/src/app/(dashboard)/admin/_features/wiki/MoneyViewScreen";

/** This company's handled work (money view, 2026-08-17). */
export default async function CompanyMoneyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MoneyViewScreen companyId={id as Id<"companies">} />;
}
