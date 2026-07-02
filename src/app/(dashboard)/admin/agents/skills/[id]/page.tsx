"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { redirect, useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Archive, BrainCircuit, CheckCircle2, Copy, Download, Lightbulb, Loader2, Save, UploadCloud, Users, Wrench } from "lucide-react";

type SkillStatus = Doc<"agentSkills">["status"];
type SkillRisk = Doc<"agentSkills">["riskLevel"];

type FormData = {
  name: string;
  description: string;
  category: string;
  status: SkillStatus;
  riskLevel: SkillRisk;
  instruction: string;
  requiredToolMappingsJson: string;
  recommendedToolMappingsJson: string;
  recommendedKnowledgeJson: string;
  defaultRulesJson: string;
  suggestedEvalFixturesJson: string;
};

const emptyForm: FormData = {
  name: "",
  description: "",
  category: "GENERAL",
  status: "DRAFT",
  riskLevel: "MEDIUM",
  instruction: "",
  requiredToolMappingsJson: "[]",
  recommendedToolMappingsJson: "[]",
  recommendedKnowledgeJson: "",
  defaultRulesJson: "",
  suggestedEvalFixturesJson: "[]",
};

function formatJson(value: string | undefined, fallback = "") {
  if (!value) return fallback;
  try {
    return JSON.stringify(JSON.parse(value) as unknown, null, 2);
  } catch {
    return value;
  }
}

function inputClassName() {
  return "h-10 rounded-[8px] border border-border-dim bg-card px-3 text-[13px] text-foreground outline-none focus:border-brand/50";
}

function textareaClassName(minHeight = "min-h-28") {
  return `${minHeight} rounded-[8px] border border-border-dim bg-card p-3 text-[12px] text-foreground font-mono leading-relaxed outline-none focus:border-brand/50`;
}

type AgentSkillDetailPageProps = {
  basePath?: string;
};

export function AgentSkillDetail({ basePath = "/admin/ai/skills" }: AgentSkillDetailPageProps) {
  const params = useParams();
  const skillId = params.id as Id<"agentSkills">;
  const detail = useQuery(api.agentSkills.getSkill, { skillId });
  const rolloutBindings = useQuery(api.agentSkills.getBindingsForSkill, { skillId });
  const learningAnalytics = useQuery(api.agentSkills.getSkillLearningAnalytics, { skillId });
  const exportBundle = useQuery(api.agentSkills.exportSkillBundle, { skillId });
  const updateSkill = useMutation(api.agentSkills.updateSkill);
  const cloneSkill = useMutation(api.agentSkills.cloneSkill);
  const archiveSkill = useMutation(api.agentSkills.archiveSkill);
  const upgradeSkillBindings = useMutation(api.agentSkills.upgradeSkillBindingsForSkill);
  const initializedIdRef = useRef<Id<"agentSkills"> | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [isCloning, setIsCloning] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [upgradingId, setUpgradingId] = useState<string | null>(null);
  const [clonedSkillId, setClonedSkillId] = useState<Id<"agentSkills"> | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const outdatedBindings = (rolloutBindings ?? []).filter((row) => row.hasAvailableUpdate);
  const currentBindings = (rolloutBindings ?? []).filter((row) => !row.hasAvailableUpdate);
  const currentValidatedBindings = currentBindings.filter((row) => row.evalCoverage.latestPassedRun);
  const currentNeedsSmokeBindings = currentBindings.filter((row) => !row.evalCoverage.latestPassedRun);

  useEffect(() => {
    if (!detail?.skill || initializedIdRef.current === detail.skill._id) return;
    initializedIdRef.current = detail.skill._id;
    setForm({
      name: detail.skill.name,
      description: detail.skill.description ?? "",
      category: detail.skill.category,
      status: detail.skill.status,
      riskLevel: detail.skill.riskLevel,
      instruction: detail.skill.instruction,
      requiredToolMappingsJson: formatJson(detail.skill.requiredToolMappingsJson, "[]"),
      recommendedToolMappingsJson: formatJson(detail.skill.recommendedToolMappingsJson, "[]"),
      recommendedKnowledgeJson: formatJson(detail.skill.recommendedKnowledgeJson),
      defaultRulesJson: formatJson(detail.skill.defaultRulesJson),
      suggestedEvalFixturesJson: formatJson(detail.skill.suggestedEvalFixturesJson, "[]"),
    });
  }, [detail]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setFeedback(null);
    try {
      await updateSkill({
        skillId,
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        status: form.status,
        riskLevel: form.riskLevel,
        instruction: form.instruction,
        requiredToolMappingsJson: form.requiredToolMappingsJson,
        recommendedToolMappingsJson: form.recommendedToolMappingsJson,
        recommendedKnowledgeJson: form.recommendedKnowledgeJson || undefined,
        defaultRulesJson: form.defaultRulesJson || undefined,
        suggestedEvalFixturesJson: form.suggestedEvalFixturesJson,
      });
      setFeedback({ tone: "success", message: "Skill saved and version snapshot refreshed." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Skill could not be saved." });
    } finally {
      setIsSaving(false);
    }
  };

  const archive = async () => {
    setIsArchiving(true);
    setFeedback(null);
    try {
      await archiveSkill({ skillId });
      setForm((current) => ({ ...current, status: "ARCHIVED" }));
      setFeedback({ tone: "success", message: "Skill archived. Existing historical bindings remain auditable." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Skill could not be archived." });
    } finally {
      setIsArchiving(false);
    }
  };

  const clone = async () => {
    setIsCloning(true);
    setClonedSkillId(null);
    setFeedback(null);
    try {
      const result = await cloneSkill({ skillId });
      setClonedSkillId(result.skillId);
      setFeedback({ tone: "success", message: "Skill cloned as a draft. Review it before attaching agents." });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Skill could not be cloned." });
    } finally {
      setIsCloning(false);
    }
  };

  const downloadBundle = () => {
    if (!exportBundle) return;
    const blob = new Blob([exportBundle.bundleJson], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = exportBundle.filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const upgradeBindings = async (bindingIds?: Id<"agentSkillBindings">[]) => {
    const operationId = bindingIds && bindingIds.length === 1 ? bindingIds[0] : "all";
    setUpgradingId(operationId);
    setFeedback(null);
    try {
      const result = await upgradeSkillBindings({
        skillId,
        ...(bindingIds ? { bindingIds } : {}),
        seedEvalFixtures: true,
      });
      setFeedback({
        tone: "success",
        message: `${result.upgradedCount} agent${result.upgradedCount === 1 ? "" : "s"} updated to the latest skill version.`,
      });
    } catch (error) {
      setFeedback({ tone: "error", message: error instanceof Error ? error.message : "Skill bindings could not be upgraded." });
    } finally {
      setUpgradingId(null);
    }
  };

  if (detail === undefined) {
    return <div className="p-8 text-secondary flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading skill</div>;
  }
  if (detail === null) {
    return <div className="p-8 text-red-400">Skill not found.</div>;
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-5 pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <Link href={basePath} className="text-[12px] text-secondary hover:text-foreground flex items-center gap-1 mb-3">
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to skills
          </Link>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-brand" />
            {detail.skill.name}
          </h1>
          <p className="text-[13px] text-secondary mt-1">Edit the reusable instructions, tool requirements, and starter evals for this skill.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={downloadBundle}
            disabled={!exportBundle}
            className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground disabled:opacity-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          <button
            type="button"
            onClick={clone}
            disabled={isCloning}
            className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {isCloning ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Clone
          </button>
          <button
            type="button"
            onClick={archive}
            disabled={isArchiving || form.status === "ARCHIVED"}
            className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {isArchiving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Archive
          </button>
          <button
            type="submit"
            disabled={isSaving}
            className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save skill
          </button>
        </div>
      </header>

      {feedback && (
        <div className={`rounded-[8px] border p-3 text-[12px] ${
          feedback.tone === "success"
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}>
          {feedback.message}
          {clonedSkillId && (
            <Link href={`${basePath}/${clonedSkillId}`} className="ml-2 font-semibold underline underline-offset-2">
              Open clone
            </Link>
          )}
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Name
              <input className={inputClassName()} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Category
              <input className={inputClassName()} value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Status
              <select className={inputClassName()} value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SkillStatus })}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
                <option value="ARCHIVED">Archived</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Risk
              <select className={inputClassName()} value={form.riskLevel} onChange={(event) => setForm({ ...form, riskLevel: event.target.value as SkillRisk })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Description
            <input className={inputClassName()} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Skill instruction
            <textarea className={textareaClassName("min-h-52")} value={form.instruction} onChange={(event) => setForm({ ...form, instruction: event.target.value })} required />
          </label>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Required tool mappings
              <textarea className={textareaClassName()} value={form.requiredToolMappingsJson} onChange={(event) => setForm({ ...form, requiredToolMappingsJson: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Recommended tool mappings
              <textarea className={textareaClassName()} value={form.recommendedToolMappingsJson} onChange={(event) => setForm({ ...form, recommendedToolMappingsJson: event.target.value })} />
            </label>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Recommended knowledge JSON
              <textarea className={textareaClassName()} value={form.recommendedKnowledgeJson} onChange={(event) => setForm({ ...form, recommendedKnowledgeJson: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Default rules JSON
              <textarea className={textareaClassName()} value={form.defaultRulesJson} onChange={(event) => setForm({ ...form, defaultRulesJson: event.target.value })} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Suggested eval fixtures JSON
            <textarea className={textareaClassName("min-h-48")} value={form.suggestedEvalFixturesJson} onChange={(event) => setForm({ ...form, suggestedEvalFixturesJson: event.target.value })} />
          </label>
        </div>

        <aside className="flex flex-col gap-3">
          <div className="rounded-[8px] border border-border-dim bg-card p-4">
            <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Latest version</div>
            <div className="text-[22px] font-semibold text-foreground mt-1">
              v{detail.latestVersion?.versionNumber ?? 0}
            </div>
            <div className="text-[11px] text-muted break-all mt-2">
              {detail.latestVersion?.snapshotHash ?? "No snapshot yet"}
            </div>
          </div>

          <div className="rounded-[8px] border border-border-dim bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <Users className="w-4 h-4 text-brand" />
                Agent rollout
              </div>
              <span className="text-[11px] font-mono text-muted">
                {outdatedBindings.length} update{outdatedBindings.length === 1 ? "" : "s"}
              </span>
            </div>
            {rolloutBindings === undefined ? (
              <div className="text-[12px] text-secondary flex items-center gap-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Loading bindings
              </div>
            ) : rolloutBindings.length === 0 ? (
              <p className="text-[12px] text-secondary">No agents have this skill attached yet.</p>
            ) : (
              <div className="flex flex-col gap-2">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[8px] border border-border-dim bg-black/10 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Current</div>
                    <div className="text-[16px] font-semibold text-foreground">{currentBindings.length}</div>
                  </div>
                  <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-emerald-300">Validated</div>
                    <div className="text-[16px] font-semibold text-emerald-200">{currentValidatedBindings.length}</div>
                  </div>
                  <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-amber-300">Needs smoke</div>
                    <div className="text-[16px] font-semibold text-amber-200">{currentNeedsSmokeBindings.length}</div>
                  </div>
                </div>
                {outdatedBindings.length > 0 && (
                  <button
                    type="button"
                    onClick={() => upgradeBindings()}
                    disabled={upgradingId !== null}
                    className="h-9 px-3 rounded-[8px] border border-sky-500/20 bg-sky-500/10 text-[12px] font-semibold text-sky-200 hover:bg-sky-500/15 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {upgradingId === "all" ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
                    Update all outdated agents
                  </button>
                )}
                {rolloutBindings.slice(0, 8).map((row) => (
                  <div key={row.binding._id} className="rounded-[8px] border border-border-dim bg-black/10 px-3 py-2 flex flex-col gap-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[12px] font-semibold text-foreground truncate">{row.agent.name}</div>
                        <div className="text-[10px] uppercase tracking-widest font-mono text-muted">
                          {row.agent.isActive ? "active" : "draft"} · current v{row.version?.versionNumber ?? 0} · latest v{row.latestVersion?.versionNumber ?? 0}
                        </div>
                      </div>
                      <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded-md border ${
                        row.hasAvailableUpdate
                          ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                          : row.evalCoverage.latestPassedRun
                            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                          : "border-amber-500/20 bg-amber-500/10 text-amber-300"
                      }`}>
                        {row.hasAvailableUpdate ? "update" : row.evalCoverage.latestPassedRun ? "validated" : "needs smoke"}
                      </span>
                    </div>
                    {!row.hasAvailableUpdate && (
                      <p className={`text-[11px] leading-relaxed ${
                        row.evalCoverage.latestPassedRun ? "text-emerald-300" : "text-amber-300"
                      }`}>
                        {row.evalCoverage.latestPassedRun
                          ? "Current skill version has passing smoke evidence."
                          : row.evalCoverage.latestRun
                            ? "Current skill version needs a passing smoke eval before high-risk activation."
                            : "Current skill version has not been smoke tested on this agent yet."}
                      </p>
                    )}
                    {row.hasAvailableUpdate && (
                      <button
                        type="button"
                        onClick={() => upgradeBindings([row.binding._id])}
                        disabled={upgradingId !== null}
                        className="self-end h-8 px-3 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] text-secondary hover:text-foreground disabled:opacity-50"
                      >
                        {upgradingId === row.binding._id ? "Updating..." : `Update to v${row.latestVersion?.versionNumber ?? 0}`}
                      </button>
                    )}
                  </div>
                ))}
                {rolloutBindings.length > 8 && (
                  <p className="text-[11px] text-muted">{rolloutBindings.length - 8} more bound agents hidden.</p>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[8px] border border-border-dim bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
                <Lightbulb className="w-4 h-4 text-brand" />
                Learning outcomes
              </div>
              {learningAnalytics === undefined && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted" />}
            </div>
            {learningAnalytics === undefined ? (
              <p className="text-[12px] text-secondary">Loading learning signals.</p>
            ) : learningAnalytics.totals.suggestions === 0 && learningAnalytics.totals.memoryCandidates === 0 ? (
              <p className="text-[12px] text-secondary">No skill-attributed suggestions or memory candidates yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-[8px] border border-border-dim bg-black/10 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Open</div>
                    <div className="text-[16px] font-semibold text-foreground">
                      {learningAnalytics.totals.openSuggestions + learningAnalytics.totals.openMemoryCandidates}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-emerald-300">Applied</div>
                    <div className="text-[16px] font-semibold text-emerald-200">
                      {learningAnalytics.totals.appliedSuggestions + learningAnalytics.totals.appliedMemoryCandidates}
                    </div>
                  </div>
                  <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-2 py-2">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-red-300">Rejected</div>
                    <div className="text-[16px] font-semibold text-red-200">
                      {learningAnalytics.totals.rejectedSuggestions + learningAnalytics.totals.rejectedMemoryCandidates}
                    </div>
                  </div>
                </div>
                {learningAnalytics.totals.highRiskOpenItems > 0 && (
                  <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-[12px] text-amber-200">
                    {learningAnalytics.totals.highRiskOpenItems} high-risk learning item{learningAnalytics.totals.highRiskOpenItems === 1 ? " still needs" : "s still need"} review.
                  </div>
                )}
                {learningAnalytics.recentLearning.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Recent learning</div>
                    {learningAnalytics.recentLearning.slice(0, 4).map((item) => (
                      <div key={`${item.kind}:${item.id}`} className="rounded-[8px] border border-border-dim bg-black/10 px-3 py-2 flex flex-col gap-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase tracking-widest font-mono text-muted">{item.kind}</span>
                          <span className="text-[10px] uppercase tracking-widest font-mono text-secondary">{item.status.toLowerCase()}</span>
                          <span className="text-[10px] uppercase tracking-widest font-mono text-secondary">{item.label.toLowerCase()}</span>
                        </div>
                        <div className="text-[12px] font-semibold text-foreground">{item.title}</div>
                        <p className="text-[11px] text-secondary leading-relaxed">{item.summary}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="rounded-[8px] border border-border-dim bg-card p-4 flex flex-col gap-3">
            <div className="flex items-center gap-2 text-[13px] font-semibold text-foreground">
              <Wrench className="w-4 h-4 text-brand" />
              Tool readiness
            </div>
            {detail.readiness.requiredToolMappings.length === 0 ? (
              <p className="text-[12px] text-secondary">No required tools configured.</p>
            ) : (
              <div className="flex flex-col gap-2">
                {detail.readiness.requiredToolMappings.map((mapping) => {
                  const missing = detail.readiness.missingRequiredToolMappings.includes(mapping);
                  return (
                    <div key={mapping} className="flex items-center justify-between gap-3 rounded-[8px] border border-border-dim bg-black/10 px-3 py-2">
                      <span className="text-[11px] font-mono text-secondary break-all">{mapping}</span>
                      <span className={`text-[10px] uppercase tracking-widest font-mono ${missing ? "text-red-400" : "text-emerald-400"}`}>
                        {missing ? "missing" : "ready"}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            {detail.readiness.missingRequiredToolMappings.length === 0 && (
              <div className="flex items-center gap-2 text-[12px] text-emerald-300">
                <CheckCircle2 className="w-4 h-4" />
                Required tools are available.
              </div>
            )}
          </div>
        </aside>
      </section>
    </form>
  );
}

export default function AgentSkillDetailPage() {
  const params = useParams();
  redirect(`/admin/ai/skills/${params.id}`);
}
