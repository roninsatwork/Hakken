import { useState, useEffect } from "react";
import { X, Save, Database, Code2, Wand2, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useTranslations } from "next-intl";
import { useAction } from "convex/react";
import { api } from "@/convex/_generated/api";

export function ConfigDrawer({ node, allNodes = [], onClose, onUpdateNode }: any) {
  const tCommon = useTranslations('common');
  const [formData, setFormData] = useState<any>({
    label: "",
    _inputMapping: "",
    _inputTemplate: "",
  });

  const [isDeveloperMode, setIsDeveloperMode] = useState(false);
  const [aiPrompt, setAiPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const generateConfig = useAction(api.ai.generateNodeConfig);

  useEffect(() => {
    if (node) {
      setFormData({
        label: node.data?.label || "",
        _inputMapping: typeof node.data?._inputMapping === 'object' ? JSON.stringify(node.data._inputMapping, null, 2) : node.data?._inputMapping || "",
        _inputTemplate: node.data?._inputTemplate || "",
      });
    }
  }, [node]);

  if (!node) return null;

  const handleAutoConfigure = async () => {
    if (!aiPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    try {
      const result = await generateConfig({
        prompt: aiPrompt,
        nodeType: node.type,
        availableNodes: allNodes.filter((n: any) => n.id !== node.id).map((n: any) => ({
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
    } catch (e) {
      alert("AI Configuration failed. Please try again or construct the payload manually.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    let parsedMapping = formData._inputMapping;
    if (parsedMapping) {
      try { parsedMapping = JSON.parse(parsedMapping); } catch(e) {}
    }
    
    onUpdateNode(node.id, {
      ...node.data,
      label: formData.label,
      _inputMapping: parsedMapping,
      _inputTemplate: formData._inputTemplate,
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
        
        <div className="flex bg-sidebar/50 p-1 rounded-xl border border-border-dim mb-6">
          <button type="button" onClick={() => setIsDeveloperMode(false)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${!isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>🪄 Standard</button>
          <button type="button" onClick={() => setIsDeveloperMode(true)} className={`flex-1 text-xs py-2 rounded-lg font-medium transition-all ${isDeveloperMode ? 'bg-background shadow-sm text-foreground' : 'text-muted hover:text-foreground'}`}>⚡️ Developer</button>
        </div>

        <form id="configForm" onSubmit={handleSave} className="flex flex-col gap-6">
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

          {!isDeveloperMode ? (
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
          ) : (
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
