"use client";

import { useQuery } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { FieldHint, FieldLabel } from "@/src/ui/components/screens/SettingsCard";
import { TopicSelect } from "../_components/TopicSelect";

/** A person's topic — a key in the shared list, or "" for none — and "Our picks" (IH14). */
export type FollowDetails = { topic: string; picked: boolean };

/** "Our picks": the server refuses a fifth. */
const MAX_PICKS = 4;

/**
 * A person's topic and "Our pick" tick, with what each means — the fields Add
 * a person and Edit details share (content-people-knowledge-plan.md, board
 * 3). The tick says how many places are free, and is held when four others
 * are picked, naming them.
 */
export function FollowDetailsFields({ followId, name, details, onChange }: {
  /** The person being edited; none on Add a person. */
  followId?: Id<"newsFollows">;
  name: string;
  details: FollowDetails;
  onChange: (patch: Partial<FollowDetails>) => void;
}) {
  const t = useTranslations("admin.newsFollows");
  const picks = useQuery(api.newsFollows.listPicksForAdmin, {});
  // The picks other than this person: four of them leave no room.
  const pickedElsewhere = (picks ?? []).filter((pick) => pick._id !== followId);
  const full = pickedElsewhere.length >= MAX_PICKS && !details.picked;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="news-follow-topic">{t("topicLabel")}</FieldLabel>
        <TopicSelect id="news-follow-topic" value={details.topic} onChange={(topic) => onChange({ topic })} noneLabel={t("noTopic")} className="w-full" />
        <FieldHint>{t("topicHint")}</FieldHint>
      </div>
      <div className="flex flex-col gap-1.5">
        <FieldLabel htmlFor="news-follow-pick">{t("picksLabel")}</FieldLabel>
        <Checkbox id="news-follow-pick" label={t("pickCheckbox")} checked={details.picked} disabled={full} onChange={(picked) => onChange({ picked })} />
        <FieldHint>
          {full
            ? t("pickHintFull", { names: pickedElsewhere.map((pick) => pick.name).join(", "), name: name || t("thisEntry"), max: MAX_PICKS })
            : t("pickHint", { free: Math.max(MAX_PICKS - pickedElsewhere.length - (details.picked ? 1 : 0), 0), max: MAX_PICKS })}
        </FieldHint>
      </div>
    </div>
  );
}
