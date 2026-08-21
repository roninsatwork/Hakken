"use client";

import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { Check, Loader2, MessageSquare, MinusCircle, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslations } from "next-intl";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import type { AdminActionRunner } from "@/src/hooks/useAdminAction";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Button } from "@/src/ui/atoms/Button";

type AgentRunFeedback = Doc<"agentRunFeedback">;
export type FeedbackRating = AgentRunFeedback["rating"];
export type FeedbackLabel = AgentRunFeedback["labels"][number];
export type FeedbackRecord = { rating: FeedbackRating; labels: FeedbackLabel[]; comment?: string };

/** What the modal is editing: one run's rating, labels and comment. */
export type FeedbackDraft = {
  runId: Id<"agentRuns">;
  objective: string;
  rating: FeedbackRating;
  labels: FeedbackLabel[];
  comment: string;
};

const feedbackLabels: Array<{ label: FeedbackLabel; textKey: string }> = [
  { label: "GOOD_ANSWER", textKey: "labels.goodAnswer" },
  { label: "INCORRECT", textKey: "labels.incorrect" },
  { label: "MISSED_CONTEXT", textKey: "labels.missedContext" },
  { label: "WRONG_TOOL", textKey: "labels.wrongTool" },
  { label: "BAD_TOOL_ARGS", textKey: "labels.badArgs" },
  { label: "UNSAFE_SUGGESTION", textKey: "labels.unsafe" },
  { label: "TOO_EXPENSIVE", textKey: "labels.tooExpensive" },
  { label: "TOO_SLOW", textKey: "labels.tooSlow" },
  { label: "NEEDS_APPROVAL_POLICY_CHANGE", textKey: "labels.approvalPolicy" },
  { label: "SHOULD_BECOME_EVAL", textKey: "labels.makeEval" },
];

/**
 * Rating a run: positive/neutral/negative, a set of labels, and a comment.
 *
 * The draft lives on the page rather than in here because the row menu is what
 * opens it — the page seeds the draft from the run's existing feedback and this
 * modal only edits it. Saving is this modal's own job, though: nothing else on
 * the page writes feedback.
 */
export function FeedbackModal({
  draft,
  onDraftChange,
  onClose,
  action,
}: {
  draft: FeedbackDraft | null;
  onDraftChange: (draft: FeedbackDraft) => void;
  onClose: () => void;
  action: AdminActionRunner;
}) {
  const t = useTranslations("admin.agents.details.runs.feedback");
  const upsertFeedback = useMutation(api.agentRunFeedback.upsertForRun);

  const handleSubmit = async () => {
    if (!draft) return;
    const outcome = await action.run(
      () => upsertFeedback({
        runId: draft.runId,
        rating: draft.rating,
        labels: draft.labels,
        comment: draft.comment,
      }),
      {
        key: draft.runId,
        successMessage: t("saveSuccess"),
        fallbackMessage: t("saveFailed"),
      },
    );
    // The draft stays open on failure so the comment is not lost.
    if (outcome.ok) onClose();
  };

  return (
    <SonaeModal
      isOpen={!!draft}
      onClose={() => !action.isBusy() && onClose()}
      title={t("title")}
      size="lg"
    >
      {draft && (
        <div className="flex flex-col gap-6">
          <div className="p-3 rounded-[8px] bg-white/[0.03] border border-border-dim">
            <p className="text-[13px] text-secondary leading-relaxed line-clamp-3">{draft.objective}</p>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([
              { rating: "POSITIVE" as const, label: t("positive"), icon: ThumbsUp },
              { rating: "NEUTRAL" as const, label: t("neutral"), icon: MinusCircle },
              { rating: "NEGATIVE" as const, label: t("negative"), icon: ThumbsDown },
            ]).map(({ rating, label, icon: Icon }) => (
              <button
                key={rating}
                type="button"
                onClick={() => onDraftChange({ ...draft, rating })}
                className={`px-3 py-2.5 rounded-[8px] border text-[13px] font-medium flex items-center justify-center gap-2 transition-all ${
                  draft.rating === rating
                    ? "bg-brand text-white border-brand"
                    : "bg-white/[0.02] text-secondary border-border-dim hover:text-foreground hover:bg-white/[0.05]"
                }`}
              >
                <Icon className="w-4 h-4" />
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-widest font-mono text-muted">{t("labelsHeading")}</span>
            <div className="flex flex-wrap gap-2">
              {feedbackLabels.map((option) => {
                const selected = draft.labels.includes(option.label);
                return (
                  <button
                    key={option.label}
                    type="button"
                    onClick={() => {
                      const labels = selected
                        ? draft.labels.filter((label) => label !== option.label)
                        : [...draft.labels, option.label];
                      onDraftChange({ ...draft, labels });
                    }}
                    className={`px-3 py-1.5 rounded-[8px] border text-[12px] flex items-center gap-2 transition-all ${
                      selected
                        ? "bg-brand/15 text-brand border-brand/30"
                        : "bg-white/[0.02] text-secondary border-border-dim hover:text-foreground hover:bg-white/[0.05]"
                    }`}
                  >
                    {selected && <Check className="w-3.5 h-3.5" />}
                    {t(option.textKey)}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex flex-col gap-2">
            <span className="text-[12px] uppercase tracking-widest font-mono text-muted">{t("commentHeading")}</span>
            <textarea
              value={draft.comment}
              onChange={(event) => onDraftChange({ ...draft, comment: event.target.value })}
              rows={4}
              className="w-full rounded-[8px] bg-black/20 border border-border-dim px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/50 resize-none"
              placeholder={t("commentPlaceholder")}
            />
          </label>

          <div className="flex justify-end gap-3">
            <Button variant="ghost" onClick={onClose} disabled={action.isBusy()}>
              {t("cancel")}
            </Button>
            <WriteButton
              type="button"
              onClick={handleSubmit}
              disabled={action.isBusy()}
              className="px-5 py-2.5 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 transition-all disabled:opacity-50 flex items-center gap-2"
            >
              {action.isBusy() ? <Loader2 className="w-4 h-4 animate-spin" /> : <MessageSquare className="w-4 h-4" />}
              {t("save")}
            </WriteButton>
          </div>
        </div>
      )}
    </SonaeModal>
  );
}
