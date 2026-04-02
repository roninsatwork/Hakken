import { useEffect, useState } from "react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Bot, BrainCircuit, Globe, Key, Settings2 } from "lucide-react";

export function AgentEditorModal({ node, onClose, onUpdateNode }: any) {
  const agentId = node?.data?._agentId;
  const agent = useQuery(api.agents.get, agentId ? { id: agentId } : "skip");
  const updateAgent = useMutation(api.agents.updateAgent);
  const promoteToGlobal = useMutation((api as any).agents.promoteToGlobal);

  const [formData, setFormData] = useState<any>({
    name: "",
    systemPrompt: "",
    inputSchema: "",
    outputSchema: "",
    modelId: "gemini-3.1-pro-preview",
    thinkingMode: false,
    reasoningEffort: "MEDIUM",
    allowInternetAccess: false,
    humanApprovalRequired: false,
    temperature: 1.0,
  });
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (agent) {
      setFormData({
        name: agent.name || "",
        systemPrompt: agent.systemPrompt || "",
        inputSchema: agent.inputSchema || "",
        outputSchema: agent.outputSchema || "",
        modelId: agent.modelId || "gemini-3.1-pro-preview",
        thinkingMode: agent.thinkingMode || false,
        reasoningEffort: agent.reasoningEffort || "MEDIUM",
        allowInternetAccess: agent.allowInternetAccess || false,
        humanApprovalRequired: agent.humanApprovalRequired || false,
        temperature: agent.temperature ?? 1.0,
      });
    }
  }, [agent]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent) return;
    setIsSaving(true);
    try {
      await updateAgent({
        id: agent._id,
        name: formData.name,
        systemPrompt: formData.systemPrompt,
        inputSchema: formData.inputSchema,
        outputSchema: formData.outputSchema,
        modelId: formData.modelId,
        thinkingMode: formData.thinkingMode,
        reasoningEffort: formData.reasoningEffort,
        allowInternetAccess: formData.allowInternetAccess,
        humanApprovalRequired: formData.humanApprovalRequired,
        temperature: parseFloat(formData.temperature),
      });

      // Update the visual node on the canvas too
      onUpdateNode(node.id, {
        ...node.data,
        label: formData.name,
        inputSchema: formData.inputSchema,
        outputSchema: formData.outputSchema,
        modelId: formData.modelId,
      });

      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to save agent config");
    } finally {
      setIsSaving(false);
    }
  };

  const handlePromote = async () => {
    if (!agent || !confirm("Promote this agent to the global library? It will be available for all workflows.")) return;
    try {
      await promoteToGlobal({ id: agent._id });
      alert("Promoted to Global Agent successfully!");
      onClose();
    } catch (err: any) {
      alert(err.message || "Failed to promote agent");
    }
  };

  if (!node) return null;

  return (
    <SonaeModal size="xl" isOpen={!!node} onClose={onClose} title={formData.name || "Configure Agent"}>
      {!agent ? (
        <div className="py-8 text-center text-muted text-sm border border-border-dim rounded-[12px]">Loading agent config...</div>
      ) : (
        <form onSubmit={handleSave} className="flex flex-col gap-6">
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left Column: Core Identity & Instructions */}
            <div className="md:col-span-3 flex flex-col gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Bot className="w-4 h-4" /> Agent Identity
                </label>
                <input 
                  type="text" 
                  required
                  value={formData.name || ""}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                  placeholder="E.g., Document Analyzer"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Key className="w-4 h-4" /> System Core Directives
                </label>
                <textarea 
                  value={formData.systemPrompt || ""}
                  onChange={e => setFormData({...formData, systemPrompt: e.target.value})}
                  rows={8}
                  className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono"
                  placeholder="You are an autonomous expert analyst... Your goal is to..."
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Input Schema (JSON)</label>
                  <textarea 
                    value={formData.inputSchema || ""}
                    onChange={e => setFormData({...formData, inputSchema: e.target.value})}
                    rows={6}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[11px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono tracking-wider"
                    placeholder='{"type": "object", "properties": {"text": {"type": "string"}}}'
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[12px] font-medium text-secondary uppercase tracking-wider">Output Schema (JSON)</label>
                  <textarea 
                    value={formData.outputSchema || ""}
                    onChange={e => setFormData({...formData, outputSchema: e.target.value})}
                    rows={6}
                    className="px-4 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-[11px] outline-none focus:border-brand/50 custom-scrollbar resize-none font-mono tracking-wider"
                    placeholder='{"type": "object", "properties": {"summary": {"type": "string"}}}'
                  />
                </div>
              </div>
            </div>

            {/* Right Column: Engine & Tools */}
            <div className="min-w-0 flex flex-col gap-6">
              
              <div className="flex flex-col gap-2">
                <label className="text-[12px] font-medium text-secondary uppercase tracking-wider flex items-center gap-2">
                  <Settings2 className="w-4 h-4" /> Cognitive Engine
                </label>
                <select
                  value={formData.modelId}
                  onChange={e => setFormData({...formData, modelId: e.target.value})}
                  className="px-3 py-3 bg-background border border-border-dim rounded-[12px] text-foreground text-sm outline-none focus:border-brand/50"
                >
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro</option>
                  <option value="gemini-3.1-flash-lite-preview">Gemini 3.1 Flash Lite</option>
                  <option value="gemini-2.0-flash-exp">Gemini 2.0 Flash</option>
                </select>
              </div>

              <div className="flex flex-col gap-3 p-4 border border-border-dim bg-background/50 rounded-[12px]">
                <label className="flex items-center gap-3 cursor-pointer group">
                  <input 
                    type="checkbox" 
                    checked={formData.thinkingMode}
                    onChange={e => setFormData({...formData, thinkingMode: e.target.checked})}
                    className="w-4 h-4 rounded appearance-none border border-border-dim bg-card checked:bg-brand checked:border-brand transition-all flex items-center justify-center after:content-['✓'] after:text-background after:text-[10px] after:opacity-0 checked:after:opacity-100"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground group-hover:text-brand transition-colors flex items-center gap-1.5"><BrainCircuit className="w-3.5 h-3.5" /> Deep Thinking</span>
                    <span className="text-[11px] text-muted leading-tight">Use invisible reasoning blocks before returning output.</span>
                  </div>
                </label>
                {formData.thinkingMode && (
                  <div className="pl-7 pt-2 border-t border-border-dim/50 mt-1 flex flex-col gap-2">
                    <span className="text-[10px] uppercase tracking-widest text-muted">Reasoning Effort</span>
                    <div className="flex gap-2">
                      {["LOW", "MEDIUM", "HIGH"].map(level => (
                        <button
                          key={level}
                          type="button"
                          onClick={() => setFormData({...formData, reasoningEffort: level})}
                          className={`flex-1 py-1.5 rounded-[6px] text-[11px] font-medium transition-all ${
                            formData.reasoningEffort === level 
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
                    onChange={e => setFormData({...formData, allowInternetAccess: e.target.checked})}
                    className="w-4 h-4 rounded appearance-none border border-border-dim bg-card checked:bg-brand checked:border-brand transition-all flex items-center justify-center after:content-['✓'] after:text-background after:text-[10px] after:opacity-0 checked:after:opacity-100"
                  />
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-foreground group-hover:text-brand transition-colors flex items-center gap-1.5"><Globe className="w-3.5 h-3.5" /> Google Search</span>
                    <span className="text-[11px] text-muted leading-tight">Allow live internet retrieval during processing.</span>
                  </div>
                </label>
              </div>

              <div className="flex flex-col gap-2 p-4 border border-border-dim bg-background/50 rounded-[12px]">
                <div className="flex justify-between items-center w-full">
                  <span className="text-sm font-medium text-foreground">Temperature: {Number(formData.temperature).toFixed(1)}</span>
                </div>
                <input 
                  type="range" 
                  min="0" max="2" step="0.1" 
                  value={formData.temperature}
                  onChange={e => setFormData({...formData, temperature: e.target.value})}
                  className="w-full accent-brand bg-card rounded-lg appearance-none h-1"
                />
                <span className="text-[11px] text-muted leading-tight mt-1">
                  0 for strict adherence, 2 for max variance.
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row justify-between items-center mt-4 pt-6 border-t border-border-dim gap-4">
            <div>
              {agent.isGlobal === false && (
                <button 
                  type="button" 
                  onClick={handlePromote}
                  className="px-4 py-2 rounded-[10px] text-brand hover:text-brand-foreground hover:bg-brand transition-all text-[12px] font-medium border border-brand/20 shadow-sm shadow-brand/10 w-full sm:w-auto"
                >
                  Promote to Global Pattern
                </button>
              )}
            </div>
            
            <div className="flex gap-3 w-full sm:w-auto justify-end">
              <button 
                type="button" 
                onClick={onClose}
                className="px-5 py-2.5 rounded-[10px] text-secondary hover:text-foreground hover:bg-foreground/5 transition-all text-sm font-medium"
              >
                Cancel
              </button>
              <button 
                type="submit"
                disabled={isSaving}
                className="px-6 py-2.5 rounded-[10px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-md shadow-foreground/10 text-sm disabled:opacity-50"
              >
                {isSaving ? "Saving..." : "Save Graph Parameters"}
              </button>
            </div>
          </div>
        </form>
      )}
    </SonaeModal>
  );
}
