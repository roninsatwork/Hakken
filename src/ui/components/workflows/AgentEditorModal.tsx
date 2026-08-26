import { useMemo, useState } from "react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, BrainCircuit, Globe, Key, Settings2, Database, Code2, Wand2, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import type { Id } from "@/convex/_generated/dataModel";
import type { WorkflowCanvasEdge, WorkflowCanvasNode, WorkflowNodeUpdateHandler } from "./types";
import { Button } from "@/src/ui/components/screens/Button";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useAdminAction } from "@/src/hooks/useAdminAction";

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
  temperature: number | string;
  _inputMapping: string;
  _inputTemplate: string;
  _inputFields: string;
  _outputFields: string;
  selectedSkillIds: Array<Id<"agentSkills">>;
};

type JsonSchemaObject = {
  properties?: Record<string, unknown>;
};

function deriveCSVFromSchema(schemaStr: string) {
  try {
    const parsed = JSON.parse(schemaStr) as JsonSchemaObject;
    return Object.keys(parsed.properties || {}).join(", ");
  } catch { return ""; }
}

const AUTO_CONFIGURE_KEY = "auto-configure";
const SAVE_KEY = "save-agent";
const PROMOTE_KEY = "promote";

type AgentEditorModalProps = {
  node: WorkflowCanvasNode | null;
  allNodes?: WorkflowCanvasNode[];
  edges?: WorkflowCanvasEdge[];
  onClose: () => void;
  onUpdateNode: WorkflowNodeUpdateHandler;
};


export function AgentEditorModal({ node, allNodes = [], edges = [], onClose, onUpdateNode }: AgentEditorModalProps) {
  const { platformName } = useSystemSettings();
  const t = useTranslations('admin.workflows.designer.editor');
  const tAlerts = useTranslations('admin.workflows.designer.alerts');
  const tDesigner = useTranslations('admin.workflows.designer');
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
  const activeSkillsData = useQuery(api.agentSkills.getActiveSkills);
  const activeSkills = useMemo(() => activeSkillsData ?? [], [activeSkillsData]);
  const existingSkillBindingsData = useQuery(api.agentSkills.getForAgent, agentId ? { agentId } : "skip");
  const existingSkillBindings = useMemo(() => existingSkillBindingsData ?? [], [existingSkillBindingsData]);
  const activeModelsData = useQuery(api.aiModels.getActiveModels, { useCase: "workflow" });
  const activeModels = useMemo(() => activeModelsData ?? [], [activeModelsData]);
  const defaultModelId = useMemo(() => activeModels.find((m) => m.isDefault)?.modelId || "", [activeModels]);
  const params = useParams();

  const updateAgent = useMutation(api.agents.updateAgent);
  const createInlineAgent = useMutation(api.agents.createInlineAgent);
  const promoteToGlobal = useMutation(api.agents.promoteToGlobal);
  const bindSkillToAgent = useMutation(api.agentSkills.bindSkillToAgent);
  const unbindSkillFromAgent = useMutation(api.agentSkills.unbindSkillFromAgent);
  const action = useAdminAction({ scope: "admin-workflow-agent-editor" });

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
    temperature: 1.0,
    _inputMapping: "",
    _inputTemplate: "",
    _inputFields: "",
    _outputFields: "",
    selectedSkillIds: [],
  });
  const [activeTab, setActiveTab] = useState<'IDENTITY' | 'MAPPING'>('MAPPING');
  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [isPromoteModalOpen, setIsPromoteModalOpen] = useState(false);

  const isGenerating = action.isBusy(AUTO_CONFIGURE_KEY);
  const isSaving = action.isBusy(SAVE_KEY);

  const generateConfig = useAction(api.workflowNodeConfig.generateNodeConfig);

  // Adopted during render rather than in an effect, per the React docs on
  // deriving state from props. The sentinel is the pair of ids the form is
  // seeded from — this agent and this canvas node — because Convex and the
  // canvas both hand back new objects for records that have not changed, and
  // keying on those objects re-seeded the editor over whatever was being typed.
  // The platform's default model and the skill bindings arrive from their own
  // queries, which can land after the agent does, so the seed waits for them as
  // the agent settings screen waits: seeding without them meant a second seed a
  // moment later that threw away anything typed in between.
  const seedKey = agent && node ? `${agent._id}:${node.id}` : null;
  const seedInputsReady =
    (Boolean(agent?.modelId) || activeModelsData !== undefined)
    && existingSkillBindingsData !== undefined;

  const [seenSeedKey, setSeenSeedKey] = useState<string | null>(null);

  if (agent && node && seedInputsReady && seenSeedKey !== seedKey) {
    const bindingSkillIds = existingSkillBindings.map((row) => row.skill._id);
    const nodeSkillIds = node.data?._skillIds ?? [];
    setSeenSeedKey(seedKey);
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
      temperature: agent.temperature ?? 1.0,
      _inputMapping: typeof node.data?._inputMapping === 'object' ? JSON.stringify(node.data._inputMapping, null, 2) : node.data?._inputMapping || "",
      _inputTemplate: node.data?._inputTemplate || "",
      _inputFields: agent.inputSchema ? deriveCSVFromSchema(agent.inputSchema) : "",
      _outputFields: agent.outputSchema ? deriveCSVFromSchema(agent.outputSchema) : "",
      selectedSkillIds: Array.from(new Set([...bindingSkillIds, ...nodeSkillIds])),
    });
  }

  const createSchemaFromCSV = (csv: string) => {
    const fields = csv.split(',').map(f => f.trim()).filter(Boolean);
    if (fields.length === 0) return "";
    const properties: Record<string, { type: "string" }> = {};
    fields.forEach(f => properties[f] = { type: "string" });
    return JSON.stringify({ type: "object", properties }, null, 2);
  };

  const selectedSkillNames = useMemo(() => {
    const nameById = new Map<string, string>();
    for (const skill of activeSkills) nameById.set(skill._id, skill.name);
    for (const row of existingSkillBindings) nameById.set(row.skill._id, row.skill.name);
    return formData.selectedSkillIds.map((skillId) => nameById.get(skillId)).filter((name): name is string => Boolean(name));
  }, [activeSkills, existingSkillBindings, formData.selectedSkillIds]);

  const toggleSkill = (skillId: Id<"agentSkills">) => {
    setFormData((current) => ({
      ...current,
      selectedSkillIds: current.selectedSkillIds.includes(skillId)
        ? current.selectedSkillIds.filter((id) => id !== skillId)
        : [...current.selectedSkillIds, skillId],
    }));
  };

  const handleAutoConfigure = async () => {
	    if (!node) return;
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

    const result = outcome.data;
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
  };

  const handleSave = async (e: React.FormEvent) => {
	    e.preventDefault();
	    if (!node) return;
    setFeedbackMessage("");

    const outcome = await action.run(
      async () => {
        let targetAgentId = agentId;
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
          temperature: parseFloat(String(formData.temperature)),
        });

        for (const skillId of formData.selectedSkillIds) {
          await bindSkillToAgent({
            agentId: targetAgentId,
            skillId,
            isEnabled: true,
            seedEvalFixtures: false,
          });
        }
        const selectedSkillIdSet = new Set(formData.selectedSkillIds);
        for (const row of existingSkillBindings) {
          if (!selectedSkillIdSet.has(row.skill._id)) {
            await unbindSkillFromAgent({ bindingId: row.binding._id });
          }
        }

        return { targetAgentId, generatedInputSchema, generatedOutputSchema };
      },
      { key: SAVE_KEY, suppressErrorToast: true, fallbackMessage: tAlerts('saveAgentFailed') },
    );

    if (!outcome.ok) {
      if (outcome.message) setFeedbackMessage(outcome.message);
      return;
    }

    let parsedMapping = formData._inputMapping;
    if (parsedMapping) {
      try { parsedMapping = JSON.parse(parsedMapping); } catch {}
    }

    // Update the visual node on the canvas too
    onUpdateNode(node.id, {
      ...node.data,
      label: formData.name,
      inputSchema: outcome.data.generatedInputSchema,
      outputSchema: outcome.data.generatedOutputSchema,
      modelId: formData.modelSelectionMode === "override" ? formData.modelId : defaultModelId,
      _agentId: outcome.data.targetAgentId,
      _inputMapping: parsedMapping,
      _inputTemplate: formData._inputTemplate,
      _skillIds: formData.selectedSkillIds,
      _skillNames: selectedSkillNames,
    });

    onClose();
	  };

	  const handlePromote = async () => {
	    if (!agent) return;
    const outcome = await action.run(() => promoteToGlobal({ id: agent._id }), {
      key: PROMOTE_KEY,
      suppressErrorToast: true,
      fallbackMessage: tAlerts('promoteFailed'),
    });

    if (outcome.ok) {
      onClose();
      return;
    }
    if (outcome.message) {
      setIsPromoteModalOpen(false);
      setFeedbackMessage(outcome.message);
    }
	  };

  if (!node) return null;
  const isLoading = Boolean(agentId) && (agent === undefined || !seedInputsReady);

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

	          {/* Tabs — both raw on purpose: active-underline tabs, not a Button
	              variant's recipe. */}
          <div className="flex border-b border-border-dim mb-2 w-full max-w-[400px]">
             <button
                type="button"
                onClick={() => setActiveTab('MAPPING')}
                className={`flex-1 py-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'MAPPING' ? 'border-brand text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
             >
                <Wand2 className="w-4 h-4" /> {t('tabs.aiConfiguration')}
             </button>
             <button
                type="button"
                onClick={() => setActiveTab('IDENTITY')}
                className={`flex-1 py-3 px-4 font-semibold text-sm transition-all border-b-2 flex items-center justify-center gap-2 ${activeTab === 'IDENTITY' ? 'border-brand text-foreground' : 'border-transparent text-muted hover:text-foreground'}`}
             >
                <Bot className="w-4 h-4" /> {t('tabs.advancedEngine')}
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
                    <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('variables.inputLabel')}</label>
                    <textarea
                      value={formData._inputFields !== undefined ? formData._inputFields : formData.inputSchema || ""}
                      onChange={e => setFormData({ ...formData, _inputFields: e.target.value })}
                      rows={2}
                      className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none"
                      placeholder={t('variables.inputPlaceholder')}
                    />
                    <span className="text-[10px] text-muted">{t('variables.inputHint', { platformName })}</span>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">{t('variables.outputLabel')}</label>
                    <textarea
                      value={formData._outputFields !== undefined ? formData._outputFields : formData.outputSchema || ""}
                      onChange={e => setFormData({ ...formData, _outputFields: e.target.value })}
                      rows={2}
                      className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none"
                      placeholder={t('variables.outputPlaceholder')}
                    />
                    <span className="text-[10px] text-muted">{t('variables.outputHint', { platformName })}</span>
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
                        {/* Raw on purpose: a selected/unselected segment of the
                            effort picker — no Button variant is a segment. */}
                        {([
                          { value: "LOW", label: t('effort.low') },
                          { value: "MEDIUM", label: t('effort.medium') },
                          { value: "HIGH", label: t('effort.high') },
                        ] as const).map(({ value: level, label }) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setFormData({ ...formData, reasoningEffort: level })}
                            className={`flex-1 py-1.5 rounded-[6px] text-[11px] font-medium transition-all ${formData.reasoningEffort === level
                              ? 'bg-brand/20 text-brand border border-brand/50'
                              : 'bg-sidebar border border-border-dim text-secondary hover:text-foreground hover:bg-foreground/5'
                              }`}
                          >
                            {label}
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

                <div className="flex flex-col gap-3 p-4 border border-border-dim bg-background/50 rounded-[12px]">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-foreground flex items-center gap-1.5">
                        <BrainCircuit className="w-3.5 h-3.5" /> {t('skills.label')}
                      </span>
                      <span className="text-[11px] text-muted leading-tight">{t('skills.selectedCount', { count: formData.selectedSkillIds.length })}</span>
                    </div>
                  </div>
                  <div className="max-h-[220px] overflow-y-auto custom-scrollbar flex flex-col gap-2 pr-1">
                    {activeSkills.length === 0 ? (
                      <p className="rounded-[8px] border border-border-dim bg-card/60 px-3 py-2 text-[12px] text-secondary">
                        {t('skills.empty')}
                      </p>
                    ) : activeSkills.map((skill) => {
                      const isSelected = formData.selectedSkillIds.includes(skill._id);
                      return (
                        <label
                          key={skill._id}
                          className={`flex cursor-pointer items-start gap-3 rounded-[8px] border px-3 py-2 transition-colors ${
                            isSelected
                              ? "border-brand/40 bg-brand/10"
                              : "border-border-dim bg-card/60 hover:border-border"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSkill(skill._id)}
                            className="mt-0.5 h-4 w-4 rounded border-border-dim accent-brand"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-[12px] font-semibold text-foreground">{skill.name}</span>
                              <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{t('skills.risk', { level: skill.riskLevel.toLowerCase() })}</span>
                            </span>
                            <span className="mt-0.5 block line-clamp-2 text-[11px] text-secondary">{skill.description || t('skills.noDescription')}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                  <span className="text-[11px] text-muted leading-tight">
                    {t('skills.bindHint')}
                  </span>
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
                  {/* Both raw on purpose: halves of a segmented mode toggle. */}
                  <button type="button" onClick={() => setIsDeveloperMode(false)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${!isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>{t('mapping.standardTab')}</button>
                  <button type="button" onClick={() => setIsDeveloperMode(true)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>{t('mapping.developerTab')}</button>
                </div>

                {!isDeveloperMode ? (
                  <div className="flex flex-col gap-3 border border-border-dim bg-sidebar/50 p-6 rounded-[16px] relative overflow-hidden">
                     <label className="text-sm font-semibold text-foreground flex items-center gap-2">
                        <Wand2 className="w-4 h-4" /> {t('mapping.autoTitle')}
                     </label>
                     <p className="text-[13px] text-muted leading-relaxed">
                        {t('mapping.autoDescription')}
                     </p>
                     <textarea
                       value={aiPrompt}
                       onChange={(e) => setAiPrompt(e.target.value)}
                       placeholder={t('mapping.autoPlaceholder')}
                       className="w-full bg-background border border-border-dim rounded-[12px] p-4 text-sm focus:border-brand/50 outline-none resize-none min-h-[120px] shadow-inner mt-2"
                     />
                     <Button
                       variant="primary"
                       disabled={isGenerating || !aiPrompt.trim()}
                       onClick={handleAutoConfigure}
                       className="w-full mt-2 py-3 rounded-[12px] font-semibold shadow-foreground/20 flex items-center justify-center gap-2"
                     >
                       {isGenerating ? <><Loader2 className="w-4 h-4 animate-spin" /> {tDesigner('analyzing')}</> : <><Wand2 className="w-4 h-4" /> {t('mapping.autoConfigure')}</>}
                     </Button>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-col gap-2">
                      <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Database className="w-4 h-4" /> {t('mapping.jsonLabel')}
                      </label>
                      <textarea
                        value={formData._inputMapping}
                        onChange={(e) => setFormData({ ...formData, _inputMapping: e.target.value })}
                        rows={10}
                        className="w-full px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[12px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                        placeholder='{&#10;  "textToAnalyze": "{{nodes.triggerNode-123.output.emailBody}}"&#10;}'
                      />
                      <span className="text-[11px] text-muted leading-tight mt-1">
                        {t.rich('mapping.jsonHint', {
                          syntax: () => <code className="text-brand">{"{{nodes.id.output}}"}</code>,
                          strong: (chunks) => <strong className="text-foreground">{chunks}</strong>,
                        })}
                      </span>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                      <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                        <Code2 className="w-4 h-4" /> {t('mapping.templateLabel')}
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
	                // Raw on purpose: an outline that floods solid brand on hover —
	                // `outline` never fills and `accent` stays a tinted chip, so no variant is this.
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
              <Button
                variant="ghost"
                onClick={onClose}
                className="rounded-[10px] text-sm hover:bg-foreground/5"
              >
                {tCommon('cancel')}
              </Button>
              <Button variant="primary" type="submit" disabled={isSaving} className="shadow-md">
                {isSaving ? tCommon('saving') : (agent?.isGlobal ? tCommon('save') : t('save'))}
              </Button>
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
            <Button
              variant="ghost"
              onClick={() => setIsPromoteModalOpen(false)}
              className="rounded-[10px]"
            >
              {tCommon('cancel')}
            </Button>
            {/* Raw on purpose: a brand fill with brand-foreground text —
                `brand` wears plain white, so no variant is this. */}
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
