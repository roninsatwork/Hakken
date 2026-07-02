"use client";

import { Loader2 } from "lucide-react";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";

type CompanySkill = Doc<"companySkills">;

type PaginatedSkillStatus = "LoadingFirstPage" | "CanLoadMore" | "LoadingMore" | "Exhausted";

type CompanySkillCheckboxPickerProps = {
  skills: CompanySkill[];
  selectedSkillIds: Array<Id<"companySkills">>;
  status: PaginatedSkillStatus;
  emptyMessage: string;
  onToggleSkill: (skillId: Id<"companySkills">) => void;
  onLoadMore: () => void;
};

export function CompanySkillCheckboxPicker({
  skills,
  selectedSkillIds,
  status,
  emptyMessage,
  onToggleSkill,
  onLoadMore,
}: CompanySkillCheckboxPickerProps) {
  return (
    <div className="overflow-hidden rounded-[8px] border border-border-dim bg-background/50">
      {status === "LoadingFirstPage" ? (
        <div className="px-4 py-10 text-center">
          <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
        </div>
      ) : skills.length === 0 ? (
        <div className="px-4 py-8 text-center text-[13px] text-secondary">
          {emptyMessage}
        </div>
      ) : (
        <div className="divide-y divide-border-dim">
          {skills.map((skill) => {
            const isSelected = selectedSkillIds.includes(skill._id);
            return (
              <label
                key={skill._id}
                className={`flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors ${
                  isSelected ? "bg-brand/10" : "hover:bg-foreground/5"
                }`}
              >
                <input
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => onToggleSkill(skill._id)}
                  className="mt-1 h-4 w-4 accent-brand"
                />
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="text-[13px] font-semibold text-foreground">{skill.name}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{skill.category}</span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{skill.riskLevel.toLowerCase()} risk</span>
                  </span>
                  <span className="mt-1 block line-clamp-2 text-[12px] text-secondary">{skill.description || "No description provided."}</span>
                </span>
              </label>
            );
          })}
        </div>
      )}
      <AdminLoadMoreFooter
        visibleCount={skills.length}
        canLoadMore={status === "CanLoadMore"}
        isLoading={status === "LoadingMore"}
        onLoadMore={onLoadMore}
      />
    </div>
  );
}
