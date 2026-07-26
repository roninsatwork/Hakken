"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { BrainCircuit, ExternalLink, Library, Loader2, Plus, Search, Trash2 } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import {
  AdminLoadMoreFooter,
  AdminTableEmptyRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { MAX_SKILLS_PER_AGENT } from "@/convex/utils/skillLimits";

/** One screenful of candidates; "load more" fetches the next. */
const PICKER_PAGE_SIZE = 20;

type BindingRow = {
  binding: Doc<"agentSkillBindings">;
  skill: Doc<"agentSkills">;
  version: Doc<"agentSkillVersions"> | null;
  latestVersion: Doc<"agentSkillVersions"> | null;
  hasAvailableUpdate: boolean;
  readiness: {
    requiredToolMappings: string[];
    recommendedToolMappings: string[];
    missingRequiredToolMappings: string[];
    missingRecommendedToolMappings: string[];
  };
  evalCoverage: {
    activeFixtureCount: number;
    latestRun: {
      runId: Id<"agentRuns">;
      status: Doc<"agentRuns">["status"];
      completedAt?: number;
      startedAt: number;
      isCurrent: boolean;
    } | null;
    latestPassedRun: {
      runId: Id<"agentRuns">;
      completedAt?: number;
      startedAt: number;
      isCurrent: boolean;
    } | null;
  };
};




export default function AgentSkillsPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const bindings = useQuery(api.agentSkills.getForAgent, { agentId });
  const bindSkill = useMutation(api.agentSkills.bindSkillToAgent);
  const unbindSkill = useMutation(api.agentSkills.unbindSkillFromAgent);
  const [skillSearchTerm, setSkillSearchTerm] = useState("");
  const [selectedSkillIds, setSelectedSkillIds] = useState<Array<Id<"agentSkills">>>([]);

  const toggleSkillSelection = (skillId: Id<"agentSkills">) => {
    setSelectedSkillIds((current) =>
      current.includes(skillId) ? current.filter((entry) => entry !== skillId) : [...current, skillId],
    );
  };
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<BindingRow | null>(null);
  const action = useAdminAction({ scope: "admin-agent-skills" });

  // Already-attached skills are excluded by the server, so the picker cannot
  // offer one twice. Memoised because this array is a query argument: rebuilt
  // every render it would resubscribe on every keystroke.
  const attachedSkillIds = useMemo(
    () => (bindings ?? []).map((row) => row.skill._id),
    [bindings]
  );

  // Searched and paged in the database rather than fetched and filtered here.
  // The old picker read the first 250 active skills and filtered them in the
  // browser, so past 250 a skill could not be attached and nothing said so.
  const {
    results: pickerSkills,
    status: pickerStatus,
    loadMore: loadMoreSkills,
  } = usePaginatedQuery(
    api.agentSkills.searchActiveSkills,
    {
      ...(skillSearchTerm.trim() ? { searchTerm: skillSearchTerm.trim() } : {}),
      excludeSkillIds: attachedSkillIds,
    },
    { initialNumItems: PICKER_PAGE_SIZE }
  );
  const isPickerLoading = pickerStatus === "LoadingFirstPage";
  const canLoadMoreSkills = pickerStatus === "CanLoadMore";
  const isLoadingMoreSkills = pickerStatus === "LoadingMore";
  // The picker loads inside its own modal, so the page no longer waits on the
  // whole skill catalogue before it can render the agent's own skills.
  const isLoading = bindings === undefined;

  const attachSelected = async () => {
    if (selectedSkillIds.length === 0) return;
    const outcome = await action.run(
      async () => {
        // The reader ticked a set and expects the set to arrive.
        for (const skillId of selectedSkillIds) {
          await bindSkill({ agentId, skillId, seedEvalFixtures: true });
        }
        return selectedSkillIds.length;
      },
      { fallbackMessage: "The skills could not be added." },
    );
    if (!outcome.ok) return;
    setSelectedSkillIds([]);
    setSkillSearchTerm("");
    setIsPickerOpen(false);
  };



  const confirmRemove = async () => {
    if (!removeTarget) return;
    const outcome = await action.run(() => unbindSkill({ bindingId: removeTarget.binding._id }), {
      key: removeTarget.binding._id,
      successMessage: "Skill detached from this agent.",
      fallbackMessage: "Skill update failed.",
    });
    if (!outcome.ok) return;
    setRemoveTarget(null);
  };

  if (isLoading) {
    return (
      <div className="p-8 text-secondary flex items-center gap-2">
        <Loader2 className="w-4 h-4 animate-spin" />
        Loading skills
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-brand" />
            Agent skills
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Skills from the Skill Center that this agent uses. Two at most — each one is added to
            every message the agent sends.
          </p>
        </div>
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/admin/ai/skills"
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim bg-card px-3 text-[12px] font-semibold text-secondary transition-colors hover:text-foreground"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              Skill Center
            </Link>
            <button
              type="button"
              disabled={bindings.length >= MAX_SKILLS_PER_AGENT}
              onClick={() => {
                setIsPickerOpen(true);
                setSelectedSkillIds([]);
                setSkillSearchTerm("");
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[12px] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              <Library className="h-3.5 w-3.5" />
              Add from Skill Center
            </button>
          </div>
        </div>

      </header>


      <AdminTableShell
        minWidthClassName="min-w-[640px]"
        footer={
          <AdminLoadMoreFooter
            visibleCount={bindings.length}
            canLoadMore={false}
            isLoading={false}
            onLoadMore={() => undefined}
            labels={{
              empty: "No skills yet",
              showing: (count) => `Showing ${count} skill${count === 1 ? "" : "s"}`,
            }}
          />
        }
      >
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Skill</th>
            <th className="px-4 py-3 font-medium w-[190px]">Added</th>
            <th className="px-4 py-3 font-medium w-[90px] text-right"></th>
          </tr>
        </thead>
        <tbody>
          {bindings.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={3}
              icon={<BrainCircuit className="h-8 w-8 text-muted/30" />}
              label="No skills yet — add one from the Skill Center"
            />
          ) : bindings.map((row) => (
            <tr key={row.binding._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
              <td className="px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{row.skill.name}</div>
                <div className="text-[12px] text-secondary line-clamp-1 max-w-[520px]">
                  {row.skill.description || "No description."}
                </div>
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">{formatDateTime(row.binding.assignedAt)}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  aria-label={`Remove ${row.skill.name}`}
                  onClick={() => setRemoveTarget(row)}
                  className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>

      <SonaeModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} title="Add skills" size="lg">
        {/* The same tick-list the company screen uses. It replaced a two-pane
            browser that made the reader pick one skill, read a preview of its
            instructions, attach it, and start again for the next. */}
        <div className="flex flex-col gap-4">
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={skillSearchTerm}
              onChange={(event) => setSkillSearchTerm(event.target.value)}
              placeholder="Search skills"
              className="h-10 w-full rounded-[8px] border border-border-dim bg-background/50 pl-9 pr-3 text-[13px] text-foreground outline-none focus:border-brand/50"
            />
          </label>

          {isPickerLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
          ) : pickerSkills.length === 0 ? (
            <p className="px-1 py-8 text-center text-[13px] text-muted">
              {skillSearchTerm.trim()
                ? "No skills match that search."
                : "Every skill in the Skill Center is already attached to this agent."}
            </p>
          ) : (
            <div className="max-h-[380px] divide-y divide-border-dim overflow-y-auto rounded-[8px] border border-border-dim bg-background/50">
              {pickerSkills.map((skill) => (
                <label key={skill._id} className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03]">
                  <input
                    type="checkbox"
                    checked={selectedSkillIds.includes(skill._id)}
                    onChange={() => toggleSkillSelection(skill._id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold text-foreground">{skill.name}</span>
                    <span className="block text-[12px] text-secondary line-clamp-1">
                      {skill.description || "No description."}
                    </span>
                  </span>
                </label>
              ))}
              {canLoadMoreSkills && (
                <button
                  type="button"
                  onClick={() => loadMoreSkills(PICKER_PAGE_SIZE)}
                  disabled={isLoadingMoreSkills}
                  className="w-full px-4 py-3 text-[12px] font-semibold text-secondary hover:bg-foreground/[0.03] hover:text-foreground disabled:opacity-50"
                >
                  Show more skills
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsPickerOpen(false)} className="h-10 rounded-[8px] border border-border-dim px-4 text-[13px] text-secondary hover:text-foreground">
              Cancel
            </button>
            <button
              type="button"
              onClick={attachSelected}
              disabled={selectedSkillIds.length === 0 || action.isBusy()}
              className="flex h-10 items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              {selectedSkillIds.length > 1 ? `Add ${selectedSkillIds.length} skills` : "Add skill"}
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={!!removeTarget} onClose={() => setRemoveTarget(null)} title="Remove skill" size="sm">
        <div className="flex flex-col gap-5 px-1 pb-2 text-[13px] text-secondary">
          <p>
            Remove {removeTarget?.skill.name} from this agent? Historical versions and run evidence remain available.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setRemoveTarget(null)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] hover:text-foreground">
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmRemove}
              disabled={!!removeTarget && action.isBusy(removeTarget.binding._id)}
              className="h-9 px-4 rounded-[8px] bg-red-500 text-white text-[12px] font-medium disabled:opacity-50"
            >
              Remove skill
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
