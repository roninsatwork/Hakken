"use client";

import { useSearchParams } from "next/navigation";
import { Library } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { LearnShell, isTopicKey } from "../_learn/LearnShell";
import { HelpfulFront, HelpfulList } from "./_components/HelpfulFront";

/**
 * Helpful content (docs/plans/active/insights-helpful-content-plan.md): the
 * best of what others have written, for every signed-in user, in Insights.
 * The front page is set out as News's (IH5); a topic chosen in the side menu,
 * or a publication beside the lead, lists alone (IH6). Each article opens on
 * its own page, and its original on its own site.
 */
export default function HelpfulContentPage() {
  const t = useTranslations("learn.helpful");
  const { platformName } = useSystemSettings();
  const params = useSearchParams();
  const topic = params.get("topic");
  const publication = params.get("publication");
  return (
    <LearnShell header={<PageHeader icon={<Library className="h-6 w-6 text-brand" />} title={t("title")} description={t("description", { platformName })} divider />}>
      {isTopicKey(topic) ? <HelpfulList topic={topic} /> : publication ? <HelpfulList publication={publication} /> : <HelpfulFront />}
    </LearnShell>
  );
}
