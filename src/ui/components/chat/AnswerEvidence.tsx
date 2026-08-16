"use client";

import { useState } from "react";
import { useQuery } from "convex/react";
import { ChevronDown, FileText, Lightbulb, Wrench, BookOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";

/**
 * The workings behind an answer.
 *
 * Every reply already records which documents retrieval admitted, which
 * memories applied and which skills were in force — written from what was
 * actually used rather than what was merely available. This shows that
 * record and nothing else.
 *
 * Deliberately not a modal: it is reference material beside an answer, not a
 * decision to make. It only asks the database once opened, so a long
 * conversation does not fetch the workings of every reply nobody looked at.
 */
export function AnswerEvidence({ messageId }: { messageId: Id<"messages"> }) {
  const t = useTranslations("ai.assistant.evidence");
  const [isOpen, setIsOpen] = useState(false);
  const evidence = useQuery(api.messageEvidence.getForMessage, isOpen ? { messageId } : "skip");

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        aria-expanded={isOpen}
        className="self-start inline-flex items-center gap-1 text-[11px] text-muted hover:text-secondary transition-colors"
      >
        <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        {isOpen ? t("hide") : t("why")}
      </button>

      {isOpen && evidence && (
        <div className="flex flex-col gap-3 border-l border-border-dim pl-3 text-[12px]">
          {!evidence.hasAny && <p className="text-muted leading-relaxed max-w-[34rem]">{t("none")}</p>}

          {evidence.wikiPages.length > 0 && (
            <EvidenceGroup icon={<BookOpen className="h-3 w-3" />} label={t("wikiPages")}>
              {evidence.wikiPages.map((page) => (
                <li key={`${page.isPlatform}-${page.title}`} className="text-secondary">
                  {page.title.replace(/^https?:\/\//, "")}
                  {page.isPlatform && (
                    <span className="ml-1.5 text-muted">{t("wikiPlatform")}</span>
                  )}
                </li>
              ))}
            </EvidenceGroup>
          )}

          {evidence.documents.length > 0 && (
            <EvidenceGroup icon={<FileText className="h-3 w-3" />} label={t("documents")}>
              {evidence.documents.map((doc) => (
                <li key={doc.id} className="text-secondary">{doc.title}</li>
              ))}
            </EvidenceGroup>
          )}

          {evidence.memories.length > 0 && (
            <EvidenceGroup icon={<Lightbulb className="h-3 w-3" />} label={t("memories")}>
              {evidence.memories.map((memory) => (
                <li key={memory.id || memory.title} className="text-secondary">
                  {memory.title}
                  {memory.alwaysOn && <span className="text-muted"> — {t("always")}</span>}
                </li>
              ))}
            </EvidenceGroup>
          )}

          {evidence.skills.length > 0 && (
            <EvidenceGroup icon={<Wrench className="h-3 w-3" />} label={t("skills")}>
              {evidence.skills.map((skill) => (
                <li key={skill.id} className="text-secondary">{skill.name}</li>
              ))}
            </EvidenceGroup>
          )}
        </div>
      )}
    </div>
  );
}

function EvidenceGroup({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="inline-flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted">
        {icon}
        {label}
      </span>
      <ul className="flex flex-col gap-0.5 pl-[18px] list-disc marker:text-muted/50">{children}</ul>
    </div>
  );
}
