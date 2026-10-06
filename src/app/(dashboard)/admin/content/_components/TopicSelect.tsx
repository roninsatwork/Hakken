"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Select } from "@/src/ui/components/screens/Select";

/**
 * The shared topic list in Admin (docs/plans/active/insights-helpful-content-
 * plan.md, IH20): one chooser for Knowledge, Helpful content and Who to follow,
 * in an editor or as a list's filter chip, so the three never drift apart.
 * Topics are kept by key and shown by their English name, in the list's order.
 */

/** The list's choices, in order; undefined while it loads. */
export function useTopicChoices() {
  return useQuery(api.topics.listTopicChoices, {});
}

/** A topic's English name from the choices, by key; null for none, or for a topic deleted meanwhile. */
export function topicNameIn(choices: Array<{ key: string; nameEn: string }> | undefined, key: string | null | undefined): string | null {
  return key ? choices?.find((choice) => choice.key === key)?.nameEn ?? null : null;
}

export function TopicSelect({
  id,
  value,
  onChange,
  noneLabel,
  chip,
  className,
  "aria-label": ariaLabel,
}: {
  id?: string;
  /** A topic's key, or "" for none. */
  value: string;
  onChange: (key: string) => void;
  /** What the "no topic" choice says: "No topic" in an editor, "All topics" in a filter. */
  noneLabel: string;
  /** Drawn as a list's filter chip, `label` on it. */
  chip?: { label: string };
  className?: string;
  "aria-label"?: string;
}) {
  const choices = useTopicChoices();
  const chosen = topicNameIn(choices, value);
  return (
    <Select
      id={id}
      value={value}
      onChange={onChange}
      className={className}
      aria-label={ariaLabel}
      {...(chip ? { chip: { label: chip.label, choice: chosen } } : {})}
    >
      <option value="">{noneLabel}</option>
      {(choices ?? []).map((choice) => (
        <option key={choice.key} value={choice.key}>{choice.nameEn}</option>
      ))}
    </Select>
  );
}
