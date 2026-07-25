"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useToast } from "@/src/context/ToastContext";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  AlertTriangle,
  Archive,
  BrainCircuit,
  CheckCircle2,
  ClipboardCheck,
  Pencil,
  Eye,
  Loader2,
  Plus,
  PlayCircle,
  ShieldCheck,
  Timer,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type AgentEvalFixture = Doc<"agentEvalFixtures">;
type AgentEvalSuitePreset = Doc<"agentEvalSuitePresets">;
type AgentRunStatus = Doc<"agentRuns">["status"];
type FixtureType = AgentEvalFixture["type"];
type SkillFilter = "ALL" | Id<"agentSkills">;

type FixtureSkillEvidence = {
  skillId: Id<"agentSkills">;
  skillVersionId?: Id<"agentSkillVersions">;
  skillName?: string;
};

const fixtureTypes: FixtureType[] = [
  "HAPPY_PATH",
  "TOOL_PLAN",
  "APPROVAL_PAUSE",
  "REJECTED_ACTION",
  "PROMPT_INJECTION",
  "TENANT_BOUNDARY",
  "BAD_TOOL_ARGS",
  "CANCELLATION",
  "REPLAYED_FAILURE",
  "COST_LATENCY_BUDGET",
];

const emptyFixtureForm = {
  type: "HAPPY_PATH" as FixtureType,
  objective: "",
  expectedToolMappings: "",
  expectedBlockedActionsJson: "",
  expectedFinalOutputRubric: "",
  tags: "",
};

function fixtureToForm(fixture: AgentEvalFixture) {
  const fixtureTypeTag = fixture.type.toLowerCase();
  return {
    type: fixture.type,
    objective: fixture.objective,
    expectedToolMappings: expectedToolMappings(fixture).join(", "),
    expectedBlockedActionsJson: fixture.expectedBlockedActionsJson
      ? JSON.stringify(parseJson(fixture.expectedBlockedActionsJson), null, 2)
      : "",
    expectedFinalOutputRubric: fixture.expectedFinalOutputRubric,
    tags: fixture.tags.filter((tag) => tag !== fixtureTypeTag).join(", "),
  };
}

function parseJson(value: string | undefined) {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function expectedToolMappings(fixture: AgentEvalFixture) {
  const parsed = parseJson(fixture.expectedToolPlanJson);
  if (!Array.isArray(parsed)) return [];
  return Array.from(new Set(parsed
    .map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const handlerMapping = (entry as { handlerMapping?: unknown }).handlerMapping;
      return typeof handlerMapping === "string" && handlerMapping.trim().length > 0
        ? handlerMapping.trim()
        : null;
    })
    .filter((entry): entry is string => entry !== null)));
}

function expectedBlockedActions(fixture: AgentEvalFixture) {
  const parsed = parseJson(fixture.expectedBlockedActionsJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return [];
  const source = parsed as { toolCalls?: unknown; approvals?: unknown; policies?: unknown };
  const summaries: string[] = [];

  if (Array.isArray(source.toolCalls)) {
    for (const entry of source.toolCalls) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as { handlerMapping?: unknown; status?: unknown };
      if (typeof record.status !== "string") continue;
      const handlerMapping = typeof record.handlerMapping === "string" ? record.handlerMapping : "tool";
      summaries.push(`${handlerMapping}:${record.status}`);
    }
  }

  if (Array.isArray(source.approvals)) {
    for (const entry of source.approvals) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as { status?: unknown };
      if (typeof record.status !== "string") continue;
      summaries.push(`approval:${record.status}`);
    }
  }

  if (Array.isArray(source.policies)) {
    for (const entry of source.policies) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      const record = entry as { assertion?: unknown; handlerMapping?: unknown; scope?: unknown };
      if (typeof record.assertion !== "string") continue;
      const target = typeof record.handlerMapping === "string"
        ? record.handlerMapping
        : typeof record.scope === "string" ? record.scope : "tenant";
      summaries.push(`policy:${record.assertion}:${target}`);
    }
  }

  return Array.from(new Set(summaries)).sort();
}

function parseSkillEvidence(fixture: AgentEvalFixture): FixtureSkillEvidence | null {
  const parsed = parseJson(fixture.sourceEvidenceJson);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const source = parsed as {
    source?: unknown;
    skillId?: unknown;
    skillVersionId?: unknown;
    skillName?: unknown;
  };
  if (source.source !== "agent_skill" || typeof source.skillId !== "string") return null;
  return {
    skillId: source.skillId as Id<"agentSkills">,
    ...(typeof source.skillVersionId === "string" ? { skillVersionId: source.skillVersionId as Id<"agentSkillVersions"> } : {}),
    ...(typeof source.skillName === "string" ? { skillName: source.skillName } : {}),
  };
}

function getStatusTone(status: AgentRunStatus) {
  if (status === "SUCCESS") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-500";
  if (status === "FAILED") return "border-red-500/20 bg-red-500/10 text-red-500";
  if (status === "CANCELLED") return "border-amber-500/20 bg-amber-500/10 text-amber-500";
  return "border-sky-500/20 bg-sky-500/10 text-sky-500";
}

function getComparisonTone(status: string) {
  if (status === "PASSED") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  if (status === "FAILED") return "border-red-500/20 bg-red-500/10 text-red-400";
  if (status === "MODEL_REQUIRED") return "border-violet-500/20 bg-violet-500/10 text-violet-300";
  if (status === "STALE" || status === "NOT_RUN") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-sky-500/20 bg-sky-500/10 text-sky-300";
}

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: LucideIcon }) {
  return (
    <div className="border border-border-dim rounded-[8px] bg-white/[0.02] px-4 py-3 flex items-center gap-3 min-w-0">
      <div className="w-8 h-8 rounded-[8px] bg-brand/10 text-brand flex items-center justify-center flex-shrink-0">
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <div className="text-[11px] text-muted uppercase tracking-widest font-mono truncate">{label}</div>
        <div className="text-[18px] text-foreground font-semibold tracking-tight truncate">{value}</div>
      </div>
    </div>
  );
}

export default function AgentEvalsPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  // Page-level actions need busy keys of their own so they do not share a
  // spinner with the per-fixture row actions.
  const SUITE_KEY = "suite";
  const PRESET_SAVE_KEY = "preset-save";
  const FIXTURE_SAVE_KEY = "fixture-save";
  const action = useAdminAction({ scope: "admin-agent-evals" });
  const { showToast } = useToast();
  const [isAuthoringFixture, setIsAuthoringFixture] = useState(false);
  const [editingFixtureId, setEditingFixtureId] = useState<Id<"agentEvalFixtures"> | null>(null);
  const [pendingArchiveFixture, setPendingArchiveFixture] = useState<AgentEvalFixture | null>(null);
  const [selectedSkillId, setSelectedSkillId] = useState<SkillFilter>("ALL");
  const [fixtureForm, setFixtureForm] = useState(emptyFixtureForm);
  const [isPresetModalOpen, setIsPresetModalOpen] = useState(false);
  const [editingPresetId, setEditingPresetId] = useState<Id<"agentEvalSuitePresets"> | null>(null);
  const [pendingArchivePreset, setPendingArchivePreset] = useState<AgentEvalSuitePreset | null>(null);
  const [presetForm, setPresetForm] = useState({
    name: "",
    description: "",
    suiteTag: "",
    isReleaseGate: false,
    requiresModelGrading: false,
    fixtureIds: [] as Id<"agentEvalFixtures">[],
  });

  const fixtures = useQuery(api.agentEvalFixtures.getRecentForAgent, { agentId });
  const evalHistory = useQuery(api.agentEvalFixtures.getSmokeEvalHistory, { agentId, limit: 15 });
  const releaseComparison = useQuery(api.agentEvalFixtures.getReleaseCandidateComparison, { agentId });
  const suitePresets = useQuery(api.agentEvalFixtures.listSuitePresets, { agentId });
  const readiness = useQuery(api.agents.getAgentReadiness, { id: agentId });
  const createFixture = useMutation(api.agentEvalFixtures.createManual);
  const updateFixture = useMutation(api.agentEvalFixtures.updateFixture);
  const archiveFixture = useMutation(api.agentEvalFixtures.archiveFixture);
  const saveSuitePreset = useMutation(api.agentEvalFixtures.saveSuitePreset);
  const archiveSuitePreset = useMutation(api.agentEvalFixtures.archiveSuitePreset);
  const runEvalSuite = useMutation(api.agentEvalFixtures.runEvalSuite);
  const runSmokeEval = useMutation(api.agentEvalFixtures.runSmokeEval);
  const updateAgent = useMutation(api.agents.updateAgent);

  const fixtureTypeCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fixture of fixtures || []) {
      counts.set(fixture.type, (counts.get(fixture.type) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [fixtures]);

  const fixtureTagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const fixture of fixtures || []) {
      const typeTag = fixture.type.toLowerCase();
      for (const tag of fixture.tags) {
        if (tag === typeTag) continue;
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries()).sort(([left], [right]) => left.localeCompare(right));
  }, [fixtures]);

  const fixtureSkillEvidenceById = useMemo(() => {
    const entries = new Map<Id<"agentEvalFixtures">, FixtureSkillEvidence>();
    for (const fixture of fixtures || []) {
      const evidence = parseSkillEvidence(fixture);
      if (evidence) entries.set(fixture._id, evidence);
    }
    return entries;
  }, [fixtures]);

  const skillCoverageRows = useMemo(() => {
    const rows = new Map<Id<"agentSkills">, {
      skillId: Id<"agentSkills">;
      name: string;
      riskLevel?: string;
      activeFixtureCount: number;
      latestRunStatus?: string;
      latestRunIsCurrent?: boolean;
      skillSmokePassed?: boolean;
      fixtureIds: Id<"agentEvalFixtures">[];
    }>();

    for (const skill of readiness?.skillReadiness.skills ?? []) {
      rows.set(skill.skillId, {
        skillId: skill.skillId,
        name: skill.name,
        riskLevel: skill.riskLevel,
        activeFixtureCount: skill.activeEvalFixtureCount ?? 0,
        latestRunStatus: skill.latestSkillSmokeEval?.status,
        latestRunIsCurrent: skill.latestSkillSmokeEval?.isCurrent,
        skillSmokePassed: skill.skillSmokePassed,
        fixtureIds: [],
      });
    }

    for (const fixture of fixtures || []) {
      const evidence = fixtureSkillEvidenceById.get(fixture._id);
      if (!evidence) continue;
      const existing = rows.get(evidence.skillId);
      rows.set(evidence.skillId, {
        skillId: evidence.skillId,
        name: existing?.name ?? evidence.skillName ?? "Skill fixture",
        riskLevel: existing?.riskLevel,
        activeFixtureCount: existing?.activeFixtureCount ?? 0,
        latestRunStatus: existing?.latestRunStatus,
        latestRunIsCurrent: existing?.latestRunIsCurrent,
        skillSmokePassed: existing?.skillSmokePassed,
        fixtureIds: [...(existing?.fixtureIds ?? []), fixture._id],
      });
    }

    return Array.from(rows.values())
      .map((row) => ({
        ...row,
        activeFixtureCount: Math.max(row.activeFixtureCount, row.fixtureIds.length),
      }))
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [fixtureSkillEvidenceById, fixtures, readiness?.skillReadiness.skills]);

  const filteredFixtures = useMemo(() => {
    if (!fixtures) return undefined;
    if (selectedSkillId === "ALL") return fixtures;
    return fixtures.filter((fixture) => fixtureSkillEvidenceById.get(fixture._id)?.skillId === selectedSkillId);
  }, [fixtureSkillEvidenceById, fixtures, selectedSkillId]);

  const releaseGatePolicy = readiness?.releaseGatePolicy;
  const hasCriticalFixtures = Boolean(releaseGatePolicy && releaseGatePolicy.criticalFixtureCount > 0);

  const runSuite = async (
    suiteTag?: string,
    fixtureIds?: Id<"agentEvalFixtures">[],
    suitePresetId?: Id<"agentEvalSuitePresets">,
    gradingMode?: "CONTRACT_ONLY" | "MODEL_GRADED",
  ) => {
    const outcome = await action.run(
      () => runEvalSuite({
        agentId,
        ...(suiteTag ? { suiteTag } : {}),
        ...(fixtureIds && fixtureIds.length > 0 ? { fixtureIds } : {}),
        ...(suitePresetId ? { suitePresetId } : {}),
        ...(gradingMode ? { gradingMode } : {}),
      }),
      { key: SUITE_KEY, fallbackMessage: "The eval suite could not be run." },
    );
    if (!outcome.ok) return;
    const result = outcome.data;
    const label = result.suitePresetName ? `${result.suitePresetName} ` : suiteTag ? `${suiteTag} ` : "";
    showToast(
      `Ran ${label}${result.total} contract eval${result.total === 1 ? "" : "s"}: ${result.passed} passed, ${result.failed} failed, ${result.active} still active.`,
      result.failed > 0 ? "info" : "success",
    );
  };

  const openNewPresetModal = () => {
    setEditingPresetId(null);
    setPresetForm({
      name: "",
      description: "",
      suiteTag: "",
      isReleaseGate: false,
      requiresModelGrading: false,
      fixtureIds: [],
    });
    setIsPresetModalOpen(true);
  };

  const openEditPresetModal = (preset: AgentEvalSuitePreset) => {
    setEditingPresetId(preset._id);
    setPresetForm({
      name: preset.name,
      description: preset.description ?? "",
      suiteTag: preset.suiteTag ?? "",
      isReleaseGate: readiness?.releaseGatePolicy.suitePresetId === preset._id || preset.isReleaseGate === true,
      requiresModelGrading: preset.requiresModelGrading === true,
      fixtureIds: preset.fixtureIds ?? [],
    });
    setIsPresetModalOpen(true);
  };

  const closePresetModal = () => {
    if (action.isBusy(PRESET_SAVE_KEY)) return;
    setIsPresetModalOpen(false);
    setEditingPresetId(null);
    setPresetForm({
      name: "",
      description: "",
      suiteTag: "",
      isReleaseGate: false,
      requiresModelGrading: false,
      fixtureIds: [],
    });
  };

  const savePreset = async () => {
    const outcome = await action.run(async () => {
      const presetId = await saveSuitePreset({
        agentId,
        ...(editingPresetId ? { presetId: editingPresetId } : {}),
        name: presetForm.name,
        description: presetForm.description,
        suiteTag: presetForm.suiteTag,
        ...(presetForm.fixtureIds.length > 0 ? { fixtureIds: presetForm.fixtureIds } : {}),
        isReleaseGate: presetForm.isReleaseGate,
        requiresModelGrading: presetForm.requiresModelGrading,
      });
      if (presetForm.isReleaseGate) {
        await updateAgent({
          id: agentId,
          releaseGateMode: "PRESET",
          releaseGateSuitePresetId: presetId,
          releaseGateRequiresModelGrading: presetForm.requiresModelGrading,
        });
      } else if (editingPresetId && readiness?.releaseGatePolicy.suitePresetId === editingPresetId) {
        await updateAgent({
          id: agentId,
          releaseGateMode: "TAG",
          releaseGateSuitePresetId: undefined,
          releaseGateRequiresModelGrading: false,
        });
      }
    }, {
      key: PRESET_SAVE_KEY,
      successMessage: presetForm.isReleaseGate
        ? "Suite preset saved. It is now the release gate for this agent."
        : "Suite preset saved and available for future eval runs.",
      fallbackMessage: "The suite preset could not be saved.",
    });
    // The form stays open on failure so the author's input is not lost.
    if (!outcome.ok) return;
    setPresetForm({ name: "", description: "", suiteTag: "", isReleaseGate: false, requiresModelGrading: false, fixtureIds: [] });
    setEditingPresetId(null);
    setIsPresetModalOpen(false);
  };

  const confirmArchivePreset = async () => {
    if (!pendingArchivePreset) return;
    const outcome = await action.run(() => archiveSuitePreset({ presetId: pendingArchivePreset._id }), {
      key: pendingArchivePreset._id,
      successMessage: "Preset archived. Any release gate using it returned to tag mode.",
      fallbackMessage: "The suite preset could not be archived.",
    });
    // The confirmation stays open on failure so the user can retry or cancel.
    if (outcome.ok) setPendingArchivePreset(null);
  };

  const setPresetReleaseGate = async (preset: AgentEvalSuitePreset) => {
    await action.run(
      () => updateAgent({
        id: agentId,
        releaseGateMode: "PRESET",
        releaseGateSuitePresetId: preset._id,
        releaseGateRequiresModelGrading: preset.requiresModelGrading === true,
      }),
      {
        key: preset._id,
        successMessage: "Release gate updated. This preset now controls activation.",
        fallbackMessage: "The release gate could not be updated.",
      },
    );
  };

  const runFixture = async (fixtureId: Id<"agentEvalFixtures">) => {
    const outcome = await action.run(() => runSmokeEval({ agentId, fixtureId }), {
      key: fixtureId,
      fallbackMessage: "The fixture could not be run.",
    });
    if (!outcome.ok) return;
    const result = outcome.data;
    // A failing eval is a result, not an error — it gets a plain notice rather
    // than the error tone, which is reserved for the call itself going wrong.
    showToast(
      result.status === "SUCCESS"
        ? "Fixture passed its contract checks."
        : `Fixture failed: ${result.missingToolMappings.length > 0 ? `missing ${result.missingToolMappings.join(", ")}` : "review the eval history for details."}`,
      result.status === "SUCCESS" ? "success" : "info",
    );
  };

  const openNewFixtureModal = () => {
    setEditingFixtureId(null);
    setFixtureForm(emptyFixtureForm);
    setIsAuthoringFixture(true);
  };

  const openEditFixtureModal = (fixture: AgentEvalFixture) => {
    setEditingFixtureId(fixture._id);
    setFixtureForm(fixtureToForm(fixture));
    setIsAuthoringFixture(true);
  };

  const closeFixtureModal = () => {
    if (action.isBusy(FIXTURE_SAVE_KEY)) return;
    setIsAuthoringFixture(false);
    setEditingFixtureId(null);
    setFixtureForm(emptyFixtureForm);
  };

  const saveFixture = async () => {
    const outcome = await action.run(async () => {
      const expectedToolMappings = fixtureForm.expectedToolMappings
        .split(",")
        .map((mapping) => mapping.trim())
        .filter((mapping) => mapping.length > 0);
      const tags = fixtureForm.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      if (editingFixtureId) {
        await updateFixture({
          fixtureId: editingFixtureId,
          type: fixtureForm.type,
          objective: fixtureForm.objective,
          expectedFinalOutputRubric: fixtureForm.expectedFinalOutputRubric,
          expectedToolMappings,
          expectedBlockedActionsJson: fixtureForm.expectedBlockedActionsJson,
          tags,
        });
      } else {
        await createFixture({
          agentId,
          type: fixtureForm.type,
          objective: fixtureForm.objective,
          expectedFinalOutputRubric: fixtureForm.expectedFinalOutputRubric,
          ...(expectedToolMappings.length > 0 ? { expectedToolMappings } : {}),
          ...(fixtureForm.expectedBlockedActionsJson.trim().length > 0
            ? { expectedBlockedActionsJson: fixtureForm.expectedBlockedActionsJson }
            : {}),
          ...(tags.length > 0 ? { tags } : {}),
        });
      }
    }, {
      key: FIXTURE_SAVE_KEY,
      successMessage: editingFixtureId
        ? "Fixture updated. It will be used in future suite runs."
        : "Fixture created and available for suite runs.",
      fallbackMessage: "The eval fixture could not be saved.",
    });
    // The author's work stays on screen if the save failed.
    if (!outcome.ok) return;
    setFixtureForm(emptyFixtureForm);
    setEditingFixtureId(null);
    setIsAuthoringFixture(false);
  };

  const confirmArchiveFixture = async () => {
    if (!pendingArchiveFixture) return;
    const outcome = await action.run(() => archiveFixture({ fixtureId: pendingArchiveFixture._id }), {
      key: pendingArchiveFixture._id,
      successMessage: "Fixture archived. Existing eval history remains available.",
      fallbackMessage: "The eval fixture could not be archived.",
    });
    if (outcome.ok) setPendingArchiveFixture(null);
  };

  const latestEvalPassed = readiness?.latestSmokeEvalRun?.status === "SUCCESS";

  return (
    <div className="w-full flex flex-col gap-5 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased pb-12">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 border-b border-border-dim/50 pb-4">
        <div className="min-w-0">
          <h2 className="text-[16px] font-semibold text-foreground tracking-wide flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-brand" />
            Eval suite
          </h2>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Run safe contract checks against active fixtures before activating or changing this agent.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-2">
          <button
            type="button"
            onClick={openNewFixtureModal}
            className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-foreground text-[13px] font-semibold hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2 min-h-10"
          >
            <Plus className="w-4 h-4" />
            New fixture
          </button>
          <button
            type="button"
            onClick={openNewPresetModal}
            className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-foreground text-[13px] font-semibold hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2 min-h-10"
          >
            <Plus className="w-4 h-4" />
            New preset
          </button>
          <button
            type="button"
            onClick={() => runSuite(undefined, releaseGatePolicy?.fixtures.map((fixture) => fixture.fixtureId))}
            disabled={!hasCriticalFixtures || action.isBusy()}
            className="px-4 py-2 rounded-[8px] border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 text-[13px] font-semibold hover:bg-emerald-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-10"
          >
            {action.isBusy(SUITE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Run critical
          </button>
          <button
            type="button"
            onClick={() => runSuite(undefined, releaseGatePolicy?.fixtures.map((fixture) => fixture.fixtureId), undefined, "MODEL_GRADED")}
            disabled={!hasCriticalFixtures || action.isBusy()}
            className="px-4 py-2 rounded-[8px] border border-violet-500/30 bg-violet-500/10 text-violet-300 text-[13px] font-semibold hover:bg-violet-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-10"
          >
            {action.isBusy(SUITE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Model gate
          </button>
          <button
            type="button"
            onClick={() => runSuite()}
            disabled={!fixtures || fixtures.length === 0 || action.isBusy()}
            className="px-4 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[13px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 min-h-10"
          >
            {action.isBusy(SUITE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <PlayCircle className="w-4 h-4" />}
            Run full suite
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-3">
        <MetricTile label="Active fixtures" value={fixtures ? fixtures.length.toLocaleString() : "..."} icon={ClipboardCheck} />
        <MetricTile label="Critical" value={releaseGatePolicy ? `${releaseGatePolicy.passedCriticalFixtureCount}/${releaseGatePolicy.criticalFixtureCount}` : "..."} icon={ShieldCheck} />
        <MetricTile label="Eval runs" value={evalHistory ? evalHistory.totals.total.toLocaleString() : "..."} icon={Timer} />
        <MetricTile label="Passed" value={evalHistory ? evalHistory.totals.passed.toLocaleString() : "..."} icon={CheckCircle2} />
        <MetricTile label="Failed" value={evalHistory ? evalHistory.totals.failed.toLocaleString() : "..."} icon={XCircle} />
        <MetricTile label="Release gate" value={!readiness?.latestSmokeEvalRun ? "Not run" : latestEvalPassed ? "Passing" : "Blocked"} icon={ShieldCheck} />
      </div>

      {skillCoverageRows.length > 0 && (
        <section className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4 flex flex-col gap-3 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight flex items-center gap-2">
                <BrainCircuit className="w-4 h-4 text-brand" />
                Skill eval coverage
              </h3>
              <p className="text-[12px] text-secondary mt-1">
                Filter fixtures by attached skill and run skill-specific smoke coverage from here.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedSkillId("ALL")}
              className={`px-3 py-1.5 rounded-[8px] border text-[11px] font-medium transition-all ${
                selectedSkillId === "ALL"
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-border-dim bg-white/[0.03] text-secondary hover:text-foreground"
              }`}
            >
              All fixtures
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-3">
            {skillCoverageRows.map((skill) => {
              const isSelected = selectedSkillId === skill.skillId;
              const isPassing = skill.skillSmokePassed === true;
              const isStale = skill.latestRunStatus === "SUCCESS" && skill.latestRunIsCurrent === false;
              const hasFixtures = skill.activeFixtureCount > 0;
              return (
                <div
                  key={skill.skillId}
                  className={`rounded-[8px] border px-3 py-3 flex flex-col gap-3 ${
                    isSelected ? "border-brand/40 bg-brand/10" : "border-border-dim bg-white/[0.02]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[13px] font-semibold text-foreground truncate">{skill.name}</span>
                        {skill.riskLevel && (
                          <span className="text-[10px] uppercase tracking-widest font-mono text-muted">{skill.riskLevel.toLowerCase()} risk</span>
                        )}
                      </div>
                      <p className="text-[11px] text-secondary mt-1">
                        {skill.activeFixtureCount} active fixture{skill.activeFixtureCount === 1 ? "" : "s"}
                      </p>
                    </div>
                    <span className={`text-[10px] uppercase tracking-widest font-mono px-2 py-1 rounded-md border ${
                      isPassing
                        ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
                        : isStale
                          ? "border-amber-500/20 bg-amber-500/10 text-amber-300"
                          : hasFixtures
                            ? "border-sky-500/20 bg-sky-500/10 text-sky-300"
                            : "border-red-500/20 bg-red-500/10 text-red-300"
                    }`}>
                      {isPassing ? "passing" : isStale ? "stale" : hasFixtures ? "not run" : "missing"}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedSkillId(isSelected ? "ALL" : skill.skillId)}
                      className="px-2.5 py-1.5 rounded-md border border-border-dim bg-white/[0.03] text-[10px] uppercase tracking-widest font-mono text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all"
                    >
                      {isSelected ? "Clear" : "Filter"}
                    </button>
                    <button
                      type="button"
                      onClick={() => runSuite(undefined, skill.fixtureIds)}
                      disabled={skill.fixtureIds.length === 0 || action.isBusy()}
                      className="px-2.5 py-1.5 rounded-md border border-brand/30 bg-brand/10 text-[10px] uppercase tracking-widest font-mono text-brand hover:bg-brand/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <PlayCircle className="w-3 h-3" />
                      Run skill
                    </button>
                    <button
                      type="button"
                      onClick={() => runSuite(undefined, skill.fixtureIds, undefined, "MODEL_GRADED")}
                      disabled={skill.fixtureIds.length === 0 || action.isBusy()}
                      className="px-2.5 py-1.5 rounded-md border border-violet-500/20 bg-violet-500/10 text-[10px] uppercase tracking-widest font-mono text-violet-300 hover:bg-violet-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                    >
                      <ShieldCheck className="w-3 h-3" />
                      Model
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {readiness?.latestSmokeEvalRun && !latestEvalPassed && (
        <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] text-red-300 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <p className="leading-relaxed">
            Latest eval checkpoint is {readiness.latestSmokeEvalRun.status.toLowerCase().replace("_", " ")}. Activation remains blocked until the latest checkpoint passes.
          </p>
        </div>
      )}

      {releaseGatePolicy && releaseGatePolicy.blockedCriticalFixtureCount > 0 && (
        <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200 flex items-start gap-3">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <div className="min-w-0">
            <p className="leading-relaxed">
              Critical eval gate is blocking activation. {releaseGatePolicy.passedCriticalFixtureCount} of {releaseGatePolicy.criticalFixtureCount} required fixtures are passing.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {releaseGatePolicy.fixtures.filter((fixture) => !fixture.passed).map((fixture) => (
                <span key={fixture.fixtureId} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-amber-500/20 bg-black/20 text-amber-200">
                  {fixture.type.toLowerCase().replaceAll("_", " ")}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {readiness?.releaseGatePolicy && (
        <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 text-[13px] text-secondary flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="min-w-0">
            <span className="text-[10px] uppercase tracking-widest font-mono text-muted">Release policy</span>
            <p className="text-foreground mt-1">
              {readiness.releaseGatePolicy.mode === "PRESET"
                ? `Preset: ${readiness.releaseGatePolicy.suitePresetName || "missing preset"}`
                : readiness.releaseGatePolicy.mode === "NONE"
                  ? "Critical gate disabled"
                  : `Tags: ${readiness.releaseGatePolicy.requiredTags.join(", ")}`}
            </p>
            {readiness.releaseGatePolicy.warning && (
              <p className="text-amber-300 mt-1">{readiness.releaseGatePolicy.warning}</p>
            )}
          </div>
          <button
            type="button"
            onClick={openNewPresetModal}
            className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all flex items-center justify-center gap-2 shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            Save preset
          </button>
        </div>
      )}

      <section className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4 flex flex-col gap-4 min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-3">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Release candidate comparison</h3>
            <p className="text-[12px] text-secondary mt-1">
              Current release-gate fixtures compared against their latest and previous eval checkpoints.
            </p>
          </div>
          {releaseComparison && (
            <div className="flex flex-wrap gap-2">
              <span className="px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-[10px] uppercase tracking-widest font-mono text-muted">
                total {releaseComparison.totals.total}
              </span>
              <span className="px-2 py-1 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-[10px] uppercase tracking-widest font-mono text-emerald-300">
                passed {releaseComparison.totals.passed}
              </span>
              <span className="px-2 py-1 rounded-md border border-red-500/20 bg-red-500/10 text-[10px] uppercase tracking-widest font-mono text-red-300">
                failed {releaseComparison.totals.failed}
              </span>
              <span className="px-2 py-1 rounded-md border border-amber-500/20 bg-amber-500/10 text-[10px] uppercase tracking-widest font-mono text-amber-300">
                pending {releaseComparison.totals.stale + releaseComparison.totals.notRun + releaseComparison.totals.active + releaseComparison.totals.modelRequired}
              </span>
              {releaseComparison.policy.modelGradingRequired && (
                <span className="px-2 py-1 rounded-md border border-violet-500/20 bg-violet-500/10 text-[10px] uppercase tracking-widest font-mono text-violet-300">
                  model required
                </span>
              )}
              {releaseComparison.totals.changed > 0 && (
                <span className="px-2 py-1 rounded-md border border-sky-500/20 bg-sky-500/10 text-[10px] uppercase tracking-widest font-mono text-sky-300">
                  changed {releaseComparison.totals.changed}
                </span>
              )}
            </div>
          )}
        </div>

        {!releaseComparison ? (
          <div className="py-8 flex items-center justify-center text-muted">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : releaseComparison.policy.warning ? (
          <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-200">
            {releaseComparison.policy.warning}
          </div>
        ) : releaseComparison.entries.length === 0 ? (
          <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-6 text-[13px] text-secondary">
            No release-gate fixtures are selected by the current policy.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {releaseComparison.entries.map((entry) => (
              <div key={entry.fixtureId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3 min-w-0">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getComparisonTone(entry.status)}`}>
                        {entry.status.replace("_", " ")}
                      </span>
                      {entry.changedSincePrevious && (
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-300">
                          changed
                        </span>
                      )}
                      <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                        {entry.type.toLowerCase().replaceAll("_", " ")}
                      </span>
                    </div>
                    <p className="text-[13px] text-foreground mt-2 leading-relaxed line-clamp-2">{entry.objective}</p>
                  </div>
                  <span className="text-[11px] font-mono text-muted shrink-0">
                    {formatDateTime(entry.updatedAt)}
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Latest</div>
                    <div className="text-[12px] text-foreground mt-1">
                      {entry.latestRun ? entry.latestRun.status.replace("_", " ") : "Not run"}
                    </div>
                    {entry.latestRun?.completedAt && (
                      <div className="text-[11px] text-muted font-mono mt-1">{formatDateTime(entry.latestRun.completedAt)}</div>
                    )}
                  </div>
                  <div className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 min-w-0">
                    <div className="text-[10px] uppercase tracking-widest font-mono text-muted">Previous</div>
                    <div className="text-[12px] text-foreground mt-1">
                      {entry.previousRun ? entry.previousRun.status.replace("_", " ") : "No baseline"}
                    </div>
                    {entry.previousRun?.completedAt && (
                      <div className="text-[11px] text-muted font-mono mt-1">{formatDateTime(entry.previousRun.completedAt)}</div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] gap-4">
        <section className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4 flex flex-col gap-4 min-w-0">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div>
              <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Active fixtures</h3>
              <p className="text-[12px] text-secondary mt-1">
                {selectedSkillId === "ALL"
                  ? "Fixture contracts run without executing external or destructive side effects."
                  : `${filteredFixtures?.length ?? 0} fixture${(filteredFixtures?.length ?? 0) === 1 ? "" : "s"} shown for the selected skill.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {fixtureTypeCounts.map(([type, count]) => (
                <span key={type} className="px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-[10px] uppercase tracking-widest font-mono text-muted">
                  {type.toLowerCase().replaceAll("_", " ")}: {count}
                </span>
              ))}
            </div>
          </div>

          {fixtureTagCounts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {fixtureTagCounts.map(([tag, count]) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => runSuite(tag)}
                  disabled={action.isBusy()}
                  className="px-2.5 py-1.5 rounded-md border border-border-dim bg-white/[0.03] text-[10px] uppercase tracking-widest font-mono text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                >
                  <PlayCircle className="w-3 h-3" />
                  {tag}: {count}
                </button>
              ))}
            </div>
          )}

          {suitePresets && suitePresets.length > 0 && (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-3 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-[12px] font-semibold text-foreground">Saved presets</h4>
                <span className="text-[10px] uppercase tracking-widest font-mono text-muted">{suitePresets.length}</span>
              </div>
              <div className="flex flex-col gap-2">
                {suitePresets.map((preset) => {
                  const isReleasePreset = readiness?.releaseGatePolicy.suitePresetId === preset._id;
                  return (
                    <div key={preset._id} className="rounded-[8px] border border-border-dim bg-black/20 px-3 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[12px] font-medium text-foreground truncate">{preset.name}</span>
                          {preset.suiteTag && (
                            <span className="text-[10px] uppercase tracking-widest font-mono text-muted">{preset.suiteTag}</span>
                          )}
                          {isReleasePreset && (
                            <span className="text-[10px] uppercase tracking-widest font-mono px-2 py-0.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 text-emerald-300">release</span>
                          )}
                        </div>
                        {preset.description && <p className="text-[11px] text-secondary mt-1 line-clamp-1">{preset.description}</p>}
                        {preset.requiresModelGrading && (
                          <p className="text-[10px] text-violet-300 mt-1 uppercase tracking-widest font-mono">
                            requires model grading
                          </p>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => runSuite(undefined, undefined, preset._id)}
                          disabled={action.isBusy()}
                          className="px-2.5 py-1.5 rounded-md border border-border-dim bg-white/[0.03] text-[10px] uppercase tracking-widest font-mono text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          <PlayCircle className="w-3 h-3" />
                          {preset.requiresModelGrading ? "Model" : "Run"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setPresetReleaseGate(preset)}
                          disabled={isReleasePreset}
                          className="px-2.5 py-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 text-[10px] uppercase tracking-widest font-mono text-emerald-300 hover:bg-emerald-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1.5"
                        >
                          <ShieldCheck className="w-3 h-3" />
                          Gate
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditPresetModal(preset)}
                          className="px-2.5 py-1.5 rounded-md border border-border-dim bg-white/[0.03] text-[10px] uppercase tracking-widest font-mono text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all flex items-center gap-1.5"
                        >
                          <Pencil className="w-3 h-3" />
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => setPendingArchivePreset(preset)}
                          className="px-2.5 py-1.5 rounded-md border border-red-500/20 bg-red-500/10 text-[10px] uppercase tracking-widest font-mono text-red-300 hover:bg-red-500/15 transition-all flex items-center gap-1.5"
                        >
                          <Archive className="w-3 h-3" />
                          Archive
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!fixtures ? (
            <div className="py-12 flex items-center justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : fixtures.length === 0 ? (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-8 text-[13px] text-secondary">
              No active eval fixtures are ready for this agent.
            </div>
          ) : filteredFixtures && filteredFixtures.length === 0 ? (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-8 text-[13px] text-secondary">
              No active eval fixtures match the selected skill.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {(filteredFixtures ?? []).map((fixture) => {
                const toolMappings = expectedToolMappings(fixture);
                const blockedActions = expectedBlockedActions(fixture);
                const skillEvidence = fixtureSkillEvidenceById.get(fixture._id);
                return (
                  <div key={fixture._id} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                            {fixture.type.toLowerCase().replaceAll("_", " ")}
                          </span>
                          <span className="text-[11px] font-mono text-muted">{formatDateTime(fixture.updatedAt)}</span>
                          {skillEvidence && (
                            <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-brand/20 bg-brand/10 text-brand">
                              {skillEvidence.skillName ?? "skill"}
                            </span>
                          )}
                        </div>
                        <p className="text-[13px] text-foreground mt-2 leading-relaxed">{fixture.objective}</p>
                        <p className="text-[12px] text-secondary mt-2 leading-relaxed line-clamp-2">{fixture.expectedFinalOutputRubric}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => runFixture(fixture._id)}
                        disabled={action.isBusy()}
                        className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                      >
                        {action.isBusy(fixture._id) ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <PlayCircle className="w-3.5 h-3.5" />}
                        Run
                      </button>
                      <button
                        type="button"
                        onClick={() => openEditFixtureModal(fixture)}
                        disabled={action.isBusy()}
                        className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setPendingArchiveFixture(fixture)}
                        disabled={action.isBusy()}
                        className="px-3 py-1.5 rounded-[8px] border border-red-500/20 bg-red-500/10 text-[11px] font-medium text-red-300 hover:bg-red-500/15 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shrink-0"
                      >
                        <Archive className="w-3.5 h-3.5" />
                        Archive
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      {toolMappings.map((mapping) => (
                        <span key={mapping} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-sky-500/20 bg-sky-500/10 text-sky-300">
                          tool {mapping}
                        </span>
                      ))}
                      {blockedActions.map((summary) => (
                        <span key={summary} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-300">
                          blocked {summary}
                        </span>
                      ))}
                      {fixture.tags.filter((tag) => tag !== fixture.type.toLowerCase()).map((tag) => (
                        <span key={tag} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-black/20 text-muted">
                          {tag}
                        </span>
                      ))}
                      {toolMappings.length === 0 && blockedActions.length === 0 && fixture.tags.filter((tag) => tag !== fixture.type.toLowerCase()).length === 0 && (
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-black/20 text-muted">
                          rubric only
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <section className="border border-border-dim rounded-[8px] bg-black/20 px-4 py-4 flex flex-col gap-4 min-w-0">
          <div>
            <h3 className="text-[14px] font-semibold text-foreground tracking-tight">Recent eval results</h3>
            <p className="text-[12px] text-secondary mt-1">Latest contract, release-gate, and model-graded checkpoints.</p>
          </div>

          {!evalHistory ? (
            <div className="py-12 flex items-center justify-center text-muted">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : evalHistory.entries.length === 0 ? (
            <div className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-8 text-[13px] text-secondary">
              No eval runs have been recorded yet.
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {evalHistory.entries.map((entry) => (
                <div key={entry.runId} className="rounded-[8px] border border-border-dim bg-white/[0.02] px-4 py-3 flex flex-col gap-3 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${getStatusTone(entry.status)}`}>
                          {entry.status.replace("_", " ")}
                        </span>
                        <span className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-border-dim bg-white/[0.03] text-secondary">
                          {entry.gradingMode === "MODEL_GRADED" ? "Model graded" : "Contract"}
                        </span>
                      </div>
                      <p className="text-[13px] text-foreground mt-2 leading-relaxed line-clamp-2">
                        {entry.fixture?.objective || entry.objective}
                      </p>
                    </div>
                    <span className="text-[11px] font-mono text-muted shrink-0">
                      {formatDateTime(entry.completedAt ?? entry.startedAt)}
                    </span>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {entry.missingToolMappings.map((mapping) => (
                      <span key={mapping} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-red-500/20 bg-red-500/10 text-red-400">
                        missing {mapping}
                      </span>
                    ))}
                    {entry.expectedBlockedActionSummaries.map((summary) => (
                      <span key={summary} className="text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border border-amber-500/20 bg-amber-500/10 text-amber-300">
                        blocked {summary}
                      </span>
                    ))}
                  </div>

                  {(entry.finalOutput || entry.error) && (
                    <p className={`text-[12px] leading-relaxed line-clamp-2 ${entry.status === "FAILED" ? "text-red-400" : "text-secondary"}`}>
                      {entry.error || entry.finalOutput}
                    </p>
                  )}

                  <div className="flex justify-end">
                    <Link
                      href={`/admin/agents/${agentId}/runs`}
                      className="px-3 py-1.5 rounded-[8px] border border-border-dim bg-white/[0.03] text-[11px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all flex items-center gap-2"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      Runs
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <SonaeModal
        isOpen={isAuthoringFixture}
        onClose={closeFixtureModal}
        title={editingFixtureId ? "Edit eval fixture" : "New eval fixture"}
        size="lg"
      >
        <div className="pt-2 pb-4 px-1 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Type</span>
              <select
                value={fixtureForm.type}
                onChange={(event) => setFixtureForm({ ...fixtureForm, type: event.target.value as FixtureType })}
                className="h-10 rounded-[8px] border border-border-dim bg-black/30 px-3 text-[13px] text-foreground outline-none focus:border-brand/60"
              >
                {fixtureTypes.map((type) => (
                  <option key={type} value={type}>{type.toLowerCase().replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Tags</span>
              <input
                value={fixtureForm.tags}
                onChange={(event) => setFixtureForm({ ...fixtureForm, tags: event.target.value })}
                placeholder="regression, safety"
                className="h-10 rounded-[8px] border border-border-dim bg-black/30 px-3 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60"
              />
            </label>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Objective</span>
            <textarea
              value={fixtureForm.objective}
              onChange={(event) => setFixtureForm({ ...fixtureForm, objective: event.target.value })}
              placeholder="Describe the behavior this eval should preserve."
              rows={3}
              className="rounded-[8px] border border-border-dim bg-black/30 px-3 py-2 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60 resize-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Expected tool mappings</span>
            <input
              value={fixtureForm.expectedToolMappings}
              onChange={(event) => setFixtureForm({ ...fixtureForm, expectedToolMappings: event.target.value })}
              placeholder="knowledge.search, crm.lookup"
              className="h-10 rounded-[8px] border border-border-dim bg-black/30 px-3 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Expected blocked actions JSON</span>
            <textarea
              value={fixtureForm.expectedBlockedActionsJson}
              onChange={(event) => setFixtureForm({ ...fixtureForm, expectedBlockedActionsJson: event.target.value })}
              placeholder='{"toolCalls":[{"handlerMapping":"company.overview.update","status":"APPROVAL_REQUIRED"}],"policies":[{"assertion":"approval_required","handlerMapping":"company.overview.update"}]}'
              rows={4}
              className="rounded-[8px] border border-border-dim bg-black/30 px-3 py-2 text-[12px] font-mono text-foreground placeholder:text-muted outline-none focus:border-brand/60 resize-none"
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Rubric</span>
            <textarea
              value={fixtureForm.expectedFinalOutputRubric}
              onChange={(event) => setFixtureForm({ ...fixtureForm, expectedFinalOutputRubric: event.target.value })}
              placeholder="State what the final response must contain or avoid."
              rows={3}
              className="rounded-[8px] border border-border-dim bg-black/30 px-3 py-2 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60 resize-none"
            />
          </label>

          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closeFixtureModal}
              disabled={action.isBusy(FIXTURE_SAVE_KEY)}
              className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={saveFixture}
              disabled={action.isBusy(FIXTURE_SAVE_KEY)}
              className="px-4 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[13px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {action.isBusy(FIXTURE_SAVE_KEY) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingFixtureId ? "Save fixture" : "Create fixture"}
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={!!pendingArchiveFixture}
        onClose={() => !action.isBusy(pendingArchiveFixture?._id) && setPendingArchiveFixture(null)}
        title="Archive eval fixture"
        size="sm"
      >
        <div className="pt-2 pb-4 px-1 flex flex-col gap-6">
          <p className="text-[14px] text-secondary leading-relaxed">
            Archive this fixture and remove it from future suite runs? Existing eval history will remain available.
          </p>
          {pendingArchiveFixture && (
            <p className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2 text-[12px] text-foreground leading-relaxed">
              {pendingArchiveFixture.objective}
            </p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingArchiveFixture(null)}
              disabled={action.isBusy(pendingArchiveFixture?._id)}
              className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmArchiveFixture}
              disabled={action.isBusy(pendingArchiveFixture?._id)}
              className="px-4 py-2 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-300 text-[13px] font-semibold hover:bg-red-500/15 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {action.isBusy(pendingArchiveFixture?._id) && <Loader2 className="w-4 h-4 animate-spin" />}
              Archive fixture
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={isPresetModalOpen}
        onClose={closePresetModal}
        title={editingPresetId ? "Edit suite preset" : "New suite preset"}
        size="sm"
      >
        <div className="pt-2 pb-4 px-1 flex flex-col gap-4">
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Name</span>
            <input
              value={presetForm.name}
              onChange={(event) => setPresetForm({ ...presetForm, name: event.target.value })}
              placeholder="Release gate"
              className="h-10 rounded-[8px] border border-border-dim bg-black/30 px-3 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Suite tag</span>
            <input
              value={presetForm.suiteTag}
              onChange={(event) => setPresetForm({ ...presetForm, suiteTag: event.target.value })}
              placeholder="release-gate"
              className="h-10 rounded-[8px] border border-border-dim bg-black/30 px-3 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-widest font-mono text-muted">Description</span>
            <textarea
              value={presetForm.description}
              onChange={(event) => setPresetForm({ ...presetForm, description: event.target.value })}
              placeholder="Critical checks required before activation."
              rows={3}
              className="rounded-[8px] border border-border-dim bg-black/30 px-3 py-2 text-[13px] text-foreground placeholder:text-muted outline-none focus:border-brand/60 resize-none"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2">
            <span className="text-[12px] text-secondary">Use as release gate</span>
            <input
              type="checkbox"
              checked={presetForm.isReleaseGate}
              onChange={(event) => setPresetForm({ ...presetForm, isReleaseGate: event.target.checked })}
              className="h-4 w-4 accent-brand"
            />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2">
            <span className="text-[12px] text-secondary">Require model grading</span>
            <input
              type="checkbox"
              checked={presetForm.requiresModelGrading}
              onChange={(event) => setPresetForm({ ...presetForm, requiresModelGrading: event.target.checked })}
              className="h-4 w-4 accent-brand"
            />
          </label>
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={closePresetModal}
              disabled={action.isBusy(PRESET_SAVE_KEY)}
              className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={savePreset}
              disabled={action.isBusy(PRESET_SAVE_KEY)}
              className="px-4 py-2 rounded-[8px] border border-brand/30 bg-brand/10 text-brand text-[13px] font-semibold hover:bg-brand/15 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {action.isBusy(PRESET_SAVE_KEY) && <Loader2 className="w-4 h-4 animate-spin" />}
              {editingPresetId ? "Save preset" : "Create preset"}
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={!!pendingArchivePreset}
        onClose={() => !action.isBusy(pendingArchivePreset?._id) && setPendingArchivePreset(null)}
        title="Archive suite preset"
        size="sm"
      >
        <div className="pt-2 pb-4 px-1 flex flex-col gap-6">
          <p className="text-[14px] text-secondary leading-relaxed">
            Archive this preset and remove it from future suite runs? Existing eval history will remain available.
          </p>
          {pendingArchivePreset && (
            <p className="rounded-[8px] border border-border-dim bg-white/[0.03] px-3 py-2 text-[12px] text-foreground leading-relaxed">
              {pendingArchivePreset.name}
            </p>
          )}
          <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
            <button
              type="button"
              onClick={() => setPendingArchivePreset(null)}
              disabled={action.isBusy(pendingArchivePreset?._id)}
              className="px-4 py-2 rounded-[8px] border border-border-dim bg-white/[0.03] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/[0.06] transition-all disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmArchivePreset}
              disabled={action.isBusy(pendingArchivePreset?._id)}
              className="px-4 py-2 rounded-[8px] border border-red-500/20 bg-red-500/10 text-red-300 text-[13px] font-semibold hover:bg-red-500/15 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {action.isBusy(pendingArchivePreset?._id) && <Loader2 className="w-4 h-4 animate-spin" />}
              Archive preset
            </button>
          </div>
        </div>
      </SonaeModal>

    </div>
  );
}
