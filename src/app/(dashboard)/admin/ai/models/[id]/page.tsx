"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, Loader2, Save, Settings2, Zap, Database, Cpu, Layers, Tags } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";

function formatTag(value: string) {
  return value
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatProviderName(providerKey?: string) {
  if (!providerKey) return "Unclassified";
  if (providerKey === "google") return "Google Vertex AI";
  if (providerKey === "openai") return "OpenAI";
  if (providerKey === "anthropic") return "Anthropic";
  return providerKey;
}

function formatNumber(value?: number) {
  if (value === undefined) return "Not recorded";
  return new Intl.NumberFormat("en-GB").format(value);
}

function formatTokenCount(value?: number) {
  if (value === undefined) return "Not recorded";
  return `${formatNumber(value)} tokens`;
}

function formatDate(value?: number) {
  if (!value) return "Not recorded";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function MetadataValue({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      <p className="break-words text-[13px] font-medium text-foreground">{value}</p>
    </div>
  );
}

function TagList({ label, values, emptyLabel }: { label: string; values?: string[]; emptyLabel: string }) {
  return (
    <div>
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted">{label}</p>
      {values && values.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {values.map((value) => (
            <span
              key={value}
              className="rounded-[6px] border border-border-dim bg-foreground/5 px-2 py-1 text-[10px] font-bold uppercase tracking-[0.1em] text-secondary"
            >
              {formatTag(value)}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[13px] font-medium text-muted">{emptyLabel}</p>
      )}
    </div>
  );
}

export default function ModelPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const modelId = resolvedParams.id as Id<"aiModels">;

  const model = useQuery(api.aiModels.getModel, { modelId });
  const updatePricing = useMutation(api.aiModels.updatePricingConfig);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  
  // Form State
  const [friendlyName, setFriendlyName] = useState("");
  const [standardBelow, setStandardBelow] = useState("");
  const [standardAbove, setStandardAbove] = useState("");
  const [cachedBelow, setCachedBelow] = useState("");
  const [cachedAbove, setCachedAbove] = useState("");
  const [outputResponse, setOutputResponse] = useState("");
  const [outputReasoning, setOutputReasoning] = useState("");

  // Sync state
  useEffect(() => {
    if (model) {
      setFriendlyName(model.friendlyName || "");
      setStandardBelow(model.standardInputCostBelow200k?.toString() || "");
      setStandardAbove(model.standardInputCostAbove200k?.toString() || "");
      setCachedBelow(model.cachedInputCostBelow200k?.toString() || "");
      setCachedAbove(model.cachedInputCostAbove200k?.toString() || "");
      setOutputResponse(model.outputResponseCost?.toString() || "");
      setOutputReasoning(model.outputReasoningCost?.toString() || "");
    }
  }, [model]);

  const handleSave = async () => {
    setIsSaving(true);
    setSaveError("");
    try {
      await updatePricing({
        modelId,
        friendlyName: friendlyName || undefined,
        standardInputCostBelow200k: standardBelow ? parseFloat(standardBelow) : 0,
        standardInputCostAbove200k: standardAbove ? parseFloat(standardAbove) : 0,
        cachedInputCostBelow200k: cachedBelow ? parseFloat(cachedBelow) : 0,
        cachedInputCostAbove200k: cachedAbove ? parseFloat(cachedAbove) : 0,
        outputResponseCost: outputResponse ? parseFloat(outputResponse) : 0,
        outputReasoningCost: outputReasoning ? parseFloat(outputReasoning) : 0,
      });
      router.back();
    } catch (e) {
      console.error(e);
      setSaveError("Failed to save pricing configuration.");
    } finally {
      setIsSaving(false);
    }
  };

  if (model === undefined) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;
  }

  if (model === null) {
    return <div className="py-24 text-center">Model not found.</div>;
  }

  return (
    <div className="flex flex-col gap-6 w-full h-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim pb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.back()}
            className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-full border border-border-dim bg-sidebar/40 hover:bg-foreground/5 transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-secondary" />
          </button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              {model.displayName} Configuration
            </h1>
            <div className="flex items-center gap-2 mt-1 text-[13px] font-mono tracking-wide">
              <span className="text-secondary">{model.modelId}</span>
              <span className="text-muted">•</span>
              <span className={cn(
                "font-bold px-2 py-0.5 rounded-full uppercase tracking-wider text-[10px]",
                model.isEnabled ? "text-[#10b981] bg-[#10b981]/10" : "text-muted bg-foreground/5"
              )}>
                {model.isEnabled ? "ACTIVE" : "DISABLED"}
              </span>
            </div>
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="h-10 px-6 rounded-full bg-foreground text-background font-medium text-[13px] tracking-wide flex items-center gap-2 hover:opacity-90 transition-all shadow-sm disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          SAVE PRICING CONFIGURATION
        </button>
	      </div>
      <AdminSaveError>{saveError}</AdminSaveError>

	      <div className="flex flex-col gap-6">
        
        {/* General Information */}
        <section className="bg-sidebar/40 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="p-5 border-b border-border-dim/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-brand/10 flex items-center justify-center">
              <Settings2 className="w-4 h-4 text-brand" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">General Information</h3>
              <p className="text-[12px] text-secondary">Basic configuration and display settings.</p>
            </div>
          </div>
          <div className="p-6">
            <div className="max-w-xl">
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Friendly Name</label>
              <input 
                type="text" 
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="e.g. 3.1 Pro"
                className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] px-4 text-[14px] text-foreground focus:outline-none focus:border-brand/50 transition-colors"
              />
              <p className="text-[12px] text-muted mt-2">A short, user-friendly name displayed in toolbars and chat.</p>
            </div>
          </div>
        </section>

        {/* Provider Metadata */}
        <section className="bg-sidebar/40 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="p-5 border-b border-border-dim/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center">
              <Layers className="w-4 h-4 text-emerald-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">Provider Metadata</h3>
              <p className="text-[12px] text-secondary">Read-only catalogue details used by model selection, defaults, and analytics.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6 p-6 lg:grid-cols-2">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <MetadataValue label="Provider" value={formatProviderName(model.providerKey)} />
              <MetadataValue label="Provider Model ID" value={model.providerModelId || model.modelId} />
              <MetadataValue label="Internal Model ID" value={model.modelId} />
              <MetadataValue label="Catalogue Status" value={model.status ? formatTag(model.status) : model.isEnabled ? "Available" : "Disabled"} />
              <MetadataValue label="Context Window" value={formatTokenCount(model.contextWindowTokens)} />
              <MetadataValue label="Max Output" value={formatTokenCount(model.maxOutputTokens)} />
              <MetadataValue label="Last Synced" value={formatDate(model.lastSyncedAt)} />
              <MetadataValue label="Pricing Source" value={model.pricingSource || "Manual"} />
            </div>
            <div className="flex flex-col gap-5">
              <TagList label="Capabilities" values={model.capabilities} emptyLabel="No capabilities recorded yet." />
              <TagList label="Supported Use Cases" values={model.supportedUseCases} emptyLabel="Uses legacy default compatibility." />
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <MetadataValue label="Input Unit" value={model.inputTokenUnit || "Per 1M tokens"} />
                <MetadataValue label="Output Unit" value={model.outputTokenUnit || "Per 1M tokens"} />
                <MetadataValue label="Currency" value={model.currency || "USD"} />
                <MetadataValue label="Pricing Effective" value={formatDate(model.pricingEffectiveAt)} />
              </div>
            </div>
          </div>
        </section>

        {/* Capability Summary */}
        <section className="bg-sidebar/40 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="p-5 border-b border-border-dim/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-purple-500/10 flex items-center justify-center">
              <Tags className="w-4 h-4 text-purple-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">Selection Summary</h3>
              <p className="text-[12px] text-secondary">How this model can appear in platform, company, agent, and workflow selectors.</p>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 p-6 sm:grid-cols-3">
            <MetadataValue label="Availability" value={model.isEnabled ? "Selectable" : "Hidden from selectors"} />
            <MetadataValue label="Legacy Default" value={model.isDefault ? "Yes" : "No"} />
            <MetadataValue label="Display Name" value={model.friendlyName || model.displayName} />
          </div>
        </section>

        {/* Standard Input */}
        <section className="bg-sidebar/40 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="p-5 border-b border-border-dim/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-orange-500/10 flex items-center justify-center">
              <Zap className="w-4 h-4 text-orange-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">Standard Input (Text, Image, Video, Audio)</h3>
              <p className="text-[12px] text-secondary">Price per 1M tokens processed by the model initially.</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Cost ≤ 200K Context</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">$</span>
                <input 
                  type="number"
                  step="0.01" 
                  value={standardBelow}
                  onChange={(e) => setStandardBelow(e.target.value)}
                  className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] pl-8 pr-4 text-[14px] text-foreground font-mono focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Cost &gt; 200K Context</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">$</span>
                <input 
                  type="number"
                  step="0.01" 
                  value={standardAbove}
                  onChange={(e) => setStandardAbove(e.target.value)}
                  className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] pl-8 pr-4 text-[14px] text-foreground font-mono focus:outline-none focus:border-orange-500/50 transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Cached Input */}
        <section className="bg-sidebar/40 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="p-5 border-b border-border-dim/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-blue-500/10 flex items-center justify-center">
              <Database className="w-4 h-4 text-blue-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">Cached Input</h3>
              <p className="text-[12px] text-secondary">Discounted price per 1M cached input tokens when the provider supports caching.</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Cached Cost ≤ 200K Context</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">$</span>
                <input 
                  type="number"
                  step="0.01" 
                  value={cachedBelow}
                  onChange={(e) => setCachedBelow(e.target.value)}
                  className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] pl-8 pr-4 text-[14px] text-foreground font-mono focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Cached Cost &gt; 200K Context</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">$</span>
                <input 
                  type="number"
                  step="0.01" 
                  value={cachedAbove}
                  onChange={(e) => setCachedAbove(e.target.value)}
                  className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] pl-8 pr-4 text-[14px] text-foreground font-mono focus:outline-none focus:border-blue-500/50 transition-colors"
                />
              </div>
            </div>
          </div>
        </section>

        {/* Generated Output */}
        <section className="bg-sidebar/40 border border-border-dim rounded-[16px] overflow-hidden">
          <div className="p-5 border-b border-border-dim/50 flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-yellow-500/10 flex items-center justify-center">
              <Cpu className="w-4 h-4 text-yellow-500" />
            </div>
            <div>
              <h3 className="text-[14px] font-bold text-foreground">Generated Output</h3>
              <p className="text-[12px] text-secondary">Price per 1M tokens generated by the model.</p>
            </div>
          </div>
          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div>
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Cost per 1M Response Tokens</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">$</span>
                <input 
                  type="number"
                  step="0.01" 
                  value={outputResponse}
                  onChange={(e) => setOutputResponse(e.target.value)}
                  className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] pl-8 pr-4 text-[14px] text-foreground font-mono focus:outline-none focus:border-yellow-500/50 transition-colors"
                />
              </div>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-secondary uppercase tracking-widest mb-2">Cost per 1M Reasoning Tokens</label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary font-mono">$</span>
                <input 
                  type="number"
                  step="0.01" 
                  value={outputReasoning}
                  onChange={(e) => setOutputReasoning(e.target.value)}
                  className="w-full h-11 bg-background/50 border border-border-dim rounded-[8px] pl-8 pr-4 text-[14px] text-foreground font-mono focus:outline-none focus:border-yellow-500/50 transition-colors"
                />
              </div>
              <p className="text-[11px] text-muted mt-2">For models with thinking/reasoning modes.</p>
            </div>
          </div>
        </section>

      </div>
    </div>
  );
}
