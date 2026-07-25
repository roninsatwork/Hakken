"use client";

import {useState} from "react";
import Link from "next/link";
import { redirect, useParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useToast } from "@/src/context/ToastContext";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Archive, BrainCircuit, CheckCircle2, Copy, Download, Lightbulb, Loader2, UploadCloud, Users, Wrench } from "lucide-react";
import { formatDateTime } from "@/src/lib/dates";

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

/**
 * How many examples came with the skill.
 *
 * Counted rather than rendered: the fixtures are a JSON array written for the
 * eval runner, and putting that array on screen is what this page used to do.
 */
function countExamples(value: string | undefined) {
  if (!value) return 0;
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.length : 0;
  } catch {
    return 0;
  }
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
  const [initializedId, setInitializedId] = useState<Id<"agentSkills"> | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  // One key per page-level action so the three header buttons spin independently.
  const STATUS_KEY = "status";
  const exampleCount = countExamples(detail?.skill.suggestedEvalFixturesJson);
  const CLONE_KEY = "clone";
  const ARCHIVE_KEY = "archive";
  const action = useAdminAction({ scope: "admin-agent-skill" });
  const { showToast } = useToast();
  const [clonedSkillId, setClonedSkillId] = useState<Id<"agentSkills"> | null>(null);
  const outdatedBindings = (rolloutBindings ?? []).filter((row) => row.hasAvailableUpdate);
  const currentBindings = (rolloutBindings ?? []).filter((row) => !row.hasAvailableUpdate);
  const currentValidatedBindings = currentBindings.filter((row) => row.evalCoverage.latestPassedRun);
  const currentNeedsSmokeBindings = currentBindings.filter((row) => !row.evalCoverage.latestPassedRun);

  // Seeding the form during render rather than in an effect: React re-runs this
  // component before committing, so the fields are populated in the same paint.
  // In an effect the user sees an empty form first and then it fills in.
  if (detail?.skill && initializedId !== detail.skill._id) {
    setInitializedId(detail.skill._id);
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
  }

  const setStatus = async (status: SkillStatus) => {
    await action.run(() => updateSkill({ skillId, status }), {
      key: STATUS_KEY,
      successMessage: status === "ACTIVE"
        ? "Skill published. It can now be attached to agents."
        : "Skill returned to draft. Agents already using it keep the version they have.",
      fallbackMessage: "The skill status could not be changed.",
    });
  };

  const archive = async () => {
    const outcome = await action.run(() => archiveSkill({ skillId }), {
      key: ARCHIVE_KEY,
      successMessage: "Skill archived. Existing historical bindings remain auditable.",
      fallbackMessage: "Skill could not be archived.",
    });
    // The local status only moves once the server has accepted the change.
    if (outcome.ok) setForm((current) => ({ ...current, status: "ARCHIVED" }));
  };

  const clone = async () => {
    setClonedSkillId(null);
    const outcome = await action.run(() => cloneSkill({ skillId }), {
      key: CLONE_KEY,
      successMessage: "Skill cloned as a draft. Review it before attaching agents.",
      fallbackMessage: "Skill could not be cloned.",
    });
    if (outcome.ok) setClonedSkillId(outcome.data.skillId);
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
    const outcome = await action.run(
      () => upgradeSkillBindings({ skillId, ...(bindingIds ? { bindingIds } : {}), seedEvalFixtures: true }),
      { key: operationId, fallbackMessage: "Skill bindings could not be upgraded." },
    );
    if (!outcome.ok) return;
    const { upgradedCount } = outcome.data;
    showToast(`${upgradedCount} agent${upgradedCount === 1 ? "" : "s"} updated to the latest skill version.`, "success");
  };

  if (detail === undefined) {
    return <div className="p-8 text-secondary flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Loading skill</div>;
  }
  if (detail === null) {
    return <div className="p-8 text-red-400">Skill not found.</div>;
  }

  return (
    <div className="flex flex-col gap-5 pb-12">
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
          <p className="text-[13px] text-secondary mt-1">What this skill tells an agent to do, and which agents are using it.</p>
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
            disabled={action.isBusy(CLONE_KEY)}
            className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {action.isBusy(CLONE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Copy className="w-4 h-4" />}
            Clone
          </button>
          <button
            type="button"
            onClick={archive}
            disabled={action.isBusy(ARCHIVE_KEY) || form.status === "ARCHIVED"}
            className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground disabled:opacity-50 flex items-center gap-2"
          >
            {action.isBusy(ARCHIVE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Archive className="w-4 h-4" />}
            Archive
          </button>
          {/* The file is the source of truth, so the primary action is
              replacing it rather than editing a copy of its contents here. */}
          <Link
            href={`${basePath}?import=1`}
            className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 flex items-center gap-2"
          >
            <UploadCloud className="w-4 h-4" />
            Upload new version
          </Link>
        </div>
      </header>


      {/* The clone toast says it worked; this is the way through to it, which a
          toast cannot carry. */}
      {clonedSkillId && (
        <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 p-3 text-[12px] text-emerald-300">
          Cloned as a draft.
          <Link href={`${basePath}/${clonedSkillId}`} className="ml-2 font-semibold underline underline-offset-2">
            Open clone
          </Link>
        </div>
      )}

      <section className="grid grid-cols-1 xl:grid-cols-[1fr_320px] gap-5">
        <div className="flex flex-col gap-4">
          {/* Publishing is the one decision that is not in the file. Everything
              else on this page is what the uploaded SKILL.md says, which is why
              it is shown rather than offered as a form: editing the copy in the
              database would only let it drift from the file that produced it. */}
          <div className="rounded-[8px] border border-border-dim bg-card p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="text-[13px] font-semibold text-foreground">
                {detail.skill.status === "ACTIVE"
                  ? "Published — agents can use this skill"
                  : detail.skill.status === "DRAFT"
                    ? "Draft — not available to agents yet"
                    : "Archived — kept for the record, not offered to agents"}
              </div>
              <p className="text-[12px] text-secondary mt-1">
                {detail.skill.status === "ACTIVE"
                  ? "Attach it to an agent from that agent's Skills tab."
                  : "Publish it when you are happy with the instructions below."}
              </p>
            </div>
            {detail.skill.status !== "ARCHIVED" && (
              <button
                type="button"
                onClick={() => setStatus(detail.skill.status === "ACTIVE" ? "DRAFT" : "ACTIVE")}
                disabled={action.isBusy(STATUS_KEY)}
                className="h-10 shrink-0 px-4 rounded-[8px] border border-border-dim text-[13px] font-medium text-foreground hover:bg-hover disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {action.isBusy(STATUS_KEY) && <Loader2 className="w-4 h-4 animate-spin" />}
                {detail.skill.status === "ACTIVE" ? "Return to draft" : "Publish skill"}
              </button>
            )}
          </div>

          <div className="rounded-[8px] border border-border-dim bg-card p-5 flex flex-col gap-2">
            <h2 className="text-[13px] font-semibold text-foreground">What this skill does</h2>
            <p className="text-[14px] leading-relaxed text-secondary">
              {detail.skill.description || "No summary was included in the file."}
            </p>
          </div>

          {/* The instruction is the skill. It used to sit in a monospaced box
              the same size and shape as four boxes of JSON; here it is the
              thing you actually read. */}
          <div className="rounded-[8px] border border-border-dim bg-card p-5 flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold text-foreground">Instructions given to the agent</h2>
            <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-foreground/90">
              {detail.skill.instruction}
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="rounded-[8px] border border-border-dim bg-card p-5 flex flex-col gap-3">
              <h2 className="text-[13px] font-semibold text-foreground">Tools it needs</h2>
              {detail.readiness.requiredToolMappings.length === 0 ? (
                <p className="text-[13px] text-secondary">This skill needs no tools — it is instructions only.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {detail.readiness.requiredToolMappings.map((mapping) => (
                    <li key={mapping} className="flex items-center justify-between gap-3 text-[13px]">
                      <span className="text-secondary">{mapping}</span>
                      <span className={detail.readiness.missingRequiredToolMappings.includes(mapping) ? "text-red-400 text-[12px]" : "text-emerald-400 text-[12px]"}>
                        {detail.readiness.missingRequiredToolMappings.includes(mapping) ? "not available" : "available"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {detail.readiness.recommendedToolMappings.length > 0 && (
                <p className="text-[12px] text-muted">
                  Also suggested: {detail.readiness.recommendedToolMappings.join(", ")}
                </p>
              )}
            </div>

            <div className="rounded-[8px] border border-border-dim bg-card p-5 flex flex-col gap-3">
              <h2 className="text-[13px] font-semibold text-foreground">Examples it is tested against</h2>
              <p className="text-[13px] text-secondary">
                {exampleCount === 0
                  ? "No examples were included in the file. A skill with no examples cannot be checked automatically."
                  : `${exampleCount} example${exampleCount === 1 ? "" : "s"} came with this skill and are used to test agents that have it.`}
              </p>
            </div>
          </div>

          <div className="rounded-[8px] border border-border-dim bg-card p-5 flex flex-col gap-3">
            <h2 className="text-[13px] font-semibold text-foreground">Where this came from</h2>
            {detail.skill.sourceFilename ? (
              <p className="text-[13px] text-secondary">
                Uploaded from <span className="text-foreground">{detail.skill.sourceFilename}</span>, last changed {formatDateTime(detail.skill.updatedAt)}.
                To change it, edit that file and upload it again — it will replace this skill rather than adding a second one.
              </p>
            ) : (
              <p className="text-[13px] text-secondary">
                This skill was created in Sonae rather than uploaded from a file.
                Uploading a SKILL.md named &ldquo;{detail.skill.name}&rdquo; will take it over from here on.
              </p>
            )}
          </div>
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
                    disabled={action.isBusy()}
                    className="h-9 px-3 rounded-[8px] border border-sky-500/20 bg-sky-500/10 text-[12px] font-semibold text-sky-200 hover:bg-sky-500/15 disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {action.isBusy("all") ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UploadCloud className="w-3.5 h-3.5" />}
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
                        disabled={action.isBusy()}
                        className="self-end h-8 px-3 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] text-secondary hover:text-foreground disabled:opacity-50"
                      >
                        {action.isBusy(row.binding._id) ? "Updating..." : `Update to v${row.latestVersion?.versionNumber ?? 0}`}
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
    </div>
  );
}

export default function AgentSkillDetailPage() {
  const params = useParams();
  redirect(`/admin/ai/skills/${params.id}`);
}
