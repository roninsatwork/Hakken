"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  Archive,
  BrainCircuit,
  Cable,
  Loader2,
  Plus,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { AdminLoadMoreFooter } from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  AdminModalFormActions,
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type CompanySkill = Doc<"companySkills">;
type CompanySkillBinding = Doc<"companySkillBindings">;
type SkillStatus = CompanySkill["status"];
type SkillRisk = CompanySkill["riskLevel"];
type SkillSurface = CompanySkillBinding["surfaceType"];

const SKILL_STATUSES: Array<{ value: SkillStatus; label: string }> = [
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "ARCHIVED", label: "Archived" },
];

const SKILL_SURFACES: Array<{ value: SkillSurface; label: string }> = [
  { value: "COMPANY_CHAT", label: "Company chat" },
  { value: "WIDGET", label: "Widget" },
  { value: "AGENT", label: "Agent" },
  { value: "WORKFLOW", label: "Workflow" },
  { value: "APP_KIT", label: "App kit" },
];

const DEFAULT_BINDING_FORM = {
  surfaceType: "COMPANY_CHAT" as SkillSurface,
  surfaceId: "",
  isEnabled: true,
};

function getRiskClasses(risk: SkillRisk) {
  if (risk === "HIGH") return "border-red-500/20 bg-red-500/10 text-red-300";
  if (risk === "MEDIUM") return "border-amber-500/20 bg-amber-500/10 text-amber-300";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
}

function getStatusClasses(status: SkillStatus) {
  if (status === "ACTIVE") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-300";
  if (status === "ARCHIVED") return "border-border-dim bg-foreground/5 text-muted";
  return "border-blue-500/20 bg-blue-500/10 text-blue-300";
}

function parseStringArray(value: string | undefined) {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((entry): entry is string => typeof entry === "string") : [];
  } catch {
    return [];
  }
}

function hasJson(value: string | undefined) {
  if (!value) return false;
  try {
    JSON.parse(value);
    return true;
  } catch {
    return false;
  }
}

function getSurfaceLabel(surface: SkillSurface) {
  return SKILL_SURFACES.find((item) => item.value === surface)?.label ?? surface;
}

export default function CompanyAiSkillsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const aiHref = `/admin/companies/${companyId}/ai`;
  const summary = useQuery(api.companySkills.getSummary, { companyId });
  const setBinding = useMutation(api.companySkills.setBinding);
  const archiveSkill = useMutation(api.companySkills.archiveSkill);

  const [statusFilter, setStatusFilter] = useState<SkillStatus>("ACTIVE");
  const skills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    { companyId, status: statusFilter },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const [bindingTarget, setBindingTarget] = useState<CompanySkill | null>(null);
  const [bindingForm, setBindingForm] = useState(DEFAULT_BINDING_FORM);
  const [bindingError, setBindingError] = useState("");
  const [expandedSkillId, setExpandedSkillId] = useState<Id<"companySkills"> | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CompanySkill | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const bindings = useQuery(
    api.companySkills.getBindingsForSkill,
    expandedSkillId ? { skillId: expandedSkillId } : "skip"
  );

  const handleSetBinding = async (event: FormEvent) => {
    event.preventDefault();
    if (!bindingTarget) return;
    setIsSubmitting(true);
    setBindingError("");
    try {
      await setBinding({
        skillId: bindingTarget._id,
        surfaceType: bindingForm.surfaceType,
        surfaceId: bindingForm.surfaceId || undefined,
        isEnabled: bindingForm.isEnabled,
      });
      setExpandedSkillId(bindingTarget._id);
      setBindingTarget(null);
      setBindingForm(DEFAULT_BINDING_FORM);
    } catch (error) {
      setBindingError(error instanceof Error ? error.message : "Skill binding could not be saved.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleArchiveSkill = async () => {
    if (!archiveTarget) return;
    setIsSubmitting(true);
    try {
      await archiveSkill({ skillId: archiveTarget._id });
      if (expandedSkillId === archiveTarget._id) setExpandedSkillId(null);
      setArchiveTarget(null);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div className="flex flex-col xl:flex-row xl:items-end xl:justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
              <BrainCircuit className="h-6 w-6 text-brand" />
              Company Skills
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              Govern reusable company capabilities, tool requirements, approval policy, and surface availability.
            </p>
          </div>
          <Link
            href={`${aiHref}/skills/new?returnTo=${encodeURIComponent(`${aiHref}/skills`)}`}
            className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
          >
            <Plus className="h-4 w-4" />
            New skill
          </Link>
        </div>

        <div className="grid grid-cols-2 lg:grid-cols-6 gap-3">
          {[
            { label: "Active", value: summary?.activeSkills ?? 0 },
            { label: "Drafts", value: summary?.draftSkills ?? 0 },
            { label: "Bindings", value: summary?.enabledBindings ?? 0 },
            { label: "Ready", value: summary?.readySkills ?? 0 },
            { label: "Tool gaps", value: summary?.missingToolRequirementSkills ?? 0 },
            { label: "Approval gaps", value: summary?.highRiskMissingApproval ?? 0 },
          ].map((metric) => (
            <div key={metric.label} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-4">
              <div className="text-[10px] font-mono uppercase tracking-widest text-muted">{metric.label}</div>
              <div className="mt-2 text-2xl font-semibold text-foreground">
                {summary === undefined ? "..." : metric.value.toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </header>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-border-dim px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground">Skill Catalog</h2>
            <p className="mt-0.5 text-[12px] text-secondary">Bindings declare availability only; runtime tool authorization remains enforced by backend connectors and permissions.</p>
          </div>
          <div className="inline-flex rounded-[8px] border border-border-dim bg-background/50 p-1">
            {SKILL_STATUSES.map((status) => (
              <button
                key={status.value}
                type="button"
                onClick={() => setStatusFilter(status.value)}
                className={`h-8 rounded-[6px] px-3 text-[12px] font-semibold transition-colors ${
                  statusFilter === status.value ? "bg-brand text-white" : "text-secondary hover:text-foreground hover:bg-foreground/5"
                }`}
              >
                {status.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border-dim">
          {skills.status === "LoadingFirstPage" ? (
            <div className="px-4 py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
            </div>
          ) : skills.results.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-muted">No company skills found for this status.</div>
          ) : skills.results.map((skill) => {
            const requiredTools = parseStringArray(skill.requiredToolsJson);
            const isExpanded = expandedSkillId === skill._id;
            const hasApprovalPolicy = hasJson(skill.approvalPolicyJson);

            return (
              <div key={skill._id} className="px-4 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-[14px] font-semibold text-foreground">{skill.name}</h3>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getRiskClasses(skill.riskLevel)}`}>
                        {skill.riskLevel} risk
                      </span>
                      <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${getStatusClasses(skill.status)}`}>
                        {skill.status}
                      </span>
                      <span className="rounded-md border border-border-dim bg-foreground/5 px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest text-secondary">
                        {skill.category}
                      </span>
                    </div>
                    <p className="mt-2 text-[12px] leading-relaxed text-secondary">{skill.description || "No description provided."}</p>
                    <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-muted">{skill.instruction}</p>
                    <div className="mt-2 flex flex-wrap gap-3 text-[10px] font-mono uppercase tracking-widest text-muted">
                      <span>{requiredTools.length} required tool{requiredTools.length === 1 ? "" : "s"}</span>
                      <span>{hasApprovalPolicy ? "approval policy set" : "no approval policy"}</span>
                      {skill.versionLabel && <span>{skill.versionLabel}</span>}
                      <span>{formatDateTime(skill.updatedAt)}</span>
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => setExpandedSkillId(isExpanded ? null : skill._id)}
                      className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-3 text-[12px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      Bindings
                    </button>
                    {skill.status !== "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => {
                          setBindingTarget(skill);
                          setBindingForm(DEFAULT_BINDING_FORM);
                          setBindingError("");
                        }}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 text-[12px] font-semibold text-emerald-300 transition-colors hover:bg-emerald-500/15"
                      >
                        <Cable className="h-3.5 w-3.5" />
                        Bind
                      </button>
                    )}
                    {skill.status !== "ARCHIVED" && (
                      <button
                        type="button"
                        onClick={() => setArchiveTarget(skill)}
                        className="inline-flex h-8 items-center justify-center gap-2 rounded-[8px] border border-red-500/20 bg-red-500/10 px-3 text-[12px] font-semibold text-red-300 transition-colors hover:bg-red-500/15"
                      >
                        <Archive className="h-3.5 w-3.5" />
                        Archive
                      </button>
                    )}
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-4 rounded-[8px] border border-border-dim bg-background/50 p-3">
                    {bindings === undefined ? (
                      <Loader2 className="h-4 w-4 animate-spin text-brand" />
                    ) : bindings.length === 0 ? (
                      <p className="text-[12px] text-muted">No surface bindings recorded for this skill.</p>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {bindings.map((binding) => (
                          <div key={binding._id} className="rounded-[8px] border border-border-dim bg-sidebar/30 p-3">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <div className="text-[12px] font-semibold text-foreground">{getSurfaceLabel(binding.surfaceType)}</div>
                                <div className="mt-1 truncate text-[10px] font-mono uppercase tracking-widest text-muted">
                                  {binding.surfaceId || "default surface"}
                                </div>
                              </div>
                              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest ${
                                binding.isEnabled ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300" : "border-border-dim bg-foreground/5 text-muted"
                              }`}>
                                {binding.isEnabled ? "enabled" : "disabled"}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <AdminLoadMoreFooter
          visibleCount={skills.results.length}
          canLoadMore={skills.status === "CanLoadMore"}
          isLoading={skills.status === "LoadingMore"}
          onLoadMore={() => skills.loadMore(ADMIN_PAGE_SIZE)}
        />
      </section>

      <SonaeModal isOpen={Boolean(bindingTarget)} onClose={() => setBindingTarget(null)} title="Bind Skill" size="md">
        <form onSubmit={handleSetBinding} className="flex flex-col gap-5">
          <AdminModalFormError>{bindingError}</AdminModalFormError>
          <p className="text-[13px] leading-relaxed text-secondary">
            Bindings make a skill available to a surface. They do not grant connector permissions or bypass backend authorization.
          </p>
          <AdminModalFormField label="Surface">
            <select className={adminModalInputClassName} value={bindingForm.surfaceType} onChange={(event) => setBindingForm((current) => ({ ...current, surfaceType: event.target.value as SkillSurface }))}>
              {SKILL_SURFACES.map((surface) => <option key={surface.value} value={surface.value}>{surface.label}</option>)}
            </select>
          </AdminModalFormField>
          <AdminModalFormField label="Surface id" hint="Optional for a specific widget, agent, workflow, or app kit">
            <input className={adminModalInputClassName} value={bindingForm.surfaceId} onChange={(event) => setBindingForm((current) => ({ ...current, surfaceId: event.target.value }))} placeholder="Leave blank for default company surface" />
          </AdminModalFormField>
          <label className="flex items-center gap-3 rounded-[8px] border border-border-dim bg-background/50 px-3 py-3 text-[13px] text-foreground">
            <input
              type="checkbox"
              checked={bindingForm.isEnabled}
              onChange={(event) => setBindingForm((current) => ({ ...current, isEnabled: event.target.checked }))}
              className="h-4 w-4 accent-brand"
            />
            Enabled for this surface
          </label>
          <AdminModalFormActions cancelLabel="Cancel" submitLabel={isSubmitting ? "Saving..." : "Save binding"} isSubmitting={isSubmitting} onCancel={() => setBindingTarget(null)} />
        </form>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive Skill" size="sm">
        <div className="flex flex-col gap-6">
          <div className="flex gap-3 text-[13px] leading-relaxed text-secondary">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p>Archiving disables enabled bindings and removes this skill from readiness scoring. Historical audit evidence remains.</p>
          </div>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={isSubmitting} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleArchiveSkill} disabled={isSubmitting} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Archive
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
