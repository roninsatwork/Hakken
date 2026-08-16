"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { BookmarkPlus, Check, Loader2, ThumbsDown, ThumbsUp } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTranslations } from "next-intl";

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
  const settings = useSystemSettings();
  const tAnswer = useTranslations("ai.assistant.answer");
  const feedback = useQuery(api.messageFeedback.getMineForThread, { threadId: message.threadId });
  const upsert = useMutation(api.messageFeedback.upsertForMessage);
  const saveAnswer = useMutation(api.knowledge.saveAnswerToWiki);
  const [labelPickerOpen, setLabelPickerOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [correction, setCorrection] = useState("");
  const [correctionSent, setCorrectionSent] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  if (!feedback?.enabled) return null;

  const mine = feedback.ratings.find((entry) => entry.messageId === message._id);

  const submit = async (
    rating: "POSITIVE" | "NEGATIVE",
    labels?: Array<"GREAT_ANSWER" | "INCORRECT" | "MISSED_CONTEXT" | "UNHELPFUL">,
    comment?: string,
  ) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      await upsert({
        messageId: message._id,
        rating,
        ...(labels ? { labels } : {}),
        ...(comment ? { comment } : {}),
      });
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

  /**
   * A thumbs-down says an answer was wrong; it never says what right would
   * have been. That correction is the one signal that is genuinely expensive
   * to get, and it was being thrown away.
   *
   * It proposes rather than corrects: nothing rewrites the reply that was
   * given, and the text joins the memory review queue an admin already reads.
   * Skipping the field leaves the old behaviour exactly as it was.
   */
  /**
   * Keep a good answer where the team will find it: the wiki
   * (one-brain-plan.md, phase 3). A person's save outranks the Filing
   * Clerk's judgement, so it files without the worthiness question, with
   * this conversation as the receipt on the page it teaches.
   */
  const save = async () => {
    if (saveState === "saving" || saveState === "saved") return;
    setSaveState("saving");
    try {
      await saveAnswer({ messageId: message._id });
      setSaveState("saved");
    } catch {
      setSaveState("failed");
    }
  };

  const sendCorrection = async () => {
    const text = correction.trim();
    if (!text || isSaving) return;
    await submit("NEGATIVE", mine?.labels?.length ? mine.labels : undefined, text);
    setCorrectionSent(true);
    setCorrection("");
  };

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

        <button
          type="button"
          disabled={saveState === "saving" || saveState === "saved"}
          onClick={() => void save()}
          className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
            saveState === "saved"
              ? "border-sky-500/40 bg-sky-500/10 text-sky-500"
              : "border-border-dim text-muted hover:text-secondary hover:bg-hover/40"
          }`}
        >
          {saveState === "saving" ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : saveState === "saved" ? (
            <Check className="h-3 w-3" />
          ) : (
            <BookmarkPlus className="h-3 w-3" />
          )}
          {saveState === "saved"
            ? tAnswer("saved")
            : saveState === "failed"
              ? tAnswer("saveFailed")
              : tAnswer("save")}
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

      {isNegative && (
        correctionSent || mine?.hasCorrection ? (
          <p className="text-[11px] text-muted">
            Thanks — that has gone to whoever reviews what {settings.platformName} remembers.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={correction}
              onChange={(event) => setCorrection(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void sendCorrection();
                }
              }}
              placeholder="What should it have said?"
              aria-label="What should it have said?"
              className="flex-1 min-w-[220px] bg-transparent border-0 border-b border-border-dim rounded-none px-0 pb-1 text-[12px] text-foreground focus:outline-none focus:border-brand/50 placeholder:text-muted/70"
            />
            <button
              type="button"
              disabled={!correction.trim() || isSaving}
              onClick={() => void sendCorrection()}
              className="rounded-full border border-border-dim px-2.5 py-1 text-[11px] text-muted hover:text-foreground hover:bg-hover/40 transition-colors disabled:opacity-40"
            >
              Send
            </button>
          </div>
        )
      )}
    </div>
  );
}
