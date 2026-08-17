"use client";

import { getErrorMessage } from "@/src/lib/errors";
import { useQuery, useMutation } from "convex/react";
import { useServerPagedTable } from "@/src/hooks/useServerPagedTable";
import { api } from "@/convex/_generated/api";
import { useState } from "react";
import Image from "next/image";
import type { Doc } from "@/convex/_generated/dataModel";
import {
  Bot,
  Workflow,
  Plus,
  Trash2,
  Settings,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { ConfirmationModal } from "@/src/ui/components/screens/ConfirmationModal";
import {
  PageHeader,
  PagePrimaryAction,
} from "@/src/ui/components/screens/PageHeader";
import { RowActions, RowIconButton, SearchBar } from "@/src/ui/components/screens/Table";
import { DataTable } from "@/src/ui/components/screens/DataTable";
import { TABLE_PAGE_SIZE } from "@/src/ui/components/screens/pagination";

type Agent = Doc<"agents">;

export default function AgentsPage() {
  const router = useRouter();
  const t = useTranslations('admin.agents');
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "agent" });
  const activeModels = activeModelsData || [];
  const deleteAgent = useMutation(api.agents.deleteAgent);
  // Asked once for the whole page, not once per row.
  const inheritedModels = useQuery(api.agents.getInheritedAgentModels);
  // Live, so the list changes while an agent works instead of saying
  // "Active" identically for a working agent and an idle one.
  const workingAgentIds = useQuery(api.agentRuns.getWorkingAgentIds);
  const isWorking = (agentId: string) => (workingAgentIds ?? []).includes(agentId as Agent["_id"]);

  /**
   * What this agent actually runs.
   *
   * This column used to print the agent's stored `modelId` regardless of whether
   * the agent uses it. The runtime only applies an agent's own model when its
   * mode is "override", so every inheriting agent was listed against a leftover
   * value — naming a model it never touches.
   */
  const describeAgentModel = (agent: { modelId: string; modelSelectionMode?: string; workflowId?: string }) => {
    if (agent.modelSelectionMode === "override") {
      const ownModel = activeModels.find((model) => model.modelId === agent.modelId);
      return ownModel?.friendlyName || ownModel?.displayName || agent.modelId;
    }

    const inherited = agent.workflowId ? inheritedModels?.workflow : inheritedModels?.agent;
    if (!inheritedModels) return "";
    return inherited
      ? t('table.followsPlatformDefault', { model: inherited.displayName })
      : t('table.platformDefaultNotSet');
  };

  const [searchTerm, setSearchTerm] = useState("");
  const [deletingAgent, setDeletingAgent] = useState<Agent | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");

  const itemsPerPage = TABLE_PAGE_SIZE;
  const agents = useServerPagedTable(api.agents.getPaginatedAgents, { searchTerm }, itemsPerPage);
  const paginatedAgents = agents.rows;
  const isLoading = agents.isLoading || activeModelsData === undefined;

  const handleSearch = (v: string) => {
    setSearchTerm(v);
  };

  // Creating an agent is its own screen, not a box over this one: it collects
  // ten fields, and work typed into a modal is lost to a stray backdrop click.
  const handleOpenAdd = () => router.push("/admin/agents/new");

  const confirmDelete = async () => {
    if (deletingAgent) {
      setIsSubmitting(true);
      try {
        await deleteAgent({ id: deletingAgent._id });
        setDeletingAgent(null);
      } catch (err: unknown) {
        setSubmitError(getErrorMessage(err, t('errors.delete')));
      } finally {
        setIsSubmitting(false);
      }
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full">
      <PageHeader
        icon={<Workflow className="w-6 h-6 text-brand" />}
        title={t('title')}
        description={t('description')}
        action={
          <PagePrimaryAction icon={<Plus className="w-4 h-4" />} onClick={handleOpenAdd}>
            {t('new')}
          </PagePrimaryAction>
        }
      />

      <SearchBar value={searchTerm} onChange={handleSearch} placeholder={t('searchPlaceholder')} />

      {/* Table */}
      <DataTable
        rows={isLoading ? undefined : paginatedAgents}
        rowKey={(agent) => agent._id}
        minWidthClassName="min-w-[800px]"
        onRowClick={(agent) => router.push(`/admin/agents/${agent._id}`)}
        empty={{ icon: <Bot className="w-8 h-8 text-muted/30" />, label: t('table.empty') }}
        footer={{
          mode: "paged",
          page: agents.page,
          totalPages: agents.totalPages,
          totalCount: agents.loadedCount,
          pageSize: itemsPerPage,
          isLoading: agents.isBusy,
          onPageChange: agents.goToPage,
          labels: { empty: t('table.empty') },
        }}
        columns={[
          {
            key: "agent",
            header: t('table.agent'),
            cell: (agent) => (
              <div className="flex items-center gap-3">
                {agent.avatar ? (
                  <Image
                    src={agent.avatar}
                    alt={agent.name}
                    width={32}
                    height={32}
                    unoptimized
                    className="w-8 h-8 rounded-full border border-border-dim object-cover"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground">
                    <Bot className="w-4 h-4 text-brand" />
                  </div>
                )}
                <div className="flex flex-col">
                  <span className="font-medium text-[13px] text-foreground leading-tight flex items-center gap-2">
                    {agent.name}
                    {/* The wiki's staff (wiki-agents plan, phase 0): built in,
                        switchable, never deletable. */}
                    {agent.systemKey && (
                      <span className="px-1.5 py-0.5 rounded-full bg-brand/10 border border-brand/30 text-brand text-[10px] font-medium">
                        Wiki staff
                      </span>
                    )}
                  </span>
                  {agent.description && (
                    <span className="text-[11px] text-secondary mt-0.5 line-clamp-1 max-w-[300px]">
                      {agent.description}
                    </span>
                  )}
                </div>
              </div>
            ),
          },
          {
            key: "model",
            header: t('table.model'),
            cell: (agent) => (
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-foreground/5 border border-border-dim w-fit">
                {/* Not lowercased: a published model name such as
                    "MoonshotAI: Kimi K3" is not the platform's to restyle, and
                    the label is now a phrase. */}
                <span className="text-[10px] font-mono tracking-widest text-foreground/80">
                  {describeAgentModel(agent)}
                </span>
              </div>
            ),
          },
          {
            key: "status",
            header: t('table.status'),
            cell: (agent) => (
              <div className={`flex items-center gap-2 text-[12px] font-medium ${isWorking(agent._id) ? 'text-brand' : agent.isActive ? 'text-green-500' : 'text-neutral-500'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${isWorking(agent._id) ? 'bg-brand animate-pulse' : agent.isActive ? 'bg-green-500' : 'bg-neutral-500'}`} />
                {isWorking(agent._id)
                  ? t('table.working')
                  : agent.isActive ? t('table.active') : t('table.draft')}
              </div>
            ),
          },
          {
            key: "actions",
            header: t('table.actions'),
            align: "right",
            cell: (agent) => (
              <RowActions>
                <RowIconButton navigates label={t('table.configure')} onClick={() => router.push(`/admin/agents/${agent._id}`)}>
                  <Settings className="w-4 h-4" />
                </RowIconButton>
                <RowIconButton label={t('buttons.delete')} tone="danger" onClick={() => setDeletingAgent(agent)}>
                  <Trash2 className="w-4 h-4" />
                </RowIconButton>
              </RowActions>
            ),
          },
        ]}
      />

      <ConfirmationModal
        isOpen={!!deletingAgent}
        onClose={() => {
          setDeletingAgent(null);
          setSubmitError("");
        }}
        title={t('modal.deleteTitle')}
        cancelLabel={t('buttons.cancel')}
        confirmLabel={isSubmitting ? t('buttons.deleting') : t('buttons.delete')}
        isSubmitting={isSubmitting}
        onConfirm={confirmDelete}
        error={submitError}
      >
        <p>
          {t('modal.deleteConfirm', { name: deletingAgent?.name ?? "" })}
        </p>
        <p className="text-[13px] text-muted">{t('modal.undone')}</p>
      </ConfirmationModal>
    </div>
  );
}
