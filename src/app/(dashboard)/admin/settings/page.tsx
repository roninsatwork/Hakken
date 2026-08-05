"use client";

import { useState, useEffect } from "react";
import type { ChangeEvent } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import {
  Palette,
  Loader2,
  Settings as SettingsIcon,
  Save,
  CheckCircle2,
  Building2,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  History,
  Database,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { validateUploadFile } from "@/src/lib/constants/uploads";
import { AppearanceSettingsSection } from "./_components/AppearanceSettingsSection";
import { AuditLogsSection } from "./_components/AuditLogsTable";
import { IdentitySettingsSection } from "./_components/IdentitySettingsSection";
import { PurgesSettingsSection } from "./_components/PurgesSettingsSection";
import { ApprovalExpirySection } from "./_components/ApprovalExpirySection";
import { SettingBlock } from "./_components/SettingBlock";
import { isSettingsTab } from "./_components/settingsTabs";
import { WhiteLabelCustomDomainChecklistSection, type WhiteLabelCustomDomainChecklist } from "./_components/WhiteLabelCustomDomainChecklistSection";
import { WhiteLabelHandoffSummarySection, type WhiteLabelHandoffSummary } from "./_components/WhiteLabelHandoffSummarySection";
import { WhiteLabelModulePresetsSection, type WhiteLabelModulePreset } from "./_components/WhiteLabelModulePresetsSection";
import { WhiteLabelNavigationProfilesSection, type WhiteLabelNavigationProfile } from "./_components/WhiteLabelNavigationProfilesSection";
import { WhiteLabelPackagingChecklistSection, type WhiteLabelPackagingChecklist } from "./_components/WhiteLabelPackagingChecklistSection";
import { WhiteLabelReadinessSection, type WhiteLabelReadiness } from "./_components/WhiteLabelReadinessSection";
import { useCanWriteHere } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import { AdminWriteButton } from "@/src/app/(dashboard)/admin/_components/AdminAccessLevel";
import {
  type AuditConfig,
  type PiiConfig,
  type SettingsTab,
  type SystemSettingsFormData,
} from "./_components/types";

export default function SystemSettingsPage() {
  const canWriteHere = useCanWriteHere();
  const t = useTranslations('admin.settings');

  const currentSettings = useQuery(api.settings.get);
  const whiteLabelReadiness = useQuery(api.settings.getWhiteLabelReadiness);
  const whiteLabelModulePresets = useQuery(api.settings.getWhiteLabelModulePresets);
  const whiteLabelNavigationProfiles = useQuery(api.settings.getWhiteLabelNavigationProfiles);
  const whiteLabelCustomDomainChecklist = useQuery(api.settings.getWhiteLabelCustomDomainChecklist);
  const whiteLabelHandoffSummary = useQuery(api.settings.getWhiteLabelHandoffSummary);
  const whiteLabelPackagingChecklist = useQuery(api.settings.getWhiteLabelPackagingChecklist);
  const updateSettings = useMutation(api.settings.update);
  const generateUploadUrl = useMutation(api.settings.generateUploadUrl);

  const currentPiiConfig = useQuery(api.system.getPiiConfig);
  const updatePiiConfig = useMutation(api.system.updatePiiConfig);

  const currentAuditConfig = useQuery(api.auditLogs.getConfig);
  const updateAuditConfig = useMutation(api.auditLogs.updateConfig);
  const recentLogs = useQuery(api.auditLogs.getRecentLogs);

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Local state form
  const [formData, setFormData] = useState<SystemSettingsFormData>({});
  const [piiData, setPiiData] = useState<PiiConfig>({});
  const [auditData, setAuditData] = useState<AuditConfig>({
    enabled: false,
    retentionDays: 30,
    dayOfMonth: 1,
    hourOfDay: 2,
    nextRunTimestamp: 0,
  });

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const searchParams = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const initTab: SettingsTab = isSettingsTab(requestedTab) ? requestedTab : "identity";
  const [activeTab, setActiveTab] = useState<SettingsTab>(initTab);

  const router = useRouter();

  useEffect(() => {
    if (currentPiiConfig) {
      setPiiData(currentPiiConfig);
    }
  }, [currentPiiConfig]);

  useEffect(() => {
    const freshTab = searchParams.get("tab");
    if (freshTab && freshTab !== activeTab) {
      setActiveTab(isSettingsTab(freshTab) ? freshTab : "identity");
    }
  }, [activeTab, searchParams]);

  // Optionally, update the URL instantly when clicking tabs
  const handleTabChange = (tab: SettingsTab) => {
    setActiveTab(tab);
    router.replace(`/admin/settings?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    if (currentAuditConfig) {
      setAuditData(currentAuditConfig);
    }
  }, [currentAuditConfig]);

  useEffect(() => {
    if (currentSettings) {
      setFormData({
        ...currentSettings,
        // Inject explicit default HEX variants mirroring globals.css instead of leaving them blank
        headingFontFamily: currentSettings.headingFontFamily || "var(--font-sans)",
        bodyFontFamily: currentSettings.bodyFontFamily || "var(--font-sans)",
        headingSizeGlobal: currentSettings.headingSizeGlobal || "1.5rem",
        subTextSizeGlobal: currentSettings.subTextSizeGlobal || "13px",

        darkBg: currentSettings.darkBg || "#222224",
        darkCardBg: currentSettings.darkCardBg || "#2C2C2E",
        darkFg: currentSettings.darkFg || "#FFFFFF",
        darkCardFg: currentSettings.darkCardFg || "#A1A1A6",
        darkMuted: currentSettings.darkMuted || "#3A3A3C",
        darkMutedFg: currentSettings.darkMutedFg || "#737373",
        darkBorder: currentSettings.darkBorder || "#3A3A3C",
        darkSuccess: currentSettings.darkSuccess || "#10B981",
        darkDestructive: currentSettings.darkDestructive || "#EF4444",
        darkRing: currentSettings.darkRing || "#FF5A1F",

        lightBg: currentSettings.lightBg || "#FCFCFC",
        lightCardBg: currentSettings.lightCardBg || "#FFFFFF",
        lightFg: currentSettings.lightFg || "#111111",
        lightCardFg: currentSettings.lightCardFg || "#666666",
        lightMuted: currentSettings.lightMuted || "#F2F2F2",
        lightMutedFg: currentSettings.lightMutedFg || "#999999",
        lightBorder: currentSettings.lightBorder || "#E5E5E5",
        lightSuccess: currentSettings.lightSuccess || "#10B981",
        lightDestructive: currentSettings.lightDestructive || "#EF4444",
        lightRing: currentSettings.lightRing || "#FF5A1F",
      });
    }
  }, [currentSettings]);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      if (activeTab === "security") {
        await updatePiiConfig({ configStr: JSON.stringify(piiData) });
        await updateAuditConfig(auditData);
      } else if (activeTab === "audit") {
        // Read-only feed, no state to save
      } else {
        const payload = { ...formData };
        delete payload._id;
        delete payload._creationTime;
        await updateSettings(payload);
      }
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFileUpload = async (e: ChangeEvent<HTMLInputElement>, mode: "light" | "dark") => {
    const file = e.target.files?.[0];
    if (!file) return;
    const validation = validateUploadFile(file, "adminImage");
    if (!validation.allowed) return;

    if (mode === "light") setUploadingLight(true);
    if (mode === "dark") setUploadingDark(true);

    try {
      const uploadUrl = await generateUploadUrl();
      const res = await fetch(uploadUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await res.json();

      // Instantly save to DB
      if (mode === "light") {
        await updateSettings({ logoUrlLight: storageId });
        setFormData((s) => ({ ...s, logoUrlLight: storageId }));
      } else {
        await updateSettings({ logoUrlDark: storageId });
        setFormData((s) => ({ ...s, logoUrlDark: storageId }));
      }
    } catch (err) {
      console.error("Upload failed", err);
    } finally {
      if (mode === "light") setUploadingLight(false);
      if (mode === "dark") setUploadingDark(false);
    }
  };

  if (!currentSettings) {
    return (
      <div className="w-full h-[50vh] flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-brand opacity-80" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 w-full pb-20 antialiased">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-border-dim/50">
        <div className="flex flex-col gap-2">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <SettingsIcon className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[13px] header-subtitle text-secondary tracking-wide max-w-xl">
            {t('subtitle')}
          </p>
        </div>
        {canWriteHere ? (
          <AdminWriteButton
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50"
          >
            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
            {isSaving ? t('saving') : saveSuccess ? t('success') : t('save')}
          </AdminWriteButton>
        ) : null}
      </header>

      <div className="flex items-center gap-1 border-b border-border-dim/50 overflow-x-auto custom-scrollbar pb-px -mt-4">
        {([
          { id: 'identity', label: t('tabs.identity'), icon: Building2 },
          { id: 'appearance', label: t('tabs.appearance'), icon: Palette },
          { id: 'security', label: t('tabs.security'), icon: ShieldCheck },
          { id: 'audit', label: t('tabs.audit'), icon: History },
          { id: 'purges', label: t('tabs.purges'), icon: Database },
          { id: 'options', label: t('tabs.options'), icon: SettingsIcon }
        ] satisfies { id: SettingsTab; label: string; icon: typeof SettingsIcon }[]).map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${isActive
                ? 'border-brand text-brand bg-brand/5'
                : 'border-transparent text-secondary hover:text-foreground hover:border-foreground/30'
                } rounded-t-[8px]`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          )
        })}
      </div>

      <div className="flex flex-col gap-12 w-full mt-2">

        {activeTab === "identity" && (
          <IdentitySettingsSection
            formData={formData}
            setFormData={setFormData}
            uploadingLight={uploadingLight}
            uploadingDark={uploadingDark}
            onFileUpload={handleFileUpload}
            t={t}
          />
        )}



        {activeTab === "appearance" && (
          <AppearanceSettingsSection
            formData={formData}
            setFormData={setFormData}
            t={t}
          />
        )}

        {/* Global Security Engine */}
        {activeTab === "security" && (
          <section className="flex flex-col gap-6">
            <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
              <ShieldCheck className="w-3.5 h-3.5" /> {t('security.title')}
            </h3>

            <SettingBlock title={t('security.redaction')} sub={t('security.redactionSub')}>

              <div className="flex flex-col gap-0 border border-border-dim rounded-[16px] overflow-hidden">

                <div className="flex items-center justify-between p-5 bg-background/50 border-b border-border-dim">
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] text-foreground font-semibold">{t('security.masterToggle')}</span>
                    <span className="text-[12px] text-muted">{t('security.masterToggleSub')}</span>
                  </div>
                  <button
                    onClick={() => setPiiData({ ...piiData, enabled: !piiData.enabled })}
                    className={`transition-colors flex-shrink-0 ${piiData.enabled ? "text-brand" : "text-muted"}`}
                  >
                    {piiData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>

                <div className={`flex flex-col transition-all duration-300 ${piiData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                  <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
                    <span className="text-[13px] text-foreground/90">{t('security.maskEmails')}</span>
                    <button
                      onClick={() => setPiiData({ ...piiData, maskEmails: !piiData.maskEmails })}
                      className={`transition-colors flex-shrink-0 ${piiData.maskEmails ? "text-[#10B981]" : "text-border-dim"}`}
                    >
                      {piiData.maskEmails ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
                    <span className="text-[13px] text-foreground/90">{t('security.maskCreditCards')}</span>
                    <button
                      onClick={() => setPiiData({ ...piiData, maskCreditCards: !piiData.maskCreditCards })}
                      className={`transition-colors flex-shrink-0 ${piiData.maskCreditCards ? "text-[#10B981]" : "text-border-dim"}`}
                    >
                      {piiData.maskCreditCards ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
                    <span className="text-[13px] text-foreground/90">{t('security.maskNi')}</span>
                    <button
                      onClick={() => setPiiData({ ...piiData, maskNinos: !piiData.maskNinos })}
                      className={`transition-colors flex-shrink-0 ${piiData.maskNinos ? "text-[#10B981]" : "text-border-dim"}`}
                    >
                      {piiData.maskNinos ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </div>

                  <div className="flex items-center justify-between p-5 bg-card/10">
                    <div className="flex flex-col gap-1">
                      <span className="text-[13px] text-foreground/90">{t('security.maskPhones')}</span>
                      <span className="text-[11px] text-muted max-w-[280px]">{t('security.maskPhonesSub')}</span>
                    </div>
                    <button
                      onClick={() => setPiiData({ ...piiData, maskPhones: !piiData.maskPhones })}
                      className={`transition-colors flex-shrink-0 ${piiData.maskPhones ? "text-[#10B981]" : "text-border-dim"}`}
                    >
                      {piiData.maskPhones ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                    </button>
                  </div>
                </div>

              </div>
            </SettingBlock>

            <SettingBlock title={t('security.purgeEngine')} sub={t('security.purgeSub')}>

              <div className="flex flex-col gap-0 border border-border-dim rounded-[16px] overflow-hidden">

                <div className="flex items-center justify-between p-5 bg-background/50 border-b border-border-dim">
                  <div className="flex flex-col gap-1">
                    <span className="text-[14px] text-foreground font-semibold">{t('security.purgeToggle')}</span>
                    <span className="text-[12px] text-muted">{t('security.purgeToggleSub')}</span>
                  </div>
                  <button
                    onClick={() => setAuditData({ ...auditData, enabled: !auditData.enabled })}
                    className={`transition-colors flex-shrink-0 ${auditData.enabled ? "text-brand" : "text-muted"}`}
                  >
                    {auditData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                  </button>
                </div>

                <div className={`flex flex-col p-6 gap-6 transition-all duration-300 ${auditData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="flex flex-col gap-2 relative">
                      <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('security.retention')}</span>
                      <select
                        value={auditData.retentionDays || 30}
                        onChange={(e) => setAuditData({ ...auditData, retentionDays: parseInt(e.target.value) })}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                      >
                        <option value={7}>{t('security.days.7')}</option>
                        <option value={14}>{t('security.days.14')}</option>
                        <option value={30}>{t('security.days.30')}</option>
                        <option value={90}>{t('security.days.90')}</option>
                        <option value={365}>{t('security.days.365')}</option>
                      </select>
                    </div>

                    <div className="flex flex-col gap-2 relative">
                      <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('security.monthlyDispatch')}</span>
                      <select
                        value={auditData.dayOfMonth || 1}
                        onChange={(e) => setAuditData({ ...auditData, dayOfMonth: parseInt(e.target.value) })}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                      >
                        {Array.from({ length: 28 }, (_, i) => i + 1).map(day => {
                          const suffix = day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th';
                          return <option key={day} value={day}>{t('security.everyDay', { day, suffix })}</option>
                        })}
                      </select>
                      <span className="text-[10px] text-muted ml-2">{t('security.purgeCapNote')}</span>
                    </div>

                    <div className="flex flex-col gap-2 relative">
                      <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">{t('security.executionTime')}</span>
                      <select
                        value={auditData.hourOfDay || 2}
                        onChange={(e) => setAuditData({ ...auditData, hourOfDay: parseInt(e.target.value) })}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                      >
                        {Array.from({ length: 24 }, (_, i) => i).map(hour => {
                          const hh = hour.toString().padStart(2, '0');
                          return <option key={hour} value={hour}>{t('security.hourLabel', { hour: hh })}</option>
                        })}
                      </select>
                    </div>
                  </div>

                  {auditData.nextRunTimestamp && auditData.enabled && (
                    <div className="mt-2 p-4 bg-brand/5 border border-brand/20 rounded-[12px] flex items-center justify-between">
                      <span className="text-[12px] text-foreground font-medium">{t('security.nextRun')}</span>
                      <span className="text-[12px] font-mono text-brand font-bold bg-brand/10 px-3 py-1 rounded-[6px]">
                        {new Date(auditData.nextRunTimestamp).toUTCString()}
                      </span>
                    </div>
                  )}

                </div>

              </div>
            </SettingBlock>
          </section>
        )}



        {activeTab === "audit" && (
          <AuditLogsSection logs={recentLogs} />
        )}

        {/* Global Options Engine */}
        {activeTab === "options" && (
          <section className="flex flex-col gap-6">
            <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
              <SettingsIcon className="w-3.5 h-3.5" /> {t('options.title')}
            </h3>

            {/* The heading and its sentence came from the block; the row inside
                repeated both, word for word, wrapped in a third box. One row,
                said once, with the switch labelled so it reads as on or off. */}
            <SettingBlock title={t('options.routingMatrix')} sub={t('options.routingMatrixSub')}>
              <button
                type="button"
                aria-pressed={formData.diagnosticRoutingEnabled}
                onClick={() => setFormData({ ...formData, diagnosticRoutingEnabled: !formData.diagnosticRoutingEnabled })}
                className="flex items-center justify-between gap-4 w-full rounded-[16px] border border-border-dim bg-background/50 p-5 text-left transition-colors hover:bg-hover/40"
              >
                <span className={`text-[14px] font-semibold ${formData.diagnosticRoutingEnabled ? "text-foreground" : "text-muted"}`}>
                  {formData.diagnosticRoutingEnabled ? t('options.routingMatrixOn') : t('options.routingMatrixOff')}
                </span>
                <span className={`flex-shrink-0 transition-colors ${formData.diagnosticRoutingEnabled ? "text-brand" : "text-muted"}`}>
                  {formData.diagnosticRoutingEnabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                </span>
              </button>
            </SettingBlock>

            <SettingBlock title={t('whiteLabel.title')} sub={t('whiteLabel.subtitle')}>
              <WhiteLabelReadinessSection
                formData={formData}
                readiness={whiteLabelReadiness as WhiteLabelReadiness | undefined}
                t={t}
              />
            </SettingBlock>

            <SettingBlock title={t('handoffSummary.title')} sub={t('handoffSummary.subtitle')}>
              <WhiteLabelHandoffSummarySection
                formData={formData}
                summary={whiteLabelHandoffSummary as WhiteLabelHandoffSummary | undefined}
                t={t}
              />
            </SettingBlock>

            <SettingBlock title={t('modulePresets.title')} sub={t('modulePresets.subtitle')}>
              <WhiteLabelModulePresetsSection
                presets={whiteLabelModulePresets as WhiteLabelModulePreset[] | undefined}
                t={t}
              />
            </SettingBlock>

            <SettingBlock title={t('navigationProfiles.title')} sub={t('navigationProfiles.subtitle')}>
              <WhiteLabelNavigationProfilesSection
                profiles={whiteLabelNavigationProfiles as WhiteLabelNavigationProfile[] | undefined}
                t={t}
              />
            </SettingBlock>

            <SettingBlock title={t('customDomain.title')} sub={t('customDomain.subtitle')}>
              <WhiteLabelCustomDomainChecklistSection
                checklist={whiteLabelCustomDomainChecklist as WhiteLabelCustomDomainChecklist | undefined}
                t={t}
              />
            </SettingBlock>

            <SettingBlock title={t('packagingChecklist.title')} sub={t('packagingChecklist.subtitle')}>
              <WhiteLabelPackagingChecklistSection
                checklist={whiteLabelPackagingChecklist as WhiteLabelPackagingChecklist | undefined}
                t={t}
              />
            </SettingBlock>
          </section>
        )}

        {activeTab === "purges" && (
          <section className="flex flex-col gap-6">
            <PurgesSettingsSection />
            {/* Grouped with retention rather than given a tab of its own: both are
                "how long does the platform keep waiting before it acts", and both
                are the rare operational limits an admin can actually set. */}
            <ApprovalExpirySection />
          </section>
        )}
      </div>



    </div>
  );
}
