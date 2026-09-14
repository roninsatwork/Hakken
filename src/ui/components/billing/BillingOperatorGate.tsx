"use client";

import type { ReactNode } from "react";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";

/** No private query mounts until the platform role is known. The backend enforces it again. */
export function BillingOperatorGate({ children }: { children: ReactNode }) {
  const user = useQuery(api.users.getMe);
  const t = useTranslations("billingAdmin");
  if (user === undefined) return <p role="status">{t("loading")}</p>;
  if (user?.role !== "SUPER_ADMIN" || user.impersonatingCompanyId) return <p>{t("restricted")}</p>;
  return children;
}
