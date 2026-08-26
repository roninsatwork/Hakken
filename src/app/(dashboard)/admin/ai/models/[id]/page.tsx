"use client";

import { lazy, Suspense, use, useEffect, useState } from "react";
import { formatDateTime } from "@/src/lib/dates";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, ChevronDown, Loader2, Save } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { cn } from "@/src/ui/lib/utils";
import { Button } from "@/src/ui/components/screens/Button";
import { SaveError } from "@/src/ui/components/screens/SaveControls";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field } from "@/src/ui/components/screens/Field";
import {
  buildDefaultJobsByModelId,
  formatModelTag,
  getProviderDisplayName,
} from "../_components/modelAdminUtils";

const DefaultModelConfirmation = lazy(() => import("./DefaultModelConfirmation"));

function formatSyncDate(value: number | undefined, locale: string, neverLabel: string) {
  if (!value) return neverLabel;
  return formatDateTime(value, {
    locale,
    options: { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" },
  });
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
  const t = useTranslations("ai.models.detail");
  const tShared = useTranslations("ai.models.shared");
  const locale = useLocale();
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
  const [hasDefaultModalActivated, setHasDefaultModalActivated] = useState(false);
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
      setSaveError(t("saveFailed"));
    } finally {
      setIsSaving(false);
    }
  };

  if (model === undefined) {
    return <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>;
  }

  if (model === null) {
    return <div className="py-24 text-center">{t("notFound")}</div>;
  }

  const providers = Array.isArray(providersResult) ? providersResult : [];
  const providerNameByKey = new Map(providers.map((provider) => [provider.providerKey, provider.displayName]));
  const defaultJobs = buildDefaultJobsByModelId(globalDefaultsResult).get(model.modelId) ?? [];
  const allJobs = globalDefaultsResult?.useCases ?? [];
  // Nothing left to make default if it already handles everything.
  const handlesEveryJob = allJobs.length > 0 && defaultJobs.length === allJobs.length;

  const openDefaultConfirmation = () => {
    setHasDefaultModalActivated(true);
    setIsDefaultConfirmOpen(true);
  };

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
      setSaveError(t("makeDefaultFailed"));
    } finally {
      setIsMakingDefault(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 w-full h-full pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim pb-5">
        <div className="flex items-center gap-4">
          <Button
            variant="icon"
            onClick={() => router.push("/admin/ai/models/catalogue")}
            aria-label={t("back")}
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center p-0 border border-border-dim bg-sidebar/40"
          >
            <ArrowLeft className="w-4 h-4 text-secondary" />
          </Button>
          <div>
            <h1 className="text-[24px] font-semibold tracking-tight text-foreground">
              {model.friendlyName || model.displayName || model.modelId}
            </h1>
            <div className="flex items-center gap-2 mt-1 text-[12px]">
              <span className="font-mono text-secondary">{model.providerModelId || model.modelId}</span>
              <span className="text-muted">·</span>
              <span className={cn("font-medium", model.isEnabled ? "text-[#10b981]" : "text-muted")}>
                {model.isEnabled ? t("active") : t("inactive")}
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
          {t("save")}
        </WriteButton>
      </div>
      <SaveError>{saveError}</SaveError>

      {/* What this model is doing, which is the question the old "Legacy
          Default: Yes" field answered wrongly. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[13px] text-secondary">
          {defaultJobs.length > 0 ? (
            <>
              {t.rich("handles", {
                jobs: defaultJobs.map(formatModelTag).join(", "),
                b: (chunks) => <span className="text-foreground font-medium">{chunks}</span>,
              })}
            </>
          ) : (
            <>{t("notHandling")}</>
          )}
          <Link href="/admin/ai/models/defaults" className="text-brand hover:underline">
            {t("changeWhich")}
          </Link>
          .
        </p>
        {!handlesEveryJob && (
          <WriteButton
            type="button"
            onClick={openDefaultConfirmation}
            className="h-9 shrink-0 rounded-[8px] border border-border-dim px-4 text-[12px] font-medium text-secondary transition-colors hover:text-foreground"
          >
            {t("makeDefaultButton")}
          </WriteButton>
        )}
      </div>

      <section className="border border-border-dim rounded-[8px] bg-card px-5 py-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("nameTitle")}</h2>
        <p className="text-[12px] text-secondary mt-1 mb-4">
          {t("nameSub")}
        </p>
        {/* The heading above already names this box. */}
        <Field
          label={t("nameTitle")}
          labelHidden
          value={friendlyName}
          onChange={(e) => setFriendlyName(e.target.value)}
          placeholder={model.displayName}
          className="max-w-md"
        />
      </section>

      <section className="border border-border-dim rounded-[8px] bg-card px-5 py-5">
        <h2 className="text-[14px] font-semibold text-foreground">{t("costTitle")}</h2>
        <p className="text-[12px] text-secondary mt-1 mb-4">
          {t("costSub")}
        </p>

        {/* The two anyone actually types. The other four are real and rarely
            touched, so they fold away rather than competing for attention. */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <PriceField
            label={t("priceIn")}
            value={standardBelow}
            onChange={setStandardBelow}
            hint={t("priceInHint")}
          />
          <PriceField
            label={t("priceOut")}
            value={outputResponse}
            onChange={setOutputResponse}
            hint={t("priceOutHint")}
          />
        </div>

        {/* Stays raw: an inline padding-free text disclosure — matches no variant. */}
        <button
          type="button"
          onClick={() => setShowMorePrices((open) => !open)}
          className="mt-5 flex items-center gap-1.5 text-[12px] font-medium text-secondary hover:text-foreground transition-colors"
        >
          <ChevronDown className={cn("w-4 h-4 transition-transform", showMorePrices && "rotate-180")} />
          {showMorePrices ? t("fewerPrices") : t("morePrices")}
        </button>

        {showMorePrices && (
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl border-t border-border-dim pt-4">
            <PriceField
              label={t("priceInLong")}
              value={standardAbove}
              onChange={setStandardAbove}
              hint={t("priceInLongHint")}
            />
            <PriceField
              label={t("priceInCached")}
              value={cachedBelow}
              onChange={setCachedBelow}
              hint={t("priceInCachedHint")}
            />
            <PriceField
              label={t("priceInCachedLong")}
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
        {t.rich("suppliedBy", {
          provider: getProviderDisplayName(model.providerKey, providerNameByKey) ?? tShared("legacyProvider"),
          id: model.modelId,
          date: formatSyncDate(model.lastSyncedAt, locale, t("never")),
          code: (chunks) => <span className="font-mono">{chunks}</span>,
        })}
      </p>

      {hasDefaultModalActivated ? (
        <Suspense fallback={null}>
          <DefaultModelConfirmation
            allJobs={allJobs}
            isEnabled={model.isEnabled}
            isOpen={isDefaultConfirmOpen}
            isSubmitting={isMakingDefault}
            modelName={model.friendlyName || model.displayName || model.modelId}
            onClose={() => setIsDefaultConfirmOpen(false)}
            onConfirm={makeDefault}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
