import React from 'react';
import { Handle, Position } from '@xyflow/react';
import { Zap, Webhook, ArrowRightLeft, Settings2, Mail, Database } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { WorkflowCanvasNodeData, WorkflowNodeType } from './types';

export function GenericNode({ data, type }: { data: WorkflowCanvasNodeData; type: WorkflowNodeType }) {
  const t = useTranslations('admin.workflows.designer.node');
  let Icon = Settings2;
  let color = 'text-foreground';
  let border = 'border-border-dim';
  let bg = 'bg-background';

  if (type === 'triggerNode') {
    Icon = Zap; color = 'text-yellow-500'; border = 'border-yellow-500/30'; bg = 'bg-yellow-500/10';
  } else if (type === 'actionNode') {
    Icon = Webhook; color = 'text-blue-500'; border = 'border-blue-500/30'; bg = 'bg-blue-500/10';
  } else if (type === 'logicNode') {
    Icon = ArrowRightLeft; color = 'text-purple-500'; border = 'border-purple-500/30'; bg = 'bg-purple-500/10';
  } else if (type === 'emailNode') {
    Icon = Mail; color = 'text-rose-500'; border = 'border-rose-500/30'; bg = 'bg-rose-500/10';
  } else if (type === 'databaseNode') {
    Icon = Database; color = 'text-green-500'; border = 'border-green-500/30'; bg = 'bg-green-500/10';
  }

  return (
    <div className={`flex flex-col w-[300px] bg-sidebar rounded-[24px] border ${border} shadow-2xl relative backdrop-blur-3xl group transition-all duration-300`}>
      {type !== 'triggerNode' && (
        <Handle type="target" position={Position.Left} className="!w-5 !h-5 !bg-card !border-[4px] !border-border-dim !rounded-full !-ml-[10px] transition-transform hover:scale-125" />
      )}
      
      <div className={`p-4 flex items-center gap-4 border-b border-border-dim/50`}>
        <div className={`w-10 h-10 rounded-[12px] flex items-center justify-center ${bg} ${color}`}>
            <Icon className="w-5 h-5" />
        </div>
        <div className="flex flex-col">
            <span className="font-bold text-[14px] text-foreground tracking-wide leading-tight">
                {data.label || t('unnamed')}
            </span>
            <span className="text-[11px] uppercase tracking-widest text-muted mt-0.5">
                {t('module', { type: type.replace('Node', '') })}
            </span>
        </div>
      </div>

      <div className="p-5 flex flex-col min-h-[80px] gap-3">
         {type === 'databaseNode' ? (
             data._dbConfig?.tableName ? (
               <div className="flex flex-col gap-3">
                 <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase text-secondary font-semibold tracking-widest">{t('configuration')}</span>
                    <div className="flex items-center gap-1.5 flex-wrap">
                       <span className="px-1.5 py-0.5 rounded-[4px] bg-background border border-border-dim text-[10px] text-foreground font-mono">{data._dbConfig.operation || 'INSERT'}</span>
                       <span className="px-1.5 py-0.5 rounded-[4px] bg-background border border-border-dim text-[10px] text-foreground font-mono">{data._dbConfig.tableName || t('notAvailable')}</span>
                    </div>
                 </div>
                 <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] uppercase text-secondary font-semibold tracking-widest">{t('outputs')}</span>
                    <div className="flex flex-wrap gap-1">
                       <span className="px-1.5 py-0.5 rounded-[4px] bg-brand/10 border border-brand/20 text-[10px] font-mono text-brand/80">result</span>
                       <span className="px-1.5 py-0.5 rounded-[4px] bg-brand/10 border border-brand/20 text-[10px] font-mono text-brand/80">operation</span>
                       <span className="px-1.5 py-0.5 rounded-[4px] bg-brand/10 border border-brand/20 text-[10px] font-mono text-brand/80">tableName</span>
                    </div>
                 </div>
               </div>
             ) : (
                 <span className="text-[12px] text-secondary italic text-center w-full mt-2">{t('unconfiguredDatabase')}</span>
             )
         ) : (
             <div className="flex w-full h-full items-center justify-center">
                 <span className="text-[12px] text-secondary italic">
                     {data._inputMapping ? t('schemaBound') : t('noSchema')}
                 </span>
             </div>
         )}
      </div>

      <Handle type="source" position={Position.Right} className="!w-5 !h-5 !bg-brand/80 !border-[4px] !border-brand/50 !rounded-full !-mr-[10px] shadow-[0_0_12px_rgba(var(--brand),0.6)] transition-transform hover:scale-125" />
    </div>
  );
}
