"use client";

import { useEffect, useState } from "react";
import type { ChangeEvent } from "react";
import { AppWindow, Loader2, Save } from "lucide-react";
import { useParams } from "next/navigation";
import { useQuery as useConvexQuery, useMutation as useConvexMutation } from "convex/react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { WidgetAppearanceSection } from "./_components/WidgetAppearanceSection";
import { WidgetConfigTabs } from "./_components/WidgetConfigTabs";
import { WidgetConversationStartersSection } from "./_components/WidgetConversationStartersSection";
import { WidgetEmptyState } from "./_components/WidgetEmptyState";
import { WidgetGreetingSection } from "./_components/WidgetGreetingSection";
import { WidgetIntegrationSection } from "./_components/WidgetIntegrationSection";
import { WidgetPreviewPanel } from "./_components/WidgetPreviewPanel";
import { WidgetWelcomeSection } from "./_components/WidgetWelcomeSection";
import type { WidgetConfigTab } from "./_components/types";
import {
  buildWidgetEmbedSnippet,
  canAddConversationStarter,
  getWidgetLogoPreviewUrl,
  parseAllowedDomains,
} from "./_components/widgetConfigUtils";

export default function CompanyWidgetPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const widget = useConvexQuery(api.widgets.getPrimaryWidgetByCompany, { companyId });
  const saveWidget = useConvexMutation(api.widgets.saveWidget);
  const generateUploadUrl = useConvexMutation(api.users.generateUploadUrl);

  const [activeTab, setActiveTab] = useState<WidgetConfigTab>("Appearance");
  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostOrigin, setHostOrigin] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  const [name, setName] = useState("Website Bot");
  const [allowedDomains, setAllowedDomains] = useState("");
  const [themeGreeting, setThemeGreeting] = useState("Hi! How can I help you today?");
  const [themePrimaryColor, setThemePrimaryColor] = useState("#000000");
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
  const widgetThemePrimaryColor = widget?.themePrimaryColor || "#000000";
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
        companyId,
        name,
        isActive: true,
        isGlobal: false,
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
      setFeedbackMessage("Failed to save widget settings.");
    } finally {
      setIsSaving(false);
    }
  };

  const codeSnippet = buildWidgetEmbedSnippet(hostOrigin, widget?._id);
  const activeColor = themePrimaryColor || "#000000";
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
          <h2 className="text-xl font-bold tracking-tight text-foreground flex items-center gap-2">
            <AppWindow className="w-5 h-5 text-brand" />
            Widget Deployer
          </h2>
          <p className="text-[13px] text-secondary mt-1 tracking-wide max-w-2xl">
            Configure the intelligent embeddable front-end specific to this company.
          </p>
        </div>
        {widget && (
          <button
            onClick={handleCreateOrUpdate}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-brand text-white font-medium tracking-wide text-[13px] hover:bg-brand/90 shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)] transition-all shrink-0"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Publish Configuration</span>
          </button>
        )}
      </header>

      <AdminSaveError>{feedbackMessage}</AdminSaveError>

      {widget === undefined ? (
        <div className="py-24 flex justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-brand" />
        </div>
      ) : !widget ? (
        <WidgetEmptyState isSaving={isSaving} onInitialize={handleCreateOrUpdate} />
      ) : (
        <div className="flex flex-col gap-6 items-start relative mt-4 2xl:flex-row 2xl:gap-8">
          <WidgetConfigTabs activeTab={activeTab} onTabChange={setActiveTab} />

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
