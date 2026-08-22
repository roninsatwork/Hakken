"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
import { RowIconButton, SearchBar } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
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
import { PageHeader } from "@/src/ui/components/screens/PageHeader";
import { Button } from "@/src/ui/atoms/Button";

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
function describeStatus(
  entry: { status: string; gradingMode: string } | undefined,
  t: (key: string) => string
) {
  if (!entry) return { label: t("status.notRunYet"), tone: "text-muted" };
  if (entry.gradingMode !== "MODEL_GRADED") return { label: t("status.setupOnly"), tone: "text-amber-400" };
  if (entry.status === "SUCCESS") return { label: t("status.passing"), tone: "text-emerald-400" };
  if (entry.status === "FAILED") return { label: t("status.failing"), tone: "text-red-400" };
  return { label: t("status.running"), tone: "text-secondary" };
}

const DEFAULT_FORM = {
  objective: "",
  rubric: "",
  tools: "",
  mustPass: true,
  sampleCount: 1,
};

export default function AgentEvalsPage() {
  const t = useTranslations("admin.agents.details.evals");
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
      fallbackMessage: t("saveFailed"),
      suppressErrorToast: true,
    });

    if (!outcome.ok) return;
    const wasEditing = Boolean(editingId);
    setIsFormOpen(false);
    setEditingId(null);
    setForm(DEFAULT_FORM);
    // Editing bumps the check's timestamp, which retires its earlier passes. That
    // used to happen in silence, so a gate could re-block with no explanation.
    setNotice(wasEditing ? t("savedEdit") : t("savedNew"));
  };

  const handleRun = async (fixtureId: Id<"agentEvalFixtures">) => {
    setNotice("");
    // Model-graded, not contract-only. The per-row Run button used to default to a
    // configuration check — the thing that is not a test — and say it had passed.
    await runAction.run(() => runSmokeEval({ agentId, fixtureId, gradingMode: "MODEL_GRADED" }), {
      key: `run:${fixtureId}`,
      fallbackMessage: t("runFailed"),
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
      fallbackMessage: t("runManyFailed"),
      suppressErrorToast: true,
    });
    if (outcome.ok) setNotice(t("runningCount", { count }));
  };

  const handleCheckSetup = async () => {
    setNotice("");
    const outcome = await runAction.run(() => runEvalSuite({ agentId, gradingMode: "CONTRACT_ONLY" }), {
      key: "run:setup",
      fallbackMessage: t("setupFailed"),
    });
    if (outcome.ok) setNotice(t("setupChecked"));
  };

  const handleArchive = async () => {
    if (!archiveTarget) return;
    const outcome = await archiveAction.run(() => archiveFixture({ fixtureId: archiveTarget._id }), {
      fallbackMessage: t("removeFailed"),
    });
    if (outcome.ok) setArchiveTarget(null);
  };

  return (
    <div className="flex w-full flex-col gap-6 pb-12">
      <header className="flex flex-col gap-4">
        <PageHeader
          icon={<ClipboardCheck className="h-6 w-6 text-brand" />}
          title={t("title")}
          description={t("description")}
        />

        <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
          <p className="text-[15px] font-semibold text-foreground">
            {fixtures === undefined
              ? t("headline.loading")
              : rows.length === 0
                ? t("headline.none")
                : `${t("headline.passing", { passing, total: rows.length })}${unproven.length > 0 ? ` ${t("headline.unproven", { count: unproven.length })}` : ""}`}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="brand"
              onClick={handleRunUnproven}
              disabled={runAction.isBusy() || rows.length === 0}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] font-semibold disabled:cursor-not-allowed disabled:opacity-50"
            >
              {runAction.isBusy("run:unproven") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              {t("runEvals")}
            </Button>
            {/* Raw: bordered chip with no fill, foreground text and a foreground/5 hover — quiet matches no pixel of it. */}
            <button
              type="button"
              onClick={handleCheckSetup}
              disabled={runAction.isBusy() || rows.length === 0}
              title={t("setupTitle")}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5 disabled:opacity-50"
            >
              {runAction.isBusy("run:setup") ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />}
              {t("evalSetup")}
            </button>
            <WriteButton
              type="button"
              onClick={openCreate}
              className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-[8px] border border-border-dim px-4 text-[13px] font-semibold text-foreground transition-colors hover:bg-foreground/5"
            >
              <Plus className="h-4 w-4" />
              {t("newEval")}
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
              {t("gateBlocked", { passed: gate.passedCriticalFixtureCount, total: gate.criticalFixtureCount })}
            </p>
          </div>
        </section>
      )}
      {gate && gate.criticalFixtureCount === 0 && rows.length > 0 && (
        <section className="rounded-[8px] border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[13px] text-amber-100">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{t("gateNone")}</p>
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
        placeholder={t("searchPlaceholder")}
      />

      <DataTable
        rows={fixtures === undefined ? undefined : paged.pageRows}
        rowKey={(fixture) => fixture._id}
        minWidthClassName="min-w-[760px]"
        empty={{
          icon: <ClipboardCheck className="h-8 w-8 text-muted/30" />,
          label: t("emptyLabel"),
        }}
        footer={{
          mode: "paged",
          page: paged.page,
          totalPages: paged.totalPages,
          totalCount: paged.loadedCount,
          pageSize: paged.pageSize,
          isLoading: fixtures === undefined,
          onPageChange: paged.goToPage,
          labels: { empty: t("footerEmpty") },
        }}
        columns={[
          {
            key: "eval",
            header: t("columns.eval"),
            cell: (fixture) => (
              <>
                <Link
                  href={`/admin/agents/${agentId}/evals/${fixture._id}`}
                  className="block text-[13px] font-semibold text-foreground line-clamp-1 max-w-[480px] hover:text-brand transition-colors"
                >
                  {fixture.objective}
                </Link>
                <div className="text-[12px] text-secondary line-clamp-1 max-w-[480px]">
                  {fixture.expectedFinalOutputRubric}
                </div>
              </>
            ),
          },
          {
            key: "status",
            header: t("columns.status"),
            className: "w-[130px]",
            cell: (fixture) => {
              const status = describeStatus(latestByFixture.get(fixture._id), t);
              return <span className={`text-[13px] font-semibold ${status.tone}`}>{status.label}</span>;
            },
          },
          {
            key: "mustPass",
            header: t("columns.mustPass"),
            className: "w-[120px]",
            cell: (fixture) => (
              <span className="text-[12px] text-secondary">
                {fixture.tags.includes(MUST_PASS_TAG) ? t("yes") : t("no")}
              </span>
            ),
          },
          {
            key: "lastRun",
            header: t("columns.lastRun"),
            className: "w-[170px]",
            cell: (fixture) => {
              const latest = latestByFixture.get(fixture._id);
              return (
                <span className="text-[12px] text-secondary">
                  {latest?.completedAt ? formatDateTime(latest.completedAt) : "—"}
                </span>
              );
            },
          },
          {
            key: "actions",
            header: "",
            align: "right",
            className: "w-[150px]",
            cell: (fixture) => {
              const isRunning = runAction.isBusy(`run:${fixture._id}`);
              return (
                <div className="flex items-center justify-end gap-1">
                  {/* Raw: borderless row action with a foreground/5 hover — quiet's border and fill match no pixel of it. */}
                  <button
                    type="button"
                    onClick={() => handleRun(fixture._id)}
                    disabled={isRunning}
                    className="inline-flex h-8 items-center justify-center gap-1.5 rounded-[8px] px-2.5 text-[12px] font-semibold text-secondary transition-colors hover:bg-foreground/5 hover:text-foreground disabled:opacity-50"
                  >
                    {isRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    {t("run")}
                  </button>
                  <RowIconButton label={t("editAria", { name: fixture.objective })} onClick={() => openEdit(fixture)}>
                    <Pencil className="h-4 w-4" />
                  </RowIconButton>
                  <RowIconButton
                    label={t("removeAria", { name: fixture.objective })}
                    tone="danger"
                    onClick={() => setArchiveTarget(fixture)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </RowIconButton>
                </div>
              );
            },
          },
        ]}
      />

      {/* Two questions and a toggle, where there were six fields including a nested
          JSON blob whose required keys were documented nowhere and which the shipped
          starter evals got wrong. */}
      <SonaeModal
        isOpen={isFormOpen}
        onClose={() => setIsFormOpen(false)}
        title={editingId ? t("form.editTitle") : t("form.newTitle")}
        size="lg"
      >
        <div className="flex flex-col gap-5 pt-2">
          <ModalFormError>{formAction.error}</ModalFormError>

          <ModalFormField label={t("form.objectiveLabel")}>
            <textarea
              className={`${modalTextareaClassName} min-h-[110px]`}
              value={form.objective}
              onChange={(event) => setForm((current) => ({ ...current, objective: event.target.value }))}
              placeholder={t("form.objectivePlaceholder")}
            />
          </ModalFormField>

          <ModalFormField
            label={t("form.rubricLabel")}
            hint={t("form.rubricHint")}
          >
            <textarea
              className={`${modalTextareaClassName} min-h-[130px]`}
              value={form.rubric}
              onChange={(event) => setForm((current) => ({ ...current, rubric: event.target.value }))}
              placeholder={t("form.rubricPlaceholder")}
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
              <span className="block text-[13px] font-semibold text-foreground">{t("form.mustPassLabel")}</span>
              <span className="block text-[12px] text-secondary">{t("form.mustPassHint")}</span>
            </span>
          </label>

          <details className="rounded-[8px] border border-border-dim px-3 py-2.5">
            <summary className="cursor-pointer text-[13px] font-semibold text-foreground">{t("form.advanced")}</summary>
            <div className="mt-4 flex flex-col gap-5">
              <ModalFormField
                label={t("form.sampleLabel")}
                hint={t("form.sampleHint")}
              >
                <select
                  className={modalInputClassName}
                  value={String(form.sampleCount)}
                  onChange={(event) => setForm((current) => ({ ...current, sampleCount: Number(event.target.value) }))}
                >
                  <option value="1">{t("form.once")}</option>
                  <option value="3">{t("form.three")}</option>
                  <option value="5">{t("form.five")}</option>
                </select>
              </ModalFormField>
              <ModalField
                label={t("form.toolsLabel")}
                hint={t("form.toolsHint")}
                value={form.tools}
                onChange={(event) => setForm((current) => ({ ...current, tools: event.target.value }))}
                placeholder={t("form.toolsPlaceholder")}
              />
            </div>
          </details>

          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={formAction.isBusy()} className="px-4 py-2 font-semibold hover:bg-foreground/5">
              {t("form.cancel")}
            </Button>
            <WriteButton type="button" onClick={handleSave} disabled={formAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-brand px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-brand/90 disabled:opacity-50">
              {formAction.isBusy() && <Loader2 className="h-4 w-4 animate-spin" />}
              {editingId ? t("form.saveCheck") : t("form.createCheck")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal isOpen={Boolean(archiveTarget)} onClose={() => setArchiveTarget(null)} title={t("removeModal.title")} size="sm">
        <div className="flex flex-col gap-6">
          <p className="text-[13px] leading-relaxed text-secondary">
            {t("removeModal.body")}
          </p>
          <div className="flex justify-end gap-3 border-t border-border-dim pt-5">
            <Button variant="ghost" onClick={() => setArchiveTarget(null)} disabled={archiveAction.isBusy()} className="px-4 py-2 font-semibold hover:bg-foreground/5">
              {t("removeModal.cancel")}
            </Button>
            <WriteButton type="button" onClick={handleArchive} disabled={archiveAction.isBusy()} className="inline-flex items-center gap-2 rounded-[8px] bg-red-500 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-red-600 disabled:opacity-50">
              {archiveAction.isBusy() ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("removeModal.confirm")}
            </WriteButton>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
