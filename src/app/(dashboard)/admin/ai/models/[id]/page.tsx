"use client";

import { useState, useEffect, use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, ChevronDown, Loader2, Save } from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";
import {
  buildDefaultJobsByModelId,
  formatModelTag,
  getProviderDisplayName,
} from "../_components/modelAdminUtils";

function formatDate(value?: number) {
  if (!value) return "never";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

/**
 * A price field, in the unit the provider publishes.
 *
 * Every rate on this page is dollars per million tokens. That was previously
 * said once in a section subtitle and then contradicted by a bare "$" beside a
 * field called "Cost ≤ 200K Context", which reads as a total rather than a rate.
 */
function PriceField({
  hint,
  label,
  onChange,
  value,
}: {
  hint?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <div>
      {/* The dollar sign that used to sit inside the box has gone: the section
          above already says the prices are in dollars, and a glyph floating
          inside a field is one more thing that has to be positioned by hand. */}
      <Field
        label={label}
        hint={hint}
        type="number"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export default function ModelPricingPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const modelId = resolvedParams.id as Id<"aiModels">;

  const model = useQuery(api.aiModels.getModel, { modelId });
  const providersResult = useQuery(api.aiModels.getProviders);
  const globalDefaultsResult = useQuery(api.aiModels.getGlobalModelDefaults);
  const updatePricing = useMutation(api.aiModels.updatePricingConfig);

  const setDefaultModel = useMutation(api.aiModels.setDefaultModel);

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [showMorePrices, setShowMorePrices] = useState(false);
  const [isDefaultConfirmOpen, setIsDefaultConfirmOpen] = useState(false);
  const [isMakingDefault, setIsMakingDefault] = useState(false);

  const [friendlyName, setFriendlyName] = useState("");
  const [standardBelow, setStandardBelow] = useState("");
  const [standardAbove, setStandardAbove] = useState("");
  const [cachedBelow, setCachedBelow] = useState("");
  const [cachedAbove, setCachedAbove] = useState("");
  const [outputResponse, setOutputResponse] = useState("");

  useEffect(() => {
    if (model) {
      setFriendlyName(model.friendlyName || "");
      setStandardBelow(model.standardInputCostBelow200k?.toString() || "");
      setStandardAbove(model.standardInputCostAbove200k?.toString() || "");
      setCachedBelow(model.cachedInputCostBelow200k?.toString() || "");
      setCachedAbove(model.cachedInputCostAbove200k?.toString() || "");
      setOutputResponse(model.outputResponseCost?.toString() || "");
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
      });
      // Back to the catalogue rather than back through history, which could be
      // anywhere the reader happened to come from.
      router.push("/admin/ai/models/catalogue");
    } catch (e) {
      console.error(e);
      setSaveError("Failed to save this model.");
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

  const providers = Array.isArray(providersResult) ? providersResult : [];
  const providerNameByKey = new Map(providers.map((provider) => [provider.providerKey, provider.displayName]));
  const defaultJobs = buildDefaultJobsByModelId(globalDefaultsResult).get(model.modelId) ?? [];
  const allJobs = globalDefaultsResult?.useCases ?? [];
  // Nothing left to make default if it already handles everything.
  const handlesEveryJob = allJobs.length > 0 && defaultJobs.length === allJobs.length;

  /**
   * Point every job at this model.
   *
   * "The default model" means all ten jobs on this platform — chat, router,
   * title, embedding and the rest — because that is what the underlying action
   * does. It asks first, and names what it is taking over, for the same reason
   * this control is no longer a hover-revealed button on a catalogue row.
   */
  const makeDefault = async () => {
    setIsMakingDefault(true);
    setSaveError("");
    try {
      await setDefaultModel({ modelId });
      setIsDefaultConfirmOpen(false);
    } catch (e) {
      console.error(e);
      setSaveError("Failed to make this the default model.");
    } finally {
      setIsMakingDefault(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full h-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim pb-5">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push("/admin/ai/models/catalogue")}
            aria-label="Back to the model catalogue"
            className="w-10 h-10 flex flex-shrink-0 items-center justify-center rounded-full border border-border-dim bg-sidebar/40 hover:bg-foreground/5 transition-all"
          >
            <ArrowLeft className="w-4 h-4 text-secondary" />
          </button>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
              {model.friendlyName || model.displayName || model.modelId}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-[12px]">
              <span className="font-mono text-secondary">{model.providerModelId || model.modelId}</span>
              <span className="text-muted">·</span>
              <span className={cn("font-medium", model.isEnabled ? "text-[#10b981]" : "text-muted")}>
                {model.isEnabled ? "Active" : "Inactive"}
              </span>
            </div>
          </div>
        </div>
        <WriteButton
          onClick={handleSave}
          disabled={isSaving}
          className="h-10 px-5 rounded-[8px] bg-brand text-white text-[13px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save
        </WriteButton>
      </div>
      <SaveError>{saveError}</SaveError>

      {/* What this model is doing, which is the question the old "Legacy
          Default: Yes" field answered wrongly. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-secondary">
          {defaultJobs.length > 0 ? (
            <>
              This model currently handles{" "}
              <span className="text-foreground font-medium">{defaultJobs.map(formatModelTag).join(", ")}</span>.{" "}
            </>
          ) : (
            <>This model is not handling any job by default. </>
          )}
          <Link href="/admin/ai/models/defaults" className="text-brand hover:underline">
            Change which model handles what
          </Link>
          .
        </p>
        {!handlesEveryJob && (
          <WriteButton
            type="button"
            onClick={() => setIsDefaultConfirmOpen(true)}
            className="h-9 shrink-0 rounded-[8px] border border-border-dim px-4 text-[12px] font-medium text-secondary transition-colors hover:text-foreground"
          >
            Make this the default model
          </WriteButton>
        )}
      </div>

      <section className="border border-border-dim rounded-[8px] bg-card px-5 py-5">
        <h2 className="text-[14px] font-semibold text-foreground">What it is called</h2>
        <p className="text-[12px] text-secondary mt-1 mb-4">
          The short name people see in chat and in model pickers.
        </p>
        {/* The heading above already names this box. */}
        <Field
          label="What it is called"
          labelHidden
          value={friendlyName}
          onChange={(e) => setFriendlyName(e.target.value)}
          placeholder={model.displayName}
          className="max-w-md"
        />
      </section>

      <section className="border border-border-dim rounded-[8px] bg-card px-5 py-5">
        <h2 className="text-[14px] font-semibold text-foreground">What it costs</h2>
        <p className="text-[12px] text-secondary mt-1 mb-4">
          Dollars per million tokens, as the provider publishes them. Without a price we cannot measure
          what this model spends, so agents using it are kept to a smaller budget.
        </p>

        {/* The two anyone actually types. The other four are real and rarely
            touched, so they fold away rather than competing for attention. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <PriceField
            label="Price in"
            value={standardBelow}
            onChange={setStandardBelow}
            hint="What you are charged for the text sent to the model."
          />
          <PriceField
            label="Price out"
            value={outputResponse}
            onChange={setOutputResponse}
            hint="What you are charged for the text it writes back."
          />
        </div>

        <button
          type="button"
          onClick={() => setShowMorePrices((open) => !open)}
          className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-secondary hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", showMorePrices && "rotate-180")} />
          {showMorePrices ? "Fewer prices" : "More prices"}
        </button>

        {showMorePrices && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl border-t border-border-dim pt-4">
            <PriceField
              label="Price in, very long conversations"
              value={standardAbove}
              onChange={setStandardAbove}
              hint="Used instead of Price in once a conversation passes 200,000 tokens."
            />
            <PriceField
              label="Price in, repeated text"
              value={cachedBelow}
              onChange={setCachedBelow}
              hint="The discounted rate when the provider has already seen this text. Falls back to Price in when left empty."
            />
            <PriceField
              label="Price in, repeated text in very long conversations"
              value={cachedAbove}
              onChange={setCachedAbove}
            />
          </div>
        )}
      </section>

      {/* Nine read-only fields became one line. Three of them read "Not
          recorded" on every model, three were constants that never varied, and
          the whole panel restated things already on this page. */}
      <p className="text-[12px] text-muted">
        Supplied by {getProviderDisplayName(model.providerKey, providerNameByKey)} · known internally as{" "}
        <span className="font-mono">{model.modelId}</span> · last synced {formatDate(model.lastSyncedAt)}
      </p>

      <SonaeModal
        isOpen={isDefaultConfirmOpen}
        onClose={() => setIsDefaultConfirmOpen(false)}
        title="Make this the default model"
        size="sm"
      >
        <div className="flex flex-col gap-5 px-1 pb-2">
          <p className="text-[13px] leading-relaxed text-secondary">
            <span className="font-semibold text-foreground">
              {model.friendlyName || model.displayName || model.modelId}
            </span>{" "}
            will handle every job, replacing whatever is set for each of them:
          </p>
          <p className="text-[12px] leading-relaxed text-muted">
            {allJobs.map(formatModelTag).join(", ")}.
          </p>
          <p className="text-[12px] leading-relaxed text-secondary">
            Turning documents into something searchable needs an embedding model, so check this one
            can do that job before making it the default for all of them. Companies, agents and
            workflows can still override any of this.
            {!model.isEnabled && " This will also switch the model on."}
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsDefaultConfirmOpen(false)}
              className="h-10 px-4 rounded-[8px] border border-border-dim text-[13px] text-secondary hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={makeDefault}
              disabled={isMakingDefault}
              className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-2"
            >
              {isMakingDefault && <Loader2 className="w-4 h-4 animate-spin" />}
              Make it the default
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
