import { memo } from 'react';
import { Handle, Position, NodeProps, Node } from '@xyflow/react';
import { Bot, Network } from 'lucide-react';
import { cn } from '@/src/ui/lib/utils';
import { useTranslations } from 'next-intl';
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";

export type AgentNodeData = {
  label: string;
  avatar?: string;
  modelId?: string;
  _agentId?: string;
  inputSchema?: string;
  outputSchema?: string;
};

export type AgentNodeType = Node<AgentNodeData, 'agentNode'>;

export const AgentNode = memo(({ data, isConnectable, selected }: NodeProps<AgentNodeType>) => {
  const t = useTranslations('admin.workflows.designer.node');
  const allModels = useQuery(api.aiModels.getModels) || [];
  // Pretty-print fallback for unknown models
  const formatFallback = (id?: string) => {
    if (!id) return '';
    return id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ');
  };

  const agent = useQuery(api.agents.get, data._agentId ? { id: data._agentId as any } : "skip");
  
  // Use live agent config if available, otherwise trust the local canvas snapshot
  const liveModelId = agent ? agent.modelId : data.modelId;
  const modelConfig = (allModels as any[]).find(m => m.modelId?.toLowerCase().trim() === liveModelId?.toLowerCase().trim());
  const displayModelName = modelConfig ? (modelConfig.friendlyName || modelConfig.displayName || liveModelId) : formatFallback(liveModelId);

  // Parse schemas to show properties visually if available
  let inputProps: string[] = [];
  let outputProps: string[] = [];

  try {
    if (data.inputSchema) {
      const parsed = JSON.parse(data.inputSchema);
      if (parsed.properties) {
        inputProps = Object.keys(parsed.properties);
      }
    }
    if (data.outputSchema) {
      const parsed = JSON.parse(data.outputSchema);
      if (parsed.properties) {
        outputProps = Object.keys(parsed.properties);
      }
    }
  } catch (e) {
    console.error("Failed to parse agent schema in node", e);
  }

  return (
    <div className={cn(
      "w-[260px] rounded-[16px] border backdrop-blur-2xl bg-sidebar/80 shadow-2xl transition-all duration-200",
      selected ? "border-brand/50 shadow-brand/10" : "border-border-dim/50 hover:border-border-dim"
    )}>
      {/* Dynamic Target Handle for inputs */}
      <Handle
        type="target"
        position={Position.Left}
        isConnectable={isConnectable}
        className="!w-5 !h-5 !bg-card !border-[4px] !border-border-dim !rounded-full !-ml-[10px] transition-transform hover:scale-125"
      />

      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 p-3 border-b border-border-dim/30">
          {data.avatar ? (
            <img src={data.avatar} alt="Avatar" className="w-8 h-8 rounded-full border border-border-dim object-cover" />
          ) : (
            <div className="w-8 h-8 rounded-full bg-card border border-border-dim flex items-center justify-center text-foreground">
              <Bot className="w-4 h-4 text-brand" />
            </div>
          )}
          <div className="flex flex-col flex-1 min-w-0">
            <span className="font-semibold text-[13px] text-foreground truncate">{data.label}</span>
            <span className="text-[11px] tracking-wide text-muted font-mono truncate">
              {displayModelName || t('agent')}
            </span>
          </div>
        </div>

        {/* Content (Schemas) */}
        <div className="p-3 flex flex-col gap-3">
          {inputProps.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-secondary uppercase tracking-widest">{t('inputs')}</span>
              <div className="flex flex-wrap gap-1">
                {inputProps.map(prop => (
                  <span key={prop} className="px-1.5 py-0.5 rounded-[4px] bg-background border border-border-dim text-[10px] font-mono text-muted">
                    {prop}
                  </span>
                ))}
              </div>
            </div>
          )}

          {outputProps.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-[10px] font-medium text-secondary uppercase tracking-widest">{t('outputs')}</span>
              <div className="flex flex-wrap gap-1">
                {outputProps.map(prop => (
                  <span key={prop} className="px-1.5 py-0.5 rounded-[4px] bg-brand/10 border border-brand/20 text-[10px] font-mono text-brand/80">
                    {prop}
                  </span>
                ))}
              </div>
            </div>
          )}

          {inputProps.length === 0 && outputProps.length === 0 && (
            <div className="text-[11px] text-muted italic text-center py-2">
              {t('noSchema')}
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Source Handle for outputs */}
      <Handle
        type="source"
        position={Position.Right}
        isConnectable={isConnectable}
        className="!w-5 !h-5 !bg-brand/80 !border-[4px] !border-brand/50 !rounded-full !-mr-[10px] shadow-[0_0_12px_rgba(var(--brand),0.6)] transition-transform hover:scale-125"
      />
    </div>
  );
});

AgentNode.displayName = 'AgentNode';
