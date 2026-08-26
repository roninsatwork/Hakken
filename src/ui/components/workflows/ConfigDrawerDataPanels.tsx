"use client";

import type { Dispatch, SetStateAction } from "react";
import { X, Zap } from "lucide-react";

import { useTranslations } from "next-intl";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { Button } from "@/src/ui/components/screens/Button";
import type {
  WorkflowCanvasNode,
  WorkflowDatabaseConfig,
  WorkflowLogicRule,
  WorkflowMergeConfig,
} from "./types";
import {
  workflowDbSelectIndexes,
  type ConfigDrawerFormData,
} from "./ConfigDrawer";

/**
 * The node types that shape and route what passes through them.
 *
 * Reading and writing rows, branching on a rule, walking a list, and joining
 * branches back together. Split from ConfigDrawerPanels.tsx on 2026-08-26.
 */

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
