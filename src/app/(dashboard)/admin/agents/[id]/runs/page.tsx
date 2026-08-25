"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Timer } from "lucide-react";
import { describeRunStatus, type LabelRef } from "@/src/app/(dashboard)/admin/agents/_lib/observabilityFormat";
import type { ReplayMode } from "@/src/app/(dashboard)/admin/agents/_lib/runStatusRules";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useToast } from "@/src/context/ToastContext";
import { RunsTable, type RunFeedbackSource, type StatusFilter } from "./_components/RunsTable";
import { EvalHealthPanel } from "./_components/EvalHealthPanel";
import type { FeedbackDraft } from "./_components/FeedbackModal";

const RunDetailModal = dynamic(() =>
  import("./_components/RunDetailModal").then((module) => module.RunDetailModal)
);
const FeedbackModal = dynamic(() =>
  import("./_components/FeedbackModal").then((module) => module.FeedbackModal)
);

// Ordered by what a reader is looking for, not by the lifecycle: the things
// that need a person come first, then the things that went wrong.
const statusFilters: StatusFilter[] = ["ALL", "PENDING_APPROVAL", "FAILED", "SUCCESS", "RUNNING", "QUEUED", "CANCELLED"];

/**
 * The Runs screen: the list, the eval health panel, and the two modals.
 *
 * The page holds what is route-level — which filter is on, which run is open,
 * which run is being rated — and the write handlers that more than one child
 * offers (replay, reflection, eval fixtures), so the row menu and the detail
 * modal cannot drift apart. Everything drawn lives in `_components/`; the pure
 * status rules live in `../_lib/runStatusRules.ts`, where they are tested.
 */
export default function AgentRunsPage() {
  const t = useTranslations("admin.agents.details.runs.page");
  const tLabels = useTranslations("admin.agents.labels");
  // The pure rules return catalogue keys, not words; this says them.
  const label = (ref: LabelRef) => tLabels(ref.key, ref.params);
  const params = useParams();
  const searchParams = useSearchParams();
  const agentId = params.id as Id<"agents">;
  const requestedRunId = searchParams.get("runId") as Id<"agentRuns"> | null;
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ALL");

  // Seeded from the URL so a link straight to ?runId=… opens the detail on the
  // first render rather than flashing the list and then opening it.
  const [detailRunId, setDetailRunId] = useState<Id<"agentRuns"> | null>(requestedRunId);
  const [syncedRunId, setSyncedRunId] = useState<Id<"agentRuns"> | null>(requestedRunId);
  const [feedbackDraft, setFeedbackDraft] = useState<FeedbackDraft | null>(null);

  // One runner for every write on this page: it owns the per-row busy state,
  // unwraps failures into a sentence, and reports them. See useAdminAction.
  const action = useAdminAction({ scope: "admin-agent-runs" });
  const { showToast } = useToast();
  const replayRun = useMutation(api.agentRuns.replayRun);
  const createReflection = useMutation(api.agentRunReflections.createForRun);
  const createEvalFixture = useMutation(api.agentEvalFixtures.createFromRun);

  // Adjusting state during render rather than in an effect: React re-runs this
  // component before committing, so the detail opens in the same paint. Doing it
  // in an effect renders the closed state first and then immediately again.
  if (requestedRunId && requestedRunId !== syncedRunId) {
    setSyncedRunId(requestedRunId);
    setDetailRunId(requestedRunId);
  }

  const handleReplay = async (runId: Id<"agentRuns">, mode: ReplayMode = "CURRENT_ACTIVE") => {
    const outcome = await action.run(() => replayRun({ runId, mode }), {
      key: runId,
      fallbackMessage: t("replayFailed"),
    });
    if (outcome.ok) {
      showToast(
        mode === "SAME_VERSION"
          ? t("replaySameVersion", { runId: outcome.data.runId })
          : t("replayCurrent", { runId: outcome.data.runId }),
        "success",
      );
    }
  };

  const handleReflect = async (runId: Id<"agentRuns">) => {
    await action.run(() => createReflection({ runId }), {
      key: runId,
      successMessage: t("reflectSuccess"),
      fallbackMessage: t("reflectFailed"),
    });
  };

  const handleCreateEvalFixture = async (runId: Id<"agentRuns">) => {
    await action.run(() => createEvalFixture({ runId }), {
      key: runId,
      successMessage: t("fixtureSuccess"),
      fallbackMessage: t("fixtureFailed"),
    });
  };

  const openFeedback = (run: RunFeedbackSource) => {
    const existing = run.markers.feedback;
    setFeedbackDraft({
      runId: run._id,
      objective: run.objective,
      rating: existing?.rating || "NEUTRAL",
      labels: existing?.labels || [],
      comment: existing?.comment || "",
    });
  };

  return (
    <>
      <div className="flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 w-full h-full antialiased">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div>
            <h2 className="text-[18px] font-semibold text-foreground tracking-tight flex items-center gap-2">
              <Timer className="w-5 h-5 text-brand" />
              {t("title")}
            </h2>
            <p className="text-[13px] text-secondary mt-1">
              {t("description")}
            </p>
          </div>
          {/* The same segmented control the Overview and Raw logs screens use.
              Seven separate orange buttons read as seven calls to action; a
              segmented control reads as one choice with seven settings. */}
          <div className="flex flex-wrap gap-1 bg-white/[0.02] border border-border-dim rounded-[10px] p-1 self-start">
            {statusFilters.map((filter) => (
              /* Raw: segmented filter — the active option swaps its colours; no kit variant is stateful. */
              <button
                key={filter}
                type="button"
                onClick={() => setStatusFilter(filter)}
                className={`px-3 py-1.5 rounded-[7px] text-[12px] transition-all ${
                  statusFilter === filter
                    ? "bg-card text-foreground border border-border-dim"
                    : "text-secondary hover:text-foreground"
                }`}
              >
                {filter === "ALL" ? t("everything") : label(describeRunStatus(filter))}
              </button>
            ))}
          </div>
        </div>

        <RunsTable
          agentId={agentId}
          statusFilter={statusFilter}
          action={action}
          onRate={openFeedback}
          onReplay={handleReplay}
          onReflect={handleReflect}
          onCreateEvalFixture={handleCreateEvalFixture}
        />

        <EvalHealthPanel
          agentId={agentId}
          action={action}
          onInspectRun={setDetailRunId}
        />
      </div>

      {detailRunId && (
        <RunDetailModal
          agentId={agentId}
          detailRunId={detailRunId}
          onClose={() => setDetailRunId(null)}
          onInspectRun={setDetailRunId}
          action={action}
          onReplay={handleReplay}
          onReflect={handleReflect}
          onCreateEvalFixture={handleCreateEvalFixture}
        />
      )}

      {feedbackDraft && (
        <FeedbackModal
          draft={feedbackDraft}
          onDraftChange={setFeedbackDraft}
          onClose={() => setFeedbackDraft(null)}
          action={action}
        />
      )}
    </>
  );
}
