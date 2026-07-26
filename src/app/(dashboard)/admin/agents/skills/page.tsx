"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { redirect, useSearchParams } from "next/navigation";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { BarChart3, BrainCircuit, FileText, Loader2, Pencil, Search, Trash2 } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";
import {
  AdminPaginationFooter,
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import { formatDateTime } from "@/src/lib/dates";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-GB") : "...";
}


export function AgentSkillsCatalog({ nav }: { nav?: ReactNode } = {}) {
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
      setValidationError("Give the skill a name.");
      return;
    }
    if (!newFile) {
      setValidationError("Choose a SKILL.md file.");
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
    }, { key: ADD_KEY, fallbackMessage: "The skill could not be added.", suppressErrorToast: true });

    if (!outcome.ok) return;
    setFeedback(`Added ${name}.`);
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
      setValidationError("Give the skill a name.");
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
    }, { key: EDIT_KEY, fallbackMessage: "The skill could not be saved.", suppressErrorToast: true });

    if (!outcome.ok) return;
    setFeedback(markdown ? `Saved ${name} and replaced its file.` : `Saved ${name}.`);
    setEditTarget(null);
  };
  const DELETE_KEY = "delete";

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const outcome = await action.run(() => deleteSkill({ skillId: deleteTarget.id }), {
      key: DELETE_KEY,
      fallbackMessage: "The skill could not be deleted.",
    });
    if (!outcome.ok) return;
    setFeedback(
      outcome.data.detachedAgents > 0
        ? `Deleted ${deleteTarget.name}. It was removed from ${outcome.data.detachedAgents} agent${outcome.data.detachedAgents === 1 ? "" : "s"}.`
        : `Deleted ${deleteTarget.name}.`,
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
    { initialNumItems: ADMIN_PAGE_SIZE }
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
  const pageStart = (page - 1) * ADMIN_PAGE_SIZE;
  const pageSkills = skills.slice(pageStart, pageStart + ADMIN_PAGE_SIZE);
  const isFiltered = Boolean(searchTerm.trim());
  const knownTotal = !isFiltered && analytics?.computedAt && !analytics.isPartial
    ? analytics.totals?.skills ?? skills.length
    : skills.length;
  const totalPages = Math.max(1, Math.ceil(knownTotal / ADMIN_PAGE_SIZE));

  // Stepping past what has been fetched pulls the next page in first.
  const goToPage = (next: number) => {
    setPage(next);
    const needed = next * ADMIN_PAGE_SIZE;
    if (skills.length < needed && status === "CanLoadMore") loadMore(ADMIN_PAGE_SIZE);
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
      <AdminPageHeader
        divider
        icon={<BrainCircuit className="w-6 h-6 text-brand" />}
        title="Skill Center"
        description="Reusable instructions you can attach to any agent. Upload a SKILL.md file and it becomes available here."
        action={
          // One action, because there is one way skills arrive: a SKILL.md file.
          <button
            type="button"
            onClick={() => {
              setIsMarkdownOpen(true);
              setFeedback("");
            }}
            className="h-10 shrink-0 px-5 rounded-[8px] bg-brand text-white text-[13px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <FileText className="w-4 h-4" />
            Add new skill
          </button>
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
            { label: "Skills", value: analytics?.totals?.skills },
            { label: "In use by agents", value: analytics?.totals?.enabledBindings },
            { label: "Out of date", value: analytics?.totals?.outdatedBindings },
            { label: "Tested", value: analytics?.totals?.validatedBindings },
            { label: "Untested", value: analytics?.totals?.needsSmokeBindings },
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
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={searchTerm}
            onChange={(event) => { setSearchTerm(event.target.value); setPage(1); }}
            placeholder="Search skills by name"
            className="w-full h-10 pl-9 pr-3 rounded-[8px] border border-border-dim bg-card text-[13px] text-foreground outline-none focus:border-brand/50"
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
      <AdminTableShell
        minWidthClassName="min-w-[640px]"
        footer={
          <AdminPaginationFooter
            page={page}
            totalPages={totalPages}
            totalCount={knownTotal}
            pageSize={ADMIN_PAGE_SIZE}
            isLoading={status === "LoadingMore"}
            onPageChange={goToPage}
            labels={{
              empty: "No skills yet",
              showing: (start, end, total) =>
                isFiltered
                  ? `Showing ${start}-${end} of ${total} matching`
                  : `Showing ${start}-${end} of ${total} skills`,
            }}
          />
        }
      >
        <thead>
          {/* A skill is a name and a file. Category, status, risk and the
              description were four columns of things nobody was going to act
              on. */}
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Skill</th>
            <th className="px-4 py-3 font-medium w-[220px]">File</th>
            <th className="px-4 py-3 font-medium w-[190px]">Uploaded</th>
            <th className="px-4 py-3 font-medium w-[120px] text-right"></th>
          </tr>
        </thead>
        <tbody>
          {status === "LoadingFirstPage" ? (
            <AdminTableLoadingRow colSpan={4} />
          ) : skills.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={4}
              icon={<BrainCircuit className="w-8 h-8 text-muted/30" />}
              label="No skills yet — upload a SKILL.md file to add your first one"
            />
          ) : pageSkills.map((skill) => (
            <tr
              key={skill._id}
              onClick={() => openEdit(skill)}
              className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors cursor-pointer"
            >
              <td className="px-4 py-3">
                <div className="text-[13px] font-semibold text-foreground">{skill.name}</div>
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary truncate">
                {skill.sourceFilename || "—"}
              </td>
              <td className="px-4 py-3 text-[12px] text-secondary">{formatDateTime(skill.updatedAt)}</td>
              <td className="px-4 py-3 text-right whitespace-nowrap">
                <button
                  type="button"
                  aria-label={`Edit ${skill.name}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    openEdit(skill);
                  }}
                  className="p-2 rounded-md text-muted hover:text-foreground hover:bg-foreground/10 transition-colors"
                >
                  <Pencil className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  aria-label={`Delete ${skill.name}`}
                  onClick={(event) => {
                    // The row navigates; the button must not.
                    event.stopPropagation();
                    setDeleteTarget({ id: skill._id, name: skill.name });
                  }}
                  className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </AdminTableShell>

      <SonaeModal isOpen={!!editTarget} onClose={() => setEditTarget(null)} title="Edit skill" size="lg">
        <form onSubmit={saveEdit} className="flex flex-col gap-4 px-1 pb-2">
          {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Name
            <input
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-[13px] text-foreground outline-none focus:border-brand/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Description
            <textarea
              value={editDescription}
              onChange={(event) => setEditDescription(event.target.value)}
              rows={3}
              placeholder="What this skill is for, in your own words."
              className="rounded-[8px] border border-border-dim bg-card px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/50 resize-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Replace the file
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              onChange={(event) => setEditFile(event.target.files?.[0] ?? null)}
              className="text-[13px] text-secondary file:mr-3 file:rounded-[8px] file:border-0 file:bg-foreground/10 file:px-3 file:py-2 file:text-[12px] file:text-foreground"
            />
            <span className="text-[11px] text-muted">
              {editTarget?.sourceFilename
                ? `Currently ${editTarget.sourceFilename}. Leave empty to keep it.`
                : "No file behind this skill yet."}
            </span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setEditTarget(null)} className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={action.isBusy(EDIT_KEY)} className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {action.isBusy(EDIT_KEY) && <Loader2 className="w-4 h-4 animate-spin" />}
              Save
            </button>
          </div>
        </form>
      </SonaeModal>

      <SonaeModal isOpen={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete skill" size="sm">
        <div className="flex flex-col gap-5 px-1 pb-2">
          <p className="text-[13px] leading-relaxed text-secondary">
            Delete <span className="text-foreground font-semibold">{deleteTarget?.name}</span>? This removes the
            file and takes the skill away from any agent using it. It cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={confirmDelete}
              disabled={action.isBusy(DELETE_KEY)}
              className="h-10 px-4 rounded-[8px] bg-red-500 text-white text-[13px] font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-2"
            >
              {action.isBusy(DELETE_KEY) ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
              Delete skill
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={isMarkdownOpen} onClose={() => setIsMarkdownOpen(false)} title="Add new skill" size="lg">
        {/* A skill is a name and a file. The previous version of this dialog
            parsed the file, showed a readiness panel, a tool-mapping picker and
            a list of validation warnings before it would let anyone finish. */}
        <form onSubmit={addSkill} className="flex flex-col gap-4 px-1 pb-2">
          {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Name
            <input
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="What you want to call this skill"
              className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-[13px] text-foreground outline-none focus:border-brand/50"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Description
            <textarea
              value={newDescription}
              onChange={(event) => setNewDescription(event.target.value)}
              rows={3}
              placeholder="What this skill is for, in your own words."
              className="rounded-[8px] border border-border-dim bg-card px-3 py-2 text-[13px] text-foreground outline-none focus:border-brand/50 resize-none"
            />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Skill file
            <input
              type="file"
              accept=".md,.markdown,text/markdown"
              onChange={(event) => setNewFile(event.target.files?.[0] ?? null)}
              className="text-[13px] text-secondary file:mr-3 file:rounded-[8px] file:border-0 file:bg-foreground/10 file:px-3 file:py-2 file:text-[12px] file:text-foreground"
            />
            <span className="text-[11px] text-muted">A SKILL.md file. Its contents become the instructions the agent follows.</span>
          </label>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={() => setIsMarkdownOpen(false)} className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground">
              Cancel
            </button>
            <button type="submit" disabled={action.isBusy(ADD_KEY)} className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2">
              {action.isBusy(ADD_KEY) && <Loader2 className="w-4 h-4 animate-spin" />}
              Add skill
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
