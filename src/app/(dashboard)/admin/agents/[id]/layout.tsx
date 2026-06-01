"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import Image from "next/image";
import type { Id } from "@/convex/_generated/dataModel";
import type { ReactNode } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings, Terminal, Library, Scale, Bot, Code2, Cpu, LayoutDashboard, FileText, Play, Loader2 } from "lucide-react";
import { useState } from "react";
import { useTranslations } from "next-intl";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { AdminDetailTabs } from "@/src/app/(dashboard)/admin/_components/AdminDetailTabs";


export default function AgentDashboardLayout({ children }: { children: ReactNode }) {
  const t = useTranslations("admin.agents.details");
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const agent = useQuery(api.agents.get, { id: agentId });

  const runManualSchedule = useMutation(api.scheduler.manualRunSchedule);
  const [isManualRunning, setIsManualRunning] = useState(false);
  const [modalState, setModalState] = useState<{ title: string; message: string } | null>(null);

  const handleManualRun = async () => {
    setIsManualRunning(true);
    try {
      await runManualSchedule({ agentId });
      setModalState({
        title: "Execution Launched",
        message: "Agent execution initiated! You can monitor live telemetry inside the Logs tab."
      });
    } catch (e: unknown) {
      setModalState({
        title: "Execution Blocked",
        message: getErrorMessage(e, "An unknown error prevented execution.")
      });
    } finally {
      setIsManualRunning(false);
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
    { label: t('tabs.settings'), href: `/admin/agents/${agentId}/settings`, icon: Settings },
    { label: t('tabs.knowledge'), href: `/admin/agents/${agentId}/knowledge`, icon: Library },
    { label: t('tabs.prompt'), href: `/admin/agents/${agentId}/system-prompt`, icon: Terminal },
    { label: t('tabs.rules'), href: `/admin/agents/${agentId}/rules`, icon: Scale },
    { label: t('tabs.integrations'), href: `/admin/agents/${agentId}/integrations`, icon: Cpu },
    { label: t('tabs.schemas'), href: `/admin/agents/${agentId}/schemas`, icon: Code2 },
    { label: t('tabs.logs'), href: `/admin/agents/${agentId}/logs`, icon: FileText },
  ];

  return (
    <div className="absolute inset-0 flex flex-col gap-6 pl-2 pr-4 pb-4 overflow-hidden">
      <div className="flex flex-col gap-6 relative z-10 shrink-0 pr-4">

        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {agent.avatar ? (
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
            )}
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                {agent.name || t('unnamed')}
              </h1>
              <p className="text-[13px] text-secondary mt-1 max-w-[500px] truncate">{agent.description || t('noDescription')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 z-20">
            <button
              onClick={handleManualRun}
              disabled={isManualRunning}
              className="px-5 py-2 rounded-[10px] bg-brand text-white font-medium hover:opacity-90 transition-all text-[13px] flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              {isManualRunning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5 fill-current" />}
              Launch Run
            </button>
            <Link
              href="/admin/agents"
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("backButton")}
            </Link>
          </div>
        </header>

        <AdminDetailTabs tabs={tabs} rootHref={`/admin/agents/${agentId}`} />
      </div>

      <div className="relative z-10 flex-1 flex flex-col min-h-0 bg-transparent pt-4 w-full pr-4 overflow-y-auto custom-scrollbar">
        {children}
      </div>

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
    </div>
  );
}
