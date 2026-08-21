"use client";

import { useState } from "react";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { useMutation, usePaginatedQuery } from "convex/react";
import { useParams } from "next/navigation";
import {
  BrainCircuit,
  Library,
  Loader2,
  Trash2,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { ModalFormError } from "@/src/ui/components/screens/ModalForm";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { formatDateTime } from "@/src/lib/dates";
import { Button } from "@/src/ui/atoms/Button";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { MAX_SKILLS_PER_COMPANY } from "@/convex/utils/skillLimits";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { useTranslations } from "next-intl";

type CompanySkill = Doc<"companySkills"> & { surfaces: { chat: boolean; widget: boolean } };
type GlobalSkill = Doc<"agentSkills">;
type SkillStatus = CompanySkill["status"];









export default function CompanyAiSkillsPage() {
  const t = useTranslations("admin.companyDetails.skills");
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const importGlobalSkill = useMutation(api.companySkills.importGlobalSkill);
  const archiveSkill = useMutation(api.companySkills.archiveSkill);
  const setBinding = useMutation(api.companySkills.setBinding);

  const [statusFilter] = useState<SkillStatus>("ACTIVE");
  const [companySearchTerm, setCompanySearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const skills = usePaginatedQuery(
    api.companySkills.getSkillsForCompany,
    { companyId, status: statusFilter, ...(companySearchTerm.trim() ? { searchTerm: companySearchTerm.trim() } : {}) },
    { initialNumItems: TABLE_PAGE_SIZE }
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
    { initialNumItems: TABLE_PAGE_SIZE },
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



  const pageStart = (page - 1) * TABLE_PAGE_SIZE;
  const pageSkills = skills.results.slice(pageStart, pageStart + TABLE_PAGE_SIZE);
  // No maintained total for a company's own skills, so the count is what has
  // been fetched — honest, if conservative, while more pages remain.
  const knownTotal = skills.results.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / TABLE_PAGE_SIZE));

  const goToPage = (next: number) => {
    setPage(next);
    if (skills.results.length < next * TABLE_PAGE_SIZE && skills.status === "CanLoadMore") {
      skills.loadMore(TABLE_PAGE_SIZE);
    }
  };



  const handleToggleSurface = async (
    skill: CompanySkill,
    surfaceType: "COMPANY_CHAT" | "WIDGET",
    isEnabled: boolean,
  ) => {
    await action.run(() => setBinding({ skillId: skill._id, surfaceType, isEnabled }), {
      key: `${skill._id}:${surfaceType}`,
      fallbackMessage: t("toggleFailed"),
    });
  };

  const handleArchiveSkill = async () => {
    if (!archiveTarget) return;
    // The archive modal has nowhere to show a failure, so this one keeps its
    // toast — before, a rejection left the modal open and said nothing.
    const outcome = await action.run(() => archiveSkill({ skillId: archiveTarget._id }), {
      fallbackMessage: t("archiveFailed"),
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
      { fallbackMessage: t("importFailed"), suppressErrorToast: true },
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
              {t("title")}
            </h1>
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
              {t("subtitle")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="brand"
              disabled={skills.results.length >= MAX_SKILLS_PER_COMPANY}
              onClick={() => {
                setIsImportOpen(true);
                action.clearError();
                setGlobalSkillSearchTerm("");
                setSelectedGlobalSkillIds([]);
              }}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] font-semibold"
            >
              <Library className="h-4 w-4" />
              {t("addFromCenter")}
            </Button>
          </div>
        </div>

      </header>

      {/* Search, then the same table and pager the Skill Center uses. */}
      <div className="flex">
        <TableSearchInput
          value={companySearchTerm}
          onChange={(next) => {
            setCompanySearchTerm(next);
            setPage(1);
          }}
          placeholder={t("searchPlaceholder")}
          clearLabel={t("clearSearch")}
        />
      </div>

      <DataTable
        rows={skills.status === "LoadingFirstPage" ? undefined : pageSkills}
        rowKey={(skill) => skill._id}
        minWidthClassName="min-w-[640px]"
        empty={{
          icon: <BrainCircuit className="h-8 w-8 text-muted/30" />,
          label: companySearchTerm.trim()
            ? t("noMatch")
            : t("emptyList"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: knownTotal,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: skills.status === "LoadingMore" || skills.status === "LoadingFirstPage",
          onPageChange: goToPage,
          labels: {
            empty: t("emptyShort"),
            showing: (start, end, total) => t("showing", { start, end, total }),
          },
        }}
        columns={[
          {
            key: "skill",
            header: t("columnSkill"),
            cell: (skill) => (
              <>
                <div className="text-[13px] font-semibold text-foreground">{skill.name}</div>
                <div className="text-[12px] text-secondary line-clamp-1 max-w-[520px]">
                  {skill.description || t("noDescription")}
                </div>
              </>
            ),
          },
          {
            key: "surfaces",
            header: t("columnSurfaces"),
            className: "w-[220px]",
            /* The switch the runtime reads: off here means the skill does not
               reach that surface's answers at all. */
            cell: (skill) => (
              <div className="flex flex-col gap-1.5">
                <SurfaceToggle
                  label={t("answersInChat")}
                  isEnabled={skill.surfaces.chat}
                  onToggle={() => void handleToggleSurface(skill, "COMPANY_CHAT", !skill.surfaces.chat)}
                />
                <SurfaceToggle
                  label={t("answersOnWidget")}
                  isEnabled={skill.surfaces.widget}
                  onToggle={() => void handleToggleSurface(skill, "WIDGET", !skill.surfaces.widget)}
                />
              </div>
            ),
          },
          {
            key: "added",
            header: t("columnAdded"),
            className: "w-[190px]",
            cell: (skill) => (
              <span className="text-[12px] text-secondary">{formatDateTime(skill.updatedAt)}</span>
            ),
          },
          {
            key: "remove",
            header: "",
            align: "right",
            className: "w-[90px]",
            cell: (skill) => (
              <WriteButton
                type="button"
                aria-label={t("removeAria", { name: skill.name })}
                onClick={() => setArchiveTarget(skill)}
                className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
              >
                <Trash2 className="h-4 w-4" />
              </WriteButton>
            ),
          },
        ]}
      />

      <SonaeModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title={t("addModalTitle")} size="lg">
        {/* Tick what you want and add it. The previous version made the reader
            select one skill, read a preview of its instructions, confirm, and
            start again for the next one. */}
        <div className="flex flex-col gap-4">
          <ModalFormError>{action.error}</ModalFormError>
          <div className="flex">
            <TableSearchInput
              value={globalSkillSearchTerm}
              onChange={setGlobalSkillSearchTerm}
              placeholder={t("searchSkills")}
              clearLabel={t("clearSearch")}
            />
          </div>

          {importable.status === "LoadingFirstPage" ? (
            <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-brand" /></div>
          ) : importable.results.length === 0 ? (
            <p className="px-1 py-8 text-center text-[13px] text-muted">
              {globalSkillSearchTerm.trim()
                ? t("noMatchModal")
                : t("allAdded")}
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
                      {skill.description || t("noDescription")}
                    </span>
                  </span>
                </label>
              ))}
              {importable.status === "CanLoadMore" && (
                <Button
                  variant="ghost"
                  onClick={() => importable.loadMore(TABLE_PAGE_SIZE)}
                  className="w-full rounded-none px-4 py-3 text-[12px] font-semibold hover:bg-foreground/[0.03]"
                >
                  {t("showMore")}
                </Button>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button
              variant="quiet"
              onClick={() => setIsImportOpen(false)}
              className="h-10 px-4 text-[13px] font-normal bg-transparent hover:bg-transparent"
            >
              {t("cancel")}
            </Button>
            <WriteButton
              type="button"
              onClick={handleImportGlobalSkill}
              disabled={selectedGlobalSkillIds.length === 0 || action.isBusy()}
              className="flex h-10 items-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {action.isBusy() && <Loader2 className="h-4 w-4 animate-spin" />}
              {selectedGlobalSkillIds.length > 1
                ? t("addCount", { count: selectedGlobalSkillIds.length })
                : t("addOne")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>


      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title={t("removeModalTitle")} size="sm">
        <div className="flex flex-col gap-5 px-1 pb-2">
          <p className="text-[13px] leading-relaxed text-secondary">
            {t.rich("removeBody", {
              name: archiveTarget?.name ?? "",
              b: (chunks) => <span className="font-semibold text-foreground">{chunks}</span>,
            })}
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="quiet" onClick={() => setArchiveTarget(null)} disabled={action.isBusy()} className="h-10 px-4 text-[13px] font-normal bg-transparent hover:bg-transparent">
              {t("cancel")}
            </Button>
            <WriteButton type="button" onClick={handleArchiveSkill} disabled={action.isBusy()} className="flex h-10 items-center gap-2 rounded-[8px] bg-red-500 px-4 text-[13px] font-semibold text-white hover:bg-red-600 disabled:opacity-50">
              {action.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("removeConfirm")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}

function SurfaceToggle({
  label,
  isEnabled,
  onToggle,
}: {
  label: string;
  isEnabled: boolean;
  onToggle: () => void;
}) {
  return (
    <label className="flex w-fit cursor-pointer items-center gap-2">
      <WriteButton
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label={label}
        onClick={onToggle}
        className={`relative h-[18px] w-8 shrink-0 rounded-full transition-colors ${
          isEnabled ? "bg-brand" : "bg-foreground/15"
        }`}
      >
        <span
          className={`absolute top-[2px] h-3.5 w-3.5 rounded-full bg-white transition-[left] ${
            isEnabled ? "left-[16px]" : "left-[2px]"
          }`}
        />
      </WriteButton>
      <span className="text-[12px] text-secondary">{label}</span>
    </label>
  );
}
