"use client";

import { useState } from "react";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  BrainCircuit,
  Library,
  Loader2,
  Search,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminPaginationFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { AdminModalFormError } from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type CompanySkill = Doc<"companySkills">;
type GlobalSkill = Doc<"agentSkills">;
type SkillStatus = CompanySkill["status"];









export default function CompanyAiSkillsPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const importGlobalSkill = useMutation(api.companySkills.importGlobalSkill);
  const archiveSkill = useMutation(api.companySkills.archiveSkill);

  const [statusFilter] = useState<SkillStatus>("ACTIVE");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const skills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    { companyId, status: statusFilter, ...(companySearchTerm.trim() ? { searchTerm: companySearchTerm.trim() } : {}) },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );
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

  const [archiveTarget, setArchiveTarget] = useState<CompanySkill | null>(null);
  // One runner is safe here because the two modals that render the failure
  // inline are never open at once, and each clears it as it opens.
  const action = useAdminAction({ scope: "admin-company-skills" });



  const pageStart = (page - 1) * ADMIN_PAGE_SIZE;
  const pageSkills = skills.results.slice(pageStart, pageStart + ADMIN_PAGE_SIZE);
  // No maintained total for a company's own skills, so the count is what has
  // been fetched — honest, if conservative, while more pages remain.
  const knownTotal = skills.results.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / ADMIN_PAGE_SIZE));

  const goToPage = (next: number) => {
    setPage(next);
    if (skills.results.length < next * ADMIN_PAGE_SIZE && skills.status === "CanLoadMore") {
      skills.loadMore(ADMIN_PAGE_SIZE);
    }
  };



  const handleArchiveSkill = async () => {
    if (!archiveTarget) return;
    // The archive modal has nowhere to show a failure, so this one keeps its
    // toast — before, a rejection left the modal open and said nothing.
    const outcome = await action.run(() => archiveSkill({ skillId: archiveTarget._id }), {
      fallbackMessage: "The skill could not be archived.",
    });
    if (!outcome.ok) return;
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

      {/* Search, then the same table and pager the Skill Center uses. */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
        <input
          value={companySearchTerm}
          onChange={(event) => {
            setCompanySearchTerm(event.target.value);
            setPage(1);
          }}
          placeholder="Search skills by name"
          className="h-10 w-full rounded-[8px] border border-border-dim bg-card pl-9 pr-3 text-[13px] text-foreground outline-none focus:border-brand/50"
        />
      </div>

      <AdminTableShell
        minWidthClassName="min-w-[640px]"
        footer={
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={knownTotal}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={skills.status === "LoadingMore"}
            onPageChange={goToPage}
            labels={{
              empty: "No skills yet",
              showing: (start, end, total) => `Showing ${start}-${end} of ${total} skills`,
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
          {skills.status === "LoadingFirstPage" ? (
            <AdminTableLoadingRow colSpan={3} />
          ) : skills.results.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={3}
              icon={<BrainCircuit className="h-8 w-8 text-muted/30" />}
              label={companySearchTerm.trim() ? "No skills match that search" : "No skills yet — add one from the Skill Center"}
            />
          ) : pageSkills.map((skill) => (
            <tr key={skill._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
              <td className="px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{skill.name}</div>
                <div className="text-[12px] text-secondary line-clamp-1 max-w-[520px]">
                  {skill.description || "No description."}
                </div>
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">{formatDateTime(skill.updatedAt)}</td>
              <td className="px-4 py-3 text-right">
                <button
                  type="button"
                  aria-label={`Remove ${skill.name}`}
                  onClick={() => setArchiveTarget(skill)}
                  className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>

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


      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Remove skill" size="sm">
        <div className="flex flex-col gap-5 px-1 pb-2">
          <p className="text-[13px] leading-relaxed text-secondary">
            Remove <span className="font-semibold text-foreground">{archiveTarget?.name}</span> from this company?
            Its agents stop using it. The skill stays in the Skill Center, so you can add it back.
          </p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={action.isBusy()} className="h-10 rounded-[8px] border border-border-dim px-4 text-[13px] text-secondary hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleArchiveSkill} disabled={action.isBusy()} className="flex h-10 items-center gap-2 rounded-[8px] bg-red-500 px-4 text-[13px] font-semibold text-white hover:bg-red-600 disabled:opacity-50">
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove skill
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
