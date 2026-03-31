"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { Building2, ArrowLeft, Users, Mail, Activity } from "lucide-react";

export default function CompanyDashboardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const pathname = usePathname();

  if (company === undefined) {
    return <div className="p-8 text-secondary">Loading workspace...</div>;
  }
  if (!company) {
    return <div className="p-8 text-red-500">Workspace not found</div>;
  }

  const tabs = [
    { label: 'Overview', href: `/admin/companies/${companyId}`, icon: Activity },
    { label: 'Directory', href: `/admin/companies/${companyId}/users`, icon: Users },
    { label: 'Invites', href: `/admin/companies/${companyId}/invites`, icon: Mail },
  ];

  return (
    <div className="flex flex-col gap-6 w-full h-full pl-2">
      <div className="flex flex-col gap-6 relative z-10">
        
        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
              <Building2 className="w-6 h-6 text-brand" />
              {company.name} Workspace
            </h1>
            <p className="text-[13px] text-secondary mt-1">Manage {company.name}&apos;s dedicated tenant isolation.</p>
          </div>
          
          <div className="flex items-center gap-4">
            <Link 
              href="/admin/companies" 
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Companies
            </Link>
          </div>
        </header>

        <div className="flex items-center gap-1 border-b border-border-dim/50 overflow-x-auto custom-scrollbar pb-px mt-2">
          {tabs.map(tab => {
             const Icon = tab.icon;
             const isActive = tab.href === `/admin/companies/${companyId}` 
               ? pathname === tab.href 
               : pathname.startsWith(tab.href);
               
             return (
               <Link 
                 key={tab.href}
                 href={tab.href}
                 className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${
                   isActive 
                   ? 'border-brand text-brand bg-brand/5' 
                   : 'border-transparent text-secondary hover:text-foreground hover:border-foreground/30'
                 } rounded-t-[8px]`}
               >
                 <Icon className="w-4 h-4" />
                 {tab.label}
               </Link>
             );
          })}
        </div>
      </div>
      
      <div className="relative z-10 flex-1 flex flex-col min-h-0 bg-transparent pt-4">
        {children}
      </div>
    </div>
  );
}
