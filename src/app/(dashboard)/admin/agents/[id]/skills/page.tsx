"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AlertTriangle, BrainCircuit, CheckCircle2, Loader2, Plus, ShieldCheck, Trash2 } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

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
  const skills = useQuery(api.agentSkills.getActiveSkills);
  const bindSkill = useMutation(api.agentSkills.bindSkillToAgent);
  const upgradeSkillBinding = useMutation(api.agentSkills.upgradeSkillBindingToLatest);
  const setBindingEnabled = useMutation(api.agentSkills.setBindingEnabled);
  const unbindSkill = useMutation(api.agentSkills.unbindSkillFromAgent);
  const [seedEvalFixtures, setSeedEvalFixtures] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<BindingRow | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);

  const attachedSkillIds = useMemo(
    () => new Set((bindings ?? []).map((row) => row.skill._id)),
    [bindings]
  );
  const availableSkills = (skills ?? []).filter((skill) => !attachedSkillIds.has(skill._id));
  const isLoading = bindings === undefined || skills === undefined;

  const runMutation = async (id: string, action: () => Promise<unknown>, successMessage: string) => {
    setBusyId(id);
    setFeedback(null);
    try {
      await action();
      setFeedback({ tone: "success", message: successMessage });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Skill update failed." });
    } finally {
      setBusyId(null);
    }
  };

  const attach = async (skillId: Id<"agentSkills">) => {
    await runMutation(
      skillId,
      () => bindSkill({ agentId, skillId, seedEvalFixtures }),
      "Skill attached. The next agent version will include its current snapshot."
    );
  };

  const toggle = async (binding: Doc<"agentSkillBindings">) => {
    await runMutation(
      binding._id,
      () => setBindingEnabled({ bindingId: binding._id, isEnabled: !binding.isEnabled }),
      binding.isEnabled ? "Skill disabled for this agent." : "Skill enabled for this agent."
    );
  };

  const upgrade = async (binding: Doc<"agentSkillBindings">, latestVersionNumber: number | undefined) => {
    await runMutation(
      `upgrade:${binding._id}`,
      () => upgradeSkillBinding({ bindingId: binding._id, seedEvalFixtures }),
      `Skill upgraded${latestVersionNumber ? ` to v${latestVersionNumber}` : ""}. Run the skill smoke eval before activating high-risk changes.`
    );
  };

  const confirmRemove = async () => {
    if (!removeTarget) return;
    await runMutation(
      removeTarget.binding._id,
      () => unbindSkill({ bindingId: removeTarget.binding._id }),
      "Skill detached from this agent."
    );
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
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-brand" />
            Agent skills
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Attach reusable capability packages to this agent. Enabled skills are inserted into the runtime system prompt and snapshotted into releases.
          </p>
        </div>
        <label className="flex items-center gap-2 rounded-[8px] border border-border-dim bg-card px-3 py-2 text-[12px] text-secondary">
          <input
            type="checkbox"
            checked={seedEvalFixtures}
            onChange={(event) => setSeedEvalFixtures(event.target.checked)}
            className="h-4 w-4 rounded border-border-dim accent-brand"
          />
          Seed suggested evals on attach
        </label>
      </header>

      {feedback && (
        <div className={`rounded-[8px] border p-3 text-[12px] ${
          feedback.tone === "success"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}>
          {feedback.message}
        </div>
      )}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-foreground">Attached skills</h2>
          <span className="text-[11px] font-mono text-muted">{bindings.length} attached</span>
        </div>
        {bindings.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border-dim p-8 text-center text-[13px] text-secondary">
            This agent does not have skills attached yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {bindings.map((row) => {
              const missingRequiredCount = row.readiness.missingRequiredToolMappings.length;
              return (
                <article key={row.binding._id} className="rounded-[8px] border border-border-dim bg-card p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-[15px] font-semibold text-foreground truncate">{row.skill.name}</h3>
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${riskTone(row.skill.riskLevel)}`}>
                          {row.skill.riskLevel.toLowerCase()} risk
                        </span>
                      </div>
                      <p className="text-[12px] text-secondary mt-1 line-clamp-2">{row.skill.description || "No description provided."}</p>
                    </div>
                    <span className="text-[11px] font-mono text-muted shrink-0">v{row.version?.versionNumber ?? 0}</span>
                  </div>

                  {row.hasAvailableUpdate && row.latestVersion && (
                    <div className="rounded-[8px] border border-sky-500/20 bg-sky-500/10 p-3 text-[12px] text-sky-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                      <span>
                        New skill version available: v{row.latestVersion.versionNumber}. Review and upgrade this agent when ready.
                      </span>
                      <button
                        type="button"
                        onClick={() => upgrade(row.binding, row.latestVersion?.versionNumber)}
                        disabled={busyId === `upgrade:${row.binding._id}`}
                        className="h-8 px-3 rounded-[8px] border border-sky-400/30 bg-sky-400/10 text-[11px] font-semibold text-sky-100 hover:bg-sky-400/15 disabled:opacity-50 shrink-0"
                      >
                        {busyId === `upgrade:${row.binding._id}` ? "Updating..." : `Update to v${row.latestVersion.versionNumber}`}
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

                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => toggle(row.binding)}
                      disabled={busyId === row.binding._id}
                      className="h-9 px-3 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground disabled:opacity-50"
                    >
                      {busyId === row.binding._id ? "Saving..." : row.binding.isEnabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setRemoveTarget(row)}
                      disabled={busyId === row.binding._id}
                      className="h-9 px-3 rounded-[8px] border border-red-500/20 text-[12px] text-red-300 hover:bg-red-500/10 disabled:opacity-50 flex items-center gap-2"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[14px] font-semibold text-foreground">Available active skills</h2>
          <span className="text-[11px] font-mono text-muted">{availableSkills.length} available</span>
        </div>
        {availableSkills.length === 0 ? (
          <div className="rounded-[8px] border border-dashed border-border-dim p-8 text-center text-[13px] text-secondary">
            No unattached active skills are available.
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {availableSkills.map((skill) => (
              <article key={skill._id} className="rounded-[8px] border border-border-dim bg-card p-4 flex flex-col gap-3">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[15px] font-semibold text-foreground truncate">{skill.name}</h3>
                      <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{skill.category}</span>
                    </div>
                    <p className="text-[12px] text-secondary mt-1 line-clamp-2">{skill.description || "No description provided."}</p>
                  </div>
                  <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => attach(skill._id)}
                    disabled={busyId === skill._id}
                    className="h-9 px-3 rounded-[8px] bg-brand text-white text-[12px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
                  >
                    {busyId === skill._id ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                    Attach
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

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
              disabled={!!removeTarget && busyId === removeTarget.binding._id}
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
