"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  Loader2,
  Pencil,
  Play,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  PaginationFooter,
  SearchBar,
  TableEmptyRow,
  TableHeaderCell,
  TableHeaderRow,
  TableLoadingRow,
  TableShell,
} from "@/src/ui/components/screens/Table";
import { usePagedRows } from "@/src/hooks/usePagedRows";
import {
  ModalFormError,
  ModalField,
  ModalFormField,
  modalInputClassName,
  modalTextareaClassName,
} from "@/src/ui/components/screens/ModalForm";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";

type AgentEvalFixture = Doc<"agentEvalFixtures">;

/** Tagging a check `critical` is what makes the go-live gate require it. */
const MUST_PASS_TAG = "critical";
/**
 * Every check carries a type in the database and none of it ever helped a reader —
 * ten lowercased enum values in a dropdown, with no explanation of what any of them
 * meant. New evals are stamped with the plainest one.
 */
const DEFAULT_FIXTURE_TYPE = "HAPPY_PATH" as const;

/**
 * The result of a check, in the words an admin would use.
 *
 * A contract run checks the agent is wired up — rubric present, expected tools
 * bound — and calls no model. It is a useful check and it is not evidence the agent
 * works, which is why the activation gate refuses to count it. This screen used to
 * show it as a green SUCCESS anyway, so the number an admin read and the number that
 * gated going live disagreed, and the screen showed the flattering one.
 */
function describeStatus(entry: { status: string; gradingMode: string } | undefined) {
  if (!entry) return { label: "Not run yet", tone: "text-muted" };
  if (entry.gradingMode !== "MODEL_GRADED") return { label: "Setup only", tone: "text-amber-400" };
  if (entry.status === "SUCCESS") return { label: "Passing", tone: "text-emerald-400" };
  if (entry.status === "FAILED") return { label: "Failing", tone: "text-red-400" };
  return { label: "Running…", tone: "text-secondary" };
}

const DEFAULT_FORM = {
  objective: "",
  rubric: "",
  tools: "",
  mustPass: true,
  sampleCount: 1,
};

export default function AgentEvalsPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const fixtures = useQuery(api.agentEvalFixtures.getRecentForAgent, { agentId });
  const evalHistory = useQuery(api.agentEvalFixtures.getSmokeEvalHistory, { agentId, limit: 50 });
  const readiness = useQuery(api.agents.getAgentReadiness, { id: agentId });
  const createFixture = useMutation(api.agentEvalFixtures.createManual);
  const updateFixture = useMutation(api.agentEvalFixtures.updateFixture);
  const archiveFixture = useMutation(api.agentEvalFixtures.archiveFixture);
  const runSmokeEval = useMutation(api.agentEvalFixtures.runSmokeEval);
  const runEvalSuite = useMutation(api.agentEvalFixtures.runEvalSuite);

  const [form, setForm] = useState(DEFAULT_FORM);
  const [editingId, setEditingId] = useState<Id<"agentEvalFixtures"> | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [archiveTarget, setArchiveTarget] = useState<AgentEvalFixture | null>(null);
  const [notice, setNotice] = useState("");

  // Separate runners, keyed per row, so running one check does not disable every
  // other button on the page — which one shared busy flag used to do.
  const formAction = useAdminAction({ scope: "admin-agent-checks-form" });
  const runAction = useAdminAction({ scope: "admin-agent-checks-run" });
  const archiveAction = useAdminAction({ scope: "admin-agent-checks-archive" });

  /** The newest run per check, so the table can say where each one stands. */
  const latestByFixture = useMemo(() => {
    const map = new Map<string, { status: string; gradingMode: string; completedAt?: number }>();
    for (const entry of evalHistory?.entries ?? []) {
      const fixtureId = entry.fixture?.fixtureId;
      if (!fixtureId || map.has(fixtureId)) continue;
      map.set(fixtureId, {
        status: entry.status,
        gradingMode: entry.gradingMode,
        completedAt: entry.completedAt ?? entry.startedAt,
      });
    }
    return map;
  }, [evalHistory]);

  const [searchTerm, setSearchTerm] = useState("");

  const rows = (fixtures ?? []).filter((fixture) =>
    fixture.objective.toLowerCase().includes(searchTerm.trim().toLowerCase())
  );

  // A plain array rather than a server page, so there is nothing to fetch — but
  // the footer is the house footer either way.
  const paged = usePagedRows(rows, { canLoadMore: false, loadMore: () => {}, resetKey: searchTerm });
  const unproven = rows.filter((fixture) => {
    const latest = latestByFixture.get(fixture._id);
    return !latest || latest.gradingMode !== "MODEL_GRADED" || latest.status !== "SUCCESS";
  });
  const passing = rows.length - unproven.length;
  const gate = readiness?.releaseGatePolicy;

  const openCreate = () => {
    setEditingId(null);
    setForm(DEFAULT_FORM);
    setIsFormOpen(true);
  };

  const openEdit = (fixture: AgentEvalFixture) => {
    setEditingId(fixture._id);
    setForm({
      objective: fixture.objective,
      rubric: fixture.expectedFinalOutputRubric,
      tools: "",
      mustPass: fixture.tags.includes(MUST_PASS_TAG),
      sampleCount: fixture.sampleCount ?? 1,
    });
    setIsFormOpen(true);
  };

  const handleSave = async () => {
    const tools = form.tools.split(",").map((tool) => tool.trim()).filter(Boolean);
    const tags = form.mustPass ? [MUST_PASS_TAG] : [];

    // `expectedBlockedActionsJson` is deliberately never sent, and neither are tools
    // when the box is empty. The form renders neither in full, and sending them would
    // clear a contract it cannot show.
    const save = async () => {
      if (editingId) {
        await updateFixture({
          fixtureId: editingId,
          objective: form.objective,
          expectedFinalOutputRubric: form.rubric,
          ...(tools.length > 0 ? { expectedToolMappings: tools } : {}),
          tags,
          sampleCount: form.sampleCount,
        });
        return;
      }
      await createFixture({
        agentId,
        type: DEFAULT_FIXTURE_TYPE,
        objective: form.objective,
        expectedFinalOutputRubric: form.rubric,
        ...(tools.length > 0 ? { expectedToolMappings: tools } : {}),
        tags,
      });
    };

    const outcome = await formAction.run(save, {
      fallbackMessage: "The eval could not be saved.",
      suppressErrorToast: true,
    });

    if (!outcome.ok) return;
    const wasEditing = Boolean(editingId);
    setIsFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    // Editing bumps the check's timestamp, which retires its earlier passes. That
    // used to happen in silence, so a gate could re-block with no explanation.
    setNotice(wasEditing
      ? "Eval saved. Its earlier results no longer count, so run it again."
      : "Eval created. Run it to see how the agent does.");
  };

  const handleRun = async (fixtureId: Id<"agentEvalFixtures">) => {
    setNotice("");
    // Model-graded, not contract-only. The per-row Run button used to default to a
    // configuration check — the thing that is not a test — and say it had passed.
    await runAction.run(() => runSmokeEval({ agentId, fixtureId, gradingMode: "MODEL_GRADED" }), {
      key: `run:${fixtureId}`,
      fallbackMessage: "The eval could not be run.",
    });
  };

  const handleRunUnproven = async () => {
    setNotice("");
    // Unproven first; once everything passes, re-run the lot. A check that passed
    // last week is not evidence about today, and a button labelled "Run evals"
    // must always run some.
    const target = unproven.length > 0 ? unproven : rows;
    const count = target.length;
    const outcome = await runAction.run(() => runEvalSuite({
      agentId,
      fixtureIds: target.map((fixture) => fixture._id),
      gradingMode: "MODEL_GRADED",
    }), {
      key: "run:unproven",
      fallbackMessage: "The evals could not be run.",
      suppressErrorToast: true,
    });
    if (outcome.ok) setNotice(`Running ${count} check${count === 1 ? "" : "s"}. Results appear here as each one finishes.`);
  };

  const handleCheckSetup = async () => {
    setNotice("");
    const outcome = await runAction.run(() => runEvalSuite({ agentId, gradingMode: "CONTRACT_ONLY" }), {
      key: "run:setup",
      fallbackMessage: "The setup eval could not be run.",
    });
    if (outcome.ok) setNotice("Setup checked. This confirms the agent is wired up correctly — it does not test its answers.");
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const outcome = await archiveAction.run(() => archiveFixture({ fixtureId: archiveTarget._id }), {
      fallbackMessage: "The eval could not be removed.",
    });
    if (outcome.ok) setArchiveTarget(null);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            Evals
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            An eval is a task, and a description of a good result. Running one gives the task to
            this agent for real, then has a second AI mark what it did.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-[15px] font-semibold text-foreground">
            {fixtures === undefined
              ? "Loading…"
              : rows.length === 0
                ? "No evals yet."
                : `${passing} of ${rows.length} eval${rows.length === 1 ? "" : "s"} passing.${unproven.length > 0 ? ` ${unproven.length} not proven yet.` : ""}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunUnproven}
              disabled={runAction.isBusy() || rows.length === 0}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runAction.isBusy("run:unproven") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run evals
            </button>
            <button
              type="button"
              onClick={handleCheckSetup}
              disabled={runAction.isBusy() || rows.length === 0}
              title="Confirms the agent is wired up. Does not test its answers."
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              {runAction.isBusy("run:setup") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Eval setup
            </button>
            <WriteButton
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <Plus className="h-4 w-4" />
              New eval
            </WriteButton>
          </div>
        </div>
      </header>

      {/* One line for the go-live gate, replacing a policy strip, two banners and a
          comparison panel that between them never said what to do about it. */}
      {gate && gate.criticalFixtureCount > 0 && gate.blockedCriticalFixtureCount > 0 && (
        <section className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              {gate.passedCriticalFixtureCount} of {gate.criticalFixtureCount} must-pass evals are
              passing. This agent cannot go live until all of them do.
            </p>
          </div>
        </section>
      )}
      {gate && gate.criticalFixtureCount === 0 && rows.length > 0 && (
        <section className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>No eval has to pass before this agent goes live. Mark at least one as must-pass.</p>
          </div>
        </section>
      )}

      {(notice || formAction.error || runAction.error) && (
        <section className={`rounded-[8px] border px-4 py-3 text-[13px] ${
          formAction.error || runAction.error
            ? "border-red-500/20 bg-red-500/10 text-red-200"
            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-200"
        }`}>
          <div className="flex items-start gap-3">
            {formAction.error || runAction.error
              ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <p>{formAction.error || runAction.error || notice}</p>
          </div>
        </section>
      )}

      <SearchBar
        value={searchTerm}
        onChange={setSearchTerm}
        placeholder="Search evals by what they ask"
      />

      <TableShell
        minWidthClassName="min-w-[760px]"
        footer={
          <PaginationFooter
            page={paged.page}
            totalPages={paged.totalPages}
            totalCount={paged.loadedCount}
            pageSize={paged.pageSize}
            isLoading={false}
            onPageChange={paged.goToPage}
            labels={{ empty: "No evals" }}
          />
        }
      >
        <thead>
          <TableHeaderRow>
            <TableHeaderCell>Eval</TableHeaderCell>
            <TableHeaderCell className="w-[130px]">Status</TableHeaderCell>
            <TableHeaderCell className="w-[120px]">Must pass</TableHeaderCell>
            <TableHeaderCell className="w-[170px]">Last run</TableHeaderCell>
            <TableHeaderCell align="right" className="w-[150px]">{""}</TableHeaderCell>
          </TableHeaderRow>
        </thead>
        <tbody>
          {fixtures === undefined ? (
            <TableLoadingRow colSpan={5} />
          ) : paged.pageRows.length === 0 ? (
            <TableEmptyRow
              colSpan={5}
              icon={<ClipboardCheck className="h-8 w-8 text-muted/30" />}
              label="No evals yet — add one to catch this agent getting it wrong"
            />
          ) : paged.pageRows.map((fixture) => {
            const latest = latestByFixture.get(fixture._id);
            const status = describeStatus(latest);
            const isRunning = runAction.isBusy(`run:${fixture._id}`);

            return (
              <tr key={fixture._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <Link
                    href={`/admin/agents/${agentId}/evals/${fixture._id}`}
                    className="block text-[13px] font-semibold text-foreground line-clamp-1 max-w-[480px] hover:text-brand transition-colors"
                  >
                    {fixture.objective}
                  </Link>
                  <div className="text-[12px] text-secondary line-clamp-1 max-w-[480px]">{fixture.expectedFinalOutputRubric}</div>
                </td>
                <td className={`px-4 py-3 text-[13px] font-semibold ${status.tone}`}>{status.label}</td>
                <td className="px-4 py-3 text-[12px] text-secondary">
                  {fixture.tags.includes(MUST_PASS_TAG) ? "Yes" : "No"}
                </td>
                <td className="px-4 py-3 text-[12px] text-secondary">
                  {latest?.completedAt ? formatDateTime(latest.completedAt) : "—"}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => handleRun(fixture._id)}
                      disabled={isRunning}
                      className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                    >
                      {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                      Run
                    </button>
                    <button
                      type="button"
                      aria-label={`Edit ${fixture.objective}`}
                      title="Edit"
                      onClick={() => openEdit(fixture)}
                      className="p-2 rounded-md text-muted hover:text-foreground hover:bg-foreground/5 transition-colors"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <WriteButton
                      type="button"
                      aria-label={`Remove ${fixture.objective}`}
                      title="Remove"
                      onClick={() => setArchiveTarget(fixture)}
                      className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </WriteButton>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>

      {/* Two questions and a toggle, where there were six fields including a nested
          JSON blob whose required keys were documented nowhere and which the shipped
          starter evals got wrong. */}
      <SonaeModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? "Edit eval" : "New eval"}
        size="lg"
      >
        <div className="flex flex-col gap-5 pt-2">
          <ModalFormError>{formAction.error}</ModalFormError>

          <ModalFormField label="What should the agent be asked to do?">
            <textarea
              className={`${modalTextareaClassName} min-h-[110px]`}
              value={form.objective}
              onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
              placeholder="Find this month's overdue invoices and summarise who owes what."
            />
          </ModalFormField>

          <ModalFormField
            label="What does a good result look like?"
            hint="Plain English. This is what the marking AI reads."
          >
            <textarea
              className={`${modalTextareaClassName} min-h-[130px]`}
              value={form.rubric}
              onChange={(event) => setForm((current) => ({ ...current, rubric: event.target.value }))}
              placeholder="Lists each overdue invoice with the customer and the amount. Never invents a figure it did not look up."
            />
          </ModalFormField>

          <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
            <input
              type="checkbox"
              checked={form.mustPass}
              onChange={(event) => setForm((current) => ({ ...current, mustPass: event.target.checked }))}
              className="mt-0.5 accent-brand"
            />
            <span>
              <span className="block text-[13px] font-semibold text-foreground">This must pass before the agent goes live</span>
              <span className="block text-[12px] text-secondary">Nothing stops an agent going live unless at least one eval says so.</span>
            </span>
          </label>

          <details className="rounded-[8px] border border-border-dim px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">Advanced</summary>
            <div className="mt-4 flex flex-col gap-5">
              <ModalFormField
                label="Give it the task more than once"
                hint="An eval that passes two times in three is an eval that fails one conversation in three. Each extra attempt is a whole agent turn plus a grade."
              >
                <select
                  className={modalInputClassName}
                  value={String(form.sampleCount)}
                  onChange={(event) => setForm((current) => ({ ...current, sampleCount: Number(event.target.value) }))}
                >
                  <option value="1">Once</option>
                  <option value="3">3 times — all must pass</option>
                  <option value="5">5 times — all must pass</option>
                </select>
              </ModalFormField>
              <ModalField
                label="Tools it should use"
                hint="Optional, comma separated. Leave empty unless you are testing that a particular tool gets used."
                value={form.tools}
                onChange={(event) => setForm((current) => ({ ...current, tools: event.target.value }))}
                placeholder="knowledge.search, crm.lookup"
              />
            </div>
          </details>

          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setIsFormOpen(false)} disabled={formAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <WriteButton type="button" onClick={handleSave} disabled={formAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50">
              {formAction.isBusy() && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save check" : "Create check"}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title="Remove check" size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            This stops the check counting towards going live. Its past results stay in the audit record.
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setArchiveTarget(null)} disabled={archiveAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <WriteButton type="button" onClick={handleArchive} disabled={archiveAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {archiveAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
