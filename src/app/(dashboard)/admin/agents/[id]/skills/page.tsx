"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AlertTriangle, BrainCircuit, CheckCircle2, ExternalLink, Library, Loader2, Plus, Search, ShieldCheck, Trash2 } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type SkillRisk = Doc<"agentSkills">["riskLevel"];

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

function riskTone(risk: Doc<"agentSkills">["riskLevel"]) {
  if (risk === "HIGH") return "border-red-500/20 bg-red-500/10 text-red-400";
  if (risk === "MEDIUM") return "border-amber-500/20 bg-amber-500/10 text-amber-400";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
}

function readinessTone(row: BindingRow) {
  return row.readiness.missingRequiredToolMappings.length === 0
    ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
    : "border-red-500/20 bg-red-500/10 text-red-300";
}

function evalCoverageTone(row: BindingRow) {
  if (row.evalCoverage.latestPassedRun) return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (row.evalCoverage.latestRun?.status === "SUCCESS" && row.evalCoverage.latestRun.isCurrent === false) {
    return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  }
  if (row.evalCoverage.activeFixtureCount > 0) return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-red-500/20 bg-red-500/10 text-red-300";
}

export default function AgentSkillsPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const bindings = useQuery(api.agentSkills.getForAgent, { agentId });
  const bindSkill = useMutation(api.agentSkills.bindSkillToAgent);
  const upgradeSkillBinding = useMutation(api.agentSkills.upgradeSkillBindingToLatest);
  const setBindingEnabled = useMutation(api.agentSkills.setBindingEnabled);
  const unbindSkill = useMutation(api.agentSkills.unbindSkillFromAgent);
  const [seedEvalFixtures, setSeedEvalFixtures] = useState(true);
  const [skillSearchTerm, setSkillSearchTerm] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [riskFilter, setRiskFilter] = useState<SkillRisk | "">("");
  const [selectedSkillId, setSelectedSkillId] = useState<Id<"agentSkills"> | null>(null);
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
      ...(categoryFilter ? { category: categoryFilter } : {}),
      ...(riskFilter ? { riskLevel: riskFilter } : {}),
      excludeSkillIds: attachedSkillIds,
    },
    { initialNumItems: PICKER_PAGE_SIZE }
  );
  const isPickerLoading = pickerStatus === "LoadingFirstPage";
  const canLoadMoreSkills = pickerStatus === "CanLoadMore";
  const isLoadingMoreSkills = pickerStatus === "LoadingMore";
  const hasFilters = Boolean(skillSearchTerm.trim() || categoryFilter || riskFilter);
  const selectedSkill = pickerSkills.find((skill) => skill._id === selectedSkillId) ?? pickerSkills[0] ?? null;
  const updateCount = (bindings ?? []).filter((row) => row.hasAvailableUpdate).length;
  const toolGapCount = (bindings ?? []).filter((row) => row.readiness.missingRequiredToolMappings.length > 0).length;
  const smokeGapCount = (bindings ?? []).filter((row) => !row.evalCoverage.latestPassedRun).length;
  // The picker loads inside its own modal, so the page no longer waits on the
  // whole skill catalogue before it can render the agent's own skills.
  const isLoading = bindings === undefined;

  const attach = async (skillId: Id<"agentSkills">) => {
    const outcome = await action.run(() => bindSkill({ agentId, skillId, seedEvalFixtures }), {
      key: skillId,
      successMessage: "Skill attached. The next agent version will include its current snapshot.",
      fallbackMessage: "Skill update failed.",
    });
    if (!outcome.ok) return;
    setSelectedSkillId(null);
    setSkillSearchTerm("");
    setIsPickerOpen(false);
  };

  const toggle = async (binding: Doc<"agentSkillBindings">) => {
    await action.run(() => setBindingEnabled({ bindingId: binding._id, isEnabled: !binding.isEnabled }), {
      key: binding._id,
      successMessage: binding.isEnabled ? "Skill disabled for this agent." : "Skill enabled for this agent.",
      fallbackMessage: "Skill update failed.",
    });
  };

  const upgrade = async (binding: Doc<"agentSkillBindings">, latestVersionNumber: number | undefined) => {
    await action.run(() => upgradeSkillBinding({ bindingId: binding._id, seedEvalFixtures }), {
      key: `upgrade:${binding._id}`,
      successMessage: `Skill upgraded${latestVersionNumber ? ` to v${latestVersionNumber}` : ""}. Run the skill smoke eval before activating high-risk changes.`,
      fallbackMessage: "Skill update failed.",
    });
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
            Attach reusable capability packages to this agent. Enabled skills are inserted into the runtime system prompt and snapshotted into releases.
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
              onClick={() => {
                setIsPickerOpen(true);
                setSelectedSkillId(null);
                setSkillSearchTerm("");
              }}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[12px] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              <Library className="h-3.5 w-3.5" />
              Add from Skill Center
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[
            { label: "Attached", value: bindings.length },
            // "Available" used to live here, counted from a fetch of the first
            // 250 active skills — so past 250 it was simply wrong. An honest
            // total needs the maintained catalogue count (plan item A3); until
            // then the picker itself is the place that answers "what else is
            // there", and it answers by searching rather than by counting.
            { label: "Updates", value: updateCount },
            { label: "Tool gaps", value: toolGapCount },
            { label: "Smoke gaps", value: smokeGapCount },
          ].map((metric) => (
            <div key={metric.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted">{metric.label}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">{metric.value.toLocaleString()}</div>
            </div>
          ))}
        </div>
      </header>


      <section className="overflow-hidden rounded-[8px] border border-border-dim bg-sidebar/30">
        <div className="flex flex-col gap-3 border-b border-border-dim px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Attached Skill Catalog</h2>
            <p className="mt-0.5 text-[12px] text-secondary">Attach active Skill Center capabilities to this agent and review rollout readiness.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-[8px] border border-border-dim bg-background/50 px-3 text-[12px] text-secondary">
              <input
                type="checkbox"
                checked={seedEvalFixtures}
                onChange={(event) => setSeedEvalFixtures(event.target.checked)}
                className="h-4 w-4 rounded border-border-dim accent-brand"
              />
              Seed evals
            </label>
          </div>
        </div>
        {bindings.length === 0 ? (
          <div className="flex flex-col items-center gap-3 px-4 py-12 text-center text-[13px] text-secondary">
            <p>This agent does not have skills attached yet.</p>
            <button
              type="button"
              onClick={() => setIsPickerOpen(true)}
              className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[12px] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              <Library className="h-3.5 w-3.5" />
              Add from Skill Center
            </button>
          </div>
        ) : (
          <div className="divide-y divide-border-dim">
            {bindings.map((row) => {
              const missingRequiredCount = row.readiness.missingRequiredToolMappings.length;
              return (
                <article key={row.binding._id} className="flex flex-col gap-3 px-4 py-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-foreground truncate">{row.skill.name}</h3>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${riskTone(row.skill.riskLevel)}`}>
                          {row.skill.riskLevel.toLowerCase()} risk
                        </span>
                      </div>
                      <p className="text-[12px] text-secondary mt-1 line-clamp-2">{row.skill.description || "No description provided."}</p>
                      <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-muted">
                        <span>v{row.version?.versionNumber ?? 0}</span>
                        <span>{row.binding.isEnabled ? "enabled" : "disabled"}</span>
                        <span>{row.readiness.requiredToolMappings.length} required tool{row.readiness.requiredToolMappings.length === 1 ? "" : "s"}</span>
                        <span>{row.evalCoverage.activeFixtureCount} fixture{row.evalCoverage.activeFixtureCount === 1 ? "" : "s"}</span>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => toggle(row.binding)}
                        disabled={action.isBusy(row.binding._id)}
                        className="h-8 rounded-[8px] border border-border-dim px-3 text-[12px] text-secondary hover:text-foreground disabled:opacity-50"
                      >
                        {action.isBusy(row.binding._id) ? "Saving..." : row.binding.isEnabled ? "Disable" : "Enable"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setRemoveTarget(row)}
                        disabled={action.isBusy(row.binding._id)}
                        className="flex h-8 items-center gap-2 rounded-[8px] border border-red-500/20 px-3 text-[12px] text-red-300 hover:bg-red-500/10 disabled:opacity-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Remove
                      </button>
                    </div>
                  </div>

                  {row.hasAvailableUpdate && row.latestVersion && (
                    <div className="rounded-[8px] border border-sky-500/20 bg-sky-500/10 p-3 text-[12px] text-sky-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <span>
                        New skill version available: v{row.latestVersion.versionNumber}. Review and upgrade this agent when ready.
                      </span>
                      <button
                        type="button"
                        onClick={() => upgrade(row.binding, row.latestVersion?.versionNumber)}
                        disabled={action.isBusy(`upgrade:${row.binding._id}`)}
                        className="h-8 px-3 rounded-[8px] border border-sky-400/30 bg-sky-400/10 text-[11px] font-semibold text-sky-100 hover:bg-sky-400/15 disabled:opacity-50 shrink-0"
                      >
                        {action.isBusy(`upgrade:${row.binding._id}`) ? "Updating..." : `Update to v${row.latestVersion.versionNumber}`}
                      </button>
                    </div>
                  )}

                  <div className={`rounded-[8px] border p-3 text-[12px] flex items-center gap-2 ${readinessTone(row)}`}>
                    {missingRequiredCount === 0 ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>
                      {missingRequiredCount === 0
                        ? "Required tools are ready."
                        : `${missingRequiredCount} required tool mapping(s) are missing.`}
                    </span>
                  </div>

                  <div className={`rounded-[8px] border p-3 text-[12px] flex items-center gap-2 ${evalCoverageTone(row)}`}>
                    {row.evalCoverage.latestPassedRun ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertTriangle className="w-4 h-4 shrink-0" />}
                    <span>
                      {row.evalCoverage.latestPassedRun
                        ? `${row.evalCoverage.activeFixtureCount} skill fixture(s), recent smoke passed.`
                        : row.evalCoverage.latestRun?.status === "SUCCESS" && row.evalCoverage.latestRun.isCurrent === false
                          ? `${row.evalCoverage.activeFixtureCount} skill fixture(s), smoke evidence is stale.`
                        : row.evalCoverage.activeFixtureCount > 0
                          ? `${row.evalCoverage.activeFixtureCount} skill fixture(s), no passing smoke yet.`
                          : "No active skill eval fixtures have been seeded yet."}
                    </span>
                  </div>

                  {row.readiness.requiredToolMappings.length > 0 && (
                    <div className="flex flex-wrap gap-2">
                      {row.readiness.requiredToolMappings.map((mapping) => {
                        const missing = row.readiness.missingRequiredToolMappings.includes(mapping);
                        return (
                          <span
                            key={mapping}
                            className={`text-[10px] font-mono px-2 py-1 rounded-md border ${
                              missing
                                ? "border-red-500/20 bg-red-500/10 text-red-300"
                                : "border-border-dim bg-foreground/5 text-secondary"
                            }`}
                          >
                            {mapping}
                          </span>
                        );
                      })}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <SonaeModal isOpen={isPickerOpen} onClose={() => setIsPickerOpen(false)} title="Add From Skill Center" size="lg">
        <div className="flex flex-col gap-5">
          <p className="text-[13px] leading-relaxed text-secondary">
            Select an approved active Skill Center capability for this agent. Draft and archived skills stay out of this picker.
          </p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="overflow-hidden rounded-[8px] border border-border-dim bg-background/50">
              <div className="p-3 border-b border-border-dim flex flex-col gap-2">
                <label className="relative block">
                  <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
                  <input
                    value={skillSearchTerm}
                    onChange={(event) => {
                      setSkillSearchTerm(event.target.value);
                      setSelectedSkillId(null);
                    }}
                    placeholder="Search skills by name"
                    className="w-full h-10 pl-9 pr-3 rounded-[8px] border border-border-dim bg-black/15 text-[13px] text-foreground outline-none focus:border-brand/50"
                  />
                </label>
                {/* Filters, because search alone is not enough in a large
                    library: when most skills share a word, searching it returns
                    a page ranked by relevance and the one wanted may not be on
                    it. Both filters narrow in the database. */}
                <div className="grid grid-cols-2 gap-2">
                  <label className="sr-only" htmlFor="skill-picker-category">Category</label>
                  <input
                    id="skill-picker-category"
                    value={categoryFilter}
                    onChange={(event) => {
                      setCategoryFilter(event.target.value);
                      setSelectedSkillId(null);
                    }}
                    placeholder="Any category"
                    className="h-9 px-3 rounded-[8px] border border-border-dim bg-black/15 text-[12px] text-foreground outline-none focus:border-brand/50"
                  />
                  <label className="sr-only" htmlFor="skill-picker-risk">Risk</label>
                  <select
                    id="skill-picker-risk"
                    value={riskFilter}
                    onChange={(event) => {
                      setRiskFilter(event.target.value as SkillRisk | "");
                      setSelectedSkillId(null);
                    }}
                    className="h-9 px-3 rounded-[8px] border border-border-dim bg-black/15 text-[12px] text-foreground outline-none focus:border-brand/50"
                  >
                    <option value="">Any risk</option>
                    <option value="LOW">Low risk</option>
                    <option value="MEDIUM">Medium risk</option>
                    <option value="HIGH">High risk</option>
                  </select>
                </div>
              </div>
              {isPickerLoading ? (
                <div className="flex items-center justify-center gap-2 px-4 py-10 text-[13px] text-secondary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Loading skills
                </div>
              ) : pickerSkills.length === 0 ? (
                <div className="flex flex-col items-center gap-3 px-4 py-10 text-center text-[13px] text-secondary">
                  <p>
                    {hasFilters
                      ? "No skills match. Try a different search or clear the filters."
                      : "Every active skill is already attached to this agent."}
                  </p>
                  <Link
                    href="/admin/ai/skills"
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-[8px] border border-border-dim bg-card px-3 text-[12px] font-semibold text-foreground transition-colors hover:border-brand/40 hover:text-brand"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    Open Skill Center
                  </Link>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-border-dim">
                  {pickerSkills.map((skill) => {
                    const isSelected = selectedSkill?._id === skill._id;
                    return (
                      <button
                        key={skill._id}
                        type="button"
                        onClick={() => setSelectedSkillId(skill._id)}
                        className={`w-full text-left px-4 py-3 flex items-start justify-between gap-4 transition-colors ${
                          isSelected ? "bg-brand/10" : "hover:bg-hover"
                        }`}
                      >
                        <span className="min-w-0">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-[13px] font-semibold text-foreground truncate">{skill.name}</span>
                            <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{skill.category}</span>
                          </span>
                          <span className="block text-[12px] text-secondary mt-1 line-clamp-2">{skill.description || "No description provided."}</span>
                        </span>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border shrink-0 ${riskTone(skill.riskLevel)}`}>
                          {skill.riskLevel.toLowerCase()}
                        </span>
                      </button>
                    );
                  })}
                  {canLoadMoreSkills && (
                    <button
                      type="button"
                      onClick={() => loadMoreSkills(PICKER_PAGE_SIZE)}
                      disabled={isLoadingMoreSkills}
                      className="w-full px-4 py-3 text-[12px] font-semibold text-secondary hover:text-foreground hover:bg-hover disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                      {isLoadingMoreSkills && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                      Show more skills
                    </button>
                  )}
                </div>
              )}
            </div>

            <aside className="rounded-[8px] border border-border-dim bg-background/50 p-4 min-h-[260px]">
              {selectedSkill ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="text-[16px] font-semibold text-foreground truncate">{selectedSkill.name}</h3>
                      <p className="text-[12px] text-secondary mt-1">{selectedSkill.description || "No description provided."}</p>
                    </div>
                    <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-foreground/5 text-secondary">
                      {selectedSkill.category}
                    </span>
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${riskTone(selectedSkill.riskLevel)}`}>
                      {selectedSkill.riskLevel.toLowerCase()} risk
                    </span>
                  </div>
                  <div className="rounded-[8px] border border-border-dim bg-black/15 p-3">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Instruction preview</div>
                    <p className="mt-2 text-[12px] leading-relaxed text-secondary line-clamp-6">
                      {selectedSkill.instruction}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => attach(selectedSkill._id)}
                    disabled={action.isBusy(selectedSkill._id)}
                    className="h-10 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {action.isBusy(selectedSkill._id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Attach selected skill
                  </button>
                </div>
              ) : (
                <div className="h-full min-h-[220px] flex items-center justify-center text-center text-[13px] text-secondary">
                  Select an active skill to preview its instructions before attaching it.
                </div>
              )}
            </aside>
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
