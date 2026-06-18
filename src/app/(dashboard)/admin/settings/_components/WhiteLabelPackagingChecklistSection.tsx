"use client";

import { Check, ClipboardCopy, FileText } from "lucide-react";
import { useState } from "react";

type TranslationFn = (key: string) => string;

export type WhiteLabelPackagingChecklist = {
  title: string;
  productName: string;
  readinessPercent: number;
  sections: Array<{
    key: string;
    title: string;
    items: string[];
  }>;
  markdown: string;
};

type WhiteLabelPackagingChecklistSectionProps = {
  checklist?: WhiteLabelPackagingChecklist;
  t: TranslationFn;
};

export function WhiteLabelPackagingChecklistSection({ checklist, t }: WhiteLabelPackagingChecklistSectionProps) {
  const [copied, setCopied] = useState(false);

  if (!checklist) {
    return (
      <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 text-[12px] text-muted">
        {t("packagingChecklist.loading")}
      </div>
    );
  }

  const copyChecklist = async () => {
    await navigator.clipboard.writeText(checklist.markdown);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-9 h-9 rounded-[10px] bg-brand/10 border border-brand/20 flex items-center justify-center flex-shrink-0">
            <FileText className="w-4 h-4 text-brand" />
          </div>
          <div className="flex flex-col gap-1 min-w-0">
            <span className="text-[14px] font-semibold text-foreground break-words">{checklist.title}</span>
            <span className="text-[12px] text-muted">
              {t("packagingChecklist.summary")
                .replace("{productName}", checklist.productName)
                .replace("{readinessPercent}", String(checklist.readinessPercent))}
            </span>
          </div>
        </div>
        <button
          type="button"
          onClick={copyChecklist}
          className="inline-flex items-center justify-center gap-2 rounded-[10px] border border-border-dim bg-card/70 px-3 py-2 text-[12px] font-medium text-foreground hover:bg-hover transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-[#10B981]" /> : <ClipboardCopy className="w-4 h-4" />}
          {copied ? t("packagingChecklist.copied") : t("packagingChecklist.copy")}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {checklist.sections.map((section) => (
          <div key={section.key} className="border border-border-dim rounded-[16px] bg-background/50 p-5 flex flex-col gap-3">
            <span className="text-[10px] uppercase tracking-[0.16em] font-mono text-muted">{section.title}</span>
            <ul className="flex flex-col gap-1.5">
              {section.items.map((item) => (
                <li key={item} className="text-[12px] text-secondary leading-relaxed flex gap-2">
                  <span className="mt-[7px] w-1 h-1 rounded-full bg-brand/70 flex-shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <pre className="max-h-[280px] overflow-auto custom-scrollbar rounded-[16px] border border-border-dim bg-background/70 p-4 text-[11px] leading-relaxed text-secondary whitespace-pre-wrap">
        {checklist.markdown}
      </pre>
    </div>
  );
}
