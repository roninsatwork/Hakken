"use client";

import type { Dispatch, SetStateAction } from "react";
import { Clock, Code2 } from "lucide-react";

import { useTranslations } from "next-intl";

import type {
  WorkflowCanvasNode,
} from "./types";
import {
  type ConfigDrawerFormData,
} from "./ConfigDrawer";

/**
 * The node types that wait on a person.
 *
 * Pausing for a delay, pausing for an approval, and sending an email. Split
 * from ConfigDrawerPanels.tsx on 2026-08-26.
 */

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
