"use client";

import { FormEvent, useState } from "react";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  Archive,
  BrainCircuit,
  Cable,
  Library,
  Loader2,
  Search,
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
import { useAdminAction } from "@/src/hooks/useAdminAction";

type CompanySkill = Doc<"companySkills">;
type GlobalSkill = Doc<"agentSkills">;
type CompanySkillBinding = Doc<"companySkillBindings">;
type SkillStatus = CompanySkill["status"];
type SkillSurface = CompanySkillBinding["surfaceType"];


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





function getSurfaceLabel(surface: SkillSurface) {
  return SKILL_SURFACES.find((item) => item.value === surface)?.label ?? surface;
}

export default function CompanyAiSkillsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const setBinding = useMutation(api.companySkills.setBinding);
  const importGlobalSkill = useMutation(api.companySkills.importGlobalSkill);
  const archiveSkill = useMutation(api.companySkills.archiveSkill);

  const [statusFilter] = useState<SkillStatus>("ACTIVE");
  const skills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    { companyId, status: statusFilter },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
  const [bindingTarget, setBindingTarget] = useState<CompanySkill | null>(null);
  const [bindingForm, setBindingForm] = useState(DEFAULT_BINDING_FORM);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [globalSkillSearchTerm, setGlobalSkillSearchTerm] = useState("");
  const [selectedGlobalSkillIds, setSelectedGlobalSkillIds] = useState<Array<Id<"agentSkills">>>([]);

  // Searched and paged in the database. The previous picker read the first 250
  // active skills and filtered them in the browser, so in a library of hundreds
  // the rest could not be added to a company at all.
  const importable = usePaginatedQuery(
    api.companySkills.searchImportableGlobalSkills,
    { companyId, ...(globalSkillSearchTerm.trim() ? { searchTerm: globalSkillSearchTerm.trim() } : {}) },
    { initialNumItems: ADMIN_PAGE_SIZE },
  );

  const toggleGlobalSkill = (skillId: Id<"agentSkills">) => {
    setSelectedGlobalSkillIds((current) =>
      current.includes(skillId) ? current.filter((entry) => entry !== skillId) : [...current, skillId],
    );
  };
  const [expandedSkillId, setExpandedSkillId] = useState<Id<"companySkills"> | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<CompanySkill | null>(null);
  // One runner is safe here because the two modals that render the failure
  // inline are never open at once, and each clears it as it opens.
  const action = useAdminAction({ scope: "admin-company-skills" });



  const bindings = useQuery(
    api.companySkills.getBindingsForSkill,
    expandedSkillId ? { skillId: expandedSkillId } : "skip"
  );

  const handleSetBinding = async (event: FormEvent) => {
    event.preventDefault();
    if (!bindingTarget) return;
    const outcome = await action.run(
      () => setBinding({
        skillId: bindingTarget._id,
        surfaceType: bindingForm.surfaceType,
        surfaceId: bindingForm.surfaceId || undefined,
        isEnabled: bindingForm.isEnabled,
      }),
      { fallbackMessage: "Skill binding could not be saved.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setExpandedSkillId(bindingTarget._id);
    setBindingTarget(null);
    setBindingForm(DEFAULT_BINDING_FORM);
  };

  const handleArchiveSkill = async () => {
    if (!archiveTarget) return;
    // The archive modal has nowhere to show a failure, so this one keeps its
    // toast — before, a rejection left the modal open and said nothing.
    const outcome = await action.run(() => archiveSkill({ skillId: archiveTarget._id }), {
      fallbackMessage: "The skill could not be archived.",
    });
    if (!outcome.ok) return;
    if (expandedSkillId === archiveTarget._id) setExpandedSkillId(null);
    setArchiveTarget(null);
  };

  const handleImportGlobalSkill = async () => {
    if (selectedGlobalSkillIds.length === 0) return;
    const outcome = await action.run(
      async () => {
        // One at a time, but in one action: the reader ticked a set and expects
        // the set to arrive, not to be asked again for each one.
        for (const skillId of selectedGlobalSkillIds) {
          await importGlobalSkill({ companyId, skillId });
        }
        return selectedGlobalSkillIds.length;
      },
      { fallbackMessage: "The skills could not be added.", suppressErrorToast: true },
    );
    if (!outcome.ok) return;
    setIsImportOpen(false);
    setGlobalSkillSearchTerm("");
    setSelectedGlobalSkillIds([]);
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
              Skills from the Skill Center that this company&rsquo;s agents can use.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setIsImportOpen(true);
                action.clearError();
                setGlobalSkillSearchTerm("");
                setSelectedGlobalSkillIds([]);
              }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90"
            >
              <Library className="h-4 w-4" />
              Add from Skill Center
            </button>
          </div>
        </div>

      </header>

      <section className="rounded-[8px] border border-border-dim bg-sidebar/30 overflow-hidden">
        <div className="divide-y divide-border-dim">
          {skills.status === "LoadingFirstPage" ? (
            <div className="px-4 py-12 text-center">
              <Loader2 className="mx-auto h-5 w-5 animate-spin text-brand" />
            </div>
          ) : skills.results.length === 0 ? (
            <div className="px-4 py-12 text-center text-[13px] text-muted">
              No skills yet. Add one from the Skill Center.
            </div>
          ) : skills.results.map((skill) => {
            const isExpanded = expandedSkillId === skill._id;

            return (
              <div key={skill._id} className="px-4 py-4">
                <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                  {/* The name, and when it arrived. Risk, status, category, an
                      instruction preview, the approval-policy state and a
                      version label were six things on a row whose only real
                      question is whether this company has the skill. */}
                  <div className="min-w-0">
                    <h3 className="text-[14px] font-semibold text-foreground">{skill.name}</h3>
                    <p className="mt-1 text-[12px] leading-relaxed text-secondary line-clamp-1">
                      {skill.description || "No description."}
                    </p>
                    <p className="mt-1 text-[11px] text-muted">Added {formatDateTime(skill.updatedAt)}</p>
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
                          action.clearError();
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

      <SonaeModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="Add skills" size="lg">
        {/* Tick what you want and add it. The previous version made the reader
            select one skill, read a preview of its instructions, confirm, and
            start again for the next one. */}
        <div className="flex flex-col gap-4">
          <AdminModalFormError>{action.error}</AdminModalFormError>
          <label className="relative block">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              value={globalSkillSearchTerm}
              onChange={(event) => setGlobalSkillSearchTerm(event.target.value)}
              placeholder="Search skills"
              className="h-10 w-full rounded-[8px] border border-border-dim bg-background/50 pl-9 pr-3 text-[13px] text-foreground outline-none focus:border-brand/50"
            />
          </label>

          {importable.status === "LoadingFirstPage" ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
          ) : importable.results.length === 0 ? (
            <p className="px-1 py-8 text-center text-[13px] text-muted">
              {globalSkillSearchTerm.trim()
                ? "No skills match that search."
                : "Every skill in the Skill Center has already been added."}
            </p>
          ) : (
            <div className="max-h-[380px] divide-y divide-border-dim overflow-y-auto rounded-[8px] border border-border-dim bg-background/50">
              {importable.results.map((skill: GlobalSkill) => (
                <label
                  key={skill._id}
                  className="flex cursor-pointer items-start gap-3 px-4 py-3 transition-colors hover:bg-foreground/[0.03]"
                >
                  <input
                    type="checkbox"
                    checked={selectedGlobalSkillIds.includes(skill._id)}
                    onChange={() => toggleGlobalSkill(skill._id)}
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
              {importable.status === "CanLoadMore" && (
                <button
                  type="button"
                  onClick={() => importable.loadMore(ADMIN_PAGE_SIZE)}
                  className="w-full px-4 py-3 text-[12px] font-semibold text-secondary hover:bg-foreground/[0.03] hover:text-foreground"
                >
                  Show more skills
                </button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsImportOpen(false)}
              className="h-10 rounded-[8px] border border-border-dim px-4 text-[13px] text-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleImportGlobalSkill}
              disabled={selectedGlobalSkillIds.length === 0 || action.isBusy()}
              className="flex h-10 items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {action.isBusy() && <Loader2 className="h-4 w-4 animate-spin" />}
              {selectedGlobalSkillIds.length > 1
                ? `Add ${selectedGlobalSkillIds.length} skills`
                : "Add skill"}
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(bindingTarget)} onClose={() => setBindingTarget(null)} title="Bind Skill" size="md">
        <form onSubmit={handleSetBinding} className="flex flex-col gap-5">
          <AdminModalFormError>{action.error}</AdminModalFormError>
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
          <AdminModalFormActions cancelLabel="Cancel" submitLabel={action.isBusy() ? "Saving..." : "Save binding"} isSubmitting={action.isBusy()} onCancel={() => setBindingTarget(null)} />
        </form>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Archive Skill" size="sm">
        <div className="flex flex-col gap-6">
          <div className="flex gap-3 text-[13px] leading-relaxed text-secondary">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
            <p>Archiving disables enabled bindings and removes this skill from readiness scoring. Historical audit evidence remains.</p>
          </div>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={action.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleArchiveSkill} disabled={action.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
              Archive
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
