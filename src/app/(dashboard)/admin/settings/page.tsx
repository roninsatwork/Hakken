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
  Moon
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

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

  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  
  // Local state form
  const [formData, setFormData] = useState<any>({});

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);

  const [activeTab, setActiveTab] = useState<"identity" | "appearance" | "economics">("identity");

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
      const { _id, _creationTime, ...payload } = formData;
      await updateSettings(payload);
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
          { id: 'economics', label: 'Economics', icon: CreditCard }
        ].map(tab => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button 
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
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

      </div>
    </div>
  );
}
