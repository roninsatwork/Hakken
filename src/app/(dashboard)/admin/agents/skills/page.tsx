"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { redirect, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { BarChart3, BrainCircuit, FileText, Loader2, Plus, Search, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";

type SkillStatus = Doc<"agentSkills">["status"];
type SkillRisk = Doc<"agentSkills">["riskLevel"];
type AiTool = Doc<"aiTools">;

type MarkdownImportDraft = {
  sourceFilename?: string;
  sourceHash: string;
  name: string;
  description?: string;
  category: string;
  riskLevel: SkillRisk;
  instruction: string;
  requiredToolMappingsJson: string;
  recommendedToolMappingsJson: string;
  suggestedEvalFixturesJson: string;
  validation: {
    errors: string[];
    warnings: string[];
    suggestions: string[];
  };
};

const emptyForm = {
  name: "",
  description: "",
  category: "GENERAL",
  riskLevel: "MEDIUM" as SkillRisk,
  status: "DRAFT" as SkillStatus,
  instruction: "",
  requiredToolMappings: "[]",
  recommendedToolMappings: "[]",
  suggestedEvalFixtures: "[]",
};

function riskTone(risk: SkillRisk) {
  if (risk === "HIGH") return "border-red-500/20 bg-red-500/10 text-red-400";
  if (risk === "MEDIUM") return "border-amber-500/20 bg-amber-500/10 text-amber-400";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
}

function statusTone(status: SkillStatus) {
  if (status === "ACTIVE") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  if (status === "ARCHIVED") return "border-border-dim bg-foreground/5 text-muted";
  return "border-sky-500/20 bg-sky-500/10 text-sky-400";
}

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-GB") : "...";
}

function parseJsonStringArray(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];
  } catch {
    return [];
  }
}

function formatJsonStringArray(values: string[]) {
  return JSON.stringify(Array.from(new Set(values)));
}

function toggleJsonStringArrayValue(value: string, entry: string) {
  const entries = parseJsonStringArray(value);
  return formatJsonStringArray(entries.includes(entry)
    ? entries.filter((item) => item !== entry)
    : [...entries, entry]);
}

function hasJsonStringArrayValue(value: string, entry: string) {
  return parseJsonStringArray(value).includes(entry);
}

function hasEvalFixtures(value: string) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) && parsed.length > 0;
  } catch {
    return false;
  }
}

function hasApprovalGuidance(draft: MarkdownImportDraft) {
  return draft.riskLevel !== "HIGH" || /\b(approval|required approval|human approval|pause|confirm|do not proceed)\b/i.test(draft.instruction);
}

function hasTenantSpecificSignals(draft: MarkdownImportDraft) {
  return /\b(acme|client id|customer id|company secret|api key|password)\b/i.test(`${draft.instruction}\n${draft.description ?? ""}`);
}

function getUnresolvedMappings(draft: MarkdownImportDraft, activeToolMappings: string[]) {
  const active = new Set(activeToolMappings);
  return [
    ...parseJsonStringArray(draft.requiredToolMappingsJson),
    ...parseJsonStringArray(draft.recommendedToolMappingsJson),
  ].filter((mapping) => !active.has(mapping));
}

type ToolMappingPickerProps = {
  mappings: string[];
  value: string;
  onChange: (value: string) => void;
};

function ToolMappingPicker({ mappings, value, onChange }: ToolMappingPickerProps) {
  if (mappings.length === 0) {
    return (
      <div className="rounded-[8px] border border-border-dim bg-black/15 px-3 py-2 text-[11px] text-muted">
        No active tool mappings are available.
      </div>
    );
  }

  return (
    <div className="rounded-[8px] border border-border-dim bg-black/15 p-2">
      <div className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted">Active mappings</div>
      <div className="flex max-h-28 flex-wrap gap-2 overflow-y-auto">
        {mappings.map((mapping) => {
          const isSelected = hasJsonStringArrayValue(value, mapping);
          return (
            <button
              key={mapping}
              type="button"
              onClick={() => onChange(toggleJsonStringArrayValue(value, mapping))}
              className={`rounded-[8px] border px-2.5 py-1.5 font-mono text-[11px] transition-colors ${
                isSelected
                  ? "border-brand/40 bg-brand/15 text-brand"
                  : "border-border-dim bg-background/40 text-secondary hover:text-foreground"
              }`}
            >
              {mapping}
            </button>
          );
        })}
      </div>
    </div>
  );
}

type MarkdownReadinessPanelProps = {
  draft: MarkdownImportDraft;
  activeToolMappings: string[];
};

function MarkdownReadinessPanel({ draft, activeToolMappings }: MarkdownReadinessPanelProps) {
  const unresolvedMappings = getUnresolvedMappings(draft, activeToolMappings);
  const readinessRows = [
    {
      label: "Tool mappings",
      ready: unresolvedMappings.length === 0,
      detail: unresolvedMappings.length === 0 ? "All imported mappings match active tools." : `${unresolvedMappings.length} unresolved`,
    },
    {
      label: "Approval",
      ready: hasApprovalGuidance(draft),
      detail: hasApprovalGuidance(draft) ? "Approval guidance present or not required." : "High-risk skill needs approval guidance.",
    },
    {
      label: "Eval fixtures",
      ready: hasEvalFixtures(draft.suggestedEvalFixturesJson),
      detail: hasEvalFixtures(draft.suggestedEvalFixturesJson) ? "Starter fixtures included." : "No starter fixtures.",
    },
    {
      label: "Shared scope",
      ready: !hasTenantSpecificSignals(draft),
      detail: hasTenantSpecificSignals(draft) ? "Review for tenant-specific facts." : "No obvious sensitive tenant facts.",
    },
  ];

  return (
    <div className="rounded-[8px] border border-border-dim bg-black/15 p-3">
      <div className="mb-3 text-[11px] font-semibold text-foreground">Production readiness</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {readinessRows.map((row) => (
          <div key={row.label} className="rounded-[8px] border border-border-dim bg-background/40 px-3 py-2">
            <div className="flex items-center justify-between gap-3">
              <span className="text-[11px] font-medium text-secondary">{row.label}</span>
              <span className={`rounded-[8px] border px-2 py-0.5 font-mono text-[10px] uppercase tracking-widest ${
                row.ready ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-amber-500/20 bg-amber-500/10 text-amber-300"
              }`}
              >
                {row.ready ? "ready" : "review"}
              </span>
            </div>
            <div className="mt-1 text-[11px] text-muted">{row.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

async function readFileText(file: File) {
  if (typeof file.text === "function") return await file.text();
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("File could not be read."));
    reader.readAsText(file);
  });
}

type AgentSkillsCatalogPageProps = {
  basePath?: string;
};

export function AgentSkillsCatalog({ basePath = "/admin/ai/skills" }: AgentSkillsCatalogPageProps) {
  const createSkill = useMutation(api.agentSkills.createSkill);
  const importSkillBundle = useMutation(api.agentSkills.importSkillBundle);
  const previewSkillMarkdownImport = useMutation(api.agentSkills.previewSkillMarkdownImport);
  const importSkillMarkdown = useMutation(api.agentSkills.importSkillMarkdown);
  const seedStarterSkills = useMutation(api.agentSkills.seedStarterSkills);
  const analytics = useQuery(api.agentSkills.getSkillCatalogAnalytics, {});
  const toolCatalog = useQuery(api.aiTools.getTools, {});
  const activeToolMappings = Array.isArray(toolCatalog)
    ? toolCatalog
      .filter((tool: AiTool) => tool.isActive !== false)
      .map((tool: AiTool) => tool.handlerMapping)
      .filter(Boolean)
    : [];
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<SkillStatus | "">("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // Opened directly by the "Upload new version" button on a skill page, so
  // that action lands on the upload rather than on a list the reader then has
  // to find their way out of again.
  const searchParams = useSearchParams();
  const [isMarkdownOpen, setIsMarkdownOpen] = useState(searchParams?.get("import") === "1");
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [bundleJson, setBundleJson] = useState("");
  const [markdownFile, setMarkdownFile] = useState<File | null>(null);
  const [markdownSourceText, setMarkdownSourceText] = useState("");
  const [markdownDraft, setMarkdownDraft] = useState<MarkdownImportDraft | null>(null);
  // Each dialog on this page runs one write, so each gets its own busy key.
  const CREATE_KEY = "create";
  const SEED_KEY = "seed";
  const IMPORT_KEY = "import";
  const PARSE_KEY = "parse";
  const MARKDOWN_SAVE_KEY = "markdown-save";
  const action = useAdminAction({ scope: "admin-agent-skills" });
  // Local `error` carries client-side validation only — a missing file, an empty
  // one. Server failures come from the runner, which has already unwrapped and
  // reported them; the dialogs render whichever is current.
  const [validationError, setValidationError] = useState("");
  const error = validationError || action.error;
  const [feedback, setFeedback] = useState("");
  const [importedSkillId, setImportedSkillId] = useState<Id<"agentSkills"> | null>(null);
  const {
    results: skills,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.agentSkills.getPaginatedSkills,
    { searchTerm, ...(statusFilter ? { status: statusFilter } : {}) },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  // Undefined while loading. Zero counted skills and an empty page means there
  // is nothing to report on yet, so the panel stays away rather than showing
  // five zeros to someone who has just arrived.
  const hasSkills = analytics === undefined || analytics.totals.skills > 0 || skills.length > 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const outcome = await action.run(() => createSkill({
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        status: form.status,
        riskLevel: form.riskLevel,
        instruction: form.instruction,
        requiredToolMappingsJson: form.requiredToolMappings,
        recommendedToolMappingsJson: form.recommendedToolMappings,
        suggestedEvalFixturesJson: form.suggestedEvalFixtures,
      }), { key: CREATE_KEY, fallbackMessage: "Skill could not be created.", suppressErrorToast: true });
    // The draft stays on screen if the save failed.
    if (!outcome.ok) return;
    setForm(emptyForm);
    setIsCreateOpen(false);
  };

  const seedStarters = async () => {
    setFeedback("");
    const outcome = await action.run(() => seedStarterSkills({}), {
      key: SEED_KEY,
      fallbackMessage: "Starter skills could not be seeded.",
      suppressErrorToast: true,
    });
    if (!outcome.ok) return;
    const { createdCount, skippedCount } = outcome.data;
    setFeedback(`Created ${createdCount} starter skill${createdCount === 1 ? "" : "s"}; skipped ${skippedCount} existing.`);
  };

  const importBundle = async (event: FormEvent) => {
    event.preventDefault();
    setFeedback("");
    setImportedSkillId(null);
    const outcome = await action.run(() => importSkillBundle({ bundleJson }), {
      key: IMPORT_KEY,
      fallbackMessage: "Skill bundle could not be imported.",
      suppressErrorToast: true,
    });
    // The pasted bundle stays in the box if the import failed.
    if (!outcome.ok) return;
    setImportedSkillId(outcome.data.skillId);
    setBundleJson("");
    setIsImportOpen(false);
    setFeedback("Skill bundle imported as a draft.");
  };

  const resetMarkdownImport = () => {
    setMarkdownFile(null);
    setMarkdownSourceText("");
    setMarkdownDraft(null);
    setValidationError("");
  };

  const parseMarkdown = async (event: FormEvent) => {
    event.preventDefault();
    if (!markdownFile) {
      setValidationError("Choose a SKILL.md file to import.");
      return;
    }
    if (!markdownSourceText.trim()) {
      setValidationError("The selected SKILL.md file is empty.");
      return;
    }
    setFeedback("");
    setImportedSkillId(null);
    const outcome = await action.run(
      () => previewSkillMarkdownImport({ markdown: markdownSourceText, filename: markdownFile.name }),
      { key: PARSE_KEY, fallbackMessage: "SKILL.md could not be parsed.", suppressErrorToast: true },
    );
    if (outcome.ok) setMarkdownDraft(outcome.data as MarkdownImportDraft);
  };

  const saveMarkdownDraft = async (event: FormEvent) => {
    event.preventDefault();
    if (!markdownDraft) return;
    setFeedback("");
    setImportedSkillId(null);
    const outcome = await action.run(() => importSkillMarkdown({
        sourceFilename: markdownDraft.sourceFilename,
        sourceHash: markdownDraft.sourceHash,
        // The file itself, kept so the skill page can show what was uploaded
        // and hand the original back rather than a rebuilt approximation.
        sourceMarkdown: markdownSourceText,
        name: markdownDraft.name,
        description: markdownDraft.description || undefined,
        category: markdownDraft.category,
        riskLevel: markdownDraft.riskLevel,
        instruction: markdownDraft.instruction,
        requiredToolMappingsJson: markdownDraft.requiredToolMappingsJson,
        recommendedToolMappingsJson: markdownDraft.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: markdownDraft.suggestedEvalFixturesJson,
      }), { key: MARKDOWN_SAVE_KEY, fallbackMessage: "SKILL.md could not be imported.", suppressErrorToast: true });
    // The reviewed draft stays on screen if the import failed.
    if (!outcome.ok) return;
    setImportedSkillId(outcome.data.skillId);
    setIsMarkdownOpen(false);
    resetMarkdownImport();
    // Which of the three happened matters: "imported" on a re-upload would have
    // the reader hunting for a second copy that was never created.
    setFeedback(
      outcome.data.outcome === "CREATED"
        ? `Added ${markdownDraft.name} as a draft skill.`
        : outcome.data.outcome === "UPDATED"
          ? `Updated ${markdownDraft.name} from the file. Agents using it keep working until you roll them onto the new version.`
          : `${markdownDraft.name} is already up to date — the file has not changed since the last upload.`,
    );
  };

  return (
    <div className="flex flex-col gap-5 h-full pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-brand" />
            Skill Center
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Central management for reusable SKILL.md files and eval-backed capability packages.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setIsMarkdownOpen(true);
              resetMarkdownImport();
              setFeedback("");
            }}
            className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <FileText className="w-4 h-4" />
            Upload a skill file
          </button>
          <button
            type="button"
            onClick={() => {
              setIsImportOpen(true);
              setValidationError("");
              setFeedback("");
            }}
            className="h-10 px-4 rounded-[8px] border border-border-dim bg-card text-[13px] font-medium text-secondary flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-brand" />
            Restore from backup
          </button>
          <button
            type="button"
            onClick={seedStarters}
            disabled={action.isBusy(SEED_KEY)}
            className="h-10 px-4 rounded-[8px] border border-border-dim bg-card text-[13px] font-medium text-secondary flex items-center gap-2 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {action.isBusy(SEED_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-brand" />}
            Add example skills
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="h-10 px-4 rounded-[8px] border border-border-dim bg-card text-[13px] font-medium text-secondary flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <Plus className="w-4 h-4 text-brand" />
            Write one here
          </button>
        </div>
      </header>

      {(feedback || error) && (
        <div className={`rounded-[8px] border p-3 text-[12px] ${
          feedback
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}>
          {feedback || error}
          {importedSkillId && (
            <Link href={`${basePath}/${importedSkillId}`} className="ml-2 font-semibold underline underline-offset-2">
              Open imported skill
            </Link>
          )}
        </div>
      )}

      {/* Only shown once there is something to measure. Five large counters
          all reading zero was the most prominent thing on an empty account, and
          a panel that measures nothing reads as broken rather than as new. */}
      {hasSkills && (
      <section className="border border-border-dim rounded-[8px] bg-card px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand" />
              How your skills are being used
            </h2>
            <p className="text-[12px] text-secondary mt-1">
              Which agents have picked up your skills, and which of those need attention.
            </p>
          </div>
          {analytics === undefined ? (
            <div className="text-[12px] text-muted flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading analytics
            </div>
          ) : (
            // These counts are recomputed periodically rather than on every
            // load, so the panel says when it last counted. Presenting a number
            // of unknown age as live is the habit this whole pass is removing.
            <div className="text-[12px] text-muted">
              {analytics.computedAt
                ? `Counted ${formatDateTime(analytics.computedAt)}${analytics.isPartial ? ` · first ${analytics.skillsCounted} skills` : ""}`
                : "Not counted yet"}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {[
            { label: "Skills", value: analytics?.totals.skills },
            { label: "In use by agents", value: analytics?.totals.enabledBindings },
            { label: "Out of date", value: analytics?.totals.outdatedBindings },
            { label: "Tested", value: analytics?.totals.validatedBindings },
            { label: "Untested", value: analytics?.totals.needsSmokeBindings },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[8px] border border-border-dim bg-black/15 px-3 py-2 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{stat.label}</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">{formatCount(stat.value)}</div>
            </div>
          ))}
        </div>
        {analytics && analytics.needsAttention.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Needs attention</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {analytics.needsAttention.slice(0, 4).map((row: {
                skillId: Id<"agentSkills">;
                name: string;
                category: string;
                riskLevel: SkillRisk;
                outdatedAgents: number;
                needsSmokeAgents: number;
                validatedAgents: number;
              }) => (
                <Link
                  key={row.skillId}
                  href={`${basePath}/${row.skillId}`}
                  className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 hover:border-brand/40 transition-colors flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-foreground">{row.name}</span>
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${riskTone(row.riskLevel)}`}>
                      {row.riskLevel.toLowerCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                    <span>{row.category}</span>
                    <span>{row.outdatedAgents} outdated</span>
                    <span>{row.needsSmokeAgents} needs smoke</span>
                    <span>{row.validatedAgents} validated</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : analytics ? (
          <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
            No enabled skill bindings need upgrade or smoke validation.
          </div>
        ) : null}
      </section>
      )}

      {/* Search and status lead, because a catalogue of hundreds is navigated
          rather than scanned. Both narrow in the database. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search skills by name"
            className="w-full h-10 pl-9 pr-3 rounded-[8px] border border-border-dim bg-card text-[13px] text-foreground outline-none focus:border-brand/50"
          />
        </div>
        <label className="sr-only" htmlFor="skill-status-filter">Filter by status</label>
        <select
          id="skill-status-filter"
          value={statusFilter}
          onChange={(event) => setStatusFilter(event.target.value as SkillStatus | "")}
          className="h-10 px-3 rounded-[8px] border border-border-dim bg-card text-[13px] text-foreground outline-none focus:border-brand/50 sm:w-48"
        >
          <option value="">All statuses</option>
          <option value="ACTIVE">Published</option>
          <option value="DRAFT">Draft</option>
          <option value="ARCHIVED">Archived</option>
        </select>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {status === "LoadingFirstPage" ? (
          <div className="col-span-full border border-border-dim rounded-[8px] p-8 text-secondary flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading skills
          </div>
        ) : skills.length === 0 ? (
          <div className="col-span-full border border-dashed border-border-dim rounded-[8px] p-10 text-center text-secondary">
            No skills have been created yet.
          </div>
        ) : (
          skills.map((skill) => (
            <Link
              key={skill._id}
              href={`${basePath}/${skill._id}`}
              className="border border-border-dim rounded-[8px] bg-card px-4 py-4 hover:border-brand/40 transition-colors flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-semibold text-foreground truncate">{skill.name}</h2>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{skill.category}</span>
                  </div>
                  <p className="text-[12px] text-secondary mt-1 line-clamp-2">{skill.description || "No description provided."}</p>
                </div>
                <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${statusTone(skill.status)}`}>
                  {skill.status.toLowerCase()}
                </span>
                <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${riskTone(skill.riskLevel)}`}>
                  {skill.riskLevel.toLowerCase()} risk
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {/* How many of how many. The list previously showed a page and a "Load
          more" button, so there was no way to tell a full catalogue from a
          filtered one — or from a truncated one. The total comes from the
          rollup, which is why it is described as counted rather than live. */}
      {skills.length > 0 && (
        <div className="self-center flex flex-col items-center gap-2">
          <p className="text-[12px] text-muted">
            {searchTerm.trim()
              ? `Showing ${skills.length} matching skill${skills.length === 1 ? "" : "s"}`
              : analytics?.computedAt
                ? `Showing ${skills.length} of ${analytics.isPartial ? `${analytics.skillsCounted}+` : analytics.totals.skills} skills`
                : `Showing ${skills.length} skill${skills.length === 1 ? "" : "s"}`}
          </p>
          {status === "CanLoadMore" && (
            <button
              type="button"
              onClick={() => loadMore(ADMIN_PAGE_SIZE)}
              className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-hover transition-colors"
            >
              Load more
            </button>
          )}
        </div>
      )}

      <SonaeModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New agent skill" size="lg">
        <form onSubmit={submit} className="flex flex-col gap-4 px-1 pb-2">
          {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Name
              <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Category
              <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Status
              <select className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SkillStatus })}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Risk
              <select className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.riskLevel} onChange={(event) => setForm({ ...form, riskLevel: event.target.value as SkillRisk })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Description
            <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Instruction
            <textarea className="min-h-36 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={form.instruction} onChange={(event) => setForm({ ...form, instruction: event.target.value })} required />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Required tool mappings JSON
              <textarea className="min-h-20 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={form.requiredToolMappings} onChange={(event) => setForm({ ...form, requiredToolMappings: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Suggested eval fixtures JSON
              <textarea className="min-h-20 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={form.suggestedEvalFixtures} onChange={(event) => setForm({ ...form, suggestedEvalFixtures: event.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Cancel</button>
            <button type="submit" disabled={action.isBusy(CREATE_KEY)} className="h-9 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium flex items-center gap-2 disabled:opacity-50">
              {action.isBusy(CREATE_KEY) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </SonaeModal>

      <SonaeModal
        isOpen={isMarkdownOpen}
        onClose={() => {
          setIsMarkdownOpen(false);
          resetMarkdownImport();
        }}
        title="Import SKILL.md"
        size="lg"
      >
        {!markdownDraft ? (
          <form onSubmit={parseMarkdown} className="flex flex-col gap-4 px-1 pb-2">
            {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
            <label className="flex flex-col gap-2 text-[12px] text-secondary">
              SKILL.md file
              <input
                type="file"
                accept=".md,text/markdown,text/plain"
                onChange={async (event) => {
                  const file = event.target.files?.[0] ?? null;
                  setMarkdownFile(file);
                  setMarkdownSourceText("");
                  setValidationError("");
                  if (!file) return;
                  try {
                    setMarkdownSourceText(await readFileText(file));
                  } catch (err) {
                    setValidationError(err instanceof Error ? err.message : "File could not be read.");
                  }
                }}
                className="rounded-[8px] border border-dashed border-border-dim bg-card p-4 text-[13px] text-foreground file:mr-3 file:rounded-[8px] file:border-0 file:bg-brand file:px-3 file:py-2 file:text-[12px] file:font-medium file:text-white"
              />
            </label>
            {markdownFile && (
              <div className="rounded-[8px] border border-border-dim bg-black/15 px-3 py-2 text-[12px] text-secondary">
                Selected file: <span className="font-mono text-foreground">{markdownFile.name}</span>
              </div>
            )}
            <div className="rounded-[8px] border border-border-dim bg-black/15 px-3 py-2 text-[12px] text-secondary">
              The import creates a draft skill. Review the parsed fields before publishing or attaching it to agents.
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsMarkdownOpen(false)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Cancel</button>
              <button type="submit" disabled={action.isBusy(PARSE_KEY) || !markdownSourceText.trim()} className="h-9 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium flex items-center gap-2 disabled:opacity-50">
                {action.isBusy(PARSE_KEY) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                Parse file
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={saveMarkdownDraft} className="flex flex-col gap-4 px-1 pb-2">
            {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
            {markdownDraft.validation.errors.length > 0 && (
              <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">
                <div className="font-semibold mb-1">Blocking issues</div>
                <ul className="list-disc pl-4 space-y-1">
                  {markdownDraft.validation.errors.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}
            {markdownDraft.validation.warnings.length > 0 && (
              <div className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 p-3 text-[12px] text-amber-300">
                <div className="font-semibold mb-1">Warnings</div>
                <ul className="list-disc pl-4 space-y-1">
                  {markdownDraft.validation.warnings.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}
            {markdownDraft.validation.suggestions.length > 0 && (
              <div className="rounded-[8px] border border-sky-500/20 bg-sky-500/10 p-3 text-[12px] text-sky-300">
                <div className="font-semibold mb-1">Suggestions</div>
                <ul className="list-disc pl-4 space-y-1">
                  {markdownDraft.validation.suggestions.map((message) => <li key={message}>{message}</li>)}
                </ul>
              </div>
            )}
            <MarkdownReadinessPanel draft={markdownDraft} activeToolMappings={activeToolMappings} />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-secondary">
                Name
                <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={markdownDraft.name} onChange={(event) => setMarkdownDraft({ ...markdownDraft, name: event.target.value })} required />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-secondary">
                Category
                <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={markdownDraft.category} onChange={(event) => setMarkdownDraft({ ...markdownDraft, category: event.target.value })} />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-secondary">
                Status
                <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-muted" value="DRAFT" disabled readOnly />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-secondary">
                Risk
                <select className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={markdownDraft.riskLevel} onChange={(event) => setMarkdownDraft({ ...markdownDraft, riskLevel: event.target.value as SkillRisk })}>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                </select>
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Description
              <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={markdownDraft.description ?? ""} onChange={(event) => setMarkdownDraft({ ...markdownDraft, description: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Instruction
              <textarea className="min-h-40 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={markdownDraft.instruction} onChange={(event) => setMarkdownDraft({ ...markdownDraft, instruction: event.target.value })} required />
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px] text-secondary">
                Required tool mappings JSON
                <textarea className="min-h-20 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={markdownDraft.requiredToolMappingsJson} onChange={(event) => setMarkdownDraft({ ...markdownDraft, requiredToolMappingsJson: event.target.value })} />
                <ToolMappingPicker
                  mappings={activeToolMappings}
                  value={markdownDraft.requiredToolMappingsJson}
                  onChange={(value) => setMarkdownDraft({ ...markdownDraft, requiredToolMappingsJson: value })}
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px] text-secondary">
                Recommended tool mappings JSON
                <textarea className="min-h-20 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={markdownDraft.recommendedToolMappingsJson} onChange={(event) => setMarkdownDraft({ ...markdownDraft, recommendedToolMappingsJson: event.target.value })} />
                <ToolMappingPicker
                  mappings={activeToolMappings}
                  value={markdownDraft.recommendedToolMappingsJson}
                  onChange={(value) => setMarkdownDraft({ ...markdownDraft, recommendedToolMappingsJson: value })}
                />
              </label>
            </div>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Suggested eval fixtures JSON
              <textarea className="min-h-24 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={markdownDraft.suggestedEvalFixturesJson} onChange={(event) => setMarkdownDraft({ ...markdownDraft, suggestedEvalFixturesJson: event.target.value })} />
            </label>
            <div className="flex justify-between gap-2">
              <button type="button" onClick={() => setMarkdownDraft(null)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Choose another file</button>
              <div className="flex gap-2">
                <button type="button" onClick={() => setIsMarkdownOpen(false)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Cancel</button>
                <button
                  type="submit"
                  disabled={action.isBusy(MARKDOWN_SAVE_KEY) || markdownDraft.validation.errors.length > 0}
                  className="h-9 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium flex items-center gap-2 disabled:opacity-50"
                >
                  {action.isBusy(MARKDOWN_SAVE_KEY) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  Save draft
                </button>
              </div>
            </div>
          </form>
        )}
      </SonaeModal>

      <SonaeModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="Import skill bundle" size="lg">
        <form onSubmit={importBundle} className="flex flex-col gap-4 px-1 pb-2">
          {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Bundle JSON
            <textarea
              className="min-h-64 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]"
              value={bundleJson}
              onChange={(event) => setBundleJson(event.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsImportOpen(false)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Cancel</button>
            <button type="submit" disabled={action.isBusy(IMPORT_KEY)} className="h-9 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium flex items-center gap-2 disabled:opacity-50">
              {action.isBusy(IMPORT_KEY) && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Import draft
            </button>
          </div>
        </form>
      </SonaeModal>
    </div>
  );
}

export default function AgentSkillsCatalogPage() {
  redirect("/admin/ai/skills");
}
