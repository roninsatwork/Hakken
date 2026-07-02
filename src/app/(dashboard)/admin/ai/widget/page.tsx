"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { AppWindow, Loader2, Save } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";

import { api } from "@/convex/_generated/api";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { WidgetAppearanceSection } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetAppearanceSection";
import { WidgetConversationStartersSection } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetConversationStartersSection";
import { WidgetEmptyState } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetEmptyState";
import { WidgetGreetingSection } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetGreetingSection";
import { WidgetIntegrationSection } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetIntegrationSection";
import { WidgetPreviewPanel } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetPreviewPanel";
import { WidgetWelcomeSection } from "@/src/app/(dashboard)/admin/_features/widget-config/WidgetWelcomeSection";
import type { WidgetConfigTab } from "@/src/app/(dashboard)/admin/_features/widget-config/types";
import {
  buildWidgetEmbedSnippet,
  canAddConversationStarter,
  getWidgetLogoPreviewUrl,
  parseAllowedDomains,
  WIDGET_CONFIG_TABS,
} from "@/src/app/(dashboard)/admin/_features/widget-config/widgetConfigUtils";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { AiWorkspaceNav } from "../_components/AiWorkspaceNav";

function getWidgetSectionSlug(tab: WidgetConfigTab) {
  return tab.toLowerCase().replaceAll(" ", "-");
}

function getWidgetActiveTab(section: string | null): WidgetConfigTab {
  return WIDGET_CONFIG_TABS.find((tab) => getWidgetSectionSlug(tab) === section) ?? "Appearance";
}

export default function GlobalWidgetPage() {
  const searchParams = useSearchParams();
  const widget = useQuery(api.widgets.getPrimaryGlobalWidget);
  const saveWidget = useMutation(api.widgets.saveWidget);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);

  const activeTab = getWidgetActiveTab(searchParams.get("section"));
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostOrigin, setHostOrigin] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const [name, setName] = useState("Sonae Intercept Bot");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [themeGreeting, setThemeGreeting] = useState("Hi! How can I help you today?");
  const [themePrimaryColor, setThemePrimaryColor] = useState("#4f46e5");
  const [themeLogoUrl, setThemeLogoUrl] = useState("");
  const [themePlaceholder, setThemePlaceholder] = useState("Write a reply...");
  const [enableSounds, setEnableSounds] = useState(false);
  const [showPopupPreview, setShowPopupPreview] = useState(false);
  const [requireName, setRequireName] = useState(false);
  const [requireEmail, setRequireEmail] = useState(false);
  const [enableGreeting, setEnableGreeting] = useState(true);
  const [conversationStarters, setConversationStarters] = useState<string[]>([]);
  const [starterInput, setStarterInput] = useState("");
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [isSimulatorOpen, setIsSimulatorOpen] = useState(true);

  useEffect(() => {
    setHostOrigin(window.location.origin);
  }, []);

  const hasWidget = Boolean(widget);
  const widgetName = widget?.name || "";
  const widgetAllowedDomains = widget?.allowedDomains ? widget.allowedDomains.join(", ") : "";
  const widgetThemeGreeting = widget?.themeGreeting || "";
  const widgetThemePrimaryColor = widget?.themePrimaryColor || "#4f46e5";
  const widgetThemeLogoUrl = widget?.themeLogoUrl || "";
  const widgetThemePlaceholder = widget?.themePlaceholder || "Write a reply...";
  const widgetEnableSounds = widget?.enableSounds || false;
  const widgetShowPopupPreview = widget?.showPopupPreview || false;
  const widgetRequireName = widget?.requireName || false;
  const widgetRequireEmail = widget?.requireEmail || false;
  const widgetEnableGreeting = widget?.enableGreeting ?? true;
  const widgetConversationStartersKey = widget?.conversationStarters ? widget.conversationStarters.join("\n") : "";

  useEffect(() => {
    if (!hasWidget) return;

    setName(widgetName);
    setAllowedDomains(widgetAllowedDomains);
    setThemeGreeting(widgetThemeGreeting);
    setThemePrimaryColor(widgetThemePrimaryColor);
    setThemeLogoUrl(widgetThemeLogoUrl);
    setThemePlaceholder(widgetThemePlaceholder);
    setEnableSounds(widgetEnableSounds);
    setShowPopupPreview(widgetShowPopupPreview);
    setRequireName(widgetRequireName);
    setRequireEmail(widgetRequireEmail);
    setEnableGreeting(widgetEnableGreeting);
    setConversationStarters(widgetConversationStartersKey ? widgetConversationStartersKey.split("\n") : []);
  }, [
    hasWidget,
    widgetName,
    widgetAllowedDomains,
    widgetThemeGreeting,
    widgetThemePrimaryColor,
    widgetThemeLogoUrl,
    widgetThemePlaceholder,
    widgetEnableSounds,
    widgetShowPopupPreview,
    widgetRequireName,
    widgetRequireEmail,
    widgetEnableGreeting,
    widgetConversationStartersKey,
  ]);

  const handleLogoUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) {
      setFeedbackMessage(validation.reason);
      return;
    }

    setIsUploadingLogo(true);
    setFeedbackMessage("");

    try {
      const objectUrl = URL.createObjectURL(file);
      setThemeLogoUrl(objectUrl);

      const uploadUrl = await generateUploadUrl();
      const result = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });

      if (!result.ok) throw new Error("Upload failed");
      const { storageId } = await result.json();

      setThemeLogoUrl(storageId);
    } catch (error) {
      console.error(error);
      setThemeLogoUrl("");
      setFeedbackMessage("Failed to upload logo.");
    } finally {
      setIsUploadingLogo(false);
    }
  };

  const handleAddStarter = () => {
    if (!canAddConversationStarter(starterInput, conversationStarters)) return;

    setConversationStarters([...conversationStarters, starterInput.trim()]);
    setStarterInput("");
  };

  const handleRemoveStarter = (index: number) => {
    setConversationStarters(conversationStarters.filter((_, starterIndex) => starterIndex !== index));
  };

  const handleCreateOrUpdate = async () => {
    setIsSaving(true);
    setFeedbackMessage("");

    try {
      await saveWidget({
        widgetId: widget?._id,
        name,
        isActive: true,
        isGlobal: true,
        allowedDomains: parseAllowedDomains(allowedDomains),
        themeGreeting,
        themePrimaryColor,
        themeLogoUrl,
        themePlaceholder,
        enableSounds,
        showPopupPreview,
        requireName,
        requireEmail,
        enableGreeting,
        conversationStarters,
      });
    } catch (error) {
      console.error(error);
      setFeedbackMessage("Failed to save global widget settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const codeSnippet = buildWidgetEmbedSnippet(hostOrigin, widget?._id);
  const activeColor = themePrimaryColor || "#4f46e5";
  const logoPreviewUrl = getWidgetLogoPreviewUrl(themeLogoUrl);

  const handleCopy = async () => {
    setFeedbackMessage("");
    try {
      await navigator.clipboard.writeText(codeSnippet);
    } catch {
      setFeedbackMessage("Clipboard access was blocked. Select and copy the snippet manually.");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <AppWindow className="w-6 h-6 text-brand" />
            Global Widget Setup
          </h1>
          <p className="text-[13px] text-secondary mt-1 tracking-wide max-w-2xl">
            Configure the system-wide embeddable chat widget operated by the global AI protocol. Customizations apply
            instantly across all permitted integrations.
          </p>
        </div>
        {widget && (
          <button
            onClick={handleCreateOrUpdate}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-brand text-white font-medium tracking-wide text-[13px] hover:bg-brand/90 shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)] transition-all shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Save Configuration</span>
          </button>
        )}
      </header>

      <AiWorkspaceNav />
      <AdminSaveError>{feedbackMessage}</AdminSaveError>

      {widget === undefined ? (
        <div className="py-24 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
        </div>
      ) : !widget ? (
        <WidgetEmptyState
          actionLabel="Initialize Master Widget"
          description="Create a secure embeddable widget to allow external users to interact with the global knowledge base and intercept logic."
          isSaving={isSaving}
          onInitialize={handleCreateOrUpdate}
          title="No Global Protocol Connected"
        />
      ) : (
        <div className="flex flex-col gap-6 items-start relative mt-4">
          <div className="flex-1 w-full min-w-0 flex flex-col gap-8">
            {activeTab === "Appearance" && (
              <WidgetAppearanceSection
                activeColor={activeColor}
                enableSounds={enableSounds}
                isUploadingLogo={isUploadingLogo}
                logoPreviewUrl={logoPreviewUrl}
                name={name}
                onLogoUpload={handleLogoUpload}
                setEnableSounds={setEnableSounds}
                setName={setName}
                setShowPopupPreview={setShowPopupPreview}
                setThemeLogoUrl={setThemeLogoUrl}
                setThemePlaceholder={setThemePlaceholder}
                setThemePrimaryColor={setThemePrimaryColor}
                showPopupPreview={showPopupPreview}
                themeLogoUrl={themeLogoUrl}
                themePlaceholder={themePlaceholder}
                themePrimaryColor={themePrimaryColor}
              />
            )}
            {activeTab === "Welcome Screen" && (
              <WidgetWelcomeSection
                requireEmail={requireEmail}
                requireName={requireName}
                setRequireEmail={setRequireEmail}
                setRequireName={setRequireName}
              />
            )}
            {activeTab === "Conversation Starters" && (
              <WidgetConversationStartersSection
                conversationStarters={conversationStarters}
                onAddStarter={handleAddStarter}
                onRemoveStarter={handleRemoveStarter}
                setStarterInput={setStarterInput}
                starterInput={starterInput}
              />
            )}
            {activeTab === "Greeting" && (
              <WidgetGreetingSection
                enableGreeting={enableGreeting}
                setEnableGreeting={setEnableGreeting}
                setThemeGreeting={setThemeGreeting}
                themeGreeting={themeGreeting}
              />
            )}
            {activeTab === "Integration" && (
              <WidgetIntegrationSection
                allowedDomains={allowedDomains}
                codeSnippet={codeSnippet}
                copied={copied}
                onCopy={handleCopy}
                setAllowedDomains={setAllowedDomains}
                widgetId={widget._id}
              />
            )}
          </div>

          {activeTab === "Appearance" && (
            <WidgetPreviewPanel
              activeColor={activeColor}
              conversationStarters={conversationStarters}
              enableGreeting={enableGreeting}
              isSimulatorOpen={isSimulatorOpen}
              logoPreviewUrl={logoPreviewUrl}
              name={name}
              requireEmail={requireEmail}
              requireName={requireName}
              setIsSimulatorOpen={setIsSimulatorOpen}
              showPopupPreview={showPopupPreview}
              themeGreeting={themeGreeting}
              themeLogoUrl={themeLogoUrl}
              themePlaceholder={themePlaceholder}
            />
          )}
        </div>
      )}
    </div>
  );
}
