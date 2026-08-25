"use client";

import { lazy, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useQuery } from "convex/react";
import { Loader2, X } from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { getSafeCompanyAiReturnTo } from "@/src/app/(dashboard)/admin/companies/[id]/ai/_components/CompanyAiFormPage";
import type {
  BlockerCheckboxProps,
  RemovePhraseButtonProps,
} from "./NewChatEvalContent";

const NewChatEvalContent = lazy(() => import("./NewChatEvalContent"));

function NewChatEvalLoading() {
  return (
    <div className="flex min-h-[420px] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-brand" />
    </div>
  );
}

function RemovePhraseButton({ label, onClick }: RemovePhraseButtonProps) {
  return (
    // Stays raw: a bare in-chip dismiss glyph that turns red — matches no variant.
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="text-muted transition-colors hover:text-red-400"
    >
      <X className="h-3 w-3" />
    </button>
  );
}

function BlockerCheckbox({ checked, onChange, title, hint }: BlockerCheckboxProps) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 accent-brand"
      />
      <span>
        <span className="block text-[13px] font-semibold text-foreground">{title}</span>
        <span className="block text-[12px] text-secondary">{hint}</span>
      </span>
    </label>
  );
}

export default function NewChatEvalPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const companyId = params.id as Id<"companies">;
  const threadId = params.threadId as Id<"threads">;
  const messageId = searchParams.get("messageId") as Id<"messages"> | null;
  const fallbackHref = `/admin/companies/${companyId}/ai/chat-logs`;
  const backHref = getSafeCompanyAiReturnTo(searchParams.get("returnTo"), companyId, fallbackHref);
  const thread = useQuery(api.chatAdmin.getCompanyThreadById, { companyId, threadId });
  const messages = useQuery(api.chatAdmin.getAdminThreadMessages, { threadId });

  if (thread === undefined || messages === undefined) {
    return <NewChatEvalLoading />;
  }

  return (
    <Suspense fallback={<NewChatEvalLoading />}>
      <NewChatEvalContent
        companyId={companyId}
        threadId={threadId}
        messageId={messageId}
        backHref={backHref}
        thread={thread}
        messages={messages}
        RemovePhraseButton={RemovePhraseButton}
        BlockerCheckbox={BlockerCheckbox}
      />
    </Suspense>
  );
}
