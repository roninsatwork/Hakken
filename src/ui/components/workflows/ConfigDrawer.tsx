import { useState, useEffect } from "react";
import { X, Save, Database, Code2, Wand2, Loader2, Zap, Clock, Webhook } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import type {
  WorkflowActionConfig,
  WorkflowApprovalConfig,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowDatabaseConfig,
  WorkflowEmailConfig,
  WorkflowHeaderConfig,
  WorkflowIteratorConfig,
  WorkflowLogicConfig,
  WorkflowLogicRule,
  WorkflowMergeConfig,
  WorkflowNodeUpdateHandler,
  WorkflowTriggerType,
  WorkflowWaitConfig,
} from "./types";

type ScheduleMode = "interval" | "daily" | "weekly" | "monthly";

type ConfigDrawerFormData = {
  label: string;
  _inputMapping: string;
  _inputTemplate: string;
  _triggerType: WorkflowTriggerType;
  _scheduleMode: ScheduleMode;
  _scheduleIntervalValue: number;
  _scheduleIntervalUnit: string;
  _scheduleTime: string;
  _scheduleDayOfWeek: number;
  _scheduleDayOfMonth: number;
  _webhookSecret: string;
  _actionConfig: WorkflowActionConfig;
  _dbConfig: WorkflowDatabaseConfig;
  _logicConfig: WorkflowLogicConfig;
  _iteratorConfig: WorkflowIteratorConfig;
  _mergeConfig: WorkflowMergeConfig;
  _waitConfig: WorkflowWaitConfig;
  _approvalConfig: WorkflowApprovalConfig;
  _emailConfig: WorkflowEmailConfig;
};

type ScheduleConfig = {
  mode?: ScheduleMode;
  intervalVal?: number;
  intervalUnit?: string;
  time?: string;
  dayOfWeek?: number;
  dayOfMonth?: number;
};

type ConfigDrawerProps = {
  node: WorkflowCanvasNode | null;
  allNodes?: WorkflowCanvasNode[];
  edges?: WorkflowCanvasEdge[];
  onClose: () => void;
  onUpdateNode: WorkflowNodeUpdateHandler;
};

const defaultActionConfig: WorkflowActionConfig = { method: "GET", url: "", headers: [], body: "" };
const defaultDbConfig: WorkflowDatabaseConfig = { operation: "INSERT", tableName: "", docId: "" };
const defaultLogicConfig: WorkflowLogicConfig = { rules: [], fallbackBranch: "" };

type WorkflowDbSelectIndexOption = {
  indexName: string;
  label: string;
  filters: string[];
};

const workflowDbSelectIndexes: Record<string, WorkflowDbSelectIndexOption[]> = {
  companies: [
    { indexName: "by_name", label: "Name", filters: ["name"] },
    { indexName: "by_plan", label: "Plan", filters: ["planId"] },
  ],
  properties: [
    { indexName: "by_company", label: "Company", filters: ["companyId"] },
    { indexName: "by_rightmoveId", label: "Rightmove ID", filters: ["rightmoveId"] },
    { indexName: "by_runId", label: "Run ID", filters: ["runId"] },
  ],
  threads: [
    { indexName: "by_company", label: "Company", filters: ["companyId"] },
    { indexName: "by_user", label: "User", filters: ["userId"] },
    { indexName: "by_widget", label: "Widget", filters: ["widgetId"] },
  ],
  messages: [
    { indexName: "by_thread", label: "Thread", filters: ["threadId"] },
    { indexName: "by_company_role_created", label: "Company + Role", filters: ["companyId", "role"] },
  ],
  knowledgeDocuments: [
    { indexName: "by_company", label: "Company", filters: ["companyId"] },
    { indexName: "by_agent", label: "Agent", filters: ["agentId"] },
    { indexName: "by_thread", label: "Thread", filters: ["threadId"] },
    { indexName: "by_status", label: "Status", filters: ["status"] },
  ],
  knowledgeChunks: [
    { indexName: "by_document", label: "Document", filters: ["documentId"] },
  ],
  aiRules: [
    { indexName: "by_company_created", label: "Company", filters: ["companyId"] },
    { indexName: "by_agent_company_created", label: "Agent + Company", filters: ["agentId", "companyId"] },
  ],
  users: [
    { indexName: "by_company", label: "Company", filters: ["companyId"] },
    { indexName: "email", label: "Email", filters: ["email"] },
  ],
  agents: [
    { indexName: "by_active_created", label: "Active", filters: ["isActive"] },
  ],
  aiTools: [
    { indexName: "by_createdAt", label: "Created", filters: [] },
  ],
};

function getDefaultSelectQuery(tableName: string): WorkflowDatabaseConfig["query"] | undefined {
  const option = workflowDbSelectIndexes[tableName]?.[0];
  if (!option) return undefined;
  return {
    indexName: option.indexName,
    equals: option.filters.map((field) => ({ field, value: "" })),
    order: "desc",
    limit: 15,
  };
}

export function ConfigDrawer({ node, allNodes = [], edges = [], onClose, onUpdateNode }: ConfigDrawerProps) {
  
  const getUpstreamNodes = (): WorkflowCanvasNode[] => {
    if (!node?.id) return [];
    const upstreamIds = new Set<string>();
    const queue = [node.id];
    while (queue.length > 0) {
      const current = queue.shift();
      const incoming = edges.filter((e) => e.target === current).map((e) => e.source);
      for (const id of incoming) {
        if (!upstreamIds.has(id)) {
          upstreamIds.add(id);
          queue.push(id);
        }
      }
    }
    return allNodes.filter((n) => upstreamIds.has(n.id));
  };

  const getDownstreamNodes = (): WorkflowCanvasNode[] => {
    if (!node?.id) return [];
    const downstreamIds = edges.filter((e) => e.source === node.id).map((e) => e.target);
    return allNodes.filter((n) => downstreamIds.includes(n.id));
  };

  const upstreamNodes = getUpstreamNodes();
  const downstreamNodes = getDownstreamNodes();
  const [formData, setFormData] = useState<ConfigDrawerFormData>({
    label: "",
    _inputMapping: "",
    _inputTemplate: "",
    _triggerType: "MANUAL",
    _scheduleMode: "interval",
    _scheduleIntervalValue: 15,
    _scheduleIntervalUnit: "minutes",
    _scheduleTime: "09:00",
    _scheduleDayOfWeek: 1,
    _scheduleDayOfMonth: 1,
    _webhookSecret: "",
    _actionConfig: defaultActionConfig,
    _dbConfig: defaultDbConfig,
    _logicConfig: defaultLogicConfig,
    _iteratorConfig: { listVariable: '' },
    _mergeConfig: { mode: 'WAIT_FOR_ALL' },
    _waitConfig: { delaySeconds: '5' },
    _approvalConfig: { message: '', previewTarget: '' },
    _emailConfig: { from: '', to: '', subject: '', body: '' },
  });

  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const generateConfig = useAction(api.ai.generateNodeConfig);

  const updateDbConfig = (updates: Partial<WorkflowDatabaseConfig>) => {
    setFormData((current) => {
      const nextConfig = { ...current._dbConfig, ...updates };
      if (updates.tableName) {
        nextConfig.query = nextConfig.operation === "SELECT" ? getDefaultSelectQuery(updates.tableName) : undefined;
      }
      if (updates.operation) {
        nextConfig.query = updates.operation === "SELECT" ? getDefaultSelectQuery(nextConfig.tableName) : undefined;
        if (updates.operation === "INSERT") nextConfig.docId = "";
      }
      return { ...current, _dbConfig: nextConfig };
    });
  };

  useEffect(() => {
    if (node) {
        const existingSchedule = node.data?._scheduleInterval;
        let pMode: ScheduleMode = "interval";
        let pVal = 15;
        let pUnit = "minutes";
        let pTime = "09:00";
        let pDow = 1;
        let pDom = 1;
        if (existingSchedule) {
           try {
              const parsed = JSON.parse(existingSchedule) as ScheduleConfig;
              if (parsed.mode) pMode = parsed.mode;
              if (parsed.intervalVal) pVal = parsed.intervalVal;
              if (parsed.intervalUnit) pUnit = parsed.intervalUnit;
              if (parsed.time) pTime = parsed.time;
              if (parsed.dayOfWeek) pDow = parsed.dayOfWeek;
              if (parsed.dayOfMonth) pDom = parsed.dayOfMonth;
           } catch {
              const parts = existingSchedule.split(" ");
              if (parts.length === 2 && !isNaN(parseInt(parts[0]))) {
                 pVal = parseInt(parts[0]);
                 pUnit = parts[1];
              }
           }
        }
        
        setFormData({
          label: node.data?.label || "",
          _inputMapping: typeof node.data?._inputMapping === 'object' ? JSON.stringify(node.data._inputMapping, null, 2) : node.data?._inputMapping || "",
          _inputTemplate: node.data?._inputTemplate || "",
          _triggerType: node.data?._triggerType || "MANUAL",
          _scheduleMode: pMode,
          _scheduleIntervalValue: pVal,
          _scheduleIntervalUnit: pUnit,
          _scheduleTime: pTime,
          _scheduleDayOfWeek: pDow,
          _scheduleDayOfMonth: pDom,
        _webhookSecret: node.data?._webhookSecret || "",
        _actionConfig: node.data?._actionConfig || defaultActionConfig,
        _dbConfig: node.data?._dbConfig || defaultDbConfig,
        _logicConfig: node.data?._logicConfig || defaultLogicConfig,
        _iteratorConfig: node.data?._iteratorConfig || { listVariable: '' },
        _mergeConfig: node.data?._mergeConfig || { mode: 'WAIT_FOR_ALL' },
        _waitConfig: node.data?._waitConfig || { delaySeconds: '5' },
        _approvalConfig: node.data?._approvalConfig || { message: '', previewTarget: '' },
        _emailConfig: node.data?._emailConfig || { from: '', to: '', subject: '', body: '' },
      });
    }
  }, [node]);

  if (!node) return null;

	  const handleAutoConfigure = async () => {
	    if (!aiPrompt.trim() || isGenerating) return;
	    setIsGenerating(true);
    setFeedbackMessage("");
    try {
      const result = await generateConfig({
        prompt: aiPrompt,
        nodeType: node.type,
        availableNodes: upstreamNodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: n.data?.label
        }))
      });

      setFormData({
         ...formData,
         _inputMapping: result.mapping ? result.mapping.trim() : "",
         _inputTemplate: result.template ? result.template.trim() : ""
      });
      setAiPrompt("");
      setIsDeveloperMode(true);
    } catch {
      setFeedbackMessage("AI Configuration failed. Please try again or construct the payload manually.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedMapping = formData._inputMapping;
    if (parsedMapping) {
      try { parsedMapping = JSON.parse(parsedMapping); } catch {}
    }
    
    onUpdateNode(node.id, {
      ...node.data,
      label: formData.label,
      _inputMapping: parsedMapping,
      _inputTemplate: formData._inputTemplate,
      _triggerType: formData._triggerType,
      _scheduleInterval: JSON.stringify({
         mode: formData._scheduleMode,
         intervalVal: formData._scheduleIntervalValue,
         intervalUnit: formData._scheduleIntervalUnit,
         time: formData._scheduleTime,
         dayOfWeek: formData._scheduleDayOfWeek,
         dayOfMonth: formData._scheduleDayOfMonth
      }),
      _scheduleMode: formData._scheduleMode,
      _scheduleIntervalValue: formData._scheduleIntervalValue,
      _scheduleIntervalUnit: formData._scheduleIntervalUnit,
      _scheduleTime: formData._scheduleTime,
      _scheduleDayOfWeek: formData._scheduleDayOfWeek,
      _scheduleDayOfMonth: formData._scheduleDayOfMonth,
      _webhookSecret: formData._webhookSecret,
      _actionConfig: formData._actionConfig,
      _dbConfig: formData._dbConfig,
      _logicConfig: formData._logicConfig,
      _iteratorConfig: formData._iteratorConfig,
      _mergeConfig: formData._mergeConfig,
      _waitConfig: formData._waitConfig,
      _approvalConfig: formData._approvalConfig,
      _emailConfig: formData._emailConfig,
    });
    onClose();
  };

  return (
    <AnimatePresence>
      {node && (
        <motion.div 
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300, mass: 0.8 }}
          className="absolute top-0 right-0 h-full w-[400px] bg-sidebar/95 backdrop-blur-3xl border-l border-border-dim z-30 shadow-2xl flex flex-col"
        >
          <div className="flex items-center justify-between p-6 border-b border-border-dim">
        <h3 className="text-lg font-bold tracking-tight text-foreground">{node.type.replace('Node', ' Module')}</h3>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-foreground/5 text-secondary hover:text-foreground transition-all">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        
        {node.type !== 'triggerNode' && node.type !== 'actionNode' && node.type !== 'logicNode' && node.type !== 'iteratorNode' && node.type !== 'mergeNode' && node.type !== 'waitNode' && node.type !== 'approvalNode' && node.type !== 'emailNode' && (
          <div className="flex bg-sidebar/50 p-1 rounded-xl border border-border-dim mb-6">
            <button type="button" onClick={() => setIsDeveloperMode(false)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${!isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>🪄 Standard</button>
            <button type="button" onClick={() => setIsDeveloperMode(true)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>⚡️ Developer</button>
          </div>
        )}

	        <form id="configForm" onSubmit={handleSave} className="flex flex-col gap-6">
            {feedbackMessage && (
              <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400">
                {feedbackMessage}
              </div>
            )}
	          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Node Label</label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
              placeholder="e.g. Scrape Google"
            />
          </div>

          {node.type === 'triggerNode' && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="flex flex-col gap-3">
                  <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Trigger Type</label>
                  <div className="flex gap-2">
                     <button
                        type="button"
                        onClick={() => setFormData({ ...formData, _triggerType: 'MANUAL' })}
                        className={`flex-1 py-3 px-4 flex flex-col items-center gap-2 rounded-xl border transition-all ${formData._triggerType === 'MANUAL' ? 'bg-brand/10 border-brand/50 text-brand' : 'bg-background border-border-dim text-muted hover:text-foreground'}`}
                     >
                        <Zap className="w-5 h-5" />
                        <span className="text-xs font-semibold">Manual</span>
                     </button>
                     <button
                        type="button"
                        onClick={() => setFormData({ ...formData, _triggerType: 'SCHEDULE' })}
                        className={`flex-1 py-3 px-4 flex flex-col items-center gap-2 rounded-xl border transition-all ${formData._triggerType === 'SCHEDULE' ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-500' : 'bg-background border-border-dim text-muted hover:text-foreground'}`}
                     >
                        <Clock className="w-5 h-5" />
                        <span className="text-xs font-semibold">Schedule</span>
                     </button>
                     <button
                        type="button"
                        onClick={() => setFormData({ ...formData, _triggerType: 'WEBHOOK' })}
                        className={`flex-1 py-3 px-4 flex flex-col items-center gap-2 rounded-xl border transition-all ${formData._triggerType === 'WEBHOOK' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500' : 'bg-background border-border-dim text-muted hover:text-foreground'}`}
                     >
                        <Webhook className="w-5 h-5" />
                        <span className="text-xs font-semibold">Webhook</span>
                     </button>
                  </div>
               </div>

               <AnimatePresence mode="popLayout">
                 {formData._triggerType === 'WEBHOOK' && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 overflow-hidden">
                     <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Webhook Endpoint</label>
                     <p className="text-[11px] text-muted mb-2 leading-relaxed">Send a POST request to this endpoint to fire the workflow. The JSON body will be passed as the initial workflow payload.</p>
                     <div className="flex items-center gap-2 p-3 bg-background border border-border-dim rounded-[12px]">
                       <code className="text-[10px] text-brand break-all whitespace-normal block">
                          {`${process.env.NEXT_PUBLIC_CONVEX_URL?.replace('.cloud', '.site') || 'https://[YOUR_CONVEX_SITE_URL]'}/api/webhooks/workflow?workflowId=${typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '[WORKFLOW_ID]'}`}
                       </code>
                     </div>
                   </motion.div>
                 )}

                 {formData._triggerType === 'SCHEDULE' && (
                   <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 overflow-hidden">
                     <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Run Frequency</label>
                     <select 
                        value={formData._scheduleMode} 
                        onChange={(e) => setFormData({ ...formData, _scheduleMode: e.target.value as ScheduleMode })}
                        className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-sm outline-none focus:border-brand/50 text-foreground cursor-pointer"
                     >
                        <option value="interval">Custom Interval</option>
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                     </select>
                     
                     {formData._scheduleMode === 'interval' && (
                        <div className="flex items-center gap-2 mt-2">
                           <span className="text-[12px] text-muted font-medium ml-1">Every</span>
                           <input
                              type="number"
                              min="1"
                              max="999"
                              value={formData._scheduleIntervalValue || 1}
                              onChange={(e) => setFormData({ ...formData, _scheduleIntervalValue: parseInt(e.target.value) || 1 })}
                              className="w-20 px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50 text-foreground text-center"
                           />
                           <select
                              value={formData._scheduleIntervalUnit || 'minutes'}
                              onChange={(e) => setFormData({ ...formData, _scheduleIntervalUnit: e.target.value })}
                              className="flex-1 px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50 text-secondary cursor-pointer"
                           >
                              <option value="minutes">Minutes</option>
                              <option value="hours">Hours</option>
                              <option value="days">Days</option>
                           </select>
                        </div>
                     )}

                     {formData._scheduleMode !== 'interval' && (
                        <div className="flex flex-col gap-3 mt-2 p-3 bg-background/50 border border-border-dim rounded-[12px]">
                           {formData._scheduleMode === 'weekly' && (
                              <div className="flex flex-col gap-1.5">
                                 <label className="text-[10px] text-secondary uppercase tracking-wider font-semibold">Day of Week</label>
                                 <select 
                                    value={formData._scheduleDayOfWeek} 
                                    onChange={(e) => setFormData({ ...formData, _scheduleDayOfWeek: parseInt(e.target.value) })}
                                    className="px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50 text-foreground"
                                 >
                                    <option value={1}>Monday</option>
                                    <option value={2}>Tuesday</option>
                                    <option value={3}>Wednesday</option>
                                    <option value={4}>Thursday</option>
                                    <option value={5}>Friday</option>
                                    <option value={6}>Saturday</option>
                                    <option value={0}>Sunday</option>
                                 </select>
                              </div>
                           )}

                           {formData._scheduleMode === 'monthly' && (
                              <div className="flex flex-col gap-1.5">
                                 <label className="text-[10px] text-secondary uppercase tracking-wider font-semibold">Day of Month</label>
                                 <input
                                    type="number"
                                    min="1"
                                    max="31"
                                    value={formData._scheduleDayOfMonth}
                                    onChange={(e) => setFormData({ ...formData, _scheduleDayOfMonth: parseInt(e.target.value) || 1 })}
                                    className="px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50 text-foreground"
                                 />
                              </div>
                           )}

                           <div className="flex flex-col gap-1.5">
                              <label className="text-[10px] text-secondary uppercase tracking-wider font-semibold">Time (UTC)</label>
                              <input
                                 type="time"
                                 value={formData._scheduleTime}
                                 onChange={(e) => setFormData({ ...formData, _scheduleTime: e.target.value })}
                                 className="px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50 text-foreground"
                              />
                           </div>
                        </div>
                     )}
                   </motion.div>
                 )}
               </AnimatePresence>
            </div>
          )}

          {node.type === 'actionNode' && (
            <div className="flex flex-col gap-6 mt-4">
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">HTTP Method</label>
                 <select 
                    value={formData._actionConfig?.method || 'GET'}
                    onChange={(e) => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, method: e.target.value } })}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                 >
                    {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
               </div>

               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Target Endpoint URL</label>
                 <input
                    type="text"
                    value={formData._actionConfig?.url || ''}
                    onChange={(e) => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, url: e.target.value } })}
                    placeholder="https://api.external.com/v1/users"
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                 />
                 <span className="text-[10px] text-muted">Supports <code className="text-brand">{'{{nodes.[NODE_ID].output.[FIELD]}}'}</code> payload injection.</span>
               </div>

               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center justify-between">
                    Request Headers
                    <button type="button" onClick={() => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, headers: [...(formData._actionConfig?.headers || []), {key: '', value: ''}] }})} className="text-brand hover:text-brand-foreground text-[10px] font-bold uppercase py-1 px-2 rounded bg-brand/10">+ Add Header</button>
                 </label>
                 
                 {formData._actionConfig?.headers?.map((header: WorkflowHeaderConfig, index: number) => (
                    <div key={index} className="flex gap-2 items-center">
                       <input 
                         type="text" placeholder="Key (e.g. Authorization)" value={header.key} 
                         onChange={(e) => {
                            const newHeaders = [...formData._actionConfig.headers];
                            newHeaders[index].key = e.target.value;
                            setFormData({...formData, _actionConfig: {...formData._actionConfig, headers: newHeaders}});
                         }}
                         className="flex-1 px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50"
                       />
                       <input 
                         type="text" placeholder="Value (e.g. Bearer 123)" value={header.value} 
                         onChange={(e) => {
                            const newHeaders = [...formData._actionConfig.headers];
                            newHeaders[index].value = e.target.value;
                            setFormData({...formData, _actionConfig: {...formData._actionConfig, headers: newHeaders}});
                         }}
                         className="flex-[2] px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50"
                       />
                       <button type="button" onClick={() => {
                          const newHeaders = formData._actionConfig.headers.filter((_, i) => i !== index);
                          setFormData({...formData, _actionConfig: {...formData._actionConfig, headers: newHeaders}});
                       }} className="p-2 text-red-500 hover:bg-red-500/10 rounded-lg"><X className="w-4 h-4"/></button>
                    </div>
                 ))}
                 {(!formData._actionConfig?.headers || formData._actionConfig.headers.length === 0) && (
                    <div className="text-[11px] text-muted italic p-3 border border-dashed border-border-dim rounded-[12px] text-center bg-background/50">No external headers configured.</div>
                 )}
               </div>

               {formData._actionConfig?.method !== 'GET' && formData._actionConfig?.method !== 'HEAD' && (
                 <div className="flex flex-col gap-2">
                   <div className="flex items-center justify-between">
                      <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Request Payload (Body)</label>
                      <select 
                         className="text-[10px] font-bold uppercase tracking-wider bg-brand/10 text-brand outline-none border-none rounded py-1 px-2 cursor-pointer"
                         onChange={(e) => {
                            if(e.target.value) {
                               setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, body: `{{nodes.${e.target.value}.output}}` }});
                               e.target.selectedIndex = 0;
                            }
                         }}
                      >
                         <option value="">+ Forward Data From...</option>
                         {upstreamNodes.map((n) => (
                            <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                         ))}
                      </select>
                   </div>
                   <textarea
                      value={formData._actionConfig?.body || ''}
                      onChange={(e) => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, body: e.target.value } })}
                      rows={6}
                      placeholder={'{\n  "email": "{{nodes.agentNode-1.output.extractedEmail}}"\n}'}
                      className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 font-mono custom-scrollbar resize-none"
                   />
                   <span className="text-[10px] text-muted">To pass the full output of a previous node securely, use the dropdown above to inject the raw variable syntax (e.g. <code className="text-brand">{'{{nodes.id.output}}'}</code>).</span>
                 </div>
               )}
            </div>
          )}

          {node.type === 'codeNode' && isDeveloperMode && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="flex flex-col gap-2">
                 <div className="flex items-center justify-between">
                    <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                       <Code2 className="w-4 h-4" /> V8 JavaScript Sandbox
                    </label>
                 </div>
                 <textarea
                    value={formData._inputTemplate || ''}
                    onChange={(e) => setFormData({ ...formData, _inputTemplate: e.target.value })}
                    rows={12}
                    placeholder={"// Use the global 'nodes' dict to evaluate dynamic conditions.\n\nconst agentData = nodes['agentNode-123']?.output;\n\nif (agentData?.score > 80) {\n  return { status: 'approved', payload: agentData };\n}\n\nreturn { status: 'rejected' };"}
                    className="px-5 py-4 bg-[#0a0a0a] border border-border-dim rounded-[12px] text-[#22c55e] text-[13px] outline-none focus:border-brand/50 font-mono custom-scrollbar resize-y selection:bg-brand/30"
                 />
                 <span className="text-[11px] text-muted leading-relaxed">A secure V8 sandbox execution layer. Manipulate, map, filter, or restructure complex arrays dynamically before passing them to integrations. You <strong className="text-foreground">MUST</strong> use a standard <code>return</code> statement.</span>
               </div>
            </div>
          )}

          {node.type === 'databaseNode' && (
            <div className="flex flex-col gap-6 mt-4">
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Database Operation</label>
                 <select 
                    value={formData._dbConfig?.operation || 'INSERT'}
                    onChange={(e) => updateDbConfig({ operation: e.target.value as WorkflowDatabaseConfig["operation"] })}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                 >
                    {['INSERT', 'UPDATE', 'DELETE', 'SELECT'].map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
               </div>

               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Target Table</label>
                 <select 
                    value={formData._dbConfig?.tableName || ''}
                    onChange={(e) => updateDbConfig({ tableName: e.target.value })}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                 >
                    <option value="">-- Select Target Table --</option>
                    {['companies', 'users', 'knowledgeDocuments', 'knowledgeChunks', 'aiRules', 'agents', 'aiTools'].map(m => <option key={m} value={m}>{m}</option>)}
                 </select>
               </div>

               {formData._dbConfig?.operation !== 'INSERT' && (
                 <div className="flex flex-col gap-2">
                   <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">
                      {formData._dbConfig?.operation === 'SELECT' ? "Target Document ID (Optional)" : "Target Document ID"}
                   </label>
                   <input
                      type="text"
                      value={formData._dbConfig?.docId || ''}
                      onChange={(e) => updateDbConfig({ docId: e.target.value })}
                      placeholder={formData._dbConfig?.operation === 'SELECT' ? "Optional direct document ID" : "e.g. {{nodes.agent-123.output.docId}} or jd7abcd..."}
                      className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] font-mono outline-none focus:border-brand/50"
                   />
                 </div>
               )}

               {formData._dbConfig?.operation === 'SELECT' && !formData._dbConfig?.docId && (
                 <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                   <div className="flex flex-col gap-2 md:col-span-3">
                     <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Indexed Query</label>
                     <select
                       value={formData._dbConfig.query?.indexName || ''}
                       onChange={(e) => {
                         const tableIndexes = workflowDbSelectIndexes[formData._dbConfig.tableName] || [];
                         const selected = tableIndexes.find((option) => option.indexName === e.target.value);
                         updateDbConfig({
                           query: selected
                             ? {
                                 indexName: selected.indexName,
                                 equals: selected.filters.map((field) => ({ field, value: "" })),
                                 order: formData._dbConfig.query?.order || "desc",
                                 limit: formData._dbConfig.query?.limit || 15,
                               }
                             : undefined,
                         });
                       }}
                       className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                     >
                       <option value="">-- Select Index --</option>
                       {(workflowDbSelectIndexes[formData._dbConfig.tableName] || []).map((option) => (
                         <option key={option.indexName} value={option.indexName}>{option.label} ({option.indexName})</option>
                       ))}
                     </select>
                   </div>

                   {(formData._dbConfig.query?.equals || []).map((filter, index) => (
                     <div key={`${filter.field}-${index}`} className="flex flex-col gap-2">
                       <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">{filter.field}</label>
                       <input
                         type="text"
                         value={String(filter.value ?? '')}
                         onChange={(e) => {
                           const equals = [...(formData._dbConfig.query?.equals || [])];
                           equals[index] = { ...equals[index], value: e.target.value };
                           updateDbConfig({ query: { ...formData._dbConfig.query!, equals } });
                         }}
                         placeholder={filter.field === "companyId" ? "Blank uses workflow tenant" : `{{${filter.field}}}`}
                         className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] font-mono outline-none focus:border-brand/50"
                       />
                     </div>
                   ))}

                   <div className="flex flex-col gap-2">
                     <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">Limit</label>
                     <input
                       type="number"
                       min={1}
                       max={100}
                       value={formData._dbConfig.query?.limit || 15}
                       onChange={(e) => updateDbConfig({ query: { ...formData._dbConfig.query!, limit: Number(e.target.value) } })}
                       className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                     />
                   </div>

                   <div className="flex flex-col gap-2">
                     <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">Order</label>
                     <select
                       value={formData._dbConfig.query?.order || "desc"}
                       onChange={(e) => updateDbConfig({ query: { ...formData._dbConfig.query!, order: e.target.value as "asc" | "desc" } })}
                       className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                     >
                       <option value="desc">Newest first</option>
                       <option value="asc">Oldest first</option>
                     </select>
                   </div>
                 </div>
               )}
            </div>
          )}

          {node.type === 'logicNode' && (
            <div className="flex flex-col gap-6 mt-4">
               
               <div className="flex flex-col gap-3">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center justify-between">
                    Routing Conditions
                    <button type="button" onClick={() => setFormData({ ...formData, _logicConfig: { ...formData._logicConfig, rules: [...(formData._logicConfig?.rules || []), { variable: '', operator: 'EQUALS', value: '', branch: '' }] }})} className="text-brand hover:text-brand-foreground text-[10px] font-bold uppercase py-1 px-2 rounded bg-brand/10">+ Add Rule</button>
                 </label>
                 
                 {formData._logicConfig?.rules?.map((rule: WorkflowLogicRule, index: number) => (
                    <div key={index} className="flex flex-col gap-3 p-4 bg-background border border-border-dim rounded-[12px] relative shadow-sm">
                       <button type="button" onClick={() => { const r = formData._logicConfig.rules.filter((_, i) => i !== index); setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="absolute top-2 right-2 p-2 text-muted hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-colors"><X className="w-4 h-4"/></button>
                       
                       <div className="flex flex-col gap-1.5 pr-8">
                           <label className="text-[10px] font-semibold text-secondary uppercase tracking-wider">Test Variable</label>
                           <div className="flex flex-col gap-2">
                               <select 
                                   className="px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none text-muted w-full cursor-pointer hover:border-brand/30"
                                   onChange={(e) => {
                                      if(e.target.value) {
                                         const r = [...formData._logicConfig.rules];
                                         r[index].variable = `{{nodes.${e.target.value}.output.`;
                                         setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}});
                                         e.target.selectedIndex = 0;
                                      }
                                   }}
                               >
                                  <option value="">+ Inject Upstream Variable Reference...</option>
                                  {upstreamNodes.map((n) => (
                                     <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                                  ))}
                               </select>
                               <input type="text" placeholder="e.g. {{nodes.agent-123.output.score}}" value={rule.variable} onChange={e => { const r = [...formData._logicConfig.rules]; r[index].variable = e.target.value; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="w-full px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] font-mono outline-none focus:border-brand/50 text-brand" />
                           </div>
                       </div>
                       
                       <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] font-semibold text-secondary uppercase tracking-wider">Condition</label>
                           <select value={rule.operator} onChange={e => { const r = [...formData._logicConfig.rules]; r[index].operator = e.target.value as WorkflowLogicRule["operator"]; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="w-full px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none cursor-pointer focus:border-brand/50">
                              <option value="EQUALS">Equals (==)</option>
                              <option value="NOT_EQUALS">Not Equals (!=)</option>
                              <option value="CONTAINS">Contains</option>
                              <option value="GREATER_THAN">Greater Than (&gt;)</option>
                              <option value="LESS_THAN">Less Than (&lt;)</option>
                              <option value="IS_EMPTY">Is Empty / Null</option>
                              <option value="NOT_EMPTY">Is Not Empty / Configured</option>
                           </select>
                       </div>

                       {rule.operator !== 'IS_EMPTY' && rule.operator !== 'NOT_EMPTY' && (
                         <div className="flex flex-col gap-1.5">
                             <label className="text-[10px] font-semibold text-secondary uppercase tracking-wider">Comparison Value</label>
                             <input type="text" placeholder="Fixed text, number or {{nodes...}}" value={rule.value} onChange={e => { const r = [...formData._logicConfig.rules]; r[index].value = e.target.value; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="w-full px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50" />
                         </div>
                       )}

                       <div className="flex gap-3 items-center mt-2 p-3 bg-brand/5 rounded-[8px] border border-brand/10 shadow-inner">
                           <Zap className="w-5 h-5 text-brand shrink-0" />
                           <div className="flex flex-col gap-1.5 w-full">
                               <span className="text-[10px] font-bold text-brand uppercase tracking-wider">Execute Next Block</span>
                               <select 
                                   value={rule.branch} 
                                   onChange={e => { const r = [...formData._logicConfig.rules]; r[index].branch = e.target.value; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} 
                                   className="w-full px-3 py-2 bg-background border border-brand/20 rounded-[8px] text-[12px] text-foreground font-medium outline-none focus:border-brand/50 cursor-pointer"
                               >
                                   {downstreamNodes.map((n) => (
                                      <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                                   ))}
                               </select>
                           </div>
                       </div>
                    </div>
                 ))}

                 {(!formData._logicConfig?.rules || formData._logicConfig.rules.length === 0) && (
                    <div className="text-[11px] text-muted italic p-3 border border-dashed border-border-dim rounded-[12px] text-center bg-background/50">No conditional routing rules defined. Traversal will always use the Fallback branch.</div>
                 )}
               </div>

               <div className="flex flex-col gap-2 mt-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Fallback Route (Default)</label>
                 <select 
                    value={formData._logicConfig?.fallbackBranch || ''}
                    onChange={(e) => setFormData({ ...formData, _logicConfig: { ...formData._logicConfig, fallbackBranch: e.target.value } })}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 cursor-pointer"
                 >
                    {downstreamNodes.map((n) => (
                       <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                    ))}
                 </select>
                 <span className="text-[10px] text-muted leading-relaxed">If no rules match, execution safely follows the path to this Fallback node.</span>
               </div>
            </div>
          )}

          {node.type === 'iteratorNode' && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px]">
                   <span className="text-[11px] text-brand leading-relaxed block w-full">The Iterator Node runs a Structural Fan-Out. For every item identified inside the parsed Array target, Sonae will natively branch off and spawn simultaneous parallel executions for all downstream elements connected to this node physically!</span>
               </div>
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Target Array Collection</label>
                 <div className="flex flex-col gap-2">
                     <select 
                         className="px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none text-muted w-full cursor-pointer hover:border-brand/30"
                         onChange={(e) => {
                            if(e.target.value) {
                               setFormData({...formData, _iteratorConfig: {...formData._iteratorConfig, listVariable: `{{nodes.${e.target.value}.output.`}});
                               e.target.selectedIndex = 0;
                            }
                         }}
                     >
                        <option value="">+ Inject Upstream Variable Reference...</option>
                        {upstreamNodes.map((n) => (
                           <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                        ))}
                     </select>
                     <input type="text" placeholder="e.g. {{nodes.scraper.output.articlesArray}}" value={formData._iteratorConfig?.listVariable} onChange={e => { setFormData({...formData, _iteratorConfig: {...formData._iteratorConfig, listVariable: e.target.value}}) }} className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-[12px] font-mono outline-none focus:border-brand/50 text-foreground" />
                 </div>
               </div>

            </div>
          )}

          {node.type === 'mergeNode' && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
                   <span className="text-[11px] text-brand leading-relaxed block w-full"><strong>Structural Fusion:</strong> The Merge Node halts downstream execution until its configured rules are met. Once fired, it dynamically bundles all physical upstream edge payloads into a singular dictionary array.</span>
                   <span className="text-[10px] text-muted italic block w-full border-t border-brand/10 pt-2">Map this block dynamically down-graph using: <code className="bg-background px-1 py-0.5 rounded text-foreground">{'{{nodes.[THIS_NODE_ID].output.mergedContexts}}'}</code></span>
               </div>
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Merge Wait Behavior</label>
                 <select 
                    value={formData._mergeConfig?.mode || 'WAIT_FOR_ALL'}
                    onChange={(e) => setFormData({ ...formData, _mergeConfig: { ...formData._mergeConfig, mode: e.target.value as WorkflowMergeConfig["mode"] } })}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 cursor-pointer"
                 >
                    <option value="WAIT_FOR_ALL">Wait for ALL mapped upstream branches to finish</option>
                    <option value="WAIT_FOR_ANY">Wait for ANY path to arrive (Drop late branches)</option>
                 </select>
               </div>
            </div>
          )}

          {node.type === 'waitNode' && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
                   <span className="text-[11px] text-brand leading-relaxed block w-full"><strong>Artificial Governor:</strong> The Wait Node pauses traversal recursively using native Convex background scheduling, successfully preventing burst rate-limits towards external APIs or concurrent DB mutations.</span>
               </div>
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Delay Execution</label>
                 <div className="flex items-center gap-2">
                     <input
                        type="text"
                        value={formData._waitConfig?.delaySeconds || ''}
                        onChange={(e) => setFormData({ ...formData, _waitConfig: { ...formData._waitConfig, delaySeconds: e.target.value } })}
                        placeholder="e.g. 5 or {{nodes.x.output.wait}}"
                        className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 font-mono"
                     />
                     <span className="text-[12px] font-semibold text-muted uppercase px-2 tracking-wider">Seconds</span>
                 </div>
                 <span className="text-[10px] text-muted italic inline-flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> Accepts static positive integers or dynamically resolved payload variables natively.</span>
               </div>
            </div>
          )}

          {node.type === 'approvalNode' && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
                   <span className="text-[11px] text-brand leading-relaxed block w-full"><strong>Human-in-the-Loop:</strong> Pauses graph execution indefinitely until an Administrator manually signs off from the execution logs, securing critical operations like automated emails, deletions, and mass outreach.</span>
               </div>
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Approval Task Notice</label>
                 <input
                    type="text"
                    value={formData._approvalConfig?.message || ''}
                    onChange={(e) => setFormData({ ...formData, _approvalConfig: { ...formData._approvalConfig, message: e.target.value } })}
                    placeholder="e.g. Please review generated email payload copy."
                    maxLength={150}
                    className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                 />
               </div>

               <div className="flex flex-col gap-2 mt-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Validation Value (Preview Target)</label>
                 <div className="flex flex-col gap-2">
                     <select 
                         className="px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none text-muted w-full cursor-pointer hover:border-brand/30"
                         onChange={(e) => {
                            if(e.target.value) {
                               setFormData({...formData, _approvalConfig: {...formData._approvalConfig, previewTarget: `{{nodes.${e.target.value}.output.`}});
                               e.target.selectedIndex = 0;
                            }
                         }}
                     >
                        <option value="">+ Map Upstream Result for live Preview...</option>
                        {upstreamNodes.map((n) => (
                           <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                        ))}
                     </select>
                     <input type="text" placeholder="e.g. {{nodes.copywriter.output.text}}" value={formData._approvalConfig?.previewTarget || ''} onChange={e => { setFormData({...formData, _approvalConfig: {...formData._approvalConfig, previewTarget: e.target.value}}) }} className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-[12px] font-mono outline-none focus:border-brand/50 text-brand" />
                 </div>
                 <span className="text-[10px] text-muted italic">Render this specific upstream value onto the Approval log card.</span>
               </div>
            </div>
          )}

          {node.type === 'emailNode' && (
            <div className="flex flex-col gap-6 mt-4">
               <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
                   <span className="text-[11px] text-brand leading-relaxed block w-full"><strong>Resend SMTP Node:</strong> Dispatches programmatic emails dynamically. Supports standard comma-separated sequences, HTML styling, and real-time mapping variables.</span>
               </div>
               
               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Sender Address (From)</label>
                 <input
                    type="text"
                    value={formData._emailConfig?.from || ''}
                    onChange={(e) => setFormData({ ...formData, _emailConfig: { ...formData._emailConfig, from: e.target.value } })}
                    placeholder="e.g. Acme Automations <hello@example.com>"
                    className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[13px] outline-none focus:border-brand/50 font-mono"
                 />
                 <span className="text-[10px] text-muted italic">Leave strictly blank to use global default dispatch address.</span>
               </div>

               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Recipient Address (To)</label>
                 <div className="flex items-center gap-2">
                     <input
                        type="text"
                        value={formData._emailConfig?.to || ''}
                        onChange={(e) => setFormData({ ...formData, _emailConfig: { ...formData._emailConfig, to: e.target.value } })}
                        placeholder="e.g. {{nodes.x.output.clientEmail}}, support@domain.com"
                        className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[13px] outline-none focus:border-brand/50 font-mono"
                     />
                 </div>
                 <span className="text-[10px] text-muted italic">Accepts comma-separated strings or injected array variables natively.</span>
               </div>

               <div className="flex flex-col gap-2">
                 <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Subject Line</label>
                 <input
                    type="text"
                    value={formData._emailConfig?.subject || ''}
                    onChange={(e) => setFormData({ ...formData, _emailConfig: { ...formData._emailConfig, subject: e.target.value } })}
                    placeholder="e.g. Your Report: {{nodes.agent.output.title}}"
                    className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[13px] outline-none focus:border-brand/50"
                 />
               </div>

               <div className="flex flex-col gap-2 relative">
                 <div className="flex items-center justify-between">
                     <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Code2 className="w-4 h-4" /> Message Body (HTML / Raw)
                     </label>
                 </div>
                 
                 <div className="flex flex-col gap-2 mt-1">
                     <select 
                         className="px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none text-muted w-full cursor-pointer hover:border-brand/30"
                         onChange={(e) => {
                            if(e.target.value) {
                               const currentBody = formData._emailConfig?.body || '';
                               setFormData({...formData, _emailConfig: {...formData._emailConfig, body: currentBody + `{{nodes.${e.target.value}.output.text}}`}});
                               e.target.selectedIndex = 0;
                            }
                         }}
                     >
                        <option value="">+ Inject Upstream Content Variable...</option>
                        {upstreamNodes.map((n) => (
                           <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                        ))}
                     </select>
                     
                     <textarea
                       value={formData._emailConfig?.body || ''}
                       onChange={(e) => setFormData({ ...formData, _emailConfig: { ...formData._emailConfig, body: e.target.value } })}
                       rows={12}
                       className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-y font-mono leading-relaxed"
                       placeholder="<h1>Hello</h1><p>Your generated content is: {{nodes.agent.output.analysis}}</p>"
                     />
                 </div>
               </div>
            </div>
          )}

          {node.type !== 'triggerNode' && node.type !== 'actionNode' && node.type !== 'logicNode' && node.type !== 'iteratorNode' && node.type !== 'mergeNode' && node.type !== 'waitNode' && node.type !== 'approvalNode' && node.type !== 'emailNode' && !isDeveloperMode && (
            <div className="flex flex-col gap-3 mt-2 border border-border-dim bg-sidebar/50 p-5 rounded-[16px] relative overflow-hidden">
               <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wand2 className="w-4 h-4" /> AI Auto-Configuration
               </label>
               <p className="text-[13px] text-muted leading-relaxed">
                  Describe what you want this node to do in plain English. Sonae will dynamically configure the payload requirements by mapping upstream variables from the graph automatically.
               </p>
               <textarea 
                 value={aiPrompt}
                 onChange={(e) => setAiPrompt(e.target.value)}
                 placeholder="e.g. Save the summary from the previous AI Agent and inject it into the Marketing database."
                 className="w-full bg-background border border-border-dim rounded-[12px] p-4 text-sm focus:border-foreground/50 outline-none resize-none min-h-[120px] shadow-inner mt-2"
               />
               <button
                 type="button"
                 disabled={isGenerating || !aiPrompt.trim()}
                 onClick={handleAutoConfigure}
                 className="w-full mt-2 py-3 rounded-[12px] bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-foreground/20"
               >
                 {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Graph Context...</> : <><Wand2 className="w-4 h-4" /> Auto-Configure Mapping</>}
               </button>
            </div>
          )}
          
          {node.type !== 'triggerNode' && node.type !== 'actionNode' && node.type !== 'codeNode' && isDeveloperMode && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4" /> JSON Data Mapping (Phase 2)
                </label>
                <textarea
                  value={formData._inputMapping}
                  onChange={(e) => setFormData({ ...formData, _inputMapping: e.target.value })}
                  rows={8}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                  placeholder='{&#10;  "textToAnalyze": "{{nodes.triggerNode-123.output.emailBody}}"&#10;}'
                />
                <span className="text-[11px] text-muted leading-tight mt-1">
                  Use <code className="text-brand">{"{{nodes.id.output}}"}</code> to bind variables mathematically. If mapped, this JSON overrides raw input.
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Code2 className="w-4 h-4" /> Raw String Template
                </label>
                <textarea
                  value={formData._inputTemplate}
                  onChange={(e) => setFormData({ ...formData, _inputTemplate: e.target.value })}
                  rows={6}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                  placeholder='Summarize this: {{nodes.someId.output.data}}'
                />
              </div>
            </>
          )}

        </form>
      </div>

      <div className="p-4 border-t border-border-dim bg-sidebar/50">
        <button
          type="submit"
          form="configForm"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/20 text-sm"
        >
          <Save className="w-4 h-4" /> Save Configuration
        </button>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
