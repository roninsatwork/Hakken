"use client";

import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { Pin, PinOff } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { localDay } from "@/src/app/(dashboard)/app/_learn/learnDates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { formatDate } from "@/src/lib/dates";
import { Button } from "@/src/ui/components/screens/Button";
import { Notice } from "@/src/ui/components/screens/Notice";
import { StatusLabel } from "@/src/ui/components/screens/StatusLabel";
import { RowIconButton } from "@/src/ui/components/screens/Table";

/**
 * The News front page's one lead story, pinned from News, Knowledge or
 * Helpful content (docs/plans/active/insights-helpful-content-plan.md, IH11,
 * boards 9–13): what leads and where it was pinned, the pin on a row and on an
 * article's page, and "Lead story until …" where it is. Pinning one unpins any
 * other, whichever list it is in (`convex/leadStory.ts`).
 */

export type StoryId = Id<"newsItems"> | Id<"knowledgeArticles"> | Id<"libraryArticles">;
type Place = "NEWS" | "KNOWLEDGE" | "HELPFUL";

const PLACE_HREF: Record<Place, string> = {
  NEWS: "/admin/content/news",
  KNOWLEDGE: "/admin/content/knowledge",
  // Helpful content's articles are in Knowledge's one list (content-people-knowledge-plan.md, phase 3).
  HELPFUL: "/admin/content/knowledge",
};

/** The list a place's stories are shown in: Knowledge holds ours and the web's. */
const LIST_OF: Record<Place, Place> = { NEWS: "NEWS", KNOWLEDGE: "KNOWLEDGE", HELPFUL: "KNOWLEDGE" };

/**
 * What leads the front page today and where it was pinned (IH11): above every
 * other list — the list it was pinned in says so on its row (board 10) — and
 * on an article's page, unless that article is the one pinned, whose own label
 * says so (board 9).
 */
export function LeadStoryNotice({ here, storyId }: { here: Place; storyId?: string }) {
  const t = useTranslations("admin.leadStory");
  const lead = useQuery(api.news.getLeadForAdmin, { today: localDay() });
  if (!lead) return null;
  const saidElsewhere = storyId === undefined ? lead.pinned && LIST_OF[lead.place] === LIST_OF[here] : lead.pinned && lead.storyId === storyId;
  if (saidElsewhere) return null;
  return (
    <Notice>
      {lead.pinned && lead.leadUntil !== null
        ? t.rich("pinned", {
          title: lead.title,
          placeName: t(`places.${lead.place}`),
          date: formatDate(lead.leadUntil),
          here,
          place: (chunks) => (
            <Link href={PLACE_HREF[lead.place]} className="text-foreground underline decoration-foreground/40 underline-offset-2 hover:decoration-foreground">
              {chunks}
            </Link>
          ),
        })
        : t("rule", { title: lead.title, here })}
    </Notice>
  );
}

/** Pins a story to lead, or takes its pin off; a failure says so in a toast. */
export function useLeadPin() {
  const t = useTranslations("admin.leadStory");
  const pin = useMutation(api.leadStory.pinLeadStory);
  const unpin = useMutation(api.leadStory.unpinLeadStory);
  const action = useAdminAction({ scope: "admin-lead-story" });
  return {
    isBusy: (storyId: StoryId) => action.isBusy(storyId),
    toggle: (storyId: StoryId, leading: boolean) =>
      void action.run(() => (leading ? unpin({ storyId }) : pin({ storyId })), { key: storyId, fallbackMessage: t("pinFailed") }),
  };
}

/** "Lead story until …" on a row or under an article's title, while its pin lasts. */
export function LeadUntilLabel({ leadUntil, className }: { leadUntil: number | null; className?: string }) {
  const t = useTranslations("admin.leadStory");
  if (leadUntil === null) return null;
  return <StatusLabel tone="info" icon="pinned" className={className}>{t("leadUntil", { date: formatDate(leadUntil) })}</StatusLabel>;
}

/** The pin in a row's actions: on what readers can see, never on a draft. A second click while one runs is ignored by the runner. */
export function LeadPinRowButton({ storyId, leadUntil, canLead }: { storyId: StoryId; leadUntil: number | null; canLead: boolean }) {
  const t = useTranslations("admin.leadStory");
  const pins = useLeadPin();
  if (leadUntil === null && !canLead) return null;
  return leadUntil !== null ? (
    <RowIconButton label={t("unpin")} onClick={() => pins.toggle(storyId, true)}>
      <PinOff className="h-4 w-4" />
    </RowIconButton>
  ) : (
    <RowIconButton label={t("pinRow")} onClick={() => pins.toggle(storyId, false)}>
      <Pin className="h-4 w-4" />
    </RowIconButton>
  );
}

/** The pin on an article's own page, beside its other controls (boards 9 and 12). */
export function LeadPinButton({ storyId, leadUntil, canLead }: { storyId: StoryId; leadUntil: number | null; canLead: boolean }) {
  const t = useTranslations("admin.leadStory");
  const pins = useLeadPin();
  if (leadUntil === null && !canLead) return null;
  const leading = leadUntil !== null;
  return (
    <Button variant="quiet" disabled={pins.isBusy(storyId)} onClick={() => pins.toggle(storyId, leading)} className="inline-flex items-center gap-1.5 whitespace-nowrap px-3 py-2">
      {leading ? <PinOff className="h-3.5 w-3.5" aria-hidden="true" /> : <Pin className="h-3.5 w-3.5" aria-hidden="true" />}
      {leading ? t("unpin") : t("pin")}
    </Button>
  );
}
