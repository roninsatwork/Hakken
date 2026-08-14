"use client";

import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useTranslations } from "next-intl";
import { SonaeMarkdown } from "./SonaeMarkdown";
import { formatTime } from "@/src/lib/dates";
import { STREAM_STALLED_MESSAGE } from "@/convex/streamingService";
import { useStreamPresentation } from "@/src/hooks/useStreamPresentation";
import { useSmoothStreamText } from "@/src/hooks/useSmoothStreamText";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { MessageFeedbackControls } from "./MessageFeedbackControls";
import { AnswerEvidence } from "./AnswerEvidence";
import { PhotoActionChip } from "./PhotoActionChip";

interface ChatMessageProps {
  // The list query attaches viewable URLs for image attachments; older
  // callers pass plain rows and simply render no thumbnails.
  message: Doc<"messages"> & { imageAttachments?: Array<{ url: string }> };
}

/**
 * A turn of the conversation, set as a document rather than as bubbles.
 *
 * What you asked becomes a small labelled heading — the thing the answer
 * belongs to — and the answer sits against a hairline margin at a
 * comfortable reading width. Long replies used to run the full width of a
 * large monitor, which makes the eye travel a long way back for every line.
 */
export default function ChatMessage({ message }: ChatMessageProps) {
  const isAssistant = message.role === "assistant";
  const t = useTranslations("ai.assistant");
  const settings = useSystemSettings();

  // A reply whose run was killed outright cannot mark itself finished, so a
  // caret would blink against an answer that is never coming.
  const presentation = useStreamPresentation(message);

  // The database receives the reply in throttled lumps by design; the reveal
  // types those lumps out at a readable pace.
  const reveal = useSmoothStreamText({
    content: message.content,
    isStreaming: presentation === "streaming",
  });
  // An abandoned reply must never blink a caret, even if the reveal had not
  // finished typing out what did arrive before the run died.
  const isStreaming =
    presentation !== "stalled" && (presentation === "streaming" || (isAssistant && reveal.isRevealing));

  if (!isAssistant) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="flex flex-col gap-1 mb-6"
      >
        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted">
          {t("you")}
        </span>
        <p className="text-[15px] leading-snug tracking-[-0.01em] text-foreground whitespace-pre-wrap">
          {message.content}
        </p>
        {message.imageAttachments && message.imageAttachments.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {message.imageAttachments.map((image, index) => (
              // Tap opens the full photo; the thread shows a bounded
              // thumbnail so one large photo cannot swallow the page.
              <a key={index} href={image.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- Convex storage URLs are signed and external; next/image adds nothing here */}
                <img
                  src={image.url}
                  alt="Attached photo"
                  className="max-h-48 max-w-[16rem] rounded-[10px] border border-border-dim object-cover"
                />
              </a>
            ))}
          </div>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="flex flex-col gap-2.5 border-l border-border-dim pl-4 sm:pl-5 mb-9"
    >
      <div className="flex items-center gap-2">
        <span className="w-[15px] h-[15px] rounded-[4px] bg-brand flex items-center justify-center flex-shrink-0">
          <Sparkles className="w-2.5 h-2.5 text-white" />
        </span>
        <span className="text-[9px] font-medium uppercase tracking-[0.2em] text-muted">
          {settings.platformName}
        </span>
      </div>

      {/* Held to a reading measure. Tables and code inside the markdown break
          out to the full column on their own. */}
      <div className="text-[14px] leading-[1.75] text-foreground/90 max-w-[34rem]">
        <SonaeMarkdown content={reveal.text} />
        {isStreaming && (
          <span
            aria-label="Still writing"
            role="status"
            className="inline-block w-[2px] h-[1.1em] -mb-[0.15em] ml-[2px] bg-brand animate-pulse"
          />
        )}
        {presentation === "stalled" && (
          <p className="mt-2 text-[12px] text-amber-500/90">{STREAM_STALLED_MESSAGE}</p>
        )}
      </div>

      {/* The follow-up the model read out of an attached photo, waiting for
          the confirming tap. Only once the reply has finished writing. */}
      {!isStreaming && presentation !== "stalled" && message.photoActionProposal && (
        <PhotoActionChip
          message={message}
          labels={{
            heading: t("photoAction.heading"),
            why: t("photoAction.why"),
            confirm: t("photoAction.confirm"),
            filing: t("photoAction.filing"),
            filed: t("photoAction.filed"),
            failed: t("photoAction.failed"),
          }}
        />
      )}

      {/* Rating only once the reply has finished writing itself, and never on
          platform notices — a quota message is not an answer. */}
      {!isStreaming && presentation !== "stalled" && !message.systemKey && (
        <>
          <MessageFeedbackControls message={message} />
          <AnswerEvidence messageId={message._id} />
        </>
      )}

      {!isStreaming && (
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted/60">
          {formatTime(message.createdAt, { locale: [], options: { hour: "2-digit", minute: "2-digit" } })}
        </span>
      )}
    </motion.div>
  );
}
