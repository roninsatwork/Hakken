"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import type { ChangeEvent } from "react";

import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { AppWindow, Plus, Loader2, Save, MessageSquare, Volume2, X, Bell, UploadCloud } from "lucide-react";
import { useParams } from "next/navigation";
import { useQuery as useConvexQuery, useMutation as useConvexMutation } from "convex/react";
import { AdminSaveError } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";
import { validateUploadFile } from "@/src/lib/constants/uploads";

type Tab = 'Appearance' | 'Welcome Screen' | 'Conversation Starters' | 'Greeting' | 'Integration';

export default function CompanyWidgetPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  
  const widgets = useConvexQuery(api.widgets.getWidgetsByCompany, { companyId });
  const saveWidget = useConvexMutation(api.widgets.saveWidget);
  const generateUploadUrl = useConvexMutation(api.users.generateUploadUrl);

  // We'll manage the first widget in the list for simplicity in this MVP
  const widget = widgets && widgets.length > 0 ? widgets[0] : null;

  const [activeTab, setActiveTab] = useState<Tab>('Appearance');

  const [isSaving, setIsSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hostOrigin, setHostOrigin] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");

  useEffect(() => {
    setHostOrigin(window.location.origin);
  }, []);

  // Form State
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
    if (widget) {
      setName(widget.name || "");
      setAllowedDomains(widget.allowedDomains ? widget.allowedDomains.join(", ") : "");
      setThemeGreeting(widget.themeGreeting || "");
      setThemePrimaryColor(widget.themePrimaryColor || "#000000");
      setThemeLogoUrl(widget.themeLogoUrl || "");
      setThemePlaceholder(widget.themePlaceholder || "Write a reply...");
      setEnableSounds(widget.enableSounds || false);
      setShowPopupPreview(widget.showPopupPreview || false);
      setRequireName(widget.requireName || false);
      setRequireEmail(widget.requireEmail || false);
      setEnableGreeting(widget.enableGreeting ?? true);
      setConversationStarters(widget.conversationStarters || []);
    }
  }, [widget]);

  const handleLogoUpload = async (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
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
	      } catch (err) {
	          console.error(err);
	          setThemeLogoUrl("");
	          setFeedbackMessage("Failed to upload logo.");
	      } finally {
          setIsUploadingLogo(false);
      }
  };

  const handleAddStarter = () => {
    if (starterInput.trim() !== "" && conversationStarters.length < 4) {
      setConversationStarters([...conversationStarters, starterInput.trim()]);
      setStarterInput("");
    }
  };

  const handleRemoveStarter = (index: number) => {
    const newStarters = [...conversationStarters];
    newStarters.splice(index, 1);
    setConversationStarters(newStarters);
  };

	  const handleCreateOrUpdate = async () => {
	    setIsSaving(true);
      setFeedbackMessage("");
	    try {
      const domains = allowedDomains.split(",").map(d => d.trim()).filter(Boolean);
      await saveWidget({
        widgetId: widget?._id,
        companyId,
        name,
        isActive: true,
        isGlobal: false,
        allowedDomains: domains,
        themeGreeting,
        themePrimaryColor,
        themeLogoUrl,
        themePlaceholder,
        enableSounds,
        showPopupPreview,
        requireName,
        requireEmail,
        enableGreeting,
        conversationStarters
      });
	    } catch (error) {
	      console.error(error);
	      setFeedbackMessage("Failed to save widget settings.");
	    } finally {
      setIsSaving(false);
    }
  };

  const codeSnippet = widget ? `<script src="${hostOrigin}/embed.js" data-widget-id="${widget._id}"></script>` : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(codeSnippet);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const activeColor = themePrimaryColor || "#000000";
  const logoPreviewUrl = themeLogoUrl.startsWith('blob:') || themeLogoUrl.startsWith('http') ? themeLogoUrl : null;

  const tabs: Tab[] = ['Appearance', 'Welcome Screen', 'Conversation Starters', 'Greeting', 'Integration'];

  return (
    <>
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

	        {widgets === undefined ? (
          <div className="py-24 flex justify-center"><Loader2 className="w-6 h-6 animate-spin text-brand" /></div>
        ) : !widget ? (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center border border-border-dim/50 border-dashed rounded-[16px] bg-foreground/[0.02]">
            <AppWindow className="w-10 h-10 text-brand mb-4 opacity-80" />
            <h3 className="text-sm font-medium text-foreground mb-1">Unconfigured Integrations</h3>
            <p className="text-[13px] text-secondary max-w-sm mb-6">
              Establish a secure embeddable widget to let your clients chat directly with your company intelligence.
            </p>
            <button
              onClick={handleCreateOrUpdate}
              disabled={isSaving}
              className="flex items-center gap-2 px-6 py-3 rounded-full bg-foreground text-background font-medium tracking-wide text-[13px] hover:opacity-90 shadow-[0_0_20px_rgba(255,255,255,0.05)] transition-all"
            >
              {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
              <span>Initialize Master Widget</span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col lg:flex-row gap-8 items-start relative mt-4">
              
            {/* Left Vertical Sub-Menu */}
            <div className="w-full lg:w-[220px] shrink-0 sticky top-6 bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl rounded-[16px] overflow-hidden flex flex-col pt-2 pb-2">
                {tabs.map((tab) => (
                    <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={`text-left px-5 py-3.5 text-[14px] font-medium transition-colors ${
                            activeTab === tab
                                ? 'bg-brand text-white'
                                : 'text-secondary hover:text-foreground hover:bg-foreground/5'
                        }`}
                    >
                        {tab}
                    </button>
                ))}
            </div>

            {/* The Active Form Panel */}
            <div className="flex-1 w-full min-w-0 flex flex-col gap-8">
                
              {activeTab === 'Appearance' && (
                  <div className="flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
                    <div className="border-b border-border-dim pb-4 mb-2">
                        <h2 className="text-[18px] font-bold text-foreground">Appearance</h2>
                        <p className="text-[13px] text-secondary mt-1">Customize widget appearance that will be shown to the user.</p>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-6">
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-semibold text-secondary">Public Name</label>
                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors" placeholder="e.g. Sales Assistant" />
                        </div>
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-semibold text-secondary">Primary Widget Color</label>
                            <div className="flex items-center gap-2 bg-background border border-border-dim rounded-[10px] px-2 py-1.5 focus-within:border-brand transition-colors">
                                <input type="text" value={themePrimaryColor} onChange={(e) => setThemePrimaryColor(e.target.value)} className="flex-1 bg-transparent border-none outline-none font-mono text-[14px] tracking-wider text-foreground placeholder:text-muted/60" />
                                <input type="color" value={activeColor} onChange={(e) => setThemePrimaryColor(e.target.value)} className="w-10 h-8 rounded shrink-0 cursor-pointer border-none bg-transparent" />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-semibold text-secondary">Custom Source Logo</label>
                            {themeLogoUrl ? (
                                <div className="flex items-center gap-4 bg-background border border-border-dim rounded-[10px] p-3">
                                    <div className="w-12 h-12 rounded-full overflow-hidden border border-border-dim/50 flex-shrink-0 bg-sidebar/50">
                                        {logoPreviewUrl ? (
                                            <Image
                                                src={logoPreviewUrl}
                                                alt="Widget Logo"
                                                width={48}
                                                height={48}
                                                unoptimized
                                                className="w-full h-full object-cover"
                                            />
                                        ) : (
                                            <AppWindow className="w-full h-full p-3 text-secondary" />
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0 flex flex-col justify-center">
                                        <span className="text-[13px] text-foreground font-medium truncate">
                                            {themeLogoUrl.startsWith('blob:') ? 'Uploading...' : 'Custom Logo Set'}
                                        </span>
                                    </div>
                                    <button onClick={() => setThemeLogoUrl("")} disabled={isUploadingLogo} className="p-2 text-secondary hover:text-destructive hover:bg-destructive/10 rounded-full transition-colors flex-shrink-0">
                                        <X className="w-4 h-4" />
                                    </button>
                                </div>
                            ) : (
                                <div className="relative group rounded-[10px] border border-border-dim border-dashed bg-background hover:border-brand/40 hover:bg-foreground/[0.02] transition-colors p-4 flex flex-col items-center justify-center text-center cursor-pointer overflow-hidden">
                                    <input type="file" accept="image/*" onChange={handleLogoUpload} disabled={isUploadingLogo} className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed" />
                                    {isUploadingLogo ? (
                                        <Loader2 className="w-6 h-6 text-brand animate-spin mb-2" />
                                    ) : (
                                        <UploadCloud className="w-6 h-6 text-brand mb-2 group-hover:scale-110 transition-transform" />
                                    )}
                                    <span className="text-[13px] font-medium text-foreground tracking-wide">
                                        {isUploadingLogo ? "Uploading..." : "Click to upload an image"}
                                    </span>
                                    <span className="text-[11px] text-secondary mt-1">
                                        PNG, JPG, SVG up to 2MB. Recommended 256x256.
                                    </span>
                                </div>
                            )}
                        </div>
                        
                        <div className="flex flex-col gap-2">
                            <label className="text-[13px] font-semibold text-secondary">Input Placeholder Text</label>
                            <input type="text" value={themePlaceholder} onChange={(e) => setThemePlaceholder(e.target.value)} className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors" placeholder="Write a reply..." />
                        </div>

                        <div className="flex flex-col gap-4 mt-2">
                            <label className="flex items-center justify-between p-4 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Volume2 className="w-4 h-4 text-brand" />
                                    <span className="text-[13px] font-semibold tracking-wide text-foreground">Enable sound notifications</span>
                                </div>
                                <input type="checkbox" checked={enableSounds} onChange={(e) => setEnableSounds(e.target.checked)} className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4" />
                            </label>
                            <label className="flex items-center justify-between p-4 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
                                <div className="flex items-center gap-3">
                                    <Bell className="w-4 h-4 text-brand" />
                                    <span className="text-[13px] font-semibold tracking-wide text-foreground">Show pop-up message preview</span>
                                </div>
                                <input type="checkbox" checked={showPopupPreview} onChange={(e) => setShowPopupPreview(e.target.checked)} className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4" />
                            </label>
                        </div>
                    </div>
                  </div>
              )}

              {activeTab === 'Welcome Screen' && (
                  <div className="flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
                    <div className="border-b border-border-dim pb-4 mb-2">
                        <h2 className="text-[18px] font-bold text-foreground">Welcome Screen</h2>
                        <p className="text-[13px] text-secondary mt-1">Add and customize input fields that will be shown at the first widget screen.</p>
                    </div>
                    <div className="flex flex-col gap-4">
                        <h3 className="text-[13px] font-semibold text-secondary">Choose the input fields to start a chat</h3>
                        <label className="flex items-center gap-3 p-3 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
                            <input type="checkbox" checked={requireName} onChange={(e) => setRequireName(e.target.checked)} className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4" />
                            <span className="text-[13px] text-foreground font-medium tracking-wide">Name input</span>
                        </label>
                        <label className="flex items-center gap-3 p-3 rounded-[12px] border border-border-dim bg-background/50 cursor-pointer hover:bg-foreground/5 transition-colors">
                            <input type="checkbox" checked={requireEmail} onChange={(e) => setRequireEmail(e.target.checked)} className="rounded border-border-dim text-brand focus:ring-brand form-checkbox bg-transparent w-4 h-4" />
                            <span className="text-[13px] text-foreground font-medium tracking-wide">Email input</span>
                        </label>
                    </div>
                  </div>
              )}

              {activeTab === 'Conversation Starters' && (
                  <div className="flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
                    <div className="border-b border-border-dim pb-4 mb-2">
                        <h2 className="text-[18px] font-bold text-foreground">Conversation Starters</h2>
                        <p className="text-[13px] text-secondary mt-1 max-w-2xl leading-relaxed">
                            Create up to 4 quick replies that appear before the chat begins. Tailor suggestions based on user language to encourage engagement right from the start. Enabling conversation starters will disable the Greetings feature.
                        </p>
                    </div>
                    <div className="flex flex-col gap-4 bg-background/50 p-6 rounded-[16px] border border-border-dim">
                        <div className="flex items-center gap-2">
                            <input type="text" value={starterInput} onChange={(e) => setStarterInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && handleAddStarter()} disabled={conversationStarters.length >= 4} className="flex-1 bg-background border border-border-dim rounded-[10px] px-4 py-3 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors disabled:opacity-50" placeholder="Enter a conversation starter" />
                            <span className="text-[12px] text-muted font-medium w-12 text-right">{conversationStarters.length}/4</span>
                        </div>
                        <button onClick={handleAddStarter} disabled={starterInput.trim() === "" || conversationStarters.length >= 4} className="self-start px-5 py-2.5 rounded-[10px] bg-foreground/10 text-foreground font-medium text-[13px] transition-colors hover:bg-foreground/20 disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2">
                            <Plus className="w-4 h-4"/> Add Conversation Starter
                        </button>
                    </div>

                    <div className="flex flex-col gap-2 mt-4">
                        {conversationStarters.length === 0 ? (
                             <p className="text-[14px] text-foreground font-medium text-center py-12">No conversation starters added yet.</p>
                        ) : (
                            conversationStarters.map((starter, index) => (
                                <div key={index} className="flex items-center justify-between bg-background border border-border-dim p-4 rounded-[12px] text-[14px] text-foreground tracking-wide group">
                                    {starter}
                                    <button onClick={() => handleRemoveStarter(index)} className="w-6 h-6 rounded-full bg-red-100 text-red-500 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-red-500 hover:text-white"><X className="w-3 h-3"/></button>
                                </div>
                            ))
                        )}
                    </div>
                  </div>
              )}

              {activeTab === 'Greeting' && (
                  <div className="flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
                    <div className="border-b border-border-dim pb-4 mb-2">
                        <h2 className="text-[18px] font-bold text-foreground">Greeting</h2>
                        <p className="text-[13px] text-secondary mt-1">Customize greeting message that will pop up automatically to the user.</p>
                    </div>
                    
                    <div className="w-full overflow-x-auto border border-border-dim rounded-[12px] bg-background text-[13px]">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border-dim text-secondary font-semibold">
                                    <th className="px-6 py-4">Greeting name</th>
                                    <th className="px-6 py-4">Status</th>
                                    <th className="px-6 py-4">Enable/disable</th>
                                    <th className="px-6 py-4 text-right">Configure</th>
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="px-6 py-5 font-medium text-foreground">Default greeting</td>
                                    <td className="px-6 py-5 text-muted">Active</td>
                                    <td className="px-6 py-5">
                                        <label className="flex items-center gap-2 cursor-pointer relative z-10 transition-opacity">
                                            <div className={`w-10 h-5 rounded-full flex items-center p-0.5 transition-colors ${enableGreeting ? 'bg-brand' : 'bg-border-dim'}`}>
                                                <div className={`w-4 h-4 rounded-full bg-white transition-transform ${enableGreeting ? 'translate-x-5' : 'translate-x-0'}`} />
                                            </div>
                                            <input type="checkbox" className="hidden" checked={enableGreeting} onChange={(e) => setEnableGreeting(e.target.checked)} />
                                        </label>
                                    </td>
                                    <td className="px-6 py-5">
                                        <div className="flex justify-end">
                                             <textarea rows={2} value={themeGreeting} onChange={(e) => setThemeGreeting(e.target.value)} disabled={!enableGreeting} className="w-64 bg-background border border-border-dim rounded-[8px] text-[13px] p-2 text-foreground focus:outline-none focus:border-brand resize-none placeholder-muted/50 disabled:opacity-50" placeholder="Type a greeting message..." />
                                        </div>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                  </div>
              )}

              {activeTab === 'Integration' && (
                  <div className="flex flex-col gap-6 p-6 md:p-8 rounded-[20px] bg-sidebar/40 border border-border-dim shadow-sm backdrop-blur-xl">
                    <div className="border-b border-border-dim pb-4 mb-2">
                        <h2 className="text-[18px] font-bold text-foreground">Integration</h2>
                        <p className="text-[13px] text-secondary mt-1">Connect your secure agent connection pipeline into external domains.</p>
                    </div>

                    <div className="flex flex-col gap-3">
                        <label className="text-[13px] font-semibold text-secondary">Authorized Domains</label>
                        <input type="text" value={allowedDomains} onChange={(e) => setAllowedDomains(e.target.value)} className="w-full bg-background border border-border-dim rounded-[10px] px-4 py-2.5 text-[14px] text-foreground focus:outline-none focus:border-brand transition-colors font-mono" placeholder="https://example.com, https://app.example.com" />
                    </div>

                    <div className="mt-4">
                        <label className="text-[13px] font-semibold text-secondary mb-3 block">Copy AI chat code snippet to clipboard</label>
                        <div className="bg-background border border-border-dim rounded-[12px] overflow-hidden flex flex-col relative group">
                            <pre className="p-5 text-[13px] text-muted overflow-x-auto font-mono leading-relaxed select-all">
                                {codeSnippet}
                            </pre>
                            <div className="border-t border-border-dim bg-foreground/5 py-4 px-5">
                                <button onClick={handleCopy} className="px-6 py-2 rounded-[8px] bg-brand text-white font-medium hover:bg-brand/90 transition-colors flex items-center justify-center min-w-[160px]">
                                    {copied ? 'Copied!' : 'Copy to clipboard'}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-6 border-t border-border-dim border-dashed">
                       <p className="text-[13px] text-secondary mb-4 leading-relaxed">
                           Test your Widget configuration safely inside the Sonae Sandbox Environment.
                       </p>
                       <a 
                           href={`/sandbox/${widget._id}`} 
                           target="_blank" 
                           rel="noopener noreferrer"
                           className="flex items-center justify-center gap-2 w-full max-w-sm py-3 rounded-full bg-foreground text-background font-bold text-[13px] shadow-lg hover:scale-[1.02] transition-transform"
                       >
                           <AppWindow className="w-4 h-4" />
                           Test Widget Sandbox
                       </a>
                   </div>
                  </div>
              )}

            </div>

            {/* Right Column: Dynamic Sticky Live Preview Sandbox (only for Appearance tab) */}
            {activeTab === 'Appearance' && (
                <div className="w-full lg:w-[380px] shrink-0 sticky top-6 self-start flex flex-col gap-4">
                    {/* Simulated Webpage Body */}
                    <div className="aspect-[3/4] bg-[#f8f9fc] rounded-[24px] border border-border-dim shadow-inner relative overflow-hidden flex flex-col items-end justify-end p-6">
                        
                        <div className="absolute inset-0 bg-gradient-to-tr from-transparent to-black/5 pointer-events-none" />

                        {/* The Rendered Widget Simulation */}
                        <div className="w-[320px] flex flex-col items-end gap-3 transform scale-90 origin-bottom-right drop-shadow-2xl relative">
                            
                            {/* Call to action text preview bubble */}
                            {!isSimulatorOpen && showPopupPreview && enableGreeting && themeGreeting && (
                                <div className="w-full relative animate-in slide-in-from-bottom-4 fade-in duration-500 mb-2">
                                    <div className="bg-white p-4 rounded-[16px] shadow-lg text-[13.5px] font-medium text-gray-800 leading-[1.6]">
                                        {themeGreeting}
                                    </div>
                                    <div className="absolute -bottom-2 right-6 w-4 h-4 bg-white rotate-45" />
                                </div>
                            )}

                            {/* Open Widget Mode Simulation */}
                            <div className={`w-full bg-white rounded-[24px] overflow-hidden shadow-2xl flex flex-col h-[400px] border border-gray-100 transition-all origin-bottom-right ease-out duration-300 ${isSimulatorOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-95 pointer-events-none absolute bottom-[80px] right-0'}`}>
                                {/* Widget Header */}
                                <div className="px-5 py-4 flex items-center justify-between text-white shrink-0" style={{ backgroundColor: activeColor }}>
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center overflow-hidden shrink-0 border border-white/30 backdrop-blur-md">
                                            {themeLogoUrl ? (
                                                logoPreviewUrl ? (
                                                    <Image
                                                        src={logoPreviewUrl}
                                                        alt="logo"
                                                        width={32}
                                                        height={32}
                                                        unoptimized
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <AppWindow className="w-4 h-4 text-white" />
                                                )
                                            ) : (
                                                <AppWindow className="w-4 h-4 text-white" />
                                            )}
                                        </div>
                                        <span className="font-semibold tracking-wide text-[15px]">{name || "Website Bot"}</span>
                                    </div>
                                    <X onClick={() => setIsSimulatorOpen(false)} className="w-5 h-5 opacity-70 cursor-pointer hover:opacity-100 transition-opacity" />
                                </div>

                                {/* Widget Body */}
                                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#f9fafb] relative">
                                    {/* Lead Gate Screen Preview */}
                                    {(requireName || requireEmail) ? (
                                        <div className="flex flex-col gap-4 my-auto p-2">
                                            <h3 className="font-semibold text-gray-800 text-[14px]">Before we begin...</h3>
                                            <div className="flex flex-col gap-3">
                                                {requireName && <input type="text" disabled placeholder="Full Name" className="w-full bg-white border border-gray-200 rounded-[8px] px-3 py-2.5 text-[13px] opacity-70" />}
                                                {requireEmail && <input type="email" disabled placeholder="Email Address" className="w-full bg-white border border-gray-200 rounded-[8px] px-3 py-2.5 text-[13px] opacity-70" />}
                                                <button disabled style={{ backgroundColor: activeColor }} className="w-full py-2.5 rounded-[8px] text-white font-medium text-[13px] mt-2 opacity-80">Start Chat</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <>
                                            {/* Greeting inside chat */}
                                            {enableGreeting && themeGreeting && (
                                                <div className="flex items-end gap-2 max-w-[85%] self-start">
                                                    <div className="w-6 h-6 rounded-full flex items-center justify-center shrink-0 mb-1" style={{ backgroundColor: activeColor }}>
                                                        {logoPreviewUrl ? (
                                                            <Image
                                                                src={logoPreviewUrl}
                                                                alt="logo"
                                                                width={24}
                                                                height={24}
                                                                unoptimized
                                                                className="w-full h-full object-cover rounded-full"
                                                            />
                                                        ) : (
                                                            <AppWindow className="w-3 h-3 text-white" />
                                                        )}
                                                    </div>
                                                    <div className="p-3 bg-white border border-gray-200 rounded-[14px] rounded-bl-sm text-[13px] text-gray-700 shadow-sm leading-relaxed">
                                                        {themeGreeting}
                                                    </div>
                                                </div>
                                            )}

                                            {/* Conversation Starters Block */}
                                            {(conversationStarters.length > 0 && !enableGreeting) && (
                                                <div className="flex flex-col gap-2 mt-auto pb-2 self-end items-end w-full">
                                                    {conversationStarters.map((starter, i) => (
                                                        <div key={i} className="px-4 py-2 rounded-full border border-brand bg-brand/5 text-[12px] text-brand font-medium shadow-sm max-w-[90%] text-right cursor-pointer hover:bg-brand/10 transition-colors">
                                                            {starter}
                                                        </div>
                                                    ))}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>

                                {/* Widget Input Footer */}
                                <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2 shrink-0 shadow-[0_-5px_15px_rgba(0,0,0,0.02)] relative z-10">
                                    <div className="flex-1 bg-gray-100/80 rounded-full h-10 flex items-center px-4">
                                        <span className="text-[13px] text-gray-400">{themePlaceholder}</span>
                                    </div>
                                    <div className="w-10 h-10 flex items-center justify-center rounded-full cursor-pointer shadow-md transition-transform hover:scale-105" style={{ backgroundColor: activeColor }}>
                                        <MessageSquare className="w-4 h-4 text-white -mt-0.5" />
                                    </div>
                                </div>
                            </div>

                            {/* Toggle Button */}
                            <button onClick={() => setIsSimulatorOpen(!isSimulatorOpen)} className="w-[60px] h-[60px] rounded-full shadow-[0_8px_24px_rgba(0,0,0,0.2)] flex items-center justify-center transition-transform hover:scale-105 relative z-10 shrink-0 mt-2" style={{ backgroundColor: activeColor }}>
                                {isSimulatorOpen ? <X className="w-6 h-6 text-white" /> : <MessageSquare className="w-6 h-6 text-white" />}
                            </button>

                        </div>
                    </div>
                </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}
