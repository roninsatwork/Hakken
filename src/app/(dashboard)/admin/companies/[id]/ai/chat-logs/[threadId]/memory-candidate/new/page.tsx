"use client";

import { lazy, Suspense, useMemo } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2 } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

const ChatMemoryCandidateContent = lazy(() => import("./ChatMemoryCandidateContent"));

function ChatMemoryCandidateLoadingState() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}

export default function NewChatMemoryCandidatePage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const threadId = params.threadId as Id<"threads">;
  const messageId = searchParams.get("messageId") as Id<"messages"> | null;
  const thread = useQuery(api.chatAdmin.getCompanyThreadById, { companyId, threadId });
  const messages = useQuery(api.chatAdmin.getAdminThreadMessages, { threadId });

  const selectedMessage = useMemo(() => {
    if (!messages) return undefined;
    return messages.find((message) => message._id === messageId)
      ?? [...messages].reverse().find((message) => message.role === "assistant")
      ?? messages[messages.length - 1];
  }, [messageId, messages]);

  if (thread === undefined || messages === undefined || !thread || !selectedMessage) {
    return <ChatMemoryCandidateLoadingState />;
  }

  return (
    <Suspense fallback={<ChatMemoryCandidateLoadingState />}>
      <ChatMemoryCandidateContent
        companyId={companyId}
        threadId={threadId}
        threadTitle={thread.title ?? ""}
        isWidgetThread={Boolean(thread.widgetId)}
        selectedMessage={selectedMessage}
        returnTo={searchParams.get("returnTo")}
      />
    </Suspense>
  );
}
