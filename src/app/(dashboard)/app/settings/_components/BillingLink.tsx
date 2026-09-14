"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";

export function BillingLink() {
  const t = useTranslations("billing");
  const status = useQuery(api.billing.getStatus, {});
  if (!status) return null;
  return <Link href="/app/settings/billing" className="self-start text-sm text-secondary underline underline-offset-4 hover:text-foreground">{t("title")}</Link>;
}
