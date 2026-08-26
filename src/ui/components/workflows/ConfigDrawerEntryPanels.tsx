"use client";

import type { Dispatch, SetStateAction } from "react";
import { Clock, Code2, Webhook, X, Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { Button } from "@/src/ui/components/screens/Button";
import type {
  WorkflowCanvasNode,
  WorkflowHeaderConfig,
} from "./types";
import {
  type ConfigDrawerFormData,
  type ScheduleMode,
} from "./ConfigDrawer";

/**
 * How a workflow starts, and what it runs when it does.
 *
 * The trigger's shape, the agent or tool an action step calls, and the code a
 * code step executes. Split from ConfigDrawerPanels.tsx on 2026-08-26, which
 * had grown to 818 lines holding all ten node types — a file created by an
 * earlier split and never mentioned in the report that claimed it.
 */

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
