"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";

const NEGATIVE_LABELS = [
  { key: "INCORRECT" as const, label: "Wrong answer" },
  { key: "MISSED_CONTEXT" as const, label: "Missed something" },
  { key: "UNHELPFUL" as const, label: "Not helpful" },
];

/**
 * Helpful / Not right on an assistant message (self-improvement plan,
 * Phase 3). One tap, changeable, and never green-vs-red: the positive state
 * is blue, the negative gold, both with their words next to them.
 *
 * Renders nothing while the reply is still streaming, when the message is a
 * platform notice, or when the platform switch is off — the query says so
 * and the buttons simply are not there.
 */
export function MessageFeedbackControls({ message }: { message: Doc<"messages"> }) {
  const feedback = useQuery(api.messageFeedback.getMineForThread, { threadId: message.threadId });
  const upsert = useMutation(api.messageFeedback.upsertForMessage);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  if (!feedback?.enabled) return null;

  const mine = feedback.ratings.find((entry) => entry.messageId === message._id);

  const submit = async (rating: "POSITIVE" | "NEGATIVE", labels?: Array<"GREAT_ANSWER" | "INCORRECT" | "MISSED_CONTEXT" | "UNHELPFUL">) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await upsert({ messageId: message._id, rating, ...(labels ? { labels } : {}) });
      setLabelPickerOpen(rating === "NEGATIVE" && !labels);
    } catch {
      // A failed rating is not worth an error state in the conversation; the
      // buttons simply stay as they were.
      setLabelPickerOpen(false);
    } finally {
      setIsSaving(false);
    }
  };

  const isPositive = mine?.rating === "POSITIVE";
  const isNegative = mine?.rating === "NEGATIVE";

  return (
    <div className="mt-2 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-pressed={isPositive}
          disabled={isSaving}
          onClick={() => submit("POSITIVE", ["GREAT_ANSWER"])}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            isPositive
              ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
              : "border-border-dim text-muted hover:text-secondary hover:bg-hover/40"
          }`}
        >
          <ThumbsUp className="h-3 w-3" />
          Helpful
        </button>
        <button
          type="button"
          aria-pressed={isNegative}
          disabled={isSaving}
          onClick={() => submit("NEGATIVE")}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            isNegative
              ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
              : "border-border-dim text-muted hover:text-secondary hover:bg-hover/40"
          }`}
        >
          <ThumbsDown className="h-3 w-3" />
          Not right
        </button>
      </div>

      {isNegative && labelPickerOpen && (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[10px] uppercase tracking-widest text-muted">What went wrong?</span>
          {NEGATIVE_LABELS.map((option) => (
            <button
              key={option.key}
              type="button"
              disabled={isSaving}
              onClick={() => submit("NEGATIVE", [option.key])}
              className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                mine?.labels.includes(option.key)
                  ? "border-amber-500/40 bg-amber-500/10 text-amber-500"
                  : "border-border-dim text-muted hover:text-secondary hover:bg-hover/40"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
