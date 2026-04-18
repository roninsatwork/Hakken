import React from 'react';
import { Bot, Webhook, Zap, ArrowRightLeft, X, Code2, Clock, Database, UserCheck, RefreshCcw, GitMerge, Network } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';

export const WorkflowSidebar = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const t = useTranslations('admin.workflows.designer');

  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const nodeTypes = [
    { type: 'triggerNode', label: 'Trigger Event', icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    { type: 'agentNode', label: 'AI Agent', icon: Bot, color: 'text-brand', bg: 'bg-brand/10', border: 'border-brand/20' },
    { type: 'actionNode', label: 'API Action', icon: Webhook, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { type: 'logicNode', label: 'Logic Router', icon: ArrowRightLeft, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    { type: 'mergeNode', label: 'Merge / Sync', icon: GitMerge, color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
    { type: 'iteratorNode', label: 'Iterator (Loop)', icon: RefreshCcw, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { type: 'codeNode', label: 'Code Transform', icon: Code2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { type: 'databaseNode', label: 'Database Action', icon: Database, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    { type: 'waitNode', label: 'Wait / Delay', icon: Clock, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-500/20' },
    { type: 'approvalNode', label: 'Human Approval', icon: UserCheck, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    { type: 'subWorkflowNode', label: 'Sub-Workflow', icon: Network, color: 'text-orange-500', bg: 'bg-orange-500/10', border: 'border-orange-500/20' }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
          className={`absolute top-0 right-0 w-[320px] h-full bg-sidebar/95 backdrop-blur-3xl border-l border-border-dim flex flex-col pt-6 z-40 shadow-2xl`}
        >
          <div className="px-6 pb-4 border-b border-border-dim relative">
            <h3 className="text-[14px] font-bold text-foreground">Node Library</h3>
            <p className="text-[12px] text-secondary mt-1">Drag and drop nodes onto the canvas to orchestrate your workflow.</p>
            <button onClick={onClose} className="absolute -top-1 right-4 p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-all">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 custom-scrollbar">
            {nodeTypes.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.type}
                  className={`flex items-center gap-4 p-4 rounded-[16px] border ${item.border} bg-background hover:bg-foreground/5 cursor-grab active:cursor-grabbing transition-all`}
                  onDragStart={(event) => onDragStart(event, item.type, item.label)}
                  draggable
                >
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${item.bg} ${item.color}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-bold text-foreground">{item.label}</span>
                    <span className="text-[11px] text-muted capitalize">{item.type.replace('Node', '')} Module</span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
