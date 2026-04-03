"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Loader2, ArrowLeft, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

export default function AuditLogDetail() {
  const params = useParams();
  const id = params.id as string;
  
  const logs = useQuery(api.auditLogs.getRecentLogs);
  
  if (logs === undefined) {
     return <div className="p-12 flex justify-center mt-20"><Loader2 className="w-8 h-8 animate-spin text-brand" /></div>;
  }

  // Mock data fallback if DB is empty to match the feed
  const activeLogs = logs.length > 0 ? logs : [
    {
       _id: "mock-log-1a2b3c",
       actionType: "UPDATE_COMPANY",
       actorName: "Anthony (SuperAdmin)",
       entityId: "comp_291039",
       timestamp: Date.now() - 1000 * 60 * 5,
       metadata: "{\"field\":\"security_policy\",\"status\":\"enforced\"}"
    },
    {
       _id: "mock-log-4d5e6f",
       actionType: "TOGGLE_PII",
       actorName: "System Subroutine",
       entityId: "system_global",
       timestamp: Date.now() - 1000 * 60 * 120,
       metadata: "{\"rule\":\"maskCreditCards\",\"newState\":true}"
    },
    {
       _id: "mock-log-7g8h9i",
       actionType: "DELETE_USER",
       actorName: "Anthony (SuperAdmin)",
       entityId: "usr_malicious_99",
       timestamp: Date.now() - 1000 * 60 * 60 * 24,
       metadata: "{\"reason\":\"TOS Violation\",\"email\":\"spam@fake.com\"}"
    },
    {
       _id: "mock-log-xjx9a1",
       actionType: "CREATE_INVITE",
       actorName: "Regional Admin",
       entityId: "inv_91823",
       timestamp: Date.now() - 1000 * 60 * 60 * 48,
       metadata: "{\"role\":\"USER\",\"companyId\":\"comp_812\"}"
    }
  ];
  
  const log = activeLogs.find((l: any) => l._id === id);

  return (
    <div className="flex flex-col gap-6 w-full antialiased pb-20">
      <Link 
        href="/admin/settings?tab=audit" 
        className="flex items-center gap-2 text-[13px] text-secondary hover:text-foreground transition-colors w-fit group"
      >
         <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
         Back to Audit Feed
      </Link>
      
      {log ? (
        <div className="flex flex-col gap-8 mt-4">
           <div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                 <ShieldAlert className="w-6 h-6 text-brand" />
                 Audit Trace Decryption
              </h1>
              <p className="text-[13px] text-secondary mt-1 tracking-wide">Immutable System Record #{log._id}</p>
           </div>
           
           <div className="p-8 rounded-[24px] bg-card/40 backdrop-blur-2xl border border-border-dim shadow-sm flex flex-col gap-6">
              <div className="grid grid-cols-2 gap-8">
                 <div className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">Event Signature</span>
                    <span className="text-[12px] font-mono tracking-widest text-foreground bg-foreground/5 w-fit px-2 py-1 rounded-[4px] border border-border-dim">
                       {log.actionType}
                    </span>
                 </div>
                 
                 <div className="flex flex-col gap-1">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">Timestamp (UTC)</span>
                    <span className="text-[14px] text-secondary font-medium mt-1">
                       {new Date(log.timestamp).toUTCString().replace('GMT', 'UTC')}
                    </span>
                 </div>
                 
                 <div className="flex flex-col gap-1 mt-2">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">Execution Actor</span>
                    <span className="text-[14px] text-secondary font-medium">
                       {log.actorName}
                    </span>
                 </div>

                 <div className="flex flex-col gap-1 mt-2">
                    <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">Target Object ID</span>
                    <span className="text-[13px] font-mono text-secondary mt-1">
                       {log.entityId || "Unbound Context"}
                    </span>
                 </div>
              </div>

              <div className="flex flex-col gap-2 mt-4 pt-6 border-t border-border-dim/50">
                 <span className="text-[11px] uppercase tracking-widest font-mono text-muted mb-1">Decrypted Payload</span>
                 <div className="bg-black/20 backdrop-blur-xl p-6 rounded-[16px] border border-border-dim/50 shadow-inner overflow-x-auto custom-scrollbar">
                    <pre className="text-[13px] text-secondary font-mono whitespace-pre-wrap leading-relaxed">
                       {log.metadata ? JSON.stringify(JSON.parse(log.metadata), null, 2) : "No serialized metadata payload attached to this trace."}
                    </pre>
                 </div>
              </div>
           </div>
        </div>
      ) : (
        <div className="p-12 text-center flex flex-col items-center gap-4 border border-border-dim rounded-[24px] bg-card/40 mt-8">
           <ShieldAlert className="w-12 h-12 text-muted" />
           <span className="text-[14px] font-medium text-foreground">Trace Integrity Failure</span>
           <p className="text-[13px] text-muted max-w-sm leading-relaxed">
             The requested audit record does not exist or has been permanently scrubbed by the Automated Purge Engine.
           </p>
        </div>
      )}
    </div>
  );
}
