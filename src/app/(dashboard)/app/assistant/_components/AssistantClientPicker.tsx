"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "convex/react";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * Which client a new conversation answers for — a super admin's choice in Ask
 * Hakken (docs/plans/active/assistant-foundation-plan.md, item 8, as drawn and
 * approved 2026-10-06), made without changing who they are viewing as. Once a
 * conversation has started its client is fixed: its history is that client's.
 * Everyone else is always answered for their own company and sees none of
 * this.
 */
export type ClientChoice = { kind: "company"; companyId: Id<"companies"> } | { kind: "platform" };

/** What `createThread` is told: nothing for the company being viewed as. */
export function clientThreadArgs(choice: ClientChoice | null, viewingAs: Id<"companies"> | undefined) {
  if (!choice) return {};
  if (choice.kind === "platform") return { forPlatform: true };
  return choice.companyId === viewingAs ? {} : { forCompanyId: choice.companyId };
}

const CLIENT_OPTIONS = 100;

export function AssistantClientPicker({
  choice,
  viewingAs,
  onChoose,
}: {
  choice: ClientChoice | null;
  /** The company the super admin is viewing as: the choice until they make another. */
  viewingAs: Id<"companies"> | undefined;
  onChoose: (choice: ClientChoice) => void;
}) {
  const t = useTranslations("ai.assistant.client");
  const companies = useQuery(api.companies.getCompanyOptions, { limit: CLIENT_OPTIONS });
  const [isOpen, setIsOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const close = (event: MouseEvent) => {
      if (!pickerRef.current?.contains(event.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [isOpen]);

  const current: ClientChoice | null = choice ?? (viewingAs ? { kind: "company", companyId: viewingAs } : { kind: "platform" });
  const currentName = current.kind === "platform"
    ? t("platform")
    : companies?.find((company) => company._id === current.companyId)?.name ?? "…";

  const pick = (next: ClientChoice) => {
    onChoose(next);
    setIsOpen(false);
  };

  return (
    <div ref={pickerRef} className="relative flex items-center gap-1.5 mb-2 text-[12px] text-muted">
      <span>{t("answeringFor")}</span>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="inline-flex items-center gap-1 text-foreground font-medium hover:text-secondary transition-colors"
      >
        {currentName}
        <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            role="listbox"
            className="absolute bottom-full left-16 mb-2 w-[240px] bg-card border border-border-dim rounded-[14px] shadow-2xl p-1.5 z-50 flex flex-col max-h-[320px] overflow-y-auto custom-scrollbar"
          >
            <div className="px-3 py-2 border-b border-border-dim mb-1 sticky top-0 bg-card z-10">
              <span className="text-[11px] font-medium text-muted tracking-widest uppercase">{t("title")}</span>
            </div>
            {(companies ?? []).map((company) => (
              <ClientRow
                key={company._id}
                name={company.name}
                chosen={current.kind === "company" && current.companyId === company._id}
                onPick={() => pick({ kind: "company", companyId: company._id })}
              />
            ))}
            <div className="border-t border-border-dim my-1" />
            <ClientRow name={t("platform")} chosen={current.kind === "platform"} onPick={() => pick({ kind: "platform" })} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ClientRow({ name, chosen, onPick }: { name: string; chosen: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={chosen}
      onClick={onPick}
      className="w-full flex items-center justify-between px-3 py-2 rounded-[10px] hover:bg-foreground/5 text-left"
    >
      <span className={`text-[14px] ${chosen ? "text-foreground font-medium" : "text-secondary"}`}>{name}</span>
      {chosen && <Check className="w-4 h-4 text-brand" />}
    </button>
  );
}

/**
 * The client a conversation answers for, fixed once it has started — shown
 * to a super admin above the reply box; nothing for anyone else.
 */
export function AssistantClientLabel({ threadId }: { threadId: Id<"threads"> }) {
  const t = useTranslations("ai.assistant.client");
  const client = useQuery(api.chat.getConversationClient, { threadId });
  if (!client) return null;
  return (
    <div className="flex items-center gap-1.5 mb-2 text-[12px] text-muted">
      <span>{t("answeringFor")}</span>
      <span className="text-foreground font-medium">{client.name ?? t("platform")}</span>
    </div>
  );
}
