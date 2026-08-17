"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReactNode } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings, Terminal, Library, Scale, Bot, Cpu, LayoutDashboard, FileText, Play, Loader2, Brain, BrainCircuit, Timer, ClipboardCheck, Activity, Ban } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { DetailLayout } from "@/src/ui/components/screens/DetailLayout";
import { useToast } from "@/src/context/ToastContext";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";


export default function AgentDashboardLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.agents.details");
  const params = useParams();
  const router = useRouter();
  const agentId = params.id as Id<"agents">;
  const agent = useQuery(api.agents.get, { id: agentId });
  const runningRuns = useQuery(api.agentRuns.getForAgent, {
    agentId,
    status: "RUNNING",
    paginationOpts: { numItems: 1, cursor: null },
  });
  const pendingApprovalRuns = useQuery(api.agentRuns.getForAgent, {
    agentId,
    status: "PENDING_APPROVAL",
    paginationOpts: { numItems: 1, cursor: null },
  });
  const queuedRuns = useQuery(api.agentRuns.getForAgent, {
    agentId,
    status: "QUEUED",
    paginationOpts: { numItems: 1, cursor: null },
  });

  const { showToast } = useToast();
  const runManualSchedule = useMutation(api.scheduler.manualRunSchedule);
  const cancelRun = useMutation(api.agentRuns.cancelRun);
  const [isManualRunning, setIsManualRunning] = useState(false);
  const [isStoppingAgent, setIsStoppingAgent] = useState(false);
  // Opened only when the agent has no standing job of its own, which is the
  // case its Instructions screen tells you means "somebody has to say".
  const [askDraft, setAskDraft] = useState<string | null>(null);
  const [stopRunId, setStopRunId] = useState<Id<"agentRuns"> | null>(null);
  const [modalState, setModalState] = useState<{ title: string; message: string } | null>(null);

  const handleManualRun = async (objective?: string) => {
    setIsManualRunning(true);
    try {
      await runManualSchedule({ agentId, ...(objective ? { objective } : {}) });
      setAskDraft(null);
      // Lands on Activity rather than Overview, because Activity is where the
      // new job appears — top row, marked Running. Overview looks identical
      // the instant a job starts, so pressing the button read as doing nothing.
      router.push(`/admin/agents/${agentId}/runs`);
      showToast("It has started. The new job is at the top of this list.", "success");
    } catch (e: unknown) {
      setModalState({
        title: "It could not start",
        message: getErrorMessage(e, "Something stopped this agent from running.")
      });
    } finally {
      setIsManualRunning(false);
    }
  };

  const handleConfirmStop = async () => {
    if (!stopRunId) return;
    setIsStoppingAgent(true);
    try {
      await cancelRun({ runId: stopRunId, reason: "Cancelled from the agent header" });
      setStopRunId(null);
      showToast("Agent stopped. It will show as cancelled in Activity.", "success");
    } catch (e: unknown) {
      setModalState({
        title: "It could not stop",
        message: getErrorMessage(e, "Something stopped this agent from being cancelled.")
      });
    } finally {
      setIsStoppingAgent(false);
    }
  };

  if (agent === undefined) {
    return <div className="p-8 text-secondary">{t("loading")}</div>;
  }
  if (agent === null) {
    return <div className="p-8 text-red-500">{t("notFound")}</div>;
  }

  const tabs = [
    { label: t('tabs.dashboard'), href: `/admin/agents/${agentId}`, icon: LayoutDashboard },
    {
      // Context now means only the things that shape the agent. Runs used to sit
      // here, which put the strongest account of what the agent had actually
      // done under a heading that gave no hint of it, three clicks from the top.
      label: t('tabs.context'),
      href: `/admin/agents/${agentId}/evals`,
      icon: BrainCircuit,
      dropdownItems: [
        { label: t('tabs.evals'), href: `/admin/agents/${agentId}/evals`, icon: ClipboardCheck },
        { label: t('tabs.skills'), href: `/admin/agents/${agentId}/skills`, icon: BrainCircuit },
        { label: t('tabs.knowledge'), href: `/admin/agents/${agentId}/knowledge`, icon: Library },
        { label: t('tabs.memory'), href: `/admin/agents/${agentId}/memory`, icon: Brain },
      ],
    },
    {
      label: t('tabs.instructions'),
      href: `/admin/agents/${agentId}/system-prompt`,
      icon: Scale,
      dropdownItems: [
        { label: t('tabs.prompt'), href: `/admin/agents/${agentId}/system-prompt`, icon: Terminal },
        { label: t('tabs.rules'), href: `/admin/agents/${agentId}/rules`, icon: Scale },
      ],
    },
    // One screen, so no dropdown. It was two — Integrations and I/O Schemas —
    // which are two halves of the same question: what the agent can use, and
    // what shape its answer comes back in.
    { label: t('tabs.interfaces'), href: `/admin/agents/${agentId}/interfaces`, icon: Cpu },
    {
      // The three depths of the same question, in order: is it working, what has
      // it done, and what exactly was said. Runs and Logs live here rather than
      // beside it — an overview built next to them would have been a second
      // screen answering the first question, and the two would have drifted.
      label: t('tabs.observability'),
      href: `/admin/agents/${agentId}/observability`,
      icon: Activity,
      dropdownItems: [
        { label: t('tabs.overview'), href: `/admin/agents/${agentId}/observability`, icon: Activity },
        { label: t('tabs.activity'), href: `/admin/agents/${agentId}/runs`, icon: Timer },
        { label: t('tabs.rawLogs'), href: `/admin/agents/${agentId}/logs`, icon: FileText },
      ],
    },
    { label: t('tabs.settings'), href: `/admin/agents/${agentId}/settings`, icon: Settings },
  ];
  // `page` is optional-chained too. The guard stopped one level short, so a
  // result that arrived without a page — rather than not arriving at all — took
  // the whole agent detail screen down to its error boundary.
  const activeRun = runningRuns?.page?.[0] ?? pendingApprovalRuns?.page?.[0] ?? queuedRuns?.page?.[0] ?? null;
  const isRunStateLoading = runningRuns === undefined || pendingApprovalRuns === undefined || queuedRuns === undefined;
  const hasActiveRun = activeRun !== undefined && activeRun !== null;
  const isPrimaryActionBusy = isManualRunning || isStoppingAgent || isRunStateLoading;

  return (
    <DetailLayout
      className="absolute inset-0 pl-2 pr-4 pb-4 overflow-hidden"
      headerClassName="shrink-0 pr-4"
      contentClassName="w-full pr-4 overflow-y-auto custom-scrollbar"
      leading={
        agent.avatar ? (
          <Image
            src={agent.avatar}
            alt="Avatar"
            width={40}
            height={40}
            unoptimized
            className="w-10 h-10 rounded-full border border-border-dim object-cover shadow-sm bg-card"
          />
        ) : (
          <div className="w-10 h-10 rounded-[10px] bg-card border border-border-dim flex items-center justify-center text-brand shadow-sm">
            <Bot className="w-5 h-5" />
          </div>
        )
      }
      title={agent.name || t('unnamed')}
      description={agent.description || t('noDescription')}
      tabs={tabs}
      rootHref={`/admin/agents/${agentId}`}
      actions={
        <>
            <button
              onClick={() => {
                if (hasActiveRun) {
                  setStopRunId(activeRun._id);
                  return;
                }
                if (agent.standingObjective?.trim()) {
                  void handleManualRun();
                  return;
                }
                setAskDraft("");
              }}
              disabled={isPrimaryActionBusy}
              className={`px-5 py-2 rounded-[10px] text-white font-medium hover:opacity-90 transition-all text-[13px] flex items-center gap-2 shadow-sm disabled:opacity-50 ${
                hasActiveRun ? "bg-rose-600" : "bg-brand"
              }`}
            >
              {isPrimaryActionBusy ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : hasActiveRun ? (
                <Ban className="w-3.5 h-3.5" />
              ) : (
                <Play className="w-3.5 h-3.5 fill-current" />
              )}
              {hasActiveRun ? "Stop Agent" : "Run Agent"}
            </button>
            <Link
              href="/admin/agents"
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("backButton")}
            </Link>
        </>
      }
    >
      {children}

      <SonaeModal
        isOpen={askDraft !== null}
        onClose={() => setAskDraft(null)}
        title="What should it do?"
        size="sm"
      >
        <div className="pt-2 pb-4 px-1 flex flex-col gap-4">
          <p className="text-[13px] text-secondary">
            This agent has no job of its own, so tell it what you want this time.
          </p>
          <textarea
            value={askDraft ?? ""}
            onChange={(event) => setAskDraft(event.target.value)}
            rows={4}
            autoFocus
            placeholder="Collect the listings from this Rightmove search and file them."
            className="w-full resize-none p-4 rounded-[10px] border border-border-dim bg-transparent text-foreground/90 font-mono text-[13px] leading-relaxed placeholder:text-muted/50 focus:outline-none focus:border-foreground/30 transition-colors"
          />
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setAskDraft(null)}
              className="px-4 py-2.5 rounded-[10px] border border-border-dim text-secondary font-medium text-[13px] hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              onClick={() => handleManualRun((askDraft ?? "").trim())}
              disabled={!askDraft?.trim() || isManualRunning}
              className="px-5 py-2.5 rounded-[10px] bg-brand text-white font-medium text-[13px] hover:opacity-90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isManualRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              Run it
            </button>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={stopRunId !== null}
        onClose={() => (isStoppingAgent ? undefined : setStopRunId(null))}
        title="Stop this agent?"
        size="sm"
      >
        <div className="pt-2 pb-4 px-1 flex flex-col gap-4">
          <p className="text-[13px] text-secondary">
            This will cancel the running job and any pending approvals or tool calls. It cannot be undone.
          </p>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => setStopRunId(null)}
              disabled={isStoppingAgent}
              className="px-4 py-2.5 rounded-[10px] border border-border-dim text-secondary font-medium text-[13px] hover:text-foreground transition-all disabled:opacity-50"
            >
              Keep running
            </button>
            <WriteButton
              onClick={() => void handleConfirmStop()}
              disabled={isStoppingAgent}
              className="px-5 py-2.5 rounded-[10px] bg-rose-600 text-white font-medium text-[13px] hover:opacity-90 transition-all shadow-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isStoppingAgent ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Ban className="w-3.5 h-3.5" />}
              Stop Agent
            </WriteButton>
          </div>
        </div>
      </SonaeModal>

      <SonaeModal
        isOpen={!!modalState}
        onClose={() => setModalState(null)}
        title={modalState?.title || ""}
        size="sm"
      >
        <div className="pt-2 pb-4 px-1 text-[14px] text-secondary flex flex-col gap-6">
           <p>{modalState?.message}</p>
           <div className="flex justify-end">
             <button
               onClick={() => setModalState(null)}
               className="px-5 py-2.5 rounded-[10px] bg-brand text-white font-medium text-[13px] hover:opacity-90 transition-all shadow-sm"
             >
                Acknowledge
             </button>
          </div>
        </div>
      </SonaeModal>
    </DetailLayout>
  );
}
