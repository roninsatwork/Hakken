"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import type { FormEvent, ReactNode } from "react";
import { redirect, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { BarChart3, BrainCircuit, FileText, Loader2, Pencil, Trash2 } from "lucide-react";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";
import { RowActions, RowIconButton } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { formatDateTime } from "@/src/lib/dates";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/components/screens/Button";

const SkillCatalogDialogs = dynamic(() =>
  import("./SkillCatalogDialogs").then((module) => module.SkillCatalogDialogs)
);

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-GB") : "...";
}


export function AgentSkillsCatalog({ nav }: { nav?: ReactNode } = {}) {
  const t = useTranslations("admin.agents.skillCenter");
  const previewSkillMarkdownImport = useMutation(api.agentSkills.previewSkillMarkdownImport);
  const importSkillMarkdown = useMutation(api.agentSkills.importSkillMarkdown);
  const deleteSkill = useMutation(api.agentSkills.deleteSkill);
  const updateSkill = useMutation(api.agentSkills.updateSkill);
  const analytics = useQuery(api.agentSkills.getSkillCatalogAnalytics, {});
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [deleteTarget, setDeleteTarget] = useState<{ id: Id<"agentSkills">; name: string } | null>(null);
  const [editTarget, setEditTarget] = useState<Doc<"agentSkills"> | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFile, setEditFile] = useState<File | null>(null);
  const EDIT_KEY = "edit";

  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newFile, setNewFile] = useState<File | null>(null);
  const ADD_KEY = "add";

  const addSkill = async (event: FormEvent) => {
    event.preventDefault();
    setValidationError("");
    const name = newName.trim();
    if (!name) {
      setValidationError(t("nameRequired"));
      return;
    }
    if (!newFile) {
      setValidationError(t("fileRequired"));
      return;
    }

    const markdown = await newFile.text();
    const outcome = await action.run(async () => {
      const draft = await previewSkillMarkdownImport({ markdown, filename: newFile.name });
      const created = await importSkillMarkdown({
        sourceFilename: newFile.name,
        sourceHash: draft.sourceHash,
        sourceMarkdown: markdown,
        // The name the reader typed wins over the one in the file's frontmatter.
        name,
        // What the reader typed, falling back to whatever the file said.
        description: newDescription.trim() || draft.description || undefined,
        category: draft.category,
        riskLevel: draft.riskLevel,
        instruction: draft.instruction,
        requiredToolMappingsJson: draft.requiredToolMappingsJson,
        recommendedToolMappingsJson: draft.recommendedToolMappingsJson,
        suggestedEvalFixturesJson: draft.suggestedEvalFixturesJson,
      });
      // Uploaded means available. There is no publish step.
      await updateSkill({ skillId: created.skillId, status: "ACTIVE" });
      return created;
    }, { key: ADD_KEY, fallbackMessage: t("addFailed"), suppressErrorToast: true });

    if (!outcome.ok) return;
    setFeedback(t("added", { name }));
    setNewName("");
    setNewDescription("");
    setNewFile(null);
    setIsMarkdownOpen(false);
  };

  const openEdit = (skill: Doc<"agentSkills">) => {
    setEditTarget(skill);
    setEditName(skill.name);
    setEditDescription(skill.description ?? "");
    setEditFile(null);
    setFeedback("");
  };

  /**
   * Save the two things a skill has: what it is called, and the file behind it.
   *
   * Replacing the file goes through the same import path an upload does, so
   * there is one place that turns markdown into a skill. The name is applied
   * afterwards because the file carries its own, and the name typed here is the
   * one the reader chose.
   */
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget) return;
    const name = editName.trim();
    if (!name) {
      setValidationError(t("nameRequired"));
      return;
    }

    const markdown = editFile ? await editFile.text() : null;
    const outcome = await action.run(async () => {
      if (markdown) {
        const draft = await previewSkillMarkdownImport({ markdown, filename: editFile!.name });
        await importSkillMarkdown({
          sourceFilename: editFile!.name,
          sourceHash: draft.sourceHash,
          sourceMarkdown: markdown,
          name: editTarget.name,
          description: draft.description || undefined,
          category: draft.category,
          riskLevel: draft.riskLevel,
          instruction: draft.instruction,
          requiredToolMappingsJson: draft.requiredToolMappingsJson,
          recommendedToolMappingsJson: draft.recommendedToolMappingsJson,
          suggestedEvalFixturesJson: draft.suggestedEvalFixturesJson,
        });
      }
      return await updateSkill({
        skillId: editTarget._id,
        name,
        description: editDescription.trim() || undefined,
      });
    }, { key: EDIT_KEY, fallbackMessage: t("saveFailed"), suppressErrorToast: true });

    if (!outcome.ok) return;
    setFeedback(markdown ? t("savedReplaced", { name }) : t("saved", { name }));
    setEditTarget(null);
  };
  const DELETE_KEY = "delete";

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const outcome = await action.run(() => deleteSkill({ skillId: deleteTarget.id }), {
      key: DELETE_KEY,
      fallbackMessage: t("deleteFailed"),
    });
    if (!outcome.ok) return;
    setFeedback(
      outcome.data.detachedAgents > 0
        ? t("deletedDetached", { name: deleteTarget.name, count: outcome.data.detachedAgents })
        : t("deleted", { name: deleteTarget.name }),
    );
    setDeleteTarget(null);
  };
  // Opened directly by the "Upload new version" button on a skill page, so
  // that action lands on the upload rather than on a list the reader then has
  // to find their way out of again.
  const searchParams = useSearchParams();
  const [isMarkdownOpen, setIsMarkdownOpen] = useState(searchParams?.get("import") === "1");
  // Each dialog on this page runs one write, so each gets its own busy key.
  const action = useAdminAction({ scope: "admin-agent-skills" });
  // Local `error` carries client-side validation only — a missing file, an empty
  // one. Server failures come from the runner, which has already unwrapped and
  // reported them; the dialogs render whichever is current.
  const [validationError, setValidationError] = useState("");
  const error = validationError || action.error;
  const [feedback, setFeedback] = useState("");
  const {
    results: skills,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.agentSkills.getPaginatedSkills,
    { searchTerm },
    { initialNumItems: TABLE_PAGE_SIZE }
  );
  /**
   * A page at a time, out of what has been fetched.
   *
   * The numbered pager wants a total, and a total means counting the whole
   * catalogue on every view — which is what was just removed to make this
   * scale. So the count comes from the maintained rollup when nothing is
   * filtered, and while searching the pager simply stops claiming a total it
   * cannot know.
   */
  const pageStart = (page - 1) * TABLE_PAGE_SIZE;
  const pageSkills = skills.slice(pageStart, pageStart + TABLE_PAGE_SIZE);
  const isFiltered = Boolean(searchTerm.trim());
  const knownTotal = !isFiltered && analytics?.computedAt && !analytics.isPartial
    ? analytics.totals?.skills ?? skills.length
    : skills.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / TABLE_PAGE_SIZE));

  // Stepping past what has been fetched pulls the next page in first.
  const goToPage = (next: number) => {
    setPage(next);
    const needed = next * TABLE_PAGE_SIZE;
    if (skills.length < needed && status === "CanLoadMore") loadMore(TABLE_PAGE_SIZE);
  };

  // Undefined while loading. Zero counted skills and an empty page means there
  // is nothing to report on yet, so the panel stays away rather than showing
  // five zeros to someone who has just arrived.
  // Guarded on the shape rather than only on "still loading": a rollup document
  // that has not been written yet, or a response of an unexpected shape, would
  // otherwise take the whole screen down rather than showing an empty panel.
  const hasSkills = analytics === undefined || (analytics.totals?.skills ?? 0) > 0 || skills.length > 0;

  return (
    <div className="flex flex-col gap-5 h-full pb-12">
      {/* The shared admin header, so this page's title sits where every other
          title in this section sits. It had its own copy of the same markup,
          which is how it ended up a different size with no dividing rule. */}
      <PageHeader
        divider
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title={t("title")}
        description={t("description")}
        action={
          // One action, because there is one way skills arrive: a SKILL.md file.
          <Button
            variant="brand"
            onClick={() => {
              setIsMarkdownOpen(true);
              setFeedback("");
            }}
            className="h-10 shrink-0 px-5 rounded-[8px] flex items-center gap-2"
          >
            <FileText className="w-4 h-4" />
            {t("addNew")}
          </Button>
        }
      />
      {/* Below the title, as on every other page in this section. It used to be
          rendered above it by the route that wraps this component. */}
      {nav}

      {(feedback || error) && (
        <div className={`rounded-[8px] border p-3 text-[12px] ${
          feedback
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}>
          {feedback || error}

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
              {t("analytics.title")}
            </h2>
            <p className="text-[12px] text-secondary mt-1">
              {t("analytics.description")}
            </p>
          </div>
          {analytics === undefined ? (
            <div className="text-[12px] text-muted flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              {t("analytics.loading")}
            </div>
          ) : (
            // These counts are recomputed periodically rather than on every
            // load, so the panel says when it last counted. Presenting a number
            // of unknown age as live is the habit this whole pass is removing.
            <div className="text-[12px] text-muted">
              {analytics.computedAt
                ? analytics.isPartial
                  ? t("analytics.countedPartial", { date: formatDateTime(analytics.computedAt), count: analytics.skillsCounted })
                  : t("analytics.counted", { date: formatDateTime(analytics.computedAt) })
                : t("analytics.notCounted")}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {[
            { label: t("stats.skills"), value: analytics?.totals?.skills },
            { label: t("stats.inUse"), value: analytics?.totals?.enabledBindings },
            { label: t("stats.outOfDate"), value: analytics?.totals?.outdatedBindings },
            { label: t("stats.tested"), value: analytics?.totals?.validatedBindings },
            { label: t("stats.untested"), value: analytics?.totals?.needsSmokeBindings },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[8px] border border-border-dim bg-black/15 px-3 py-2 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{stat.label}</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">{formatCount(stat.value)}</div>
            </div>
          ))}
        </div>
      </section>
      )}

      {/* Search and status lead, because a catalogue of hundreds is navigated
          rather than scanned. Both narrow in the database. */}
      <div className="flex flex-col sm:flex-row gap-2">
        <div className="flex flex-1">
          <TableSearchInput
            value={searchTerm}
            onChange={(next) => { setSearchTerm(next); setPage(1); }}
            placeholder={t("searchPlaceholder")}
            clearLabel={t("clearSearch")}
          />
        </div>
      </div>

      {/* The repo's standard admin table, the same one the model catalogue and
          API keys use. A card grid was a second way of listing things, and it
          scanned worse the longer the catalogue got.

          This comment used to claim approvals used the shared table too. It did
          not — it was still the card grid this argues against, and stayed that
          way until the approvals queue was rebuilt. Both are now in the drift
          guard, so the claim is checked rather than asserted. */}
      <DataTable
        rows={status === "LoadingFirstPage" ? undefined : pageSkills}
        rowKey={(skill) => skill._id}
        minWidthClassName="min-w-[640px]"
        onRowClick={(skill) => openEdit(skill)}
        empty={{
          icon: <BrainCircuit className="w-8 h-8 text-muted/30" />,
          label: t("emptyLabel"),
        }}
        footer={{
          mode: "paged",
          page,
          totalPages,
          totalCount: knownTotal,
          pageSize: TABLE_PAGE_SIZE,
          isLoading: status === "LoadingMore" || status === "LoadingFirstPage",
          onPageChange: goToPage,
          labels: {
            empty: t("footerEmpty"),
            showing: (start, end, total) =>
              isFiltered
                ? t("showingMatching", { start, end, total })
                : t("showingSkills", { start, end, total }),
          },
        }}
        /* A skill is a name and a file. Category, status, risk and the
           description were four columns of things nobody was going to act on. */
        columns={[
          {
            key: "skill",
            header: t("columns.skill"),
            cell: (skill) => (
              <div className="text-[13px] font-semibold text-foreground">{skill.name}</div>
            ),
          },
          {
            key: "file",
            header: t("columns.file"),
            className: "w-[220px] truncate",
            cell: (skill) => (
              <span className="text-[12px] text-secondary">{skill.sourceFilename || "—"}</span>
            ),
          },
          {
            key: "uploaded",
            header: t("columns.uploaded"),
            className: "w-[190px]",
            cell: (skill) => (
              <span className="text-[12px] text-secondary">{formatDateTime(skill.updatedAt)}</span>
            ),
          },
          {
            key: "actions",
            header: "",
            align: "right",
            className: "w-[120px] whitespace-nowrap",
            cell: (skill) => (
              <RowActions>
                <RowIconButton label={t("editAria", { name: skill.name })} onClick={() => openEdit(skill)}>
                  <Pencil className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton
                  label={t("deleteAria", { name: skill.name })}
                  tone="danger"
                  onClick={() => setDeleteTarget({ id: skill._id, name: skill.name })}
                >
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      {(editTarget || deleteTarget || isMarkdownOpen) && (
        <SkillCatalogDialogs
          editTarget={editTarget}
          editName={editName}
          editDescription={editDescription}
          onEditNameChange={setEditName}
          onEditDescriptionChange={setEditDescription}
          onEditFileChange={setEditFile}
          onCloseEdit={() => setEditTarget(null)}
          onSaveEdit={saveEdit}
          isEditBusy={action.isBusy(EDIT_KEY)}
          deleteTarget={deleteTarget}
          onCloseDelete={() => setDeleteTarget(null)}
          onConfirmDelete={confirmDelete}
          isDeleteBusy={action.isBusy(DELETE_KEY)}
          isMarkdownOpen={isMarkdownOpen}
          newName={newName}
          newDescription={newDescription}
          onNewNameChange={setNewName}
          onNewDescriptionChange={setNewDescription}
          onNewFileChange={setNewFile}
          onCloseMarkdown={() => setIsMarkdownOpen(false)}
          onAddSkill={addSkill}
          isAddBusy={action.isBusy(ADD_KEY)}
          error={error}
        />
      )}

    </div>
  );
}

export default function AgentSkillsCatalogPage() {
  redirect("/admin/ai/skills");
}
