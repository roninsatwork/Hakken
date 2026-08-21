"use client";

import { BrainCircuit } from "lucide-react";
import { useTranslations } from "next-intl";

type CompanyMemoryEvidenceRow = {
  memoryId: string;
  title: string;
  category: string;
  confidence?: number;
  score?: number;
};

type CompanyMemoryEvidencePayload = {
  memories?: CompanyMemoryEvidenceRow[];
};

type CompanyMemoryEvidenceProps = {
  evidenceJson?: string;
};

function parseEvidence(evidenceJson?: string) {
  if (!evidenceJson) return [];

  try {
    const parsed = JSON.parse(evidenceJson) as CompanyMemoryEvidencePayload;
    return Array.isArray(parsed.memories) ? parsed.memories : [];
  } catch {
    return [];
  }
}

function formatPercent(value?: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

export function CompanyMemoryEvidence({ evidenceJson }: CompanyMemoryEvidenceProps) {
  const t = useTranslations("admin.evidence");
  const memories = parseEvidence(evidenceJson);
  if (memories.length === 0) return null;

  return (
    <div className="mt-2 rounded-[12px] border border-blue-500/20 bg-blue-500/10 px-3 py-2">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-blue-200">
        <BrainCircuit className="h-3.5 w-3.5" />
        {t("companyMemoryUsed")}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        {memories.slice(0, 5).map((memory) => {
          const confidence = formatPercent(memory.confidence);

          return (
            <span
              key={memory.memoryId}
              className="inline-flex max-w-full items-center gap-2 rounded-[8px] border border-blue-500/20 bg-background/50 px-2.5 py-1 text-[11px] text-blue-100"
              title={memory.title}
            >
              <span className="font-mono uppercase tracking-widest text-blue-300">{memory.category}</span>
              <span className="truncate">{memory.title}</span>
              {confidence && <span className="font-mono text-blue-300">{confidence}</span>}
            </span>
          );
        })}
      </div>
    </div>
  );
}
