"use client";

import { useQuery } from "convex/react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { TrackedCompetitors } from "./TrackedCompetitors";

/**
 * The competitors this company compares one of its own sites with.
 *
 * Only an owned site has competitors; a tracked one is somebody else's and is
 * itself one of them, so it says where it is compared instead.
 */
export default function CompanySiteCompetitorsPage() {
  const t = useTranslations("admin.siteView");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const companyWebsiteId = params.companyWebsiteId as Id<"companyWebsites">;

  const header = useQuery(api.websiteClientView.getSiteHeader, { companyWebsiteId });
  if (!header) return null;

  if (header.relationship !== "OWNED") {
    return <p className="text-[13px] text-secondary">{t("competitorsOwnedOnly")}</p>;
  }

  return <TrackedCompetitors companyId={companyId} companyWebsiteId={companyWebsiteId} host={header.displayHost} />;
}
