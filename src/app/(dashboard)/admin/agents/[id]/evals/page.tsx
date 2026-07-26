"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
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
  AdminTableEmptyRow,
  AdminTableLoadingRow,
  AdminTableShell,
} from "@/src/app/(dashboard)/admin/_components/AdminTable";
import {
  AdminModalFormError,
  AdminModalFormField,
  adminModalInputClassName,
  adminModalTextareaClassName,
} from "@/src/app/(dashboard)/admin/_components/AdminModalForm";
import { formatDateTime } from "@/src/lib/dates";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useAdminAction } from "@/src/hooks/useAdminAction";

type AgentEvalFixture = Doc<"agentEvalFixtures">;

/** Tagging a check `critical` is what makes the go-live gate require it. */
const MUST_PASS_TAG = "critical";
/**
 * Every check carries a type in the database and none of it ever helped a reader —
 * ten lowercased enum values in a dropdown, with no explanation of what any of them
 * meant. New checks are stamped with the plainest one.
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

  const rows = fixtures ?? [];
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
      fallbackMessage: "The check could not be saved.",
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
      ? "Check saved. Its earlier results no longer count, so run it again."
      : "Check created. Run it to see how the agent does.");
  };

  const handleRun = async (fixtureId: Id<"agentEvalFixtures">) => {
    setNotice("");
    // Model-graded, not contract-only. The per-row Run button used to default to a
    // configuration check — the thing that is not a test — and say it had passed.
    await runAction.run(() => runSmokeEval({ agentId, fixtureId, gradingMode: "MODEL_GRADED" }), {
      key: `run:${fixtureId}`,
      fallbackMessage: "The check could not be run.",
    });
  };

  const handleRunUnproven = async () => {
    setNotice("");
    // Unproven first; once everything passes, re-run the lot. A check that passed
    // last week is not evidence about today, and a button labelled "Run checks"
    // must always run some.
    const target = unproven.length > 0 ? unproven : rows;
    const count = target.length;
    const outcome = await runAction.run(() => runEvalSuite({
      agentId,
      fixtureIds: target.map((fixture) => fixture._id),
      gradingMode: "MODEL_GRADED",
    }), {
      key: "run:unproven",
      fallbackMessage: "The checks could not be run.",
      suppressErrorToast: true,
    });
    if (outcome.ok) setNotice(`Running ${count} check${count === 1 ? "" : "s"}. Results appear here as each one finishes.`);
  };

  const handleCheckSetup = async () => {
    setNotice("");
    const outcome = await runAction.run(() => runEvalSuite({ agentId, gradingMode: "CONTRACT_ONLY" }), {
      key: "run:setup",
      fallbackMessage: "The setup check could not be run.",
    });
    if (outcome.ok) setNotice("Setup checked. This confirms the agent is wired up correctly — it does not test its answers.");
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const outcome = await archiveAction.run(() => archiveFixture({ fixtureId: archiveTarget._id }), {
      fallbackMessage: "The check could not be removed.",
    });
    if (outcome.ok) setArchiveTarget(null);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <div>
          <h1 className="flex items-center gap-3 text-2xl font-bold tracking-tight text-foreground">
            <ClipboardCheck className="h-6 w-6 text-brand" />
            Checks
          </h1>
          <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-secondary">
            A check is a task, and a description of a good result. Running one gives the task to
            this agent for real, then has a second AI mark what it did.
          </p>
        </div>

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-[15px] font-semibold text-foreground">
            {fixtures === undefined
              ? "Loading…"
              : rows.length === 0
                ? "No checks yet."
                : `${passing} of ${rows.length} check${rows.length === 1 ? "" : "s"} passing.${unproven.length > 0 ? ` ${unproven.length} not proven yet.` : ""}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleRunUnproven}
              disabled={runAction.isBusy() || rows.length === 0}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] bg-brand px-4 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runAction.isBusy("run:unproven") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              Run checks
            </button>
            <button
              type="button"
              onClick={handleCheckSetup}
              disabled={runAction.isBusy() || rows.length === 0}
              title="Confirms the agent is wired up. Does not test its answers."
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              {runAction.isBusy("run:setup") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              Check setup
            </button>
            <button
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <Plus className="h-4 w-4" />
              New check
            </button>
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
              {gate.passedCriticalFixtureCount} of {gate.criticalFixtureCount} must-pass checks are
              passing. This agent cannot go live until all of them do.
            </p>
          </div>
        </section>
      )}
      {gate && gate.criticalFixtureCount === 0 && rows.length > 0 && (
        <section className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>No check has to pass before this agent goes live. Mark at least one as must-pass.</p>
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

      <AdminTableShell minWidthClassName="min-w-[760px]">
        <thead>
          <tr className="border-b border-border-dim text-[11px] uppercase tracking-[0.1em] text-muted">
            <th className="px-4 py-3 font-medium">Check</th>
            <th className="px-4 py-3 font-medium w-[130px]">Status</th>
            <th className="px-4 py-3 font-medium w-[120px]">Must pass</th>
            <th className="px-4 py-3 font-medium w-[170px]">Last run</th>
            <th className="px-4 py-3 font-medium w-[150px] text-right"></th>
          </tr>
        </thead>
        <tbody>
          {fixtures === undefined ? (
            <AdminTableLoadingRow colSpan={5} />
          ) : rows.length === 0 ? (
            <AdminTableEmptyRow
              colSpan={5}
              icon={<ClipboardCheck className="h-8 w-8 text-muted/30" />}
              label="No checks yet — add one to catch this agent getting it wrong"
            />
          ) : rows.map((fixture) => {
            const latest = latestByFixture.get(fixture._id);
            const status = describeStatus(latest);
            const isRunning = runAction.isBusy(`run:${fixture._id}`);

            return (
              <tr key={fixture._id} className="border-b border-border-dim/50 hover:bg-foreground/[0.02] transition-colors">
                <td className="px-4 py-3">
                  <div className="text-[13px] font-semibold text-foreground line-clamp-1 max-w-[480px]">{fixture.objective}</div>
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
                    <button
                      type="button"
                      aria-label={`Remove ${fixture.objective}`}
                      title="Remove"
                      onClick={() => setArchiveTarget(fixture)}
                      className="p-2 rounded-md text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </AdminTableShell>

      {/* Two questions and a toggle, where there were six fields including a nested
          JSON blob whose required keys were documented nowhere and which the shipped
          starter checks got wrong. */}
      <SonaeModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? "Edit check" : "New check"}
        size="lg"
      >
        <div className="flex flex-col gap-5 pt-2">
          <AdminModalFormError>{formAction.error}</AdminModalFormError>

          <AdminModalFormField label="What should the agent be asked to do?">
            <textarea
              className={`${adminModalTextareaClassName} min-h-[110px]`}
              value={form.objective}
              onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
              placeholder="Find this month's overdue invoices and summarise who owes what."
            />
          </AdminModalFormField>

          <AdminModalFormField
            label="What does a good result look like?"
            hint="Plain English. This is what the marking AI reads."
          >
            <textarea
              className={`${adminModalTextareaClassName} min-h-[130px]`}
              value={form.rubric}
              onChange={(event) => setForm((current) => ({ ...current, rubric: event.target.value }))}
              placeholder="Lists each overdue invoice with the customer and the amount. Never invents a figure it did not look up."
            />
          </AdminModalFormField>

          <label className="flex cursor-pointer items-start gap-3 rounded-[8px] border border-border-dim px-3 py-2.5 transition-colors hover:bg-foreground/5">
            <input
              type="checkbox"
              checked={form.mustPass}
              onChange={(event) => setForm((current) => ({ ...current, mustPass: event.target.checked }))}
              className="mt-0.5 accent-brand"
            />
            <span>
              <span className="block text-[13px] font-semibold text-foreground">This must pass before the agent goes live</span>
              <span className="block text-[12px] text-secondary">Nothing stops an agent going live unless at least one check says so.</span>
            </span>
          </label>

          <details className="rounded-[8px] border border-border-dim px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">Advanced</summary>
            <div className="mt-4">
              <AdminModalFormField
                label="Tools it should use"
                hint="Optional, comma separated. Leave empty unless you are testing that a particular tool gets used."
              >
                <input
                  className={adminModalInputClassName}
                  value={form.tools}
                  onChange={(event) => setForm((current) => ({ ...current, tools: event.target.value }))}
                  placeholder="knowledge.search, crm.lookup"
                />
              </AdminModalFormField>
            </div>
          </details>

          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <button type="button" onClick={() => setIsFormOpen(false)} disabled={formAction.isBusy()} className="rounded-[8px] px-4 py-2 text-[13px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={formAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50">
              {formAction.isBusy() && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? "Save check" : "Create check"}
            </button>
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
            <button type="button" onClick={handleArchive} disabled={archiveAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {archiveAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Remove
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
