import React from 'react';
import { Bot, Webhook, Zap, ArrowRightLeft, X, Code2, Clock, Database, UserCheck, RefreshCcw, GitMerge, Mail } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useTranslations } from 'next-intl';
import { Button } from '@/src/ui/atoms/Button';

export const WorkflowSidebar = ({ isOpen, onClose }: { isOpen: boolean, onClose: () => void }) => {
  const t = useTranslations('admin.workflows.designer.library');
  const tNode = useTranslations('admin.workflows.designer.node');
  const onDragStart = (event: React.DragEvent, nodeType: string, label: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.setData('application/reactflow-label', label);
    event.dataTransfer.effectAllowed = 'move';
  };

  const nodeTypes = [
    { type: 'triggerNode', label: t('nodes.trigger'), icon: Zap, color: 'text-yellow-500', bg: 'bg-yellow-500/10', border: 'border-yellow-500/20' },
    { type: 'agentNode', label: t('nodes.agent'), icon: Bot, color: 'text-brand', bg: 'bg-brand/10', border: 'border-brand/20' },
    { type: 'actionNode', label: t('nodes.action'), icon: Webhook, color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' },
    { type: 'logicNode', label: t('nodes.logic'), icon: ArrowRightLeft, color: 'text-purple-500', bg: 'bg-purple-500/10', border: 'border-purple-500/20' },
    { type: 'mergeNode', label: t('nodes.merge'), icon: GitMerge, color: 'text-fuchsia-500', bg: 'bg-fuchsia-500/10', border: 'border-fuchsia-500/20' },
    { type: 'iteratorNode', label: t('nodes.iterator'), icon: RefreshCcw, color: 'text-cyan-500', bg: 'bg-cyan-500/10', border: 'border-cyan-500/20' },
    { type: 'codeNode', label: t('nodes.code'), icon: Code2, color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
    { type: 'databaseNode', label: t('nodes.database'), icon: Database, color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' },
    { type: 'waitNode', label: t('nodes.wait'), icon: Clock, color: 'text-slate-400', bg: 'bg-slate-400/10', border: 'border-slate-500/20' },
    { type: 'approvalNode', label: t('nodes.approval'), icon: UserCheck, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' },
    { type: 'emailNode', label: t('nodes.email'), icon: Mail, color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' }
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
            <h3 className="text-[14px] font-bold text-foreground">{t('title')}</h3>
            <p className="text-[12px] text-secondary mt-1">{t('description')}</p>
            <Button variant="icon" onClick={onClose} className="absolute -top-1 right-4">
              <X className="w-4 h-4" />
            </Button>
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
                    <span className="text-[11px] text-muted capitalize">{tNode('module', { type: item.type.replace('Node', '') })}</span>
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
