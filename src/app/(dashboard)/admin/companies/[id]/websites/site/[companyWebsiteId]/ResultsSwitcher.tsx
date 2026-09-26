"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";

import { SiteSwitcher } from "./SiteSwitcher";
import { siteBase } from "./siteView";

export type ResultsView = "searches" | "questions" | "answers" | "rankings" | "fanOut";

/**
 * Your searches · AI questions · AI answers · Everything it ranks for · What
 * the AI searched — the company's own lists and the views of what came back,
 * under the one Results tab, the one people open most first. The two lists
 * are set here because they are this company's own
 * (docs/plans/active/private-tracking-lists-plan.md, V4).
 *
 * A switch on the page rather than a dropdown on the tab, because a dropdown
 * tab takes two clicks to reach anything and hides what is there until it is
 * opened. These are three views of one question — what did this client get
 * for their money — and they read best side by side.
 */
export function ResultsSwitcher({ active }: { active: ResultsView }) {
  const t = useTranslations("admin.siteView.results");
  const params = useParams();
  const base = siteBase(params.id as string, params.companyWebsiteId as string);

  return (
    <SiteSwitcher
      label={t("label")}
      items={[
        { href: `${base}/searches`, label: t("searches"), active: active === "searches" },
        { href: `${base}/questions`, label: t("questions"), active: active === "questions" },
        { href: `${base}/citations`, label: t("answers"), active: active === "answers" },
        { href: `${base}/keywords`, label: t("rankings"), active: active === "rankings" },
        { href: `${base}/fan-out`, label: t("fanOut"), active: active === "fanOut" },
      ]}
    />
  );
}
