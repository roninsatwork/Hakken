"use client";

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";

/**
 * The one confirming tap of the photo plan: a follow-up the model read out of
 * an attached photo, shown with its reasoning so the person confirming can
 * judge it. Nothing is filed until the tap — the server holds the proposal
 * and refuses a second filing, so this component is presentation only.
 *
 * Labels arrive from the caller because the two surfaces speak differently:
 * the signed-in chat says "Raise this as a task" through next-intl, the
 * anonymous widget says "Ask the team to follow up" in its own plain English.
 */
export function PhotoActionChip({
  message,
  widgetAccessToken,
  labels,
  accentColor,
}: {
  message: Doc<"messages">;
  widgetAccessToken?: string;
  labels: {
    heading: string;
    why: string;
    confirm: string;
    filing: string;
    filed: string;
    failed: string;
  };
  accentColor?: string;
}) {
  const confirmProposal = useMutation(api.tasks.confirmPhotoAction);
  const [isFiling, setIsFiling] = useState(false);
  const [failed, setFailed] = useState(false);

  const proposal = message.photoActionProposal;
  if (!proposal) return null;

  const isFiled = Boolean(message.photoActionTaskId);

  const handleConfirm = async () => {
    if (isFiling || isFiled) return;
    setIsFiling(true);
    setFailed(false);
    try {
      await confirmProposal({ messageId: message._id, widgetAccessToken });
    } catch (error) {
      console.error("Photo action confirmation failed", error);
      setFailed(true);
    } finally {
      setIsFiling(false);
    }
  };

  return (
    <div className="mt-1 max-w-[34rem] rounded-[12px] border border-border-dim bg-foreground/[0.03] p-4 flex flex-col gap-2">
      <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted flex items-center gap-1.5">
        <ClipboardList className="w-3 h-3" />
        {labels.heading}
      </span>
      <p className="text-[13px] font-semibold text-foreground">{proposal.title}</p>
      <p className="text-[12px] leading-relaxed text-foreground/80 whitespace-pre-wrap">{proposal.detail}</p>
      <p className="text-[11px] text-secondary italic">
        {labels.why}: {proposal.reasoning}
      </p>
      {isFiled ? (
        <span className="text-[12px] text-foreground/80 flex items-center gap-1.5 mt-1">
          <CheckCircle2 className="w-3.5 h-3.5 text-brand" style={accentColor ? { color: accentColor } : undefined} />
          {labels.filed}
        </span>
      ) : (
        <div className="flex flex-col gap-1.5 mt-1">
          <button
            type="button"
            onClick={handleConfirm}
            disabled={isFiling}
            className="self-start px-4 py-2 rounded-[10px] text-[12px] font-medium text-white bg-brand hover:opacity-90 disabled:opacity-50 transition-all flex items-center gap-2"
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            {isFiling && <Loader2 className="w-3 h-3 animate-spin" />}
            {isFiling ? labels.filing : labels.confirm}
          </button>
          {failed && (
            <p className="text-[11px] text-amber-500/90" role="alert">
              {labels.failed}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
