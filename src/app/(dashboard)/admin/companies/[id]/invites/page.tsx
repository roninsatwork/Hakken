"use client";

import { useState, useEffect } from "react";
import type { FormEvent } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Mail, ShieldCheck, User as UserIcon, Loader2, Send, CheckCircle2, AlertCircle } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

import { useParams } from "next/navigation";
import { AdminSaveAction } from "@/src/app/(dashboard)/admin/_components/AdminSaveControls";

export default function InviteUsersPage() {
  const params = useParams();
  const companyId = params.id as Id<"companies">;

  const activeTemplate = useQuery(api.invites.getActiveTemplate);
  const saveTemplate = useMutation(api.invites.saveTemplate);
  const dispatchInvite = useAction(api.invites.dispatchInviteEmail);

  const [formData, setFormData] = useState({
    subject: "",
    headline: "",
    body: "",
    ctaText: "",
  });
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<"USER" | "ADMIN" | "SUPER_ADMIN">("USER");
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  useEffect(() => {
    if (activeTemplate) {
      setFormData({
         subject: activeTemplate.subject,
         headline: activeTemplate.headline,
         body: activeTemplate.body,
         ctaText: activeTemplate.ctaText,
      });
    }
  }, [activeTemplate]);

  const handleSaveTemplate = async () => {
    setIsSaving(true);
    try {
      await saveTemplate(formData);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
       console.error(error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setIsSending(true);
    setSendSuccess(false);
    setSendError(null);

    try {
      await dispatchInvite({
         email: inviteEmail,
         role: inviteRole,
         companyId,
         template: formData,
      });
      setSendSuccess(true);
      setInviteEmail("");
      setTimeout(() => setSendSuccess(false), 3000);
    } catch (e: unknown) {
      console.error(e);
      setSendError("Email delivery rejected by Resend API. Check your domain limits.");
      setTimeout(() => setSendError(null), 5000);
    } finally {
      setIsSending(false);
    }
  };

  if (activeTemplate === undefined) {
    return (
      <div className="w-full flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-muted" />
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col gap-8 pb-20">
        
        {/* Header */}
        <div className="flex flex-col gap-2 border-b border-border-dim/50 pb-6">
          <h1 className="text-[24px] font-bold tracking-tight text-foreground flex items-center gap-3">
            <Mail className="w-6 h-6 text-brand" />
            Workspace Invitations
          </h1>
          <p className="text-[14px] text-secondary max-w-xl leading-relaxed">
            Configure premium onboarding emails and dispatch secure access tokens directly to new team members.
          </p>
        </div>

        {/* Master Workflow Form */}
        <form onSubmit={handleSendInvite} className="flex flex-col gap-12 relative z-10 pt-4">
          
          {/* STEP 1: TARGETING */}
          <div className="flex flex-col gap-6">
             <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2 border-b border-border-dim/50 pb-4">
               <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">1</span>
               Target Recipient
             </h2>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               <div className="flex flex-col gap-2">
                 <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Target Email</label>
                 <input 
                   type="email" 
                   required
                   value={inviteEmail}
                   onChange={e => {
                     setInviteEmail(e.target.value);
                     if (sendError) setSendError(null);
                   }}
                   placeholder="colleague@company.com"
                   className={`w-full px-4 py-3 bg-black/20 border rounded-[12px] text-[14px] text-foreground outline-none transition-all placeholder:text-muted ${
                     sendError 
                       ? 'border-red-500/50 focus:border-red-500' 
                       : 'border-border-dim focus:border-[#10b981]/50'
                   }`}
                 />
               </div>

               <div className="flex flex-col gap-2">
                 <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Platform Role</label>
                 <div className="grid grid-cols-2 gap-3 h-[46px]">
                    <button 
                      type="button"
                      onClick={() => setInviteRole("USER")}
                      className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${inviteRole === "USER" ? "bg-foreground/10 border-foreground/20 text-foreground" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                    >
                      <UserIcon className="w-4 h-4" /> Standard User
                    </button>
                    <button 
                      type="button"
                      onClick={() => setInviteRole("ADMIN")}
                      className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${inviteRole === "ADMIN" ? "bg-brand/20 border-brand/30 text-brand" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
                    >
                      <ShieldCheck className="w-4 h-4" /> Company Admin
                    </button>
                  </div>
               </div>
             </div>
          </div>

          {/* STEP 2: PAYLOAD & TEMPLATE */}
          <div className="flex flex-col gap-6">
             
             {/* Header */}
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
               <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2">
                 <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">2</span>
                 Email Payload Configuration
               </h2>
               
               <AdminSaveAction
                 isSaving={isSaving}
                 label="Save Default Template"
                 savingLabel="Saving..."
                 successLabel="Synchronized"
                 showSuccess={saveSuccess}
                 onClick={handleSaveTemplate}
               />
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
               
               {/* Left: Input Config */}
               <div className="flex flex-col gap-6 pt-2">
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Subject Line</label>
                    <input 
                      type="text" 
                      value={formData.subject}
                      onChange={e => setFormData(p => ({...p, subject: e.target.value}))}
                      className="w-full px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-foreground/30 outline-none transition-all placeholder:text-muted"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Headline Box</label>
                    <input 
                      type="text" 
                      value={formData.headline}
                      onChange={e => setFormData(p => ({...p, headline: e.target.value}))}
                      className="w-full px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-foreground/30 outline-none transition-all"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Body Paragraph</label>
                    <textarea 
                      rows={5}
                      value={formData.body}
                      onChange={e => setFormData(p => ({...p, body: e.target.value}))}
                      className="w-full px-4 py-3 bg-background rounded-[12px] border border-border-dim text-[13px] text-foreground focus:border-foreground/30 outline-none transition-all resize-none leading-relaxed"
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-[11px] font-mono tracking-widest text-muted uppercase">Action Button</label>
                    <input 
                      type="text" 
                      value={formData.ctaText}
                      onChange={e => setFormData(p => ({...p, ctaText: e.target.value}))}
                      className="w-full px-4 py-2.5 bg-background border border-border-dim rounded-[10px] text-[13px] text-foreground focus:border-foreground/30 outline-none transition-all"
                    />
                  </div>
               </div>

               {/* Right: Premium Preview */}
               <div className="p-8 lg:p-10 bg-[#050505] border border-white/5 rounded-[24px] shadow-2xl flex items-center justify-center">
                  <div className="w-full max-w-[380px] bg-[#121212] border border-[#1A1A1A] rounded-[24px] p-8 flex flex-col items-start transition-all">
                     <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[30px] h-[30px] mb-6">
                       <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
                       <circle cx="12" cy="12" r="3" />
                     </svg>

                     <h1 className="text-[20px] font-semibold text-white tracking-tight mb-3 leading-tight">{formData.headline || "Headline Input Empty"}</h1>
                     
                     <p className="text-[#A3A3A3] text-[13px] leading-relaxed mb-8 whitespace-pre-wrap">{formData.body || "No paragraph content configured currently."}</p>

                     <button type="button" className="bg-white text-black font-medium px-5 py-2.5 rounded-[10px] text-[13px] pointer-events-none">
                       {formData.ctaText || "Validating"}
                     </button>

                     <div className="w-full mt-8 pt-4 border-t border-[#1A1A1A] text-[9px] font-mono text-[#666666] tracking-widest uppercase">
                       Sonae - to be prepared
                     </div>
                  </div>
               </div>
             </div>
          </div>

          {/* STEP 3: DISPATCH GATEWAY */}
          <div className="flex flex-col items-center justify-center pt-4">
             <button 
               type="submit"
               disabled={isSending || !inviteEmail}
               className="w-full md:w-auto min-w-[300px] flex items-center justify-center gap-3 bg-foreground text-background font-medium px-8 py-4 rounded-[14px] text-[15px] hover:bg-foreground/90 transition-all shadow-2xl shadow-foreground/10 disabled:opacity-50"
             >
               {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
               {isSending ? "Sending Invitation..." : "Send Invitation"}
             </button>

             {/* Functional Feedback Stream */}
             <div className="h-[40px] mt-4 flex items-center justify-center w-full max-w-md">
               {sendSuccess && (
                  <div className="px-5 py-2 bg-[#10b981]/10 border border-[#10b981]/20 rounded-full text-[#10b981] text-[13px] flex items-center gap-2 animate-in slide-in-from-bottom-2 fade-in">
                    <CheckCircle2 className="w-4 h-4" />
                    Success! Resend API accepted the payload.
                  </div>
               )}
               {sendError && (
                  <div className="px-5 py-2 bg-red-500/10 border border-red-500/20 rounded-[12px] text-red-500 text-[13px] flex items-start gap-2.5 animate-in slide-in-from-bottom-2 fade-in">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span className="leading-snug text-center">{sendError}</span>
                  </div>
               )}
             </div>
          </div>

        </form>



      </div>
  );
}
