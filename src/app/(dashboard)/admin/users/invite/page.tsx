"use client";

import { lazy, Suspense, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, Mail, ShieldCheck, User as UserIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import type { Id } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";

const InviteDispatchScreen = lazy(() =>
  import("@/src/app/(dashboard)/admin/_features/invites/InviteDispatchScreen").then(
    ({ InviteDispatchScreen }) => ({ default: InviteDispatchScreen })
  )
);

function InviteLoading() {
  return (
    <div className="w-full flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-muted" />
    </div>
  );
}

/**
 * Inviting anyone from the admin desk: the shared screen with this page's
 * own plain words, a three-way role choice, and — for super admins — a
 * workspace picker that decides which company the invite lands in. Words
 * that match the shared catalogue are not repeated here; the screen falls
 * back to `admin.invites` for them.
 */
export default function InviteUsersPage() {
  const t = useTranslations('admin.users.invitePage');
  const { platformName } = useSystemSettings();

  const user = useQuery(api.users.getMe);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";
  const companyOptions = useQuery(api.companies.getCompanyOptions, isSuperAdmin ? {} : "skip") || [];

  const [inviteRole, setInviteRole] = useState<"USER" | "ADMIN" | "SUPER_ADMIN">("USER");
  const [inviteCompanyId, setInviteCompanyId] = useState<string>("");

  if (user === undefined) {
    return <InviteLoading />;
  }

  return (
    <Suspense fallback={<InviteLoading />}>
      <InviteDispatchScreen
      companyId={isSuperAdmin && inviteCompanyId ? (inviteCompanyId as Id<"companies">) : undefined}
      role={inviteRole}
      header={
        <div className="flex flex-col gap-2 border-b border-border-dim/50 pb-6">
          <h1 className="text-[24px] font-bold tracking-tight text-foreground flex items-center gap-3">
            <Mail className="w-6 h-6 text-brand" />
            {t('title')}
          </h1>
          <p className="text-[14px] text-secondary max-w-xl leading-relaxed">
            {t('description')}
          </p>
        </div>
      }
      roleSelector={
        <div className="flex flex-col gap-2">
          <span className="mt-1 text-[12px] font-medium text-secondary">{t('fields.role.label')}</span>
          <div className="grid grid-cols-2 gap-3 h-[46px]">
            {/* This pair stays raw: selected-state role cards whose fills swap with selection — matches no variant. */}
            <button
              type="button"
              onClick={() => setInviteRole("USER")}
              className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${inviteRole === "USER" ? "bg-foreground/10 border-foreground/20 text-foreground" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
            >
              <UserIcon className="w-4 h-4" /> {t('fields.role.standardUser')}
            </button>
            <button
              type="button"
              onClick={() => setInviteRole("ADMIN")}
              className={`flex items-center justify-center gap-2 rounded-[12px] text-[13px] font-medium border transition-all h-full ${inviteRole === "ADMIN" ? "bg-brand/20 border-brand/30 text-brand" : "bg-black/20 border-border-dim text-secondary hover:text-foreground"}`}
            >
              <ShieldCheck className="w-4 h-4" /> {t('fields.role.systemAdmin')}
            </button>
          </div>
        </div>
      }
      targetingExtra={isSuperAdmin && (
        <div className="flex flex-col gap-2">
          <label htmlFor="invite-company" className="mt-1 text-[12px] font-medium text-secondary">{t('fields.company.label')}</label>
          <select
            id="invite-company"
            value={inviteCompanyId}
            onChange={e => setInviteCompanyId(e.target.value)}
            className="h-[46px] w-full rounded-[12px] border border-border-dim bg-black/20 px-4 text-[14px] text-foreground outline-none transition-colors focus:border-brand/50"
          >
            <option value="">{t('fields.company.noCompany')}</option>
            {companyOptions.map((c) => (
              <option key={c._id} value={c._id}>{c.name}</option>
            ))}
          </select>
        </div>
      )}
      previewCta={(label) => (
        /* Stays raw: an inert white-on-black mock inside the email preview — not a themed control. */
        <button type="button" className="bg-white text-black font-medium px-5 py-2.5 rounded-[10px] text-[13px] pointer-events-none">
          {label}
        </button>
      )}
      text={{
        step1: t('steps.targeting'),
        step2: t('steps.payload'),
        emailLabel: t('fields.email.label'),
        emailPlaceholder: t('fields.email.placeholder'),
        saveTemplate: t('actions.saveTemplate'),
        saved: t('actions.synchronized'),
        headlineLabel: t('fields.headline.label'),
        bodyLabel: t('fields.body.label'),
        ctaLabel: t('fields.cta.label'),
        previewHeadlineEmpty: t('preview.headlineEmpty'),
        previewBodyEmpty: t('preview.bodyEmpty'),
        previewCtaEmpty: t('preview.ctaEmpty'),
        previewFooter: t('preview.footer', { platformName }),
        sending: t('actions.sending'),
        send: t('actions.sendInvitation'),
        sendSuccess: t('messages.sendSuccess'),
        sendError: t('messages.sendError'),
      }}
      />
    </Suspense>
  );
}
