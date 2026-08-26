"use client";

import { useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { useQuery, useMutation, useAction } from "convex/react";
import { useTranslations } from "next-intl";
import { api } from "@/convex/_generated/api";
import { Mail, ShieldCheck, Loader2, Send } from "lucide-react";
import type { Id } from "@/convex/_generated/dataModel";

import { LAYER } from "@/src/ui/lib/layers";
import { useAdminAction } from "@/src/hooks/useAdminAction";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { WriteButton } from "@/src/ui/components/screens/AccessLevel";
import { Field, TextAreaField } from "@/src/ui/components/screens/Field";
import {
  FeedbackPill,
  SaveAction,
} from "@/src/ui/components/screens/SaveControls";

/**
 * Every string the screen draws between header and footer, overridable per
 * page. A wrapper that wants different wording resolves its own translations
 * and passes them here; any key it leaves out falls back to the shared
 * `admin.invites` catalogue. `previewFooter` arrives already interpolated
 * (the wrapper owns its own {platformName} sentence).
 */
export type InviteScreenText = Partial<
  Record<
    | "step1"
    | "step2"
    | "emailLabel"
    | "emailPlaceholder"
    | "saveTemplate"
    | "saving"
    | "saved"
    | "subjectLabel"
    | "headlineLabel"
    | "bodyLabel"
    | "ctaLabel"
    | "previewHeadlineEmpty"
    | "previewBodyEmpty"
    | "previewCtaEmpty"
    | "previewFooter"
    | "sending"
    | "send"
    | "sendSuccess"
    | "sendError",
    string
  >
>;

/**
 * The invitation desk, at all three heights.
 *
 * With a company it invites that company's people; without one it invites
 * system super admins; the admin users desk drives both from one page by
 * making `companyId` follow its workspace picker. The template editor, the
 * live email preview and the dispatch flow are the same either way — what
 * differs is who is being invited, which is why the role control arrives as
 * a slot: each page owns the one control that says what the invitee will be.
 * `targetingExtra` is a second, optional slot under the email/role pair for
 * a page that adds its own targeting control (the workspace picker).
 *
 * `header` replaces the built-in company/global heading when a page needs
 * its own words — and pins the form to the borderless (global) chrome, so a
 * `companyId` that changes with a picker cannot make the page shell jump.
 *
 * `previewCta` is a render slot rather than markup here because the mock
 * button inside the email preview is a deliberate raw button element (an
 * inert white-on-black mock, not a themed control), and each page's
 * screen-kit budget is where raw buttons are accounted for.
 */
export function InviteDispatchScreen({
  companyId,
  role,
  header,
  roleSelector,
  targetingExtra,
  previewCta,
  text,
}: {
  companyId?: Id<"companies">;
  role: "USER" | "ADMIN" | "SUPER_ADMIN";
  header?: ReactNode;
  roleSelector: ReactNode;
  targetingExtra?: ReactNode;
  previewCta: (label: string) => ReactNode;
  text?: InviteScreenText;
}) {
  const t = useTranslations("admin.invites");
  const tx = (key: keyof InviteScreenText) => text?.[key] ?? t(key);
  const { platformName } = useSystemSettings();
  const templateAction = useAdminAction({ scope: "admin-invites-template" });
  const sendAction = useAdminAction({ scope: "admin-invites-send" });
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
  const [isSaving, setIsSaving] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  // Adopted during render rather than in an effect, as the settings form does:
  // an effect paints the empty form for a frame before replacing it. The
  // sentinel is whether this screen has taken its copy of the template yet.
  // Keying on the template object re-seeded the form every time the server
  // handed back a new reference — `invites.getActiveTemplate` builds a fresh
  // object on every read — and threw away whatever was being composed. There is
  // one invite template and its result carries no id, so its identity never
  // changes: the form takes it once.
  const [hasSeededTemplate, setHasSeededTemplate] = useState(false);
  if (activeTemplate && !hasSeededTemplate) {
    setHasSeededTemplate(true);
    setFormData({
       subject: activeTemplate.subject,
       headline: activeTemplate.headline,
       body: activeTemplate.body,
       ctaText: activeTemplate.ctaText,
    });
  }

  const handleSaveTemplate = async () => {
    setIsSaving(true);
    const outcome = await templateAction.run(() => saveTemplate(formData), {
      fallbackMessage: t("templateSaveFailed"),
    });
    if (outcome.ok) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    }
    setIsSaving(false);
  };

  const handleSendInvite = async (e: FormEvent) => {
    e.preventDefault();
    if (!inviteEmail) return;
    setIsSending(true);
    setSendSuccess(false);
    setSendError(null);

    const outcome = await sendAction.run(
      () => dispatchInvite({
         email: inviteEmail,
         role,
         companyId,
         template: formData,
      }),
      { fallbackMessage: tx("sendError"), suppressErrorToast: true },
    );
    setIsSending(false);

    if (!outcome.ok) {
      setSendError(outcome.message);
      setTimeout(() => setSendError(null), 5000);
      return;
    }

    setSendSuccess(true);
    setInviteEmail("");
    setTimeout(() => setSendSuccess(false), 3000);
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
      {header ? (
        header
      ) : companyId ? (
        <header className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="text-[24px] font-bold tracking-tight text-foreground flex items-center gap-3">
              <Mail className="w-6 h-6 text-brand" />
              {t("companyTitle")}
            </h1>
            <p className="text-[14px] text-secondary max-w-xl leading-relaxed">
              {t("companyDescription")}
            </p>
          </div>
        </header>
      ) : (
        <div className="flex flex-col gap-2 border-b border-border-dim/50 pb-6">
          <h1 className="text-[24px] font-bold tracking-tight text-foreground flex items-center gap-3">
            <ShieldCheck className="w-6 h-6 text-brand" />
            {t("globalTitle")}
          </h1>
          <p className="text-[14px] text-secondary max-w-xl leading-relaxed">
            {t("globalDescription")}
          </p>
        </div>
      )}

      {/* Master Workflow Form */}
      <form
        onSubmit={handleSendInvite}
        className={`flex flex-col gap-12 relative ${LAYER.RAISED} ${!header && companyId ? "border-t border-border-dim/50 pt-8" : "pt-4"}`}
      >

          {/* STEP 1: TARGETING */}
          <div className="flex flex-col gap-6">
             <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2 border-b border-border-dim/50 pb-4">
               <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">1</span>
               {tx("step1")}
             </h2>

             <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
               {/* The failure message has its own place at the foot of the
                   form, so the box carries the red border and not the sentence
                   twice. */}
               <Field
                 label={tx("emailLabel")}
                 type="email"
                 required
                 value={inviteEmail}
                 onChange={e => {
                   setInviteEmail(e.target.value);
                   if (sendError) setSendError(null);
                 }}
                 placeholder={tx("emailPlaceholder")}
                 className={sendError ? 'border-red-500/50 focus:border-red-500' : undefined}
               />

               {roleSelector}
             </div>

             {targetingExtra}
          </div>

          {/* STEP 2: PAYLOAD & TEMPLATE */}
          <div className="flex flex-col gap-6">

             {/* Header */}
             <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border-dim/50 pb-4">
               <h2 className="text-[14px] font-semibold text-foreground tracking-wide flex items-center gap-2">
                 <span className="flex items-center justify-center w-5 h-5 rounded-full bg-brand/20 text-brand text-[11px] font-mono">2</span>
                 {tx("step2")}
               </h2>

               <SaveAction
                 isSaving={isSaving}
                 label={tx("saveTemplate")}
                 savingLabel={tx("saving")}
                 successLabel={tx("saved")}
                 showSuccess={saveSuccess}
                 onClick={handleSaveTemplate}
               />
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">

               {/* Left: Input Config */}
               <div className="flex flex-col gap-6 pt-2">
                  <Field
                    label={tx("subjectLabel")}
                    value={formData.subject}
                    onChange={e => setFormData(p => ({...p, subject: e.target.value}))}
                  />
                  <Field
                    label={tx("headlineLabel")}
                    value={formData.headline}
                    onChange={e => setFormData(p => ({...p, headline: e.target.value}))}
                  />
                  <TextAreaField
                    label={tx("bodyLabel")}
                    rows={5}
                    value={formData.body}
                    onChange={e => setFormData(p => ({...p, body: e.target.value}))}
                    className="min-h-[140px] resize-y"
                  />
                  <Field
                    label={tx("ctaLabel")}
                    value={formData.ctaText}
                    onChange={e => setFormData(p => ({...p, ctaText: e.target.value}))}
                  />
               </div>

               {/* Right: Premium Preview */}
               <div className="p-8 lg:p-10 bg-[#050505] border border-white/5 rounded-[24px] shadow-2xl flex items-center justify-center">
                  <div className="w-full max-w-[380px] bg-[#121212] border border-[#1A1A1A] rounded-[24px] p-8 flex flex-col items-start transition-all">
                     <svg viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-[30px] h-[30px] mb-6">
                       <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
                       <circle cx="12" cy="12" r="3" />
                     </svg>

                     <h1 className="text-[20px] font-semibold text-white tracking-tight mb-3 leading-tight">{formData.headline || tx("previewHeadlineEmpty")}</h1>

                     <p className="text-[#A3A3A3] text-[13px] leading-relaxed mb-8 whitespace-pre-wrap">{formData.body || tx("previewBodyEmpty")}</p>

                     {previewCta(formData.ctaText || tx("previewCtaEmpty"))}

                     <div className="w-full mt-8 pt-4 border-t border-[#1A1A1A] text-[9px] font-mono text-[#666666] tracking-widest uppercase">
                       {text?.previewFooter ?? t("previewFooter", { platformName })}
                     </div>
                  </div>
               </div>
             </div>
          </div>

          {/* STEP 3: DISPATCH GATEWAY */}
          <div className="flex flex-col items-center justify-center pt-4">
             <WriteButton

               type="submit"
               disabled={isSending || !inviteEmail}
               className="w-full md:w-auto min-w-[300px] flex items-center justify-center gap-3 bg-foreground text-background font-medium px-8 py-4 rounded-[14px] text-[15px] hover:bg-foreground/90 transition-all shadow-2xl shadow-foreground/10 disabled:opacity-50"
             >
               {isSending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
               {isSending ? tx("sending") : tx("send")}
             </WriteButton>

             {/* Functional Feedback Stream */}
             <div className="h-[40px] mt-4 flex items-center justify-center w-full max-w-md">
               {sendSuccess && (
                  <FeedbackPill tone="success">
                    {tx("sendSuccess")}
                  </FeedbackPill>
               )}
               {sendError && (
                  <FeedbackPill tone="error">{sendError}</FeedbackPill>
               )}
             </div>
          </div>

        </form>



      </div>
  );
}
