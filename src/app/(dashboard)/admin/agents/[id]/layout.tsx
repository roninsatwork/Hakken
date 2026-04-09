"use client";

import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { usePathname, useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Settings, Terminal, Library, Scale, Bot, Code2, Cpu, LayoutDashboard, FileText } from "lucide-react";
import { useTranslations } from "next-intl";

export default function AgentDashboardLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("admin.agents.details");
  const params = useParams();
  const agentId = params.id as Id<"agents">;
  const agent = useQuery(api.agents.get, { id: agentId });
  const pathname = usePathname();

  if (agent === undefined) {
    return <div className="p-8 text-secondary">{t("loading")}</div>;
  }
  if (agent === null) {
    return <div className="p-8 text-red-500">{t("notFound")}</div>;
  }

  const tabs = [
    { label: t('tabs.dashboard'), href: `/admin/agents/${agentId}`, icon: LayoutDashboard },
    { label: t('tabs.settings'), href: `/admin/agents/${agentId}/settings`, icon: Settings },
    { label: t('tabs.knowledge'), href: `/admin/agents/${agentId}/knowledge`, icon: Library },
    { label: t('tabs.prompt'), href: `/admin/agents/${agentId}/system-prompt`, icon: Terminal },
    { label: t('tabs.rules'), href: `/admin/agents/${agentId}/rules`, icon: Scale },
    { label: t('tabs.integrations'), href: `/admin/agents/${agentId}/integrations`, icon: Cpu },
    { label: t('tabs.schemas'), href: `/admin/agents/${agentId}/schemas`, icon: Code2 },
    { label: t('tabs.logs'), href: `/admin/agents/${agentId}/logs`, icon: FileText },
  ];

  return (
    <div className="flex flex-col gap-6 w-full h-full pl-2">
      <div className="flex flex-col gap-6 relative z-10">

        <header className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            {agent.avatar ? (
              <img src={agent.avatar} alt="Avatar" className="w-10 h-10 rounded-full border border-border-dim object-cover shadow-sm bg-card" />
            ) : (
              <div className="w-10 h-10 rounded-[10px] bg-card border border-border-dim flex items-center justify-center text-brand shadow-sm">
                <Bot className="w-5 h-5" />
              </div>
            )}
            <div className="flex flex-col gap-0.5">
              <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
                {agent.name || t('unnamed')}
              </h1>
              <p className="text-[13px] text-secondary mt-1 max-w-[500px] truncate">{agent.description || t('noDescription')}</p>
            </div>
          </div>

          <div className="flex items-center gap-3 z-20">
            <Link
              href="/admin/agents"
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              {t("backButton")}
            </Link>
          </div>
        </header>

        <div className="flex items-center gap-1 border-b border-border-dim/50 overflow-x-auto custom-scrollbar pb-px mt-2">
          {tabs.map(tab => {
            const Icon = tab.icon;
            // Ensure exact match for root route so it doesn't stay highlighted
            const isActive = tab.href === `/admin/agents/${agentId}`
              ? pathname === tab.href
              : pathname.startsWith(tab.href);

            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`flex items-center gap-2 px-4 py-3 text-[13px] font-medium transition-all border-b-2 whitespace-nowrap ${isActive
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

      <div className="relative z-10 flex-1 flex flex-col min-h-0 bg-transparent pt-4 w-full">
        {children}
      </div>
    </div>
  );
}
