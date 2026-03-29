"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { ArrowLeft, User, Mail, ShieldCheck, Clock, ShieldAlert, LineChart } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { motion } from "framer-motion";

export default function UserProfilePage() {
  const params = useParams();
  const userId = params.id as Id<"users">;

  // Assume user exists for the deep link
  const user = useQuery(api.users.getUserById, { id: userId });

  if (user === undefined) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 rounded-full border-t-2 border-brand animate-spin" />
      </div>
    );
  }

  if (user === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <ShieldAlert className="w-12 h-12 text-red-500/50" />
        <h2 className="text-xl font-medium text-foreground">User Not Found</h2>
        <Link href="/admin/users" className="text-sm text-secondary hover:text-foreground">
          &larr; Return to Directory
        </Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      {/* Navigation */}
      <div>
        <Link 
          href="/admin/users" 
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[13px] font-medium text-secondary hover:text-foreground hover:bg-foreground/5 transition-all border border-border-dim/50 shadow-sm"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Directory</span>
        </Link>
      </div>

      {/* Profile Header */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-col sm:flex-row items-start sm:items-center gap-8 bg-sidebar/40 border border-border-dim rounded-[32px] p-8 backdrop-blur-xl relative overflow-hidden shadow-2xl"
      >
        <div className="absolute top-0 right-0 w-64 h-64 bg-brand/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative">
          <img 
            src={user.image || `https://api.dicebear.com/7.x/notionists/svg?seed=${user.name}`} 
            alt={user.name}
            className="w-32 h-32 rounded-full border-4 border-card bg-card shadow-xl relative z-10"
          />
          <div className="absolute bottom-2 right-2 w-5 h-5 bg-[#10b981] border-[3px] border-card rounded-full z-20" />
        </div>

        <div className="flex-1 flex flex-col gap-2 relative z-10">
          <h1 className="text-4xl font-light tracking-wide text-foreground">{user.name}</h1>
          <div className="flex items-center gap-3 text-secondary">
            <div className="flex items-center gap-1.5">
              <Mail className="w-4 h-4" />
              <span className="text-[14px]">{user.email}</span>
            </div>
            <div className="w-1 h-1 rounded-full bg-border-dim" />
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-foreground/5 border border-border-dim">
              {user.role === 'ADMIN' ? <ShieldCheck className="w-3.5 h-3.5 text-brand" /> : <User className="w-3.5 h-3.5 text-foreground/70" />}
              <span className="text-[11px] font-mono tracking-widest text-foreground/80 uppercase">
                {user.role || 'USER'}
              </span>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Details Grid */}
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-1 md:grid-cols-2 gap-6"
      >
        <div className="flex flex-col gap-4 bg-sidebar/40 border border-border-dim rounded-[24px] p-6 backdrop-blur-xl shadow-sm">
          <h3 className="text-[11px] uppercase tracking-[0.2em] font-medium text-muted mb-2">Protocol Identities</h3>
          
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between border-b border-border-dim/50 pb-4">
              <span className="text-[13px] text-secondary">System ID</span>
              <span className="text-[13px] font-mono text-foreground/80 bg-foreground/5 px-2 py-0.5 rounded tracking-wider">{user._id}</span>
            </div>

            <div className="flex items-start justify-between border-b border-border-dim/50 pb-4">
              <span className="text-[13px] text-secondary">Auth Token Identifier</span>
              <span className="text-[13px] font-mono text-foreground/80 max-w-[200px] truncate" title={user.tokenIdentifier}>
                {user.tokenIdentifier.split('|')[0] === 'manual' ? 'Manual Registry' : user.tokenIdentifier}
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-[13px] text-secondary flex items-center gap-2">
                <Clock className="w-3.5 h-3.5" /> First Authenticated
              </span>
              <span className="text-[14px] font-medium text-foreground">
                {user.createdAt ? new Date(user.createdAt).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) : 'Unknown Origin'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 bg-sidebar/40 border border-border-dim rounded-[24px] p-6 backdrop-blur-xl shadow-sm">
          <h3 className="text-[11px] uppercase tracking-[0.2em] font-medium text-muted mb-2">Platform Activity</h3>
          
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-secondary">
            <LineChart className="w-8 h-8 opacity-40 text-muted" />
            <span className="text-[13px]">Activity metrics not yet integrated for this protocol.</span>
          </div>
        </div>
      </motion.div>

    </div>
  );
}
