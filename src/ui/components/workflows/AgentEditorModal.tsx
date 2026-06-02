import { getErrorMessage } from "@/src/lib/errors";
import { useEffect, useMemo, useState } from "react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, BrainCircuit, Globe, Key, Settings2, Database, Code2, Wand2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeUpdateHandler } from "./types";

type ReasoningEffort = "LOW" | "MEDIUM" | "HIGH";
type ModelSelectionMode = "inherit" | "override";

type AgentEditorFormData = {
  name: string;
  systemPrompt: string;
  inputSchema: string;
  outputSchema: string;
  modelId: string;
  modelSelectionMode: ModelSelectionMode;
  thinkingMode: boolean;
  reasoningEffort: ReasoningEffort;
  allowInternetAccess: boolean;
  humanApprovalRequired: boolean;
  temperature: number | string;
  _inputMapping: string;
  _inputTemplate: string;
  _inputFields: string;
  _outputFields: string;
};

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
};

type AgentEditorModalProps = {
  node: WorkflowCanvasNode | null;
  allNodes?: WorkflowCanvasNode[];
  edges?: WorkflowCanvasEdge[];
  onClose: () => void;
  onUpdateNode: WorkflowNodeUpdateHandler;
};


export function AgentEditorModal({ node, allNodes = [], edges = [], onClose, onUpdateNode }: AgentEditorModalProps) {
  const t = useTranslations('admin.workflows.designer.editor');
  const tAlerts = useTranslations('admin.workflows.designer.alerts');
  const tCommon = useTranslations('common');

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

  const upstreamNodes = getUpstreamNodes();

  const agentId = node?.data?._agentId;
  const agent = useQuery(api.agents.get, agentId ? { id: agentId } : "skip");
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "workflow" });
  const activeModels = useMemo(() => activeModelsData ?? [], [activeModelsData]);
  const defaultModelId = useMemo(() => activeModels.find((m) => m.isDefault)?.modelId || "", [activeModels]);
  const params = useParams();

  const updateAgent = useMutation(api.agents.updateAgent);
  const createInlineAgent = useMutation(api.agents.createInlineAgent);
  const promoteToGlobal = useMutation(api.agents.promoteToGlobal);

  const [formData, setFormData] = useState<AgentEditorFormData>({
    name: "",
    systemPrompt: "",
    inputSchema: "",
    outputSchema: "",
    modelId: defaultModelId,
    modelSelectionMode: "inherit",
    thinkingMode: false,
    reasoningEffort: "MEDIUM",
    allowInternetAccess: false,
    humanApprovalRequired: false,
    temperature: 1.0,
    _inputMapping: "",
    _inputTemplate: "",
    _inputFields: "",
    _outputFields: "",
  });
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'MAPPING'>('MAPPING');
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);

  const generateConfig = useAction(api.ai.generateNodeConfig);

  useEffect(() => {
    if (agent && node) {
      setFormData({
        name: agent.name || "",
        systemPrompt: agent.systemPrompt || "",
        inputSchema: agent.inputSchema || "",
        outputSchema: agent.outputSchema || "",
        modelId: agent.modelId || defaultModelId,
        modelSelectionMode: agent.modelSelectionMode || "override",
        thinkingMode: agent.thinkingMode || false,
        reasoningEffort: agent.reasoningEffort || "MEDIUM",
        allowInternetAccess: agent.allowInternetAccess || false,
        humanApprovalRequired: agent.humanApprovalRequired || false,
        temperature: agent.temperature ?? 1.0,
        _inputMapping: typeof node.data?._inputMapping === 'object' ? JSON.stringify(node.data._inputMapping, null, 2) : node.data?._inputMapping || "",
        _inputTemplate: node.data?._inputTemplate || "",
        _inputFields: agent.inputSchema ? deriveCSVFromSchema(agent.inputSchema) : "",
        _outputFields: agent.outputSchema ? deriveCSVFromSchema(agent.outputSchema) : "",
      });
    }
  }, [agent, defaultModelId, node]);

  const deriveCSVFromSchema = (schemaStr: string) => {
    try {
      const parsed = JSON.parse(schemaStr) as JsonSchemaObject;
      return Object.keys(parsed.properties || {}).join(", ");
    } catch { return ""; }
  };

  const createSchemaFromCSV = (csv: string) => {
    const fields = csv.split(',').map(f => f.trim()).filter(Boolean);
    if (fields.length === 0) return "";
    const properties: Record<string, { type: "string" }> = {};
    fields.forEach(f => properties[f] = { type: "string" });
    return JSON.stringify({ type: "object", properties }, null, 2);
  };

  const handleAutoConfigure = async () => {
	    if (!node) return;
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
         _inputTemplate: result.template ? result.template.trim() : "",
         name: result.agentName || formData.name,
         systemPrompt: result.agentSystemPrompt || formData.systemPrompt,
         _inputFields: result.agentInputFields || formData._inputFields,
         _outputFields: result.agentOutputFields || formData._outputFields,
         allowInternetAccess: result.agentAllowInternet !== undefined ? result.agentAllowInternet : formData.allowInternetAccess,
      });
      setAiPrompt("");
      setIsDeveloperMode(true);
    } catch {
      setFeedbackMessage("AI Configuration failed. Please try again or construct the payload manually.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
	    e.preventDefault();
	    if (!node) return;
	    setIsSaving(true);
    setFeedbackMessage("");
    let targetAgentId = agentId;

    try {
      if (!targetAgentId) {
         targetAgentId = await createInlineAgent({ workflowId: params.id as Id<"workflows"> });
      }

      const generatedInputSchema = formData._inputFields ? createSchemaFromCSV(formData._inputFields) : formData.inputSchema;
      const generatedOutputSchema = formData._outputFields ? createSchemaFromCSV(formData._outputFields) : formData.outputSchema;

      await updateAgent({
        id: targetAgentId,
        name: formData.name,
        systemPrompt: formData.systemPrompt,
        inputSchema: generatedInputSchema,
        outputSchema: generatedOutputSchema,
        modelSelectionMode: formData.modelSelectionMode,
        ...(formData.modelSelectionMode === "override" ? { modelId: formData.modelId } : {}),
        thinkingMode: formData.thinkingMode,
        reasoningEffort: formData.reasoningEffort,
        allowInternetAccess: formData.allowInternetAccess,
        humanApprovalRequired: formData.humanApprovalRequired,
        temperature: parseFloat(String(formData.temperature)),
      });

      let parsedMapping = formData._inputMapping;
      if (parsedMapping) {
        try { parsedMapping = JSON.parse(parsedMapping); } catch {}
      }

      // Update the visual node on the canvas too
      onUpdateNode(node.id, {
        ...node.data,
        label: formData.name,
        inputSchema: generatedInputSchema,
        outputSchema: generatedOutputSchema,
        modelId: formData.modelSelectionMode === "override" ? formData.modelId : defaultModelId,
        _agentId: targetAgentId,
        _inputMapping: parsedMapping,
        _inputTemplate: formData._inputTemplate,
      });

      onClose();
    } catch (err: unknown) {
      setFeedbackMessage(getErrorMessage(err, tAlerts('saveAgentFailed')));
    } finally {
      setIsSaving(false);
    }
	  };

	  const handlePromote = async () => {
	    if (!agent) return;
	    try {
	      await promoteToGlobal({ id: agent._id });
	      onClose();
	    } catch (err: unknown) {
        setIsPromoteModalOpen(false);
	      setFeedbackMessage(getErrorMessage(err, tAlerts('promoteFailed')));
	    }
	  };

  if (!node) return null;
  const isLoading = agentId && agent === undefined;

	  return (
      <>
	    <SonaeModal size="xl" isOpen={!!node} onClose={onClose} title={formData.name || t('configureAgent')}>
	      {isLoading ? (
	        <div className="py-8 text-center text-muted text-sm border border-border-dim rounded-[12px]">{t('loading')}</div>
	      ) : (
	        <form onSubmit={handleSave} className="flex flex-col gap-6">
            {feedbackMessage && (
              <div className="rounded-[10px] border border-red-500/20 bg-red-500/10 px-4 py-3 text-[13px] font-medium text-red-400">
                {feedbackMessage}
              </div>
            )}

	          {/* Tabs */}
          <div className="flex border-b border-border-dim mb-2 w-full max-w-[400px]">
             <button
                type="button"
                onClick={() => setActiveTab('MAPPING')}
                className={`flex-1 py-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'MAPPING' ? 'border-brand text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
             >
                <Wand2 className="w-4 h-4" /> AI Configuration
             </button>
             <button
                type="button"
                onClick={() => setActiveTab('IDENTITY')}
                className={`flex-1 py-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'IDENTITY' ? 'border-brand text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
             >
                <Bot className="w-4 h-4" /> Advanced Engine
             </button>
          </div>

          {activeTab === 'IDENTITY' && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              {/* Left Column: Core Identity & Instructions */}
              <div className="md:col-span-3 flex flex-col gap-6">
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Bot className="w-4 h-4" /> {t('identity.label')}
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name || ""}
                    onChange={e => setFormData({ ...formData, name: e.target.value })}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                    placeholder={t('identity.placeholder')}
                  />
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Key className="w-4 h-4" /> {t('directives.label')}
                  </label>
                  <textarea
                    value={formData.systemPrompt || ""}
                    onChange={e => setFormData({ ...formData, systemPrompt: e.target.value })}
                    rows={8}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                    placeholder={t('directives.placeholder')}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Expected Variables in Input</label>
                    <textarea
                      value={formData._inputFields !== undefined ? formData._inputFields : formData.inputSchema || ""}
                      onChange={e => setFormData({ ...formData, _inputFields: e.target.value })}
                      rows={2}
                      className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none"
                      placeholder='e.g. textEmail, topic, userPreferences'
                    />
                    <span className="text-[10px] text-muted">Comma separated variables Sonae will pass to the AI.</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Variables in AI Output</label>
                    <textarea
                      value={formData._outputFields !== undefined ? formData._outputFields : formData.outputSchema || ""}
                      onChange={e => setFormData({ ...formData, _outputFields: e.target.value })}
                      rows={2}
                      className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none"
                      placeholder='e.g. summary, sentiment, nextSteps'
                    />
                    <span className="text-[10px] text-muted">Comma separated variables matching the agent output format. Sonae strictly enforces this output.</span>
                  </div>
                </div>
              </div>

              {/* Right Column: Engine & Tools */}
              <div className="min-w-0 flex flex-col gap-6">

                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                    <Settings2 className="w-4 h-4" /> {t('engine.label')}
                  </label>
                  <select
                    value={formData.modelSelectionMode}
                    onChange={e => setFormData({ ...formData, modelSelectionMode: e.target.value as ModelSelectionMode })}
                    className="px-3 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                  >
                    <option value="inherit">{t('engine.modes.inherit')}</option>
                    <option value="override">{t('engine.modes.override')}</option>
                  </select>
                  <select
                    value={formData.modelId || ''}
                    onChange={e => setFormData({ ...formData, modelId: e.target.value })}
                    disabled={formData.modelSelectionMode === "inherit"}
                    className="px-3 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                  >
                    <option value="" disabled>{t('engine.placeholder')}</option>
                    {activeModels.map((m) => (
                      <option key={m.modelId} value={m.modelId}>
                        {m.friendlyName || m.displayName || m.modelId} {m.isDefault && t('engine.systemDefault')}
                      </option>
                    ))}

                    {formData.modelId && activeModels.length > 0 && !activeModels.find(m => m.modelId === formData.modelId) && (
                      <option value={formData.modelId}>
                        {t('engine.legacy', { id: formData.modelId })}
                      </option>
                    )}
                  </select>
                </div>

                <div className="flex flex-col gap-3 p-4 border border-border-dim bg-background/50 rounded-[12px]">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.thinkingMode}
                      onChange={e => setFormData({ ...formData, thinkingMode: e.target.checked })}
                      className="w-4 h-4 rounded appearance-none border border-border-dim bg-card checked:bg-brand checked:border-brand transition-all flex items-center justify-center after:content-['✓'] after:text-background after:text-[10px] after:opacity-0 checked:after:opacity-100"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground group-hover:text-brand transition-colors flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" /> {t('thinking.label')}</span>
                      <span className="text-[11px] text-muted leading-tight">{t('thinking.hint')}</span>
                    </div>
                  </label>
                  {formData.thinkingMode && (
                    <div className="pl-7 pt-2 border-t border-border-dim/50 mt-1 flex flex-col gap-2">
                      <span className="text-[10px] uppercase tracking-widest text-muted">{t('thinking.effort')}</span>
                      <div className="flex gap-2">
                        {(["LOW", "MEDIUM", "HIGH"] as const).map(level => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setFormData({ ...formData, reasoningEffort: level })}
                            className={`flex-1 py-1.5 rounded-[6px] text-[11px] font-medium transition-all ${formData.reasoningEffort === level
                              ? 'bg-brand/20 text-brand border border-brand/50'
                              : 'bg-sidebar border border-border-dim text-secondary hover:text-foreground hover:bg-foreground/5'
                              }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-3 p-4 border border-border-dim bg-background/50 rounded-[12px]">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={formData.allowInternetAccess}
                      onChange={e => setFormData({ ...formData, allowInternetAccess: e.target.checked })}
                      className="w-4 h-4 rounded appearance-none border border-border-dim bg-card checked:bg-brand checked:border-brand transition-all flex items-center justify-center after:content-['✓'] after:text-background after:text-[10px] after:opacity-0 checked:after:opacity-100"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground group-hover:text-brand transition-colors flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> {t('search.label')}</span>
                      <span className="text-[11px] text-muted leading-tight">{t('search.hint')}</span>
                    </div>
                  </label>
                </div>

                <div className="flex flex-col gap-2 p-4 border border-border-dim bg-background/50 rounded-[12px]">
                  <div className="flex justify-between items-center w-full">
                    <span className="text-sm font-medium text-foreground">{t('temperature.label', { value: Number(formData.temperature).toFixed(1) })}</span>
                  </div>
                  <input
                    type="range"
                    min="0" max="2" step="0.1"
                    value={formData.temperature}
                    onChange={e => setFormData({ ...formData, temperature: e.target.value })}
                    className="w-full accent-brand bg-card rounded-lg appearance-none h-1"
                  />
                  <span className="text-[11px] text-muted leading-tight mt-1">
                    {t('temperature.hint')}
                  </span>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'MAPPING' && (
             <div className="flex flex-col gap-6 w-full max-w-3xl mx-auto py-2">
                <div className="flex bg-sidebar/50 p-1 rounded-xl border border-border-dim mb-2 w-[300px]">
                  <button type="button" onClick={() => setIsDeveloperMode(false)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${!isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>🪄 Standard Configurator</button>
                  <button type="button" onClick={() => setIsDeveloperMode(true)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>⚡️ Developer Mapping</button>
                </div>

                {!isDeveloperMode ? (
                  <div className="flex flex-col gap-3 border border-border-dim bg-sidebar/50 p-6 rounded-[16px] relative overflow-hidden">
                     <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> AI Mapping Auto-Configuration
                     </label>
                     <p className="text-[13px] text-muted leading-relaxed">
                        Describe what upstream data should be passed to this Agent, or what specific operation it should be performing with prior payload variables. We will analyze the graph context and construct the dynamic injection templates.
                     </p>
                     <textarea 
                       value={aiPrompt}
                       onChange={(e) => setAiPrompt(e.target.value)}
                       placeholder="e.g. Map the contents of the previous Scrape Action into the Agent's evaluation payload."
                       className="w-full bg-background border border-border-dim rounded-[12px] p-4 text-sm focus:border-brand/50 outline-none resize-none min-h-[120px] shadow-inner mt-2"
                     />
                     <button
                       type="button"
                       disabled={isGenerating || !aiPrompt.trim()}
                       onClick={handleAutoConfigure}
                       className="w-full mt-2 py-3 rounded-[12px] bg-foreground text-background text-sm font-semibold hover:bg-foreground/90 transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-xl shadow-foreground/20"
                     >
                       {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> Analyzing Graph Context...</> : <><Wand2 className="w-4 h-4" /> Auto-Configure Mapping Requirements</>}
                     </button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Database className="w-4 h-4" /> JSON Structured Input Mapping (Phase 2)
                      </label>
                      <textarea
                        value={formData._inputMapping}
                        onChange={(e) => setFormData({ ...formData, _inputMapping: e.target.value })}
                        rows={10}
                        className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                        placeholder='{&#10;  "textToAnalyze": "{{nodes.triggerNode-123.output.emailBody}}"&#10;}'
                      />
                      <span className="text-[11px] text-muted leading-tight mt-1">
                        Use <code className="text-brand">{"{{nodes.id.output}}"}</code> to bind variables mathematically. If mapped, this JSON overrides raw templates. It aligns nicely to match the <strong className="text-foreground">Input Schema</strong> defined in the Agent Engine tab.
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                      <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Code2 className="w-4 h-4" /> Raw String Prompt Template
                      </label>
                      <textarea
                        value={formData._inputTemplate}
                        onChange={(e) => setFormData({ ...formData, _inputTemplate: e.target.value })}
                        rows={6}
                        className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                        placeholder='Summarize this: {{nodes.someId.output.data}}'
                      />
                    </div>
                  </>
                )}
             </div>
          )}

          <div className="flex flex-col sm:flex-row justify-between items-center mt-4 pt-6 border-t border-border-dim gap-4">
            <div>
              {agent?.isGlobal === false && (
	                <button
	                  type="button"
	                  onClick={() => setIsPromoteModalOpen(true)}
	                  className="px-4 py-2 rounded-[10px] text-brand hover:text-brand-foreground hover:bg-brand transition-all text-[12px] font-medium border border-brand/20 shadow-sm shadow-brand/10 w-full sm:w-auto"
                >
                  {t('promote')}
                </button>
              )}
            </div>

            <div className="flex gap-3 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
              >
                {tCommon('cancel')}
              </button>
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-md shadow-foreground/10 text-sm disabled:opacity-50"
              >
                {isSaving ? tCommon('saving') : (agent?.isGlobal ? tCommon('save') : t('save'))}
              </button>
            </div>
          </div>
	        </form>
	      )}
	    </SonaeModal>
      <SonaeModal
        isOpen={isPromoteModalOpen}
        onClose={() => setIsPromoteModalOpen(false)}
        title={t('promote')}
        size="sm"
      >
        <div className="flex flex-col gap-6">
          <p className="text-[14px] text-secondary leading-relaxed">{t('promoteConfirm')}</p>
          <div className="flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setIsPromoteModalOpen(false)}
              className="px-5 py-2.5 rounded-[10px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all"
            >
              {tCommon('cancel')}
            </button>
            <button
              type="button"
              onClick={handlePromote}
              className="px-5 py-2.5 rounded-[10px] bg-brand text-brand-foreground text-[13px] font-bold hover:bg-brand/90 transition-all"
            >
              {t('promote')}
            </button>
          </div>
        </div>
      </SonaeModal>
      </>
	  );
}
