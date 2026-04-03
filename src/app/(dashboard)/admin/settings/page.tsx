"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { 
  Palette, 
  CreditCard, 
  Upload, 
  Loader2, 
  Settings as SettingsIcon,
  Save,
  CheckCircle2,
  Building2,
  ImageIcon,
  Sun,
  Moon,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  History,
  Search
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter, useSearchParams } from "next/navigation";

const SettingBlock = ({ title, sub, children }: any) => (
  <motion.div 
    initial={{ opacity: 0, y: 15 }}
    animate={{ opacity: 1, y: 0 }}
    className="flex flex-col gap-6 p-8 rounded-[24px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm relative overflow-hidden group hover:border-brand/30 transition-colors"
  >
    <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 blur-[60px] rounded-full pointer-events-none -translate-y-20 translate-x-20 group-hover:bg-brand/10 transition-colors" />
    <div className="flex flex-col gap-1 relative z-10">
      <h2 className="text-[16px] font-bold text-foreground">{title}</h2>
      <p className="text-[12px] text-muted tracking-wide">{sub}</p>
    </div>
    <div className="relative z-10 w-full">
      {children}
    </div>
  </motion.div>
);

const ColorInput = ({ label, value, onChange }: { label: string, value: string, onChange: (v: string) => void }) => {
  const displayValue = value ? value.toUpperCase() : "";
  const hexValue = value || "#000000";

  return (
    <div className="flex items-center justify-between bg-background/50 border border-border-dim p-2 rounded-[16px]">
      <span className="text-[13px] font-mono tracking-tight text-secondary ml-3">{label}</span>
      <div className="flex items-center gap-3 pr-2">
        <span className="text-[13px] font-mono text-foreground tracking-widest uppercase">{displayValue}</span>
        <label className="cursor-pointer relative flex items-center justify-center">
            <input 
              type="color" 
              value={hexValue}
              onChange={(e) => onChange(e.target.value.toUpperCase())}
              className="w-8 h-8 rounded-[6px] cursor-pointer opacity-0 absolute inset-0 z-10"
            />
            <div 
              className="w-8 h-8 rounded-[6px] shadow-sm border border-border-dim/50 pointer-events-none"
              style={{ backgroundColor: value ? value : "transparent" }}
            />
        </label>
      </div>
    </div>
  );
};

export default function SystemSettingsPage() {
  const currentSettings = useQuery(api.settings.get);
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
  const [formData, setFormData] = useState<any>({});
  const [piiData, setPiiData] = useState<any>({});
  const [auditData, setAuditData] = useState<any>({});

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const searchParams = useSearchParams();
  const initTab = (searchParams.get("tab") as any) || "identity";
  const [activeTab, setActiveTab] = useState<"identity" | "appearance" | "economics" | "security" | "audit">(initTab);

  const router = useRouter();

  useEffect(() => {
    if (currentPiiConfig) {
       setPiiData(currentPiiConfig);
    }
  }, [currentPiiConfig]);

  useEffect(() => {
    const freshTab = searchParams.get("tab") as any;
    if (freshTab && freshTab !== activeTab) {
      setActiveTab(freshTab);
    }
  }, [searchParams]);

  // Optionally, update the URL instantly when clicking tabs
  const handleTabChange = (tab: any) => {
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
        const { _id, _creationTime, ...payload } = formData;
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

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, mode: "light" | "dark") => {
    const file = e.target.files?.[0];
    if (!file) return;

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
        setFormData((s: any) => ({ ...s, logoUrlLight: storageId }));
      } else {
        await updateSettings({ logoUrlDark: storageId });
        setFormData((s: any) => ({ ...s, logoUrlDark: storageId }));
      }
    } catch(err) {
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
            System Preferences
          </h1>
          <p className="text-[13px] header-subtitle text-secondary tracking-wide max-w-xl">
             Global platform rules, deep-level cascading style sheets (CSS) injection matrices, white-labeling, and telemetry pricing matrices.
          </p>
        </div>
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2.5 rounded-[12px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10 disabled:opacity-50"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : saveSuccess ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {isSaving ? "Injecting Styles..." : saveSuccess ? "System Updated" : "Deploy Matrix"}
        </button>
      </header>

      <div className="flex items-center gap-1 border-b border-border-dim/50 overflow-x-auto custom-scrollbar pb-px -mt-4">
        {[
          { id: 'identity', label: 'Brand Identity', icon: Building2 },
          { id: 'appearance', label: 'Appearance', icon: Palette },
          { id: 'economics', label: 'Economics', icon: CreditCard },
          { id: 'security', label: 'Data Privacy', icon: ShieldCheck },
          { id: 'audit', label: 'Audit Logs', icon: History }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button 
              key={tab.id}
              onClick={() => handleTabChange(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${
                isActive 
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
        
        {/* Core Identity */}
        {activeTab === "identity" && (
        <section className="flex flex-col gap-6">
           <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
             <Building2 className="w-3.5 h-3.5" /> Identity Subsystem
           </h3>
           <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
               <SettingBlock title="Platform Syntax" sub="The operational string name injected into headers, navigation, and core documents.">
                  <input 
                     type="text" 
                     value={formData.platformName || ""}
                     onChange={(e) => setFormData({...formData, platformName: e.target.value})}
                     className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[15px] font-bold text-foreground outline-none focus:border-brand transition-colors" 
                     placeholder="e.g., Vertex OS"
                  />
               </SettingBlock>

               <SettingBlock title="Primary Vector (Light)" sub="Drop .svg or .png. Instantly parsed when the OS detects a Light theme.">
                  <div className="w-full h-[120px] rounded-[16px] border-2 border-dashed border-border-dim/50 flex items-center justify-center relative overflow-hidden bg-white hover:bg-white/90 transition-colors group">
                    {formData.logoUrlLight ? (
                       <img src={formData.logoUrlLight} className="max-w-[80%] max-h-[80%] object-contain mix-blend-multiply" alt="Light mode" />
                    ) : (
                       <ImageIcon className="w-8 h-8 text-black/20" />
                    )}
                    <input type="file" onChange={(e) => handleFileUpload(e, "light")} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                    {uploadingLight && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>}
                 </div>
               </SettingBlock>

               <SettingBlock title="Primary Vector (Dark)" sub="Drop .svg or .png. Instantly parsed when the OS detects a Dark theme.">
                 <div className="w-full h-[120px] rounded-[16px] border-2 border-dashed border-border-dim/50 flex items-center justify-center relative overflow-hidden bg-black hover:bg-black/90 transition-colors group">
                    {formData.logoUrlDark ? (
                       <img src={formData.logoUrlDark} className="max-w-[80%] max-h-[80%] object-contain" alt="Dark mode" />
                    ) : (
                       <ImageIcon className="w-8 h-8 text-white/20" />
                    )}
                    <input type="file" onChange={(e) => handleFileUpload(e, "dark")} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full z-10" />
                    {uploadingDark && <div className="absolute inset-0 bg-background/80 flex items-center justify-center z-20"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>}
                 </div>
               </SettingBlock>
           </div>
        </section>
        )}

        {/* Global Theming Engine */}
        {activeTab === "appearance" && (
        <section className="flex flex-col gap-6">
           <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
             <Palette className="w-3.5 h-3.5" /> Environmental Theming
           </h3>
           
           <SettingBlock title="Typographic Foundation" sub="Mathematical layout overrides. Affects all rem-based typography scales.">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                 
                 {/* Font Families */}
                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Heading Typography (H1-H3)</span>
                    <select 
                        value={formData.headingFontFamily || "var(--font-sans)"}
                        onChange={(e) => setFormData({...formData, headingFontFamily: e.target.value})}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                     >
                        <option value="var(--font-sans)">Inter (System Default)</option>
                        <option value="var(--font-mono)">JetBrains (Mono)</option>
                        <option value="'Playfair Display', serif">Playfair Display (Serif)</option>
                        <option value="'Outfit', sans-serif">Outfit (Modern)</option>
                     </select>
                 </div>

                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Body/Data Typography</span>
                    <select 
                        value={formData.bodyFontFamily || "var(--font-sans)"}
                        onChange={(e) => setFormData({...formData, bodyFontFamily: e.target.value})}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                     >
                        <option value="var(--font-sans)">Inter (System Default)</option>
                        <option value="var(--font-mono)">JetBrains (Mono)</option>
                        <option value="'Playfair Display', serif">Playfair Display (Serif)</option>
                        <option value="'Outfit', sans-serif">Outfit (Modern)</option>
                     </select>
                 </div>

                 {/* Scalars */}
                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Heading Base Scalar (size)</span>
                    <select 
                        value={formData.headingSizeGlobal || "1.5rem"}
                        onChange={(e) => setFormData({...formData, headingSizeGlobal: e.target.value})}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer font-mono"
                     >
                        <option value="1.25rem">20px (Tighter)</option>
                        <option value="1.5rem">24px (Standard)</option>
                        <option value="1.875rem">30px (Punchy)</option>
                        <option value="2.25rem">36px (Editorial)</option>
                     </select>
                 </div>

                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Subtitle Helper Scalar</span>
                    <select 
                        value={formData.subTextSizeGlobal || "13px"}
                        onChange={(e) => setFormData({...formData, subTextSizeGlobal: e.target.value})}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer font-mono"
                     >
                        <option value="12px">12px (Micro)</option>
                        <option value="13px">13px (Standard)</option>
                        <option value="14px">14px (Readable)</option>
                     </select>
                 </div>
              </div>
           </SettingBlock>

           <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              
              {/* Dark Mode Injection Grid */}
              <SettingBlock title="Dark Matrix" sub="Force-inject CSS variables exclusively into the Next-Themes '.dark' tree.">
                 <div className="absolute top-6 right-6 p-2 bg-background/50 rounded-full border border-border-dim"><Moon className="w-4 h-4 text-foreground" /></div>
                 
                 <div className="flex flex-col gap-2 mt-2">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-2">Core Environment</span>
                    <ColorInput label="Background Base" value={formData.darkBg || ""} onChange={(v) => setFormData({...formData, darkBg: v})} />
                    <ColorInput label="Card/Sidebar Surfaces" value={formData.darkCardBg || ""} onChange={(v) => setFormData({...formData, darkCardBg: v})} />
                    <ColorInput label="Primary Headings & Text" value={formData.darkFg || ""} onChange={(v) => setFormData({...formData, darkFg: v})} />
                    <ColorInput label="Secondary Text Data" value={formData.darkCardFg || ""} onChange={(v) => setFormData({...formData, darkCardFg: v})} />
                    <ColorInput label="Hover Blocks (Muted)" value={formData.darkMuted || ""} onChange={(v) => setFormData({...formData, darkMuted: v})} />
                    <ColorInput label="Borders & Dividers" value={formData.darkBorder || ""} onChange={(v) => setFormData({...formData, darkBorder: v})} />
                    
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-4">Semantic Operators</span>
                    <ColorInput label="Success / Valid" value={formData.darkSuccess || ""} onChange={(v) => setFormData({...formData, darkSuccess: v})} />
                    <ColorInput label="Destructive / Error" value={formData.darkDestructive || ""} onChange={(v) => setFormData({...formData, darkDestructive: v})} />
                    <ColorInput label="Focus Ring Glow" value={formData.darkRing || ""} onChange={(v) => setFormData({...formData, darkRing: v})} />
                 </div>
              </SettingBlock>

              {/* Light Mode Injection Grid */}
              <SettingBlock title="Light Matrix" sub="Force-inject CSS variables exclusively when Next-Themes drops '.dark'.">
                 <div className="absolute top-6 right-6 p-2 bg-background/50 rounded-full border border-border-dim"><Sun className="w-4 h-4 text-foreground" /></div>
                 
                 <div className="flex flex-col gap-2 mt-2">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-2">Core Environment</span>
                    <ColorInput label="Background Base" value={formData.lightBg || ""} onChange={(v) => setFormData({...formData, lightBg: v})} />
                    <ColorInput label="Card/Sidebar Surfaces" value={formData.lightCardBg || ""} onChange={(v) => setFormData({...formData, lightCardBg: v})} />
                    <ColorInput label="Primary Headings & Text" value={formData.lightFg || ""} onChange={(v) => setFormData({...formData, lightFg: v})} />
                    <ColorInput label="Secondary Text Data" value={formData.lightCardFg || ""} onChange={(v) => setFormData({...formData, lightCardFg: v})} />
                    <ColorInput label="Hover Blocks (Muted)" value={formData.lightMuted || ""} onChange={(v) => setFormData({...formData, lightMuted: v})} />
                    <ColorInput label="Borders & Dividers" value={formData.lightBorder || ""} onChange={(v) => setFormData({...formData, lightBorder: v})} />
                    
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-2 mt-4">Semantic Operators</span>
                    <ColorInput label="Success / Valid" value={formData.lightSuccess || ""} onChange={(v) => setFormData({...formData, lightSuccess: v})} />
                    <ColorInput label="Destructive / Error" value={formData.lightDestructive || ""} onChange={(v) => setFormData({...formData, lightDestructive: v})} />
                    <ColorInput label="Focus Ring Glow" value={formData.lightRing || ""} onChange={(v) => setFormData({...formData, lightRing: v})} />
                 </div>
              </SettingBlock>
           </div>
           
           <SettingBlock title="Master Brand Origin" sub="The ultimate global tint. Operates above Light and Dark modes.">
              <div className="flex flex-col gap-2">
                 <ColorInput label="Primary Action Accent" value={formData.brandColorHex || ""} onChange={(v) => setFormData({...formData, brandColorHex: v})} />
              </div>
           </SettingBlock>
        </section>
        )}

        {/* Global Economics Engine */}
        {activeTab === "economics" && (
        <section className="flex flex-col gap-6">
           <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
             <CreditCard className="w-3.5 h-3.5" /> Economic Subsystem
           </h3>
           
           <SettingBlock title="Live MRR Multipliers" sub="Modifying these factors rewrites the Global Dashboard Revenue traces instantaneously algorithms in the backend cron loop.">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                 
                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Symbol Matrix</span>
                    <select 
                        value={formData.currencySymbol || "£"}
                        onChange={(e) => setFormData({...formData, currencySymbol: e.target.value})}
                        className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3.5 text-[15px] font-bold text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                     >
                        <option value="£">GBP (£)</option>
                        <option value="$">USD ($)</option>
                        <option value="€">EUR (€)</option>
                     </select>
                 </div>

                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Base Org (Flat)</span>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold">{formData.currencySymbol || "£"}</span>
                       <input 
                          type="number" 
                          value={formData.monthlyBasePrice || 0}
                          onChange={(e) => setFormData({...formData, monthlyBasePrice: parseFloat(e.target.value) || 0})}
                          className="w-full bg-background/50 border border-border-dim rounded-[12px] pl-9 pr-4 py-3 text-[18px] text-foreground outline-none focus:border-brand transition-colors font-bold font-mono" 
                       />
                    </div>
                 </div>

                 <div className="flex flex-col gap-2 relative">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Unit License (Active)</span>
                    <div className="relative">
                       <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted font-bold">{formData.currencySymbol || "£"}</span>
                       <input 
                          type="number" 
                          value={formData.monthlySeatPrice || 0}
                          onChange={(e) => setFormData({...formData, monthlySeatPrice: parseFloat(e.target.value) || 0})}
                          className="w-full bg-background/50 border border-border-dim rounded-[12px] pl-9 pr-4 py-3 text-[18px] text-foreground outline-none focus:border-brand transition-colors font-bold font-mono" 
                       />
                    </div>
                 </div>

               </div>
            </SettingBlock>

         </section>
         )}

        {/* Global Security Engine */}
        {activeTab === "security" && (
        <section className="flex flex-col gap-6">
           <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
             <ShieldCheck className="w-3.5 h-3.5" /> PII Masking Firewall
           </h3>
           
           <SettingBlock title="Auto-Redaction Config" sub="When enabled, sensitive data like credit cards or emails is immediately scrubbed and masked on-the-fly before hitting the database or AI orchestration system.">
              
              <div className="flex flex-col gap-0 border border-border-dim rounded-[16px] overflow-hidden">
                 
                 <div className="flex items-center justify-between p-5 bg-background/50 border-b border-border-dim">
                    <div className="flex flex-col gap-1">
                       <span className="text-[14px] text-foreground font-semibold">Master Firewall Toggle</span>
                       <span className="text-[12px] text-muted">Enable or disable the interceptor entirely.</span>
                    </div>
                    <button 
                       onClick={() => setPiiData({...piiData, enabled: !piiData.enabled})}
                       className={`transition-colors flex-shrink-0 ${piiData.enabled ? "text-brand" : "text-muted"}`}
                    >
                       {piiData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                 </div>

                 <div className={`flex flex-col transition-all duration-300 ${piiData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                     <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
                        <span className="text-[13px] text-foreground/90">Mask Email Addresses</span>
                        <button 
                           onClick={() => setPiiData({...piiData, maskEmails: !piiData.maskEmails})}
                           className={`transition-colors flex-shrink-0 ${piiData.maskEmails ? "text-[#10B981]" : "text-border-dim"}`}
                        >
                           {piiData.maskEmails ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                        </button>
                     </div>

                     <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
                        <span className="text-[13px] text-foreground/90">Mask Credit Cards (13-19 Digits)</span>
                        <button 
                           onClick={() => setPiiData({...piiData, maskCreditCards: !piiData.maskCreditCards})}
                           className={`transition-colors flex-shrink-0 ${piiData.maskCreditCards ? "text-[#10B981]" : "text-border-dim"}`}
                        >
                           {piiData.maskCreditCards ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                        </button>
                     </div>

                     <div className="flex items-center justify-between p-5 bg-card/10 border-b border-border-dim/50">
                        <span className="text-[13px] text-foreground/90">Mask National Insurance / SSN</span>
                        <button 
                           onClick={() => setPiiData({...piiData, maskNinos: !piiData.maskNinos})}
                           className={`transition-colors flex-shrink-0 ${piiData.maskNinos ? "text-[#10B981]" : "text-border-dim"}`}
                        >
                           {piiData.maskNinos ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                        </button>
                     </div>

                     <div className="flex items-center justify-between p-5 bg-card/10">
                        <div className="flex flex-col gap-1">
                           <span className="text-[13px] text-foreground/90">Mask Phone Numbers</span>
                           <span className="text-[11px] text-muted max-w-[280px]">Prone to false positives (e.g., dates/ids). Only enable if strictly required.</span>
                        </div>
                        <button 
                           onClick={() => setPiiData({...piiData, maskPhones: !piiData.maskPhones})}
                           className={`transition-colors flex-shrink-0 ${piiData.maskPhones ? "text-[#10B981]" : "text-border-dim"}`}
                        >
                           {piiData.maskPhones ? <ToggleRight className="w-7 h-7" /> : <ToggleLeft className="w-7 h-7" />}
                        </button>
                     </div>
                 </div>

              </div>
           </SettingBlock>

           <SettingBlock title="Automated Purge Engine" sub="Configures the global cron dispatcher. When active, it automatically cleanses the Audit Log database based on the retention and dispatch schedules below.">
              
              <div className="flex flex-col gap-0 border border-border-dim rounded-[16px] overflow-hidden">
                 
                 <div className="flex items-center justify-between p-5 bg-background/50 border-b border-border-dim">
                    <div className="flex flex-col gap-1">
                       <span className="text-[14px] text-foreground font-semibold">Enable Automated Purge</span>
                       <span className="text-[12px] text-muted">Toggle the execution of the purge chron job entirely.</span>
                    </div>
                    <button 
                       onClick={() => setAuditData({...auditData, enabled: !auditData.enabled})}
                       className={`transition-colors flex-shrink-0 ${auditData.enabled ? "text-brand" : "text-muted"}`}
                    >
                       {auditData.enabled ? <ToggleRight className="w-8 h-8" /> : <ToggleLeft className="w-8 h-8" />}
                    </button>
                 </div>

                 <div className={`flex flex-col p-6 gap-6 transition-all duration-300 ${auditData.enabled ? "opacity-100" : "opacity-40 pointer-events-none"}`}>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                        <div className="flex flex-col gap-2 relative">
                           <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Retention Window (Days)</span>
                           <select 
                               value={auditData.retentionDays || 30}
                               onChange={(e) => setAuditData({...auditData, retentionDays: parseInt(e.target.value)})}
                               className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                            >
                               <option value={7}>7 Days</option>
                               <option value={14}>14 Days</option>
                               <option value={30}>30 Days (Standard)</option>
                               <option value={90}>90 Days (Quarterly)</option>
                               <option value={365}>365 Days (Enterprise ISO)</option>
                            </select>
                        </div>

                        <div className="flex flex-col gap-2 relative">
                           <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Monthly Dispatch (Day)</span>
                           <select 
                               value={auditData.dayOfMonth || 1}
                               onChange={(e) => setAuditData({...auditData, dayOfMonth: parseInt(e.target.value)})}
                               className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                            >
                               {Array.from({ length: 28 }, (_, i) => i + 1).map(day => (
                                 <option key={day} value={day}>Every {day}{day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of the Month</option>
                               ))}
                            </select>
                            <span className="text-[10px] text-muted ml-2">Capped at 28 to prevent EOF Month leap-year desync.</span>
                        </div>

                        <div className="flex flex-col gap-2 relative">
                           <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1 ml-1">Execution Local Time</span>
                           <select 
                               value={auditData.hourOfDay || 2}
                               onChange={(e) => setAuditData({...auditData, hourOfDay: parseInt(e.target.value)})}
                               className="w-full bg-background/50 border border-border-dim rounded-[12px] px-4 py-3 text-[14px] text-foreground outline-none focus:border-brand transition-colors appearance-none cursor-pointer"
                            >
                               {Array.from({ length: 24 }, (_, i) => i).map(hour => {
                                 const hh = hour.toString().padStart(2, '0');
                                 return <option key={hour} value={hour}>{hh}:00 (24h)</option>
                               })}
                            </select>
                        </div>
                    </div>

                    {auditData.nextRunTimestamp && auditData.enabled && (
                       <div className="mt-2 p-4 bg-brand/5 border border-brand/20 rounded-[12px] flex items-center justify-between">
                          <span className="text-[12px] text-foreground font-medium">Next Purge Calculated Cycle:</span>
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

        {/* Global Audit Logs Subsystem */}
        {activeTab === "audit" && (
        <section className="flex flex-col gap-6">
           <h3 className="text-[11px] font-mono tracking-[0.2em] text-muted uppercase ml-2 flex items-center gap-2">
             <History className="w-3.5 h-3.5" /> Audit Logging
           </h3>

           <AuditLogsTable logs={recentLogs} />
        </section>
        )}
      </div>
    </div>
  );
}

function AuditLogsTable({ logs }: { logs: any[] | undefined }) {
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState("");
  const itemsPerPage = 20;

  if (logs === undefined) {
    return <div className="p-8 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-brand" /></div>;
  }

  // Mock data fallback if DB is empty
  const activeLogs = logs.length > 0 ? logs : [
    {
       _id: "mock-log-1a2b3c",
       actionType: "UPDATE_COMPANY",
       actorName: "Anthony (SuperAdmin)",
       entityId: "comp_291039",
       timestamp: Date.now() - 1000 * 60 * 5, // 5 mins ago
       metadata: "{\"field\":\"security_policy\",\"status\":\"enforced\"}"
    },
    {
       _id: "mock-log-4d5e6f",
       actionType: "TOGGLE_PII",
       actorName: "System Subroutine",
       entityId: "system_global",
       timestamp: Date.now() - 1000 * 60 * 120, // 2 hours ago
       metadata: "{\"rule\":\"maskCreditCards\",\"newState\":true}"
    },
    {
       _id: "mock-log-7g8h9i",
       actionType: "DELETE_USER",
       actorName: "Anthony (SuperAdmin)",
       entityId: "usr_malicious_99",
       timestamp: Date.now() - 1000 * 60 * 60 * 24, // 1 day ago
       metadata: "{\"reason\":\"TOS Violation\",\"email\":\"spam@fake.com\"}"
    },
    {
       _id: "mock-log-xjx9a1",
       actionType: "CREATE_INVITE",
       actorName: "Regional Admin",
       entityId: "inv_91823",
       timestamp: Date.now() - 1000 * 60 * 60 * 48, // 2 days ago
       metadata: "{\"role\":\"USER\",\"companyId\":\"comp_812\"}"
    }
  ];

  const filteredLogs = activeLogs.filter((l: any) => 
    l.actionType.toLowerCase().includes(searchTerm.toLowerCase()) || 
    (l.actorName || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const totalItems = filteredLogs.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedLogs = filteredLogs.slice(startIndex, startIndex + itemsPerPage);

  return (
    <div className="w-full bg-sidebar/40 border border-border-dim/50 rounded-[20px] overflow-hidden shadow-sm backdrop-blur-xl mt-2">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 border-b border-border-dim/50 bg-background/50">
        <div>
          <h3 className="text-[14px] font-medium text-foreground tracking-wide">Action Audit Feed</h3>
          <p className="text-[12px] text-secondary mt-0.5">Immutable global ledger of administrative actions.</p>
        </div>
        
        <div className="relative w-full sm:w-[280px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-muted" />
          </div>
          <input
            type="text"
            placeholder="Search by action or admin..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full pl-9 pr-4 py-2 bg-background/50 border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-brand/50 outline-none transition-all placeholder:text-muted"
          />
        </div>
      </div>

      <div className="w-full overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-border-dim/50 bg-foreground/[0.02] whitespace-nowrap">
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">Action Signature</th>
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">Administrator</th>
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em]">Target ID</th>
              <th className="px-5 py-3 text-[11px] font-medium text-secondary uppercase tracking-[0.1em] text-right">Timestamp</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border-dim/30">
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-5 py-8 text-center text-secondary text-[13px]">
                  {logs.length === 0 ? "No audit logs found. Try performing an admin action." : "No records match your search."}
                </td>
              </tr>
            ) : (
              paginatedLogs.map((log: any) => (
                <tr 
                   key={log._id} 
                   onClick={() => router.push(`/admin/audit-logs/${log._id}`)}
                   className="group hover:bg-foreground/[0.03] transition-colors cursor-pointer"
                 >
                  <td className="px-5 py-4">
                    <span className="text-[10px] font-mono tracking-widest bg-foreground/5 border border-border-dim text-foreground px-2 py-1 rounded-[4px] font-medium">
                       {log.actionType}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[13px] font-medium text-foreground">{log.actorName}</span>
                  </td>
                  <td className="px-5 py-4">
                    <span className="text-[12px] font-mono text-secondary truncate max-w-[150px] inline-block">{log.entityId || "N/A"}</span>
                  </td>
                  <td className="px-5 py-4 text-right">
                    <span className="text-[12px] text-secondary tracking-wide whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      <div className="w-full p-3 border-t border-border-dim/50 flex items-center justify-between bg-foreground/[0.02] px-5">
        <span className="text-[12px] text-secondary">
          Showing {totalItems > 0 ? startIndex + 1 : 0} to {Math.min(startIndex + itemsPerPage, totalItems)} of {totalItems} entries
        </span>
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
            disabled={currentPage === 1}
            className="px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-foreground/10 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <button 
            onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
            disabled={currentPage === totalPages || totalPages === 0}
            className="px-3 py-1.5 text-[12px] font-medium text-secondary hover:text-foreground hover:bg-foreground/10 rounded-full transition-all disabled:opacity-50 disabled:hover:bg-transparent disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
