"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { PageHeader } from "@/src/ui/components/screens/PageHeader";

type AuditLogRow = {
   _id: string;
   actionType: string;
   actorName: string;
   entityId?: string;
   timestamp: number;
   metadata?: string;
};

const MOCK_LOG_BASE_TIMESTAMP = new Date("2026-01-01T12:00:00.000Z").getTime();

const fallbackLogs: AuditLogRow[] = [
   {
      _id: "mock-log-1a2b3c",
      actionType: "UPDATE_COMPANY",
      actorName: "Anthony (SuperAdmin)",
      entityId: "comp_291039",
      timestamp: MOCK_LOG_BASE_TIMESTAMP - 1000 * 60 * 5,
      metadata: "{\"field\":\"security_policy\",\"status\":\"enforced\"}"
   },
   {
      _id: "mock-log-4d5e6f",
      actionType: "TOGGLE_PII",
      actorName: "System Subroutine",
      entityId: "system_global",
      timestamp: MOCK_LOG_BASE_TIMESTAMP - 1000 * 60 * 120,
      metadata: "{\"rule\":\"maskCreditCards\",\"newState\":true}"
   },
   {
      _id: "mock-log-7g8h9i",
      actionType: "DELETE_USER",
      actorName: "Anthony (SuperAdmin)",
      entityId: "usr_malicious_99",
      timestamp: MOCK_LOG_BASE_TIMESTAMP - 1000 * 60 * 60 * 24,
      metadata: "{\"reason\":\"TOS Violation\",\"email\":\"spam@fake.com\"}"
   },
   {
      _id: "mock-log-xjx9a1",
      actionType: "CREATE_INVITE",
      actorName: "Regional Admin",
      entityId: "inv_91823",
      timestamp: MOCK_LOG_BASE_TIMESTAMP - 1000 * 60 * 60 * 48,
      metadata: "{\"role\":\"USER\",\"companyId\":\"comp_812\"}"
   }
];

export default function AuditLogDetail() {
   const params = useParams();
   const id = params.id as string;
   const t = useTranslations('admin.auditLogs.detailPage');

   const logs = useQuery(api.auditLogs.getRecentLogs);

   if (logs === undefined) {
      return <div className="p-12 flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>;
   }

   // Mock data fallback if DB is empty to match the feed
   const activeLogs: AuditLogRow[] = logs.length > 0 ? logs : fallbackLogs;

   const log = activeLogs.find((entry) => entry._id === id);

   return (
      <div className="flex flex-col gap-6 w-full antialiased pb-20">
         <Link
            href="/admin/governance/audit-trail"
            className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors w-fit group"
         >
            <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
            {t('back')}
         </Link>

         {log ? (
            <div className="flex flex-col gap-8 mt-4">
               <PageHeader
                  icon={<ShieldAlert className="w-6 h-6 text-brand" />}
                  title={t('title')}
                  description={t('subtitle', { id: log._id })}
               />

               <div className="p-8 rounded-[24px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm flex flex-col gap-6">
                  <div className="grid grid-cols-2 gap-8">
                     <div className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t('eventSignature')}</span>
                        <span className="text-[12px] font-mono tracking-widest text-foreground bg-foreground/5 w-fit px-2 py-1 rounded-[4px] border border-border-dim">
                           {log.actionType}
                        </span>
                     </div>

                     <div className="flex flex-col gap-1">
                        <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t('timestamp')}</span>
                        <span className="text-[14px] text-secondary font-medium mt-1">
                           {new Date(log.timestamp).toUTCString().replace('GMT', 'UTC')}
                        </span>
                     </div>

                     <div className="flex flex-col gap-1 mt-2">
                        <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t('executionActor')}</span>
                        <span className="text-[14px] text-secondary font-medium">
                           {log.actorName}
                        </span>
                     </div>

                     <div className="flex flex-col gap-1 mt-2">
                        <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t('targetObject')}</span>
                        <span className="text-[13px] font-mono text-secondary mt-1">
                           {log.entityId || t('unboundContext')}
                        </span>
                     </div>
                  </div>

                  <div className="flex flex-col gap-2 mt-4 pt-6 border-t border-border-dim/50">
                     <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">{t('decryptedPayload')}</span>
                     <div className="bg-black/20 backdrop-blur-xl p-6 rounded-[16px] border border-border-dim/50 shadow-inner overflow-x-auto custom-scrollbar">
                        <pre className="text-[13px] text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                           {log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2) : t('noMetadata')}
                        </pre>
                     </div>
                  </div>
               </div>
            </div>
         ) : (
            <div className="p-12 text-center flex flex-col items-center gap-4 border border-border-dim rounded-[24px] bg-card/40 mt-8">
               <ShieldAlert className="w-12 h-12 text-muted" />
               <span className="text-[14px] font-medium text-foreground">{t('error.title')}</span>
               <p className="text-[13px] text-muted max-w-sm leading-relaxed">
                  {t('error.message')}
               </p>
            </div>
         )}
      </div>
   );
}
