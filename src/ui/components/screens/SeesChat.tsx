"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { FunctionArgs } from "convex/server";
import { ArrowUpRight, SendHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { noteSeesThread, useSeesThread } from "./hakkenSeesStore";
import { Button } from "./Button";

// Ask Hakken's own message, charts and suggested tasks included: the panel draws no second kind.
const ChatMessage = dynamic(() => import("@/src/ui/components/chat/ChatMessage"));

type StartedOn = NonNullable<FunctionArgs<typeof api.chat.createThread>["startedOn"]>;

/**
 * Asking about the page, in the eye's panel (sees-side-panel-plan-2026-10-31.md, phase 3; Anthony: "a slide out
 * side panel that we can talk to"). One chat, two ways in: the conversation is an Ask Hakken conversation for the
 * page's website, started with the page as its starting point (\`startedOn\`), shown in Ask Hakken's list and
 * carried on there. `useSeesChat` holds it; the log goes under the words and the box at the panel's foot.
 */
export function useSeesChat({ pageKey, siteId, startedOn }: { pageKey: string | null; siteId?: Id<"companyWebsites">; startedOn: StartedOn }) {
  const threadId = useSeesThread(pageKey) as Id<"threads"> | null;
  const [draft, setDraft] = useState("");
  const sendAction = useAdminAction({ scope: "sees-chat-send" });
  const t = useTranslations("ui.hakkenSees");
  const createThread = useMutation(api.chat.createThread);
  const sendMessage = useMutation(api.chat.sendMessage);
  const messages = useQuery(api.chat.getMessages, threadId ? { threadId } : "skip");
  const sending = sendAction.isBusy();
  const send = async () => {
    const content = draft.trim();
    if (!content || sending || !pageKey) return;
    // A refusal is said, and the box keeps the words: nothing is lost.
    await sendAction.run(
      async () => {
        const id = threadId ?? await createThread({ ...(siteId ? { forWebsiteId: siteId } : {}), startedOn });
        if (!threadId) noteSeesThread(pageKey, id);
        await sendMessage({ threadId: id, content });
        setDraft("");
      },
      { fallbackMessage: t("sendFailed") },
    );
  };
  // Waiting on an answer: the last line is the person's, and no answer has begun.
  const waiting = sending || (messages?.length ? messages[messages.length - 1].role === "user" : false);
  return { threadId, messages: messages ?? [], draft, setDraft, send, sending, waiting };
}

type Chat = ReturnType<typeof useSeesChat>;

/** The conversation so far, under the panel's words: the person's questions and Ask Hakken's answers. */
export function SeesChatLog({ chat }: { chat: Chat }) {
  const t = useTranslations("ui.hakkenSees");
  const { platformName } = useSystemSettings();
  // The newest line in view as it arrives, as Ask Hakken's own page keeps it.
  const end = useRef<HTMLDivElement>(null);
  const newest = chat.messages.at(-1);
  useEffect(() => {
    end.current?.scrollIntoView?.({ block: "end", behavior: "smooth" });
  }, [chat.messages.length, newest?.content.length, chat.waiting]);
  return (
    <section data-part="sees-chat" className="flex flex-col gap-3 border-t border-border-dim pt-5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12px] font-semibold uppercase tracking-[0.12em] text-muted">{t("ask")}</span>
        {chat.threadId ? (
          <Link href={`/app/assistant/${chat.threadId}`} className="inline-flex items-center gap-1.5 text-[11px] text-secondary hover:text-foreground">
            {t("open", { platformName })}
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {chat.messages.map((message) => <ChatMessage key={message._id} message={message} />)}
      {chat.waiting ? <p className="text-[13px] text-secondary" aria-live="polite">{t("thinking", { platformName })}</p> : null}
      <div ref={end} aria-hidden="true" />
    </section>
  );
}

/** The box to ask in, fixed at the panel's foot, with Ask Hakken's own disclaimer under it. */
export function SeesChatFoot({ chat }: { chat: Chat }) {
  const t = useTranslations("ui.hakkenSees");
  const tAssistant = useTranslations("ai.assistant.welcome");
  const { platformName } = useSystemSettings();
  return (
    <div data-part="sees-chat-box" className="flex flex-col gap-2">
      <form
        className="flex items-center gap-2 rounded-[12px] border border-border-dim bg-background px-3 py-2"
        onSubmit={(event) => {
          event.preventDefault();
          void chat.send();
        }}
      >
        <textarea
          rows={2}
          value={chat.draft}
          onChange={(event) => chat.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              void chat.send();
            }
          }}
          placeholder={t("askPlaceholder")}
          aria-label={t("askPlaceholder")}
          className="flex-1 resize-none bg-transparent text-[13px] text-foreground placeholder:text-muted focus:outline-none"
        />
        <Button type="submit" variant="brand" disabled={chat.sending || !chat.draft.trim()} aria-label={t("send")} title={t("send")} className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] p-0">
          <SendHorizontal className="h-4 w-4" aria-hidden="true" />
        </Button>
      </form>
      <p className="text-[11px] text-muted">{tAssistant("footer", { platformName })}</p>
      <p className="text-[11px] text-muted">{t("saved", { platformName })}</p>
    </div>
  );
}
