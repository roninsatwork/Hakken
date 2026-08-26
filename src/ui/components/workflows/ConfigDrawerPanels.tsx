"use client";

import type { Dispatch, SetStateAction } from "react";
import { Clock, Code2, Webhook, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Button } from "@/src/ui/components/screens/Button";
import type {
  WorkflowCanvasNode,
  WorkflowDatabaseConfig,
  WorkflowHeaderConfig,
  WorkflowLogicRule,
  WorkflowMergeConfig,
} from "./types";
import {
  workflowDbSelectIndexes,
  type ConfigDrawerFormData,
  type ScheduleMode,
} from "./ConfigDrawer";

export function TriggerPanel({
  formData,
  setFormData,
  webhookEndpoint,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
  webhookEndpoint: string;
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="flex flex-col gap-3">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('trigger.type')}</label>
            <div className="flex gap-2">
               {/* All three raw on purpose: selectable cards whose whole
                   recipe swaps with the chosen trigger — not buttons the
                   kit has a variant for. */}
               <button
                  type="button"
                  onClick={() => setFormData({ ...formData, _triggerType: 'MANUAL' })}
                  className={`flex-1 py-3 px-4 flex flex-col items-center gap-2 rounded-xl border transition-all ${formData._triggerType === 'MANUAL' ? 'bg-brand/10 border-brand/50 text-brand' : 'bg-background border-border-dim text-muted hover:text-foreground'}`}
               >
                  <Zap className="w-5 h-5" />
                  <span className="text-xs font-semibold">{t('trigger.manual')}</span>
               </button>
               <button
                  type="button"
                  onClick={() => setFormData({ ...formData, _triggerType: 'SCHEDULE' })}
                  className={`flex-1 py-3 px-4 flex flex-col items-center gap-2 rounded-xl border transition-all ${formData._triggerType === 'SCHEDULE' ? 'bg-indigo-500/10 border-indigo-500/50 text-indigo-500' : 'bg-background border-border-dim text-muted hover:text-foreground'}`}
               >
                  <Clock className="w-5 h-5" />
                  <span className="text-xs font-semibold">{t('trigger.schedule')}</span>
               </button>
               <button
                  type="button"
                  onClick={() => setFormData({ ...formData, _triggerType: 'WEBHOOK' })}
                  className={`flex-1 py-3 px-4 flex flex-col items-center gap-2 rounded-xl border transition-all ${formData._triggerType === 'WEBHOOK' ? 'bg-blue-500/10 border-blue-500/50 text-blue-500' : 'bg-background border-border-dim text-muted hover:text-foreground'}`}
               >
                  <Webhook className="w-5 h-5" />
                  <span className="text-xs font-semibold">{t('trigger.webhook')}</span>
               </button>
            </div>
         </div>

         <AnimatePresence mode="popLayout">
           {formData._triggerType === 'WEBHOOK' && (
             <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 overflow-hidden">
               <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('trigger.webhookEndpoint')}</label>
               <p className="text-[11px] text-muted mb-2 leading-relaxed">{t('trigger.webhookHint')}</p>
               <div className="flex items-center gap-2 p-3 bg-background border border-border-dim rounded-[12px]">
                 <code className="text-[10px] text-brand break-all whitespace-normal block">
                    {webhookEndpoint}
                 </code>
               </div>
             </motion.div>
           )}

           {formData._triggerType === 'SCHEDULE' && (
             <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="flex flex-col gap-2 overflow-hidden">
               <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('trigger.runFrequency')}</label>
               <select
                  value={formData._scheduleMode}
                  onChange={(e) => setFormData({ ...formData, _scheduleMode: e.target.value as ScheduleMode })}
                  className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-sm outline-none focus:border-brand/50 text-foreground cursor-pointer"
               >
                  <option value="interval">{t('trigger.modes.interval')}</option>
                  <option value="daily">{t('trigger.modes.daily')}</option>
                  <option value="weekly">{t('trigger.modes.weekly')}</option>
                  <option value="monthly">{t('trigger.modes.monthly')}</option>
               </select>
         
               {formData._scheduleMode === 'interval' && (
                  <div className="flex items-center gap-2 mt-2">
                     <span className="text-[12px] text-muted font-medium ml-1">{t('trigger.every')}</span>
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
                        <option value="minutes">{t('trigger.units.minutes')}</option>
                        <option value="hours">{t('trigger.units.hours')}</option>
                        <option value="days">{t('trigger.units.days')}</option>
                     </select>
                  </div>
               )}

               {formData._scheduleMode !== 'interval' && (
                  <div className="flex flex-col gap-3 mt-2 p-3 bg-background/50 border border-border-dim rounded-[12px]">
                     {formData._scheduleMode === 'weekly' && (
                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] text-secondary uppercase tracking-wider font-semibold">{t('trigger.dayOfWeek')}</label>
                           <select
                              value={formData._scheduleDayOfWeek}
                              onChange={(e) => setFormData({ ...formData, _scheduleDayOfWeek: parseInt(e.target.value) })}
                              className="px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50 text-foreground"
                           >
                              <option value={1}>{t('trigger.days.monday')}</option>
                              <option value={2}>{t('trigger.days.tuesday')}</option>
                              <option value={3}>{t('trigger.days.wednesday')}</option>
                              <option value={4}>{t('trigger.days.thursday')}</option>
                              <option value={5}>{t('trigger.days.friday')}</option>
                              <option value={6}>{t('trigger.days.saturday')}</option>
                              <option value={0}>{t('trigger.days.sunday')}</option>
                           </select>
                        </div>
                     )}

                     {formData._scheduleMode === 'monthly' && (
                        <div className="flex flex-col gap-1.5">
                           <label className="text-[10px] text-secondary uppercase tracking-wider font-semibold">{t('trigger.dayOfMonth')}</label>
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
                        <label className="text-[10px] text-secondary uppercase tracking-wider font-semibold">{t('trigger.timeUtc')}</label>
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
    </>
  );
}

export function ActionPanel({
  formData,
  setFormData,
  upstreamNodes,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
  upstreamNodes: WorkflowCanvasNode[];
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
   
         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('action.method')}</label>
           <select 
              value={formData._actionConfig?.method || 'GET'}
              onChange={(e) => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, method: e.target.value } })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
           >
              {['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].map(m => <option key={m} value={m}>{m}</option>)}
           </select>
         </div>

         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('action.url')}</label>
           <input
              type="text"
              value={formData._actionConfig?.url || ''}
              onChange={(e) => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, url: e.target.value } })}
              placeholder="https://api.external.com/v1/users"
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
           />
           <span className="text-[10px] text-muted">{t.rich('action.urlHint', { syntax: () => <code className="text-brand">{'{{nodes.[NODE_ID].output.[FIELD]}}'}</code> })}</span>
         </div>

         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center justify-between">
              {t('action.headers')}
              {/* Raw on purpose: a micro chip drifted too far from `accent`
                  (no border, 4px corners, hover recolours the text). */}
              <button type="button" onClick={() => setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, headers: [...(formData._actionConfig?.headers || []), {key: '', value: ''}] }})} className="text-brand hover:text-brand-foreground text-[10px] font-bold uppercase py-1 px-2 rounded bg-brand/10">{t('action.addHeader')}</button>
           </label>
     
           {formData._actionConfig?.headers?.map((header: WorkflowHeaderConfig, index: number) => (
              <div key={index} className="flex gap-2 items-center">
                 <input 
                   type="text" placeholder={t('action.headerKeyPlaceholder')} value={header.key}
                   onChange={(e) => {
                      const newHeaders = [...formData._actionConfig.headers];
                      newHeaders[index].key = e.target.value;
                      setFormData({...formData, _actionConfig: {...formData._actionConfig, headers: newHeaders}});
                   }}
                   className="flex-1 px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50"
                 />
                 <input 
                   type="text" placeholder={t('action.headerValuePlaceholder')} value={header.value}
                   onChange={(e) => {
                      const newHeaders = [...formData._actionConfig.headers];
                      newHeaders[index].value = e.target.value;
                      setFormData({...formData, _actionConfig: {...formData._actionConfig, headers: newHeaders}});
                   }}
                   className="flex-[2] px-3 py-2 bg-background border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50"
                 />
                 <Button variant="icon" onClick={() => {
                    const newHeaders = formData._actionConfig.headers.filter((_, i) => i !== index);
                    setFormData({...formData, _actionConfig: {...formData._actionConfig, headers: newHeaders}});
                 }} className="rounded-lg text-red-500 hover:text-red-500 hover:bg-red-500/10"><X className="w-4 h-4"/></Button>
              </div>
           ))}
           {(!formData._actionConfig?.headers || formData._actionConfig.headers.length === 0) && (
              <div className="text-[11px] text-muted italic p-3 border border-dashed border-border-dim rounded-[12px] text-center bg-background/50">{t('action.noHeaders')}</div>
           )}
         </div>

         {formData._actionConfig?.method !== 'GET' && formData._actionConfig?.method !== 'HEAD' && (
           <div className="flex flex-col gap-2">
             <div className="flex items-center justify-between">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('action.body')}</label>
                <select 
                   className="text-[10px] font-bold uppercase tracking-wider bg-brand/10 text-brand outline-none border-none rounded py-1 px-2 cursor-pointer"
                   onChange={(e) => {
                      if(e.target.value) {
                         setFormData({ ...formData, _actionConfig: { ...formData._actionConfig, body: `{{nodes.${e.target.value}.output}}` }});
                         e.target.selectedIndex = 0;
                      }
                   }}
                >
                   <option value="">{t('action.forwardData')}</option>
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
             <span className="text-[10px] text-muted">{t.rich('action.bodyHint', { syntax: () => <code className="text-brand">{'{{nodes.id.output}}'}</code> })}</span>
           </div>
         )}
      </div>
    </>
  );
}

export function CodePanel({
  formData,
  setFormData,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="flex flex-col gap-2">
           <div className="flex items-center justify-between">
              <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                 <Code2 className="w-4 h-4" /> {t('code.label')}
              </label>
           </div>
           <textarea
              value={formData._inputTemplate || ''}
              onChange={(e) => setFormData({ ...formData, _inputTemplate: e.target.value })}
              rows={12}
              placeholder={"// Use the global 'nodes' dict to evaluate dynamic conditions.\n\nconst agentData = nodes['agentNode-123']?.output;\n\nif (agentData?.score > 80) {\n  return { status: 'approved', payload: agentData };\n}\n\nreturn { status: 'rejected' };"}
              className="px-5 py-4 bg-[#0a0a0a] border border-border-dim rounded-[12px] text-[#22c55e] text-[13px] outline-none focus:border-brand/50 font-mono custom-scrollbar resize-y selection:bg-brand/30"
           />
           <span className="text-[11px] text-muted leading-relaxed">{t.rich('code.hint', {
             strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
             code: (chunks) => <code>{chunks}</code>,
           })}</span>
         </div>
      </div>
    </>
  );
}

export function DatabasePanel({
  formData,
  updateDbConfig,
}: {
  formData: ConfigDrawerFormData;
  updateDbConfig: (updates: Partial<WorkflowDatabaseConfig>) => void;
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
   
         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('db.operation')}</label>
           <select 
              value={formData._dbConfig?.operation || 'INSERT'}
              onChange={(e) => updateDbConfig({ operation: e.target.value as WorkflowDatabaseConfig["operation"] })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
           >
              {['INSERT', 'UPDATE', 'DELETE', 'SELECT'].map(m => <option key={m} value={m}>{m}</option>)}
           </select>
         </div>

         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('db.table')}</label>
           <select 
              value={formData._dbConfig?.tableName || ''}
              onChange={(e) => updateDbConfig({ tableName: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
           >
              <option value="">{t('db.selectTable')}</option>
              {['companies', 'users', 'knowledgeDocuments', 'knowledgeChunks', 'aiRules', 'agents', 'aiTools'].map(m => <option key={m} value={m}>{m}</option>)}
           </select>
         </div>

         {formData._dbConfig?.operation !== 'INSERT' && (
           <div className="flex flex-col gap-2">
             <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">
                {formData._dbConfig?.operation === 'SELECT' ? t('db.docIdOptional') : t('db.docId')}
             </label>
             <input
                type="text"
                value={formData._dbConfig?.docId || ''}
                onChange={(e) => updateDbConfig({ docId: e.target.value })}
                placeholder={formData._dbConfig?.operation === 'SELECT' ? t('db.docIdOptionalPlaceholder') : "e.g. {{nodes.agent-123.output.docId}} or jd7abcd..."}
                className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] font-mono outline-none focus:border-brand/50"
             />
           </div>
         )}

         {formData._dbConfig?.operation === 'SELECT' && !formData._dbConfig?.docId && (
           <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
             <div className="flex flex-col gap-2 md:col-span-3">
               <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('db.indexedQuery')}</label>
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
                 <option value="">{t('db.selectIndex')}</option>
                 {(workflowDbSelectIndexes[formData._dbConfig.tableName] || []).map((option) => (
                   <option key={option.indexName} value={option.indexName}>{t(option.labelKey)} ({option.indexName})</option>
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
                   placeholder={filter.field === "companyId" ? t('db.tenantPlaceholder') : `{{${filter.field}}}`}
                   className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] font-mono outline-none focus:border-brand/50"
                 />
               </div>
             ))}

             <div className="flex flex-col gap-2">
               <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">{t('db.limit')}</label>
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
               <label className="text-[11px] font-medium text-secondary uppercase tracking-wider">{t('db.order')}</label>
               <select
                 value={formData._dbConfig.query?.order || "desc"}
                 onChange={(e) => updateDbConfig({ query: { ...formData._dbConfig.query!, order: e.target.value as "asc" | "desc" } })}
                 className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
               >
                 <option value="desc">{t('db.newestFirst')}</option>
                 <option value="asc">{t('db.oldestFirst')}</option>
               </select>
             </div>
           </div>
         )}
      </div>
    </>
  );
}

export function LogicPanel({
  formData,
  setFormData,
  upstreamNodes,
  downstreamNodes,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
  upstreamNodes: WorkflowCanvasNode[];
  downstreamNodes: WorkflowCanvasNode[];
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
   
         <div className="flex flex-col gap-3">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center justify-between">
              {t('logic.conditions')}
              {/* Raw on purpose: same micro chip as Add Header above. */}
              <button type="button" onClick={() => setFormData({ ...formData, _logicConfig: { ...formData._logicConfig, rules: [...(formData._logicConfig?.rules || []), { variable: '', operator: 'EQUALS', value: '', branch: '' }] }})} className="text-brand hover:text-brand-foreground text-[10px] font-bold uppercase py-1 px-2 rounded bg-brand/10">{t('logic.addRule')}</button>
           </label>
     
           {formData._logicConfig?.rules?.map((rule: WorkflowLogicRule, index: number) => (
              <div key={index} className="flex flex-col gap-3 p-4 bg-background border border-border-dim rounded-[12px] relative shadow-sm">
                 <Button variant="icon" onClick={() => { const r = formData._logicConfig.rules.filter((_, i) => i !== index); setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="absolute top-2 right-2 rounded-lg text-muted hover:text-red-500 hover:bg-red-500/10"><X className="w-4 h-4"/></Button>
           
                 <div className="flex flex-col gap-1.5 pr-8">
                     <label className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{t('logic.testVariable')}</label>
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
                            <option value="">{t('logic.injectUpstream')}</option>
                            {upstreamNodes.map((n) => (
                               <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                            ))}
                         </select>
                         <input type="text" placeholder="e.g. {{nodes.agent-123.output.score}}" value={rule.variable} onChange={e => { const r = [...formData._logicConfig.rules]; r[index].variable = e.target.value; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="w-full px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] font-mono outline-none focus:border-brand/50 text-brand" />
                     </div>
                 </div>
           
                 <div className="flex flex-col gap-1.5">
                     <label className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{t('logic.condition')}</label>
                     <select value={rule.operator} onChange={e => { const r = [...formData._logicConfig.rules]; r[index].operator = e.target.value as WorkflowLogicRule["operator"]; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="w-full px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none cursor-pointer focus:border-brand/50">
                        <option value="EQUALS">{t('logic.operators.equals')}</option>
                        <option value="NOT_EQUALS">{t('logic.operators.notEquals')}</option>
                        <option value="CONTAINS">{t('logic.operators.contains')}</option>
                        <option value="GREATER_THAN">{t('logic.operators.greaterThan')}</option>
                        <option value="LESS_THAN">{t('logic.operators.lessThan')}</option>
                        <option value="IS_EMPTY">{t('logic.operators.isEmpty')}</option>
                        <option value="NOT_EMPTY">{t('logic.operators.notEmpty')}</option>
                     </select>
                 </div>

                 {rule.operator !== 'IS_EMPTY' && rule.operator !== 'NOT_EMPTY' && (
                   <div className="flex flex-col gap-1.5">
                       <label className="text-[10px] font-semibold text-secondary uppercase tracking-wider">{t('logic.comparisonValue')}</label>
                       <input type="text" placeholder={t('logic.comparisonPlaceholder')} value={rule.value} onChange={e => { const r = [...formData._logicConfig.rules]; r[index].value = e.target.value; setFormData({...formData, _logicConfig: {...formData._logicConfig, rules: r}}) }} className="w-full px-3 py-2 bg-sidebar border border-border-dim rounded-[8px] text-[12px] outline-none focus:border-brand/50" />
                   </div>
                 )}

                 <div className="flex gap-3 items-center mt-2 p-3 bg-brand/5 rounded-[8px] border border-brand/10 shadow-inner">
                     <Zap className="w-5 h-5 text-brand shrink-0" />
                     <div className="flex flex-col gap-1.5 w-full">
                         <span className="text-[10px] font-bold text-brand uppercase tracking-wider">{t('logic.executeNext')}</span>
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
              <div className="text-[11px] text-muted italic p-3 border border-dashed border-border-dim rounded-[12px] text-center bg-background/50">{t('logic.noRules')}</div>
           )}
         </div>

         <div className="flex flex-col gap-2 mt-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('logic.fallback')}</label>
           <select 
              value={formData._logicConfig?.fallbackBranch || ''}
              onChange={(e) => setFormData({ ...formData, _logicConfig: { ...formData._logicConfig, fallbackBranch: e.target.value } })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 cursor-pointer"
           >
              {downstreamNodes.map((n) => (
                 <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
              ))}
           </select>
           <span className="text-[10px] text-muted leading-relaxed">{t('logic.fallbackHint')}</span>
         </div>
      </div>
    </>
  );
}

export function IteratorPanel({
  formData,
  setFormData,
  upstreamNodes,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
  upstreamNodes: WorkflowCanvasNode[];
}) {
  const t = useTranslations('admin.workflows.designer.drawer');
  const { platformName } = useSystemSettings();

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px]">
             <span className="text-[11px] text-brand leading-relaxed block w-full">{t('iterator.info', { platformName })}</span>
         </div>

         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('iterator.target')}</label>
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
                  <option value="">{t('logic.injectUpstream')}</option>
                  {upstreamNodes.map((n) => (
                     <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                  ))}
               </select>
               <input type="text" placeholder="e.g. {{nodes.scraper.output.articlesArray}}" value={formData._iteratorConfig?.listVariable} onChange={e => { setFormData({...formData, _iteratorConfig: {...formData._iteratorConfig, listVariable: e.target.value}}) }} className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-[12px] font-mono outline-none focus:border-brand/50 text-foreground" />
           </div>
         </div>

      </div>
    </>
  );
}

export function MergePanel({
  formData,
  setFormData,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
             <span className="text-[11px] text-brand leading-relaxed block w-full">{t.rich('merge.info', { strong: (chunks) => <strong>{chunks}</strong> })}</span>
             <span className="text-[10px] text-muted italic block w-full border-t border-brand/10 pt-2">{t.rich('merge.mapHint', { syntax: () => <code className="bg-background px-1 py-0.5 rounded text-foreground">{'{{nodes.[THIS_NODE_ID].output.mergedContexts}}'}</code> })}</span>
         </div>
   
         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('merge.behavior')}</label>
           <select 
              value={formData._mergeConfig?.mode || 'WAIT_FOR_ALL'}
              onChange={(e) => setFormData({ ...formData, _mergeConfig: { ...formData._mergeConfig, mode: e.target.value as WorkflowMergeConfig["mode"] } })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 cursor-pointer"
           >
              <option value="WAIT_FOR_ALL">{t('merge.waitAll')}</option>
              <option value="WAIT_FOR_ANY">{t('merge.waitAny')}</option>
           </select>
         </div>
      </div>
    </>
  );
}

export function WaitPanel({
  formData,
  setFormData,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
             <span className="text-[11px] text-brand leading-relaxed block w-full">{t.rich('wait.info', { strong: (chunks) => <strong>{chunks}</strong> })}</span>
         </div>
   
         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('wait.delay')}</label>
           <div className="flex items-center gap-2">
               <input
                  type="text"
                  value={formData._waitConfig?.delaySeconds || ''}
                  onChange={(e) => setFormData({ ...formData, _waitConfig: { ...formData._waitConfig, delaySeconds: e.target.value } })}
                  placeholder="e.g. 5 or {{nodes.x.output.wait}}"
                  className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 font-mono"
               />
               <span className="text-[12px] font-semibold text-muted uppercase px-2 tracking-wider">{t('wait.seconds')}</span>
           </div>
           <span className="text-[10px] text-muted italic inline-flex items-center gap-1 mt-1"><Clock className="w-3 h-3"/> {t('wait.hint')}</span>
         </div>
      </div>
    </>
  );
}

export function ApprovalPanel({
  formData,
  setFormData,
  upstreamNodes,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
  upstreamNodes: WorkflowCanvasNode[];
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
             <span className="text-[11px] text-brand leading-relaxed block w-full">{t.rich('approval.info', { strong: (chunks) => <strong>{chunks}</strong> })}</span>
         </div>
   
         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('approval.notice')}</label>
           <input
              type="text"
              value={formData._approvalConfig?.message || ''}
              onChange={(e) => setFormData({ ...formData, _approvalConfig: { ...formData._approvalConfig, message: e.target.value } })}
              placeholder={t('approval.noticePlaceholder')}
              maxLength={150}
              className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
           />
         </div>

         <div className="flex flex-col gap-2 mt-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('approval.previewTarget')}</label>
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
                  <option value="">{t('approval.mapUpstream')}</option>
                  {upstreamNodes.map((n) => (
                     <option key={n.id} value={n.id}>{n.data?.label || n.type} ({n.id.split('-')[1] || n.id})</option>
                  ))}
               </select>
               <input type="text" placeholder="e.g. {{nodes.copywriter.output.text}}" value={formData._approvalConfig?.previewTarget || ''} onChange={e => { setFormData({...formData, _approvalConfig: {...formData._approvalConfig, previewTarget: e.target.value}}) }} className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-[12px] font-mono outline-none focus:border-brand/50 text-brand" />
           </div>
           <span className="text-[10px] text-muted italic">{t('approval.previewHint')}</span>
         </div>
      </div>
    </>
  );
}

export function EmailPanel({
  formData,
  setFormData,
  upstreamNodes,
}: {
  formData: ConfigDrawerFormData;
  setFormData: Dispatch<SetStateAction<ConfigDrawerFormData>>;
  upstreamNodes: WorkflowCanvasNode[];
}) {
  const t = useTranslations('admin.workflows.designer.drawer');

  return (
    <>
      <div className="flex flex-col gap-6 mt-4">
         <div className="bg-brand/5 border border-brand/10 p-4 rounded-[12px] flex flex-col gap-2">
             <span className="text-[11px] text-brand leading-relaxed block w-full">{t.rich('email.info', { strong: (chunks) => <strong>{chunks}</strong> })}</span>
         </div>
   
         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('email.from')}</label>
           <input
              type="text"
              value={formData._emailConfig?.from || ''}
              onChange={(e) => setFormData({ ...formData, _emailConfig: { ...formData._emailConfig, from: e.target.value } })}
              placeholder={t('email.fromPlaceholder')}
              className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[13px] outline-none focus:border-brand/50 font-mono"
           />
           <span className="text-[10px] text-muted italic">{t('email.fromHint')}</span>
         </div>

         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('email.to')}</label>
           <div className="flex items-center gap-2">
               <input
                  type="text"
                  value={formData._emailConfig?.to || ''}
                  onChange={(e) => setFormData({ ...formData, _emailConfig: { ...formData._emailConfig, to: e.target.value } })}
                  placeholder="e.g. {{nodes.x.output.clientEmail}}, support@domain.com"
                  className="flex-1 px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[13px] outline-none focus:border-brand/50 font-mono"
               />
           </div>
           <span className="text-[10px] text-muted italic">{t('email.toHint')}</span>
         </div>

         <div className="flex flex-col gap-2">
           <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('email.subject')}</label>
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
                  <Code2 className="w-4 h-4" /> {t('email.body')}
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
                  <option value="">{t('email.injectContent')}</option>
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
    </>
  );
}
