"use client";

import { ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { WebsitePicker, type PickerHold } from "@/src/app/(dashboard)/app/sites/_components/WebsitePicker";

/** Choosing keeps Ask Hakken open, the website in its address, so the choice survives a reload. */
export function websiteChoiceHref(siteId: string | null): string {
  return `/app/assistant?site=${siteId ?? "all"}`;
}

/**
 * The website chosen: the one in the address; else the one last chosen here
 * (Decision 8); else, the first time, the company's own website — as drawn
 * and signed off (keep-less-history-plan.md, 6.1). "all" is every website,
 * null the whole company; a website no longer the company's is passed over.
 */
export function chosenWebsite(holds: readonly PickerHold[], site: string | null, remembered: string | null = null): PickerHold | null {
  for (const choice of [site, remembered]) {
    if (choice === "all") return null;
    const held = holds.find((hold) => hold.siteId === choice);
    if (held) return held;
  }
  return holds.find((hold) => hold.relationship === "OWNED") ?? null;
}

/** Whether a choice in the address is one to remember: every website, or one the company holds. */
export function isWebsiteChoice(holds: readonly PickerHold[], site: string | null): site is string {
  return site === "all" || holds.some((hold) => hold.siteId === site);
}

/**
 * "Answering for", for a company's own people and a super admin viewing as a
 * company (Decision 7): only that company's websites — its own, and those it
 * tracks folded beneath each — in the website picker the Sites pages use,
 * rising above its button at the foot of the page (keep-less-history-plan.md,
 * 6.1, drawn and signed off 2026-10-07). Never another company's: the list is
 * the company being viewed.
 */
export function AssistantWebsitePicker({ holds, chosen }: { holds: readonly PickerHold[]; chosen: PickerHold | null }) {
  const t = useTranslations("ai.assistant.client");
  const { platformName } = useSystemSettings();
  return (
    <div data-part="answering-for" className="relative flex items-center gap-1.5 mb-2 text-[12px] text-muted">
      <span data-part-title>{t("answeringFor")}</span>
      <WebsitePicker
        holds={holds}
        currentId={chosen?.siteId ?? null}
        hrefFor={(hold) => websiteChoiceHref(hold.siteId)}
        all={{ label: t("allWebsites"), href: websiteChoiceHref(null) }}
        footer={t("websiteFooter", { platformName })}
        triggerLabel={t("chooseWebsite")}
        placement="above"
        // The client picker's own button (`AssistantClientPicker.tsx`): the same words, the same size.
        triggerClassName="inline-flex items-center gap-1 p-0 text-[12px] text-foreground hover:text-secondary hover:bg-transparent"
        renderTrigger={() => (
          <>
            {chosen ? chosen.host : t("allWebsites")}
            <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
          </>
        )}
      />
    </div>
  );
}
