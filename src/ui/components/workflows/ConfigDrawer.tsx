import { useState } from "react";
import { X, Save, Database, Code2, Wand2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { convexHttpActionsUrl } from "@/src/lib/convexHttpActionsUrl";
import { Button } from "@/src/ui/components/screens/Button";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { ActionPanel, CodePanel, TriggerPanel } from "./ConfigDrawerEntryPanels";
import { DatabasePanel, IteratorPanel, LogicPanel, MergePanel } from "./ConfigDrawerDataPanels";
import { ApprovalPanel, EmailPanel, WaitPanel } from "./ConfigDrawerHumanPanels";
import type {
  WorkflowActionConfig,
  WorkflowApprovalConfig,
  WorkflowCanvasEdge,
  WorkflowCanvasNode,
  WorkflowDatabaseConfig,
  WorkflowEmailConfig,
  WorkflowIteratorConfig,
  WorkflowLogicConfig,
  WorkflowMergeConfig,
  WorkflowNodeUpdateHandler,
  WorkflowTriggerType,
  WorkflowWaitConfig,
} from "./types";

export type ScheduleMode = "interval" | "daily" | "weekly" | "monthly";

export type ConfigDrawerFormData = {
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
const WEBHOOK_ORIGIN_PLACEHOLDER = "https://[YOUR_CONVEX_SITE_URL]";
const AUTO_CONFIGURE_KEY = "auto-configure";

/**
 * `labelKey` is a key under `admin.workflows.designer.drawer` resolved with
 * `t(labelKey)` at render — the same LabelRef convention the agents
 * observability screens use for data-driven labels.
 */
type WorkflowDbSelectIndexOption = {
  indexName: string;
  labelKey: string;
  filters: string[];
};

export const workflowDbSelectIndexes: Record<string, WorkflowDbSelectIndexOption[]> = {
  companies: [
    { indexName: "by_name", labelKey: "dbIndexes.name", filters: ["name"] },
    { indexName: "by_plan", labelKey: "dbIndexes.plan", filters: ["planId"] },
  ],
  properties: [
    { indexName: "by_company", labelKey: "dbIndexes.company", filters: ["companyId"] },
    { indexName: "by_rightmoveId", labelKey: "dbIndexes.rightmoveId", filters: ["rightmoveId"] },
    { indexName: "by_runId", labelKey: "dbIndexes.runId", filters: ["runId"] },
  ],
  threads: [
    { indexName: "by_company", labelKey: "dbIndexes.company", filters: ["companyId"] },
    { indexName: "by_user", labelKey: "dbIndexes.user", filters: ["userId"] },
    { indexName: "by_widget", labelKey: "dbIndexes.widget", filters: ["widgetId"] },
  ],
  messages: [
    { indexName: "by_thread", labelKey: "dbIndexes.thread", filters: ["threadId"] },
    { indexName: "by_company_role_created", labelKey: "dbIndexes.companyRole", filters: ["companyId", "role"] },
  ],
  knowledgeDocuments: [
    { indexName: "by_company", labelKey: "dbIndexes.company", filters: ["companyId"] },
    { indexName: "by_agent", labelKey: "dbIndexes.agent", filters: ["agentId"] },
    { indexName: "by_thread", labelKey: "dbIndexes.thread", filters: ["threadId"] },
    { indexName: "by_status", labelKey: "dbIndexes.status", filters: ["status"] },
  ],
  knowledgeChunks: [
    { indexName: "by_document", labelKey: "dbIndexes.document", filters: ["documentId"] },
  ],
  aiRules: [
    { indexName: "by_company_created", labelKey: "dbIndexes.company", filters: ["companyId"] },
    { indexName: "by_agent_company_created", labelKey: "dbIndexes.agentCompany", filters: ["agentId", "companyId"] },
  ],
  users: [
    { indexName: "by_company", labelKey: "dbIndexes.company", filters: ["companyId"] },
    { indexName: "email", labelKey: "dbIndexes.email", filters: ["email"] },
  ],
  agents: [
    { indexName: "by_active_created", labelKey: "dbIndexes.active", filters: ["isActive"] },
  ],
  aiTools: [
    { indexName: "by_createdAt", labelKey: "dbIndexes.created", filters: [] },
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
  const { platformName } = useSystemSettings();
  const t = useTranslations('admin.workflows.designer.drawer');
  const tNode = useTranslations('admin.workflows.designer.node');
  const tAlerts = useTranslations('admin.workflows.designer.alerts');
  const tDesigner = useTranslations('admin.workflows.designer');

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
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const generateConfig = useAction(api.workflowNodeConfig.generateNodeConfig);
  const action = useAdminAction({ scope: "admin-workflow-node-config" });
  const isGenerating = action.isBusy(AUTO_CONFIGURE_KEY);
  const webhookOrigin = convexHttpActionsUrl({
    CONVEX_SITE_URL: process.env.CONVEX_SITE_URL,
    NEXT_PUBLIC_CONVEX_URL: process.env.NEXT_PUBLIC_CONVEX_URL,
  }) || WEBHOOK_ORIGIN_PLACEHOLDER;
  const workflowId = typeof window !== 'undefined' ? window.location.pathname.split('/').pop() : '[WORKFLOW_ID]';
  const webhookEndpoint = `${webhookOrigin}/api/webhooks/workflow?workflowId=${workflowId}`;

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

  // Adopted during render rather than in an effect, per the React docs on
  // deriving state from props: an effect would paint the previous node's
  // configuration first and then replace it. The sentinel is the node's id, not
  // the node: the canvas builds a new object for the same node whenever it
  // re-renders, and keying on the object re-seeded the drawer over whatever was
  // being typed.
  const [seenNodeId, setSeenNodeId] = useState<string | null>(null);
  const nodeId = node?.id ?? null;

  if (nodeId !== seenNodeId) {
    setSeenNodeId(nodeId);
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
  }

  if (!node) return null;

	  const handleAutoConfigure = async () => {
	    if (!aiPrompt.trim() || isGenerating) return;
    setFeedbackMessage("");

    const outcome = await action.run(
      () => generateConfig({
        prompt: aiPrompt,
        nodeType: node.type,
        availableNodes: upstreamNodes.map((n) => ({
          id: n.id,
          type: n.type,
          label: n.data?.label
        }))
      }),
      { key: AUTO_CONFIGURE_KEY, suppressErrorToast: true, fallbackMessage: tAlerts('autoConfigureFailed') },
    );

    if (!outcome.ok) {
      if (outcome.message) setFeedbackMessage(outcome.message);
      return;
    }

    setFormData({
       ...formData,
       _inputMapping: outcome.data.mapping ? outcome.data.mapping.trim() : "",
       _inputTemplate: outcome.data.template ? outcome.data.template.trim() : ""
    });
    setAiPrompt("");
    setIsDeveloperMode(true);
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
        <h3 className="text-lg font-bold tracking-tight text-foreground">{tNode('module', { type: node.type.replace('Node', '') })}</h3>
        <Button variant="icon" onClick={onClose} aria-label={t('closeAria')}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
        
        {node.type !== 'triggerNode' && node.type !== 'actionNode' && node.type !== 'logicNode' && node.type !== 'iteratorNode' && node.type !== 'mergeNode' && node.type !== 'waitNode' && node.type !== 'approvalNode' && node.type !== 'emailNode' && (
          <div className="flex bg-sidebar/50 p-1 rounded-xl border border-border-dim mb-6">
            {/* Both raw on purpose: halves of a segmented mode toggle — no
                Button variant is a selected/unselected segment. */}
            <button type="button" onClick={() => setIsDeveloperMode(false)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${!isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>{t('standardTab')}</button>
            <button type="button" onClick={() => setIsDeveloperMode(true)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>{t('developerTab')}</button>
          </div>
        )}

	        <form id="configForm" onSubmit={handleSave} className="flex flex-col gap-6">
            {feedbackMessage && (
              <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400">
                {feedbackMessage}
              </div>
            )}
	          <div className="flex flex-col gap-2">
            <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('nodeLabel')}</label>
            <input
              type="text"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
              placeholder={t('nodeLabelPlaceholder')}
            />
          </div>

          {node.type === 'triggerNode' && (
            <TriggerPanel formData={formData} setFormData={setFormData} webhookEndpoint={webhookEndpoint} />
          )}

          {node.type === 'actionNode' && (
            <ActionPanel formData={formData} setFormData={setFormData} upstreamNodes={upstreamNodes} />
          )}

          {node.type === 'codeNode' && isDeveloperMode && (
            <CodePanel formData={formData} setFormData={setFormData} />
          )}

          {node.type === 'databaseNode' && (
            <DatabasePanel formData={formData} updateDbConfig={updateDbConfig} />
          )}

          {node.type === 'logicNode' && (
            <LogicPanel
              formData={formData}
              setFormData={setFormData}
              upstreamNodes={upstreamNodes}
              downstreamNodes={downstreamNodes}
            />
          )}

          {node.type === 'iteratorNode' && (
            <IteratorPanel formData={formData} setFormData={setFormData} upstreamNodes={upstreamNodes} />
          )}

          {node.type === 'mergeNode' && (
            <MergePanel formData={formData} setFormData={setFormData} />
          )}

          {node.type === 'waitNode' && (
            <WaitPanel formData={formData} setFormData={setFormData} />
          )}

          {node.type === 'approvalNode' && (
            <ApprovalPanel formData={formData} setFormData={setFormData} upstreamNodes={upstreamNodes} />
          )}

          {node.type === 'emailNode' && (
            <EmailPanel formData={formData} setFormData={setFormData} upstreamNodes={upstreamNodes} />
          )}
          {node.type !== 'triggerNode' && node.type !== 'actionNode' && node.type !== 'logicNode' && node.type !== 'iteratorNode' && node.type !== 'mergeNode' && node.type !== 'waitNode' && node.type !== 'approvalNode' && node.type !== 'emailNode' && !isDeveloperMode && (
            <div className="flex flex-col gap-3 mt-2 border border-border-dim bg-sidebar/50 p-5 rounded-[16px] relative overflow-hidden">
               <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <Wand2 className="w-4 h-4" /> {t('auto.title')}
               </label>
               <p className="text-[13px] text-muted leading-relaxed">
                  {t('auto.description', { platformName })}
               </p>
               <textarea
                 value={aiPrompt}
                 onChange={(e) => setAiPrompt(e.target.value)}
                 placeholder={t('auto.placeholder')}
                 className="w-full bg-background border border-border-dim rounded-[12px] p-4 text-sm focus:border-foreground/50 outline-none resize-none min-h-[120px] shadow-inner mt-2"
               />
               <Button
                 variant="primary"
                 disabled={isGenerating || !aiPrompt.trim()}
                 onClick={handleAutoConfigure}
                 className="w-full mt-2 py-3 rounded-[12px] font-semibold shadow-foreground/20 flex items-center justify-center gap-2"
               >
                 {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> {tDesigner('analyzing')}</> : <><Wand2 className="w-4 h-4" /> {t('auto.button')}</>}
               </Button>
            </div>
          )}
          
          {node.type !== 'triggerNode' && node.type !== 'actionNode' && node.type !== 'codeNode' && isDeveloperMode && (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Database className="w-4 h-4" /> {t('devMapping.jsonLabel')}
                </label>
                <textarea
                  value={formData._inputMapping}
                  onChange={(e) => setFormData({ ...formData, _inputMapping: e.target.value })}
                  rows={8}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                  placeholder='{&#10;  "textToAnalyze": "{{nodes.triggerNode-123.output.emailBody}}"&#10;}'
                />
                <span className="text-[11px] text-muted leading-tight mt-1">
                  {t.rich('devMapping.jsonHint', { syntax: () => <code className="text-brand">{"{{nodes.id.output}}"}</code> })}
                </span>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Code2 className="w-4 h-4" /> {t('devMapping.templateLabel')}
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
        <Button
          variant="primary"
          type="submit"
          form="configForm"
          className="w-full flex items-center justify-center gap-2 py-3 rounded-[12px] shadow-foreground/20"
        >
          <Save className="w-4 h-4" /> {t('saveConfiguration')}
        </Button>
        </div>
      </motion.div>
      )}
    </AnimatePresence>
  );
}
