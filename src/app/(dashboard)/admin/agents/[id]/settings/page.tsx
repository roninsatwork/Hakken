"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useState, useEffect, useRef } from "react";
import { useParams } from "next/navigation";
import { Id } from "@/convex/_generated/dataModel";
import { 
  Save,
  CheckCircle2,
  Bot,
  ImagePlus,
  Globe,
  Loader2
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

export default function AgentOverviewPage() {
  const params = useParams();
  const agentId = params.id as Id<"agents">;

  const agent = useQuery(api.agents.get, { id: agentId });
  const updateAgent = useMutation(api.agents.updateAgent);
  const generateUploadUrl = useMutation(api.users.generateUploadUrl);
  
  const [formData, setFormData] = useState<any>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Avatar Upload State
  const [isAvatarModalOpen, setIsAvatarModalOpen] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (agent && Object.keys(formData).length === 0) {
      setFormData({
        name: agent.name || "",
        description: agent.description || "",
        avatar: agent.avatar || "",
        modelId: agent.modelId || "gemini-3-flash-preview",
        thinkingMode: agent.thinkingMode || false,
        reasoningEffort: agent.reasoningEffort || "MEDIUM",
        allowInternetAccess: agent.allowInternetAccess || false,
        isActive: agent.isActive ?? true,
        storageId: undefined,
      });
    }
  }, [agent]);

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    try {
      await updateAgent({
        id: agentId,
        name: formData.name,
        description: formData.description,
        avatar: formData.avatar,
        modelId: formData.modelId,
        thinkingMode: formData.thinkingMode,
        reasoningEffort: formData.reasoningEffort,
        allowInternetAccess: formData.allowInternetAccess,
        isActive: formData.isActive,
        storageId: formData.storageId
      });
      setFormData((prev: any) => ({ ...prev, storageId: undefined }));
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err: any) {
      alert(err.message || "Failed to save agent configuration");
    } finally {
      setIsSaving(false);
    }
  };

  const processUpload = async (file: File) => {
    setIsUploading(true);
    try {
      const postUrl = await generateUploadUrl();
      const result = await fetch(postUrl, {
        method: "POST",
        headers: { "Content-Type": file.type },
        body: file,
      });
      const { storageId } = await result.json();
      const localPreviewUrl = URL.createObjectURL(file);
      
      setFormData((prev: any) => ({ 
        ...prev, 
        storageId, 
        avatar: localPreviewUrl 
      }));
      setIsAvatarModalOpen(false);
    } catch (error) {
      console.error("Upload failed", error);
      alert("Failed to upload avatar image.");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUpload(e.dataTransfer.files[0]);
    }
  };

  if (agent === undefined) return <div className="p-8 text-secondary">Loading...</div>;
  if (agent === null) return <div className="p-8 text-red-500">Agent not found</div>;

  return (
    <div className="w-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300 antialiased">
      <form onSubmit={handleSave} className="flex flex-col gap-12 w-full">
         <div className="flex flex-col gap-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
              <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2">
                <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">1</span>
                Agent Identity & Core Configuration
              </h2>
              
              <div className="flex items-center gap-3">
               {saveSuccess && <span className="text-[#10b981] text-[12px] font-medium flex items-center gap-1.5 animate-in fade-in"><CheckCircle2 className="w-3.5 h-3.5"/> Synchronized</span>}
               <button 
                 type="submit"
                 disabled={isSaving}
                 className="flex items-center gap-2 px-4 py-2 rounded-[10px] bg-white/5 hover:bg-white/10 text-foreground text-[12px] font-medium border border-white/5 transition-all"
               >
                 <Save className="w-3.5 h-3.5" />
                 {isSaving ? "Saving..." : "Save Agent Profile"}
               </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col sm:flex-row gap-8 md:col-span-2 w-full">
                <div className="flex flex-col gap-2 shrink-0">
                  <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Agent Avatar</label>
                  <div className="flex items-center gap-4 py-2 pr-6 border-r border-border-dim/30">
                    {formData.avatar ? (
                      <img src={formData.avatar} alt="Agent Preview" className="w-16 h-16 rounded-full object-cover border border-white/10 shrink-0 bg-card shadow-sm" />
                    ) : (
                      <div className="w-16 h-16 rounded-full border border-dashed border-white/20 flex items-center justify-center bg-white/5 shrink-0">
                        <Bot className="w-6 h-6 text-muted" />
                      </div>
                    )}
                    <div className="flex flex-col items-start gap-1">
                      <button 
                        type="button" 
                        onClick={() => setIsAvatarModalOpen(true)}
                        className="px-4 py-2 rounded-[10px] bg-foreground/10 text-foreground text-[12px] font-medium hover:bg-foreground/20 transition-all border border-border-dim"
                      >
                        Update Image
                      </button>
                      <p className="text-[10px] text-secondary">Ideal 256x256 image format.</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 flex-1 justify-center">
                  <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Agent Name</label>
                  <input 
                    type="text" 
                    value={formData.name || ''}
                    onChange={e => setFormData({...formData, name: e.target.value})}
                    className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all placeholder:text-muted focus:border-[#10b981]/50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Brief Description</label>
                <textarea 
                  rows={3}
                  value={formData.description || ''}
                  onChange={e => setFormData({...formData, description: e.target.value})}
                  className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[13px] text-foreground outline-none transition-all placeholder:text-muted focus:border-[#10b981]/50 leading-relaxed min-h-[100px] resize-none"
                />
              </div>

            </div>
         </div>

         {/* Advanced Parameters */}
         <div className="flex flex-col gap-6">
            <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2 border-b border-border-dim/50 pb-4">
              <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">2</span>
              Engine Tuning & Capabilities
            </h2>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <div className="flex flex-col gap-2 md:col-span-2 md:w-1/2">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">AI Model Engine</label>
                <select
                  value={formData.modelId || 'gemini-3-flash-preview'}
                  onChange={e => setFormData({...formData, modelId: e.target.value})}
                  className="w-full px-4 py-3 bg-black/20 border border-border-dim rounded-[12px] text-[14px] text-foreground outline-none transition-all focus:border-[#10b981]/50 appearance-none cursor-pointer"
                >
                  <option value="gemini-3.1-flash-preview">Gemini 3.1 Flash (Fast & Cheap)</option>
                  <option value="gemini-3.1-pro-preview">Gemini 3.1 Pro (Deep Reasoning)</option>
                  <option value="gemini-3-flash-preview">Gemini 3.0 Flash (Stable)</option>
                  <option value="gemini-2.5-flash">Gemini 2.5 Flash (Legacy)</option>
                  <option value="gemini-2.5-pro">Gemini 2.5 Pro (Legacy)</option>
                </select>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Reasoning Effort</label>
                <div className="grid grid-cols-3 gap-2 h-[46px]">
                   {["LOW", "MEDIUM", "HIGH"].map((level) => (
                      <button 
                        key={level}
                        type="button"
                        onClick={() => setFormData({...formData, reasoningEffort: level})}
                        className={`flex items-center justify-center gap-2 rounded-[12px] text-[12px] font-medium border transition-all h-full ${formData.reasoningEffort === level ? "bg-brand/20 border-brand/30 text-brand" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                      >
                        {level}
                      </button>
                   ))}
                 </div>
                 <p className="text-[10px] text-muted">Higher effort utilizes deeply iterative reasoning at a slower pace.</p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Internet Access</label>
                <div className="grid grid-cols-2 gap-3 h-[46px]">
                   <button 
                     type="button"
                     onClick={() => setFormData({...formData, allowInternetAccess: false})}
                     className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.allowInternetAccess ? "bg-foreground/10 border-foreground/20 text-foreground" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                   >
                     Offline
                   </button>
                   <button 
                     type="button"
                     onClick={() => setFormData({...formData, allowInternetAccess: true})}
                     className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.allowInternetAccess ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                   >
                     <Globe className="w-4 h-4" /> Live Search
                   </button>
                 </div>
                 <p className="text-[10px] text-muted">Allows the agent to search live internet sources for queries.</p>
              </div>

              <div className="flex flex-col gap-2 md:col-span-2 pt-4 border-t border-border-dim/50">
                <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Operational Status</label>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 h-[46px]">
                   <button 
                     type="button"
                     onClick={() => setFormData({...formData, isActive: false})}
                     className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${!formData.isActive ? "bg-red-500/10 border-red-500/30 text-red-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                   >
                     Draft / Inactive
                   </button>
                   <button 
                     type="button"
                     onClick={() => setFormData({...formData, isActive: true})}
                     className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${formData.isActive ? "bg-green-500/20 border-green-500/30 text-green-500" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                   >
                     <CheckCircle2 className="w-4 h-4" /> Active & Ready
                   </button>
                 </div>
              </div>
            </div>
         </div>
      </form>

      {/* Upload Drag & Drop Modal */}
      <SonaeModal
        isOpen={isAvatarModalOpen}
        onClose={() => !isUploading && setIsAvatarModalOpen(false)}
        title="Upload Image"
      >
        <div className="flex flex-col gap-6 mt-2 relative">
          <p className="text-[13px] text-secondary">
            Drag and drop an image file here to set the agent&apos;s avatar.
          </p>
          
          <div 
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
            className={cn(
              "w-full h-[200px] border-2 border-dashed rounded-[20px] flex flex-col items-center justify-center gap-4 transition-all relative overflow-hidden",
              dragActive ? "border-brand bg-brand/5" : "border-border-dim bg-background/50",
              isUploading ? "opacity-50 pointer-events-none" : ""
            )}
          >
            {isUploading ? (
              <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-8 h-8 text-brand animate-spin" />
                <span className="text-[13px] font-medium text-foreground">Processing Secure Request...</span>
              </div>
            ) : (
              <>
                <div className="w-12 h-12 rounded-full bg-foreground/5 flex items-center justify-center pointer-events-none">
                  <ImagePlus className="w-5 h-5 text-secondary" />
                </div>
                <div className="flex flex-col items-center gap-1 pointer-events-none text-center px-4">
                  <span className="text-[14px] font-medium text-foreground">Drop image here or click to browse</span>
                  <span className="text-[11px] text-muted font-mono uppercase tracking-widest mt-1">supports PNG & JPG</span>
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef}
                  accept="image/png, image/jpeg, image/webp"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      processUpload(e.target.files[0]);
                    }
                  }}
                />
              </>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-6 mt-4 border-t border-border-dim/50">
            <button
               type="button"
               onClick={() => !isUploading && setIsAvatarModalOpen(false)}
               disabled={isUploading}
               className="px-5 py-2.5 rounded-[10px] text-[13px] font-medium text-secondary hover:text-foreground hover:bg-white/5 transition-all disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      </SonaeModal>
    </div>
  );
}
