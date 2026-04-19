"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gamepad2,
  LayoutDashboard,
  FolderKanban,
  Building2,
  Users2,
  Briefcase,
  LineChart,
  ChevronDown,
  Search,
  Sidebar,
  Apple,
  Globe,
  PenTool,
  Bot,
  ShieldCheck,
  Settings,
  Workflow,
  Network
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUI } from "@/src/context/UIContext";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTheme } from "next-themes";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";

interface NavItemProps {
  icon: React.ElementType;
  label: string;
  isActive?: boolean;
  hasChildren?: boolean;
  isOpen?: boolean;
  onToggle?: () => void;
  onClick?: () => void;
  children?: React.ReactNode;
  href?: string;
}

function SubNavItem({ label, isActive, onClick, href }: { label: string, isActive: boolean, onClick: () => void, href?: string }) {
  const content = (
    <>
      {isActive && (
        <motion.div
          layoutId="active-pill"
          className="absolute inset-0 bg-foreground/10 border border-border-dim rounded-[8px] z-0 shadow-sm"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <span className="relative z-10">{label}</span>
    </>
  );

  const className = cn(
    "py-1.5 px-3 rounded-[8px] text-[13px] tracking-wide transition-all relative group text-left block w-full",
    isActive ? "text-foreground font-medium" : "text-secondary hover:text-foreground"
  );

  if (href) {
    return (
      <Link href={href} onClick={onClick} className={className}>
        {content}
      </Link>
    );
  }

  return (
    <button onClick={onClick} className={className}>
      {content}
    </button>
  );
}

function NavItem({ icon: Icon, label, isActive, hasChildren, isOpen, onToggle, onClick, children, href }: NavItemProps) {
  const content = (
    <>
      {isActive && (
        <motion.div
          layoutId="active-pill"
          className="absolute inset-0 bg-foreground/10 border border-border-dim rounded-[10px] z-0 shadow-sm"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <div className="flex items-center gap-3 relative z-10">
        <Icon className={cn("w-[18px] h-[18px]", isActive ? "text-foreground" : "text-secondary group-hover:text-foreground")} />
        <span>{label}</span>
      </div>
      {hasChildren && (
        <motion.div
          initial={false}
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
          className="relative z-10"
        >
          <ChevronDown className={cn("w-3.5 h-3.5", isActive ? "text-foreground" : "text-muted")} />
        </motion.div>
      )}
    </>
  );

  const className = cn(
    "flex items-center justify-between w-full px-3 py-[7px] rounded-[10px] text-[13px] font-medium transition-all group relative",
    isActive
      ? "text-foreground"
      : "text-secondary py-[11px] hover:text-foreground hover:bg-hover/50"
  );

  const renderClickable = () => {
    if (href && !hasChildren) {
      return (
        <Link href={href} onClick={onClick} className={className}>
          {content}
        </Link>
      );
    }
    return (
      <button onClick={hasChildren ? (onToggle || onClick) : onClick} className={className}>
        {content}
      </button>
    );
  };

  return (
    <div className="flex flex-col mb-0.5 relative">
      {renderClickable()}


      <AnimatePresence initial={false}>
        {hasChildren && isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="pl-6 pr-1 py-1 flex flex-col gap-0.5 mt-1 ml-4 border-l border-border-dim/30">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function SidebarNavigation() {
  const t = useTranslations('sidebar');
  const tc = useTranslations('common');
  const pathname = usePathname();
  const { isSidebarOpen, setIsSidebarOpen } = useUI();
  const settings = useSystemSettings();
  const { theme, systemTheme } = useTheme();

  const currentTheme = theme === "system" ? systemTheme : theme;
  const activeLogo = currentTheme === "dark" && settings.logoUrlDark
    ? settings.logoUrlDark
    : settings.logoUrlLight;

  const isAdmin = pathname.startsWith('/admin');

  const user = useQuery(api.users.getMe);
  const isSuperAdmin = user?.role === "SUPER_ADMIN";

  const [activeItem, setActiveItem] = useState(() => {
    if (pathname === '/admin') return 'Admin Dashboard';
    if (pathname.startsWith('/admin/companies')) return 'Companies';
    if (pathname.startsWith('/admin/super-admins')) return 'System Admins';
    if (pathname === '/admin/users/invite') return 'Invitations';
    if (pathname.startsWith('/admin/users')) return 'Manage Users';
    if (pathname.startsWith('/admin/ai/system-prompt')) return 'System Prompt';
    if (pathname.startsWith('/admin/ai/global-knowledge')) return 'Global Knowledge';
    if (pathname.startsWith('/admin/ai/widget')) return 'Widget';
    if (pathname.startsWith('/admin/ai/models')) return 'Models';
    if (pathname.startsWith('/admin/ai/chat-logs')) return 'Chat Logs';
    if (pathname.startsWith('/admin/ai/tools')) return 'Connectors';
    if (pathname.startsWith('/admin/ai/costs')) return 'Running Costs';
    if (pathname.startsWith('/admin/agents')) return 'Manage Agents';
    if (pathname.startsWith('/admin/workflows/schedules')) return 'Schedules';
    if (pathname.startsWith('/admin/workflows/logs')) return 'Workflow Logs';
    if (pathname === '/admin/workflows') return 'Manage Workflows';
    if (pathname.startsWith('/admin/ai/rules')) return 'Rules';
    if (pathname === '/admin/settings/analytics') return 'Analytics';
    if (pathname.startsWith('/admin/settings')) return 'System Settings';
    if (pathname === '/app') return 'Dashboard';
    if (pathname.startsWith('/app/reports')) return 'Reports';
    if (pathname.startsWith('/app/profile')) return 'Profile';
    if (pathname === '/app/settings') return 'Organization Dashboard';
    if (pathname.startsWith('/app/settings/team')) return 'Organization Team';
    if (pathname.startsWith('/app/arcade/ronin')) return 'RoninsRun';
    if (pathname.startsWith('/app/arcade')) return 'Arcade';
    return isAdmin ? 'Admin Dashboard' : '';
  });
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    workspace: true,
    businessHub: false,
    clients: false,
    companies: false,
    superAdmins: false,
    ai: true,
    agents: false,
    workflows: false,
    users: false,
    settings: false,
    reports: false,
    organization: false,
    arcade: false
  });

  const toggleSection = (section: string) => {
    setOpenSections(prev => ({ ...prev, [section]: !prev[section] }));
  };

  useEffect(() => {
    if (pathname === '/admin') setActiveItem('Admin Dashboard');
    else if (pathname.startsWith('/admin/companies')) setActiveItem('Companies');
    else if (pathname.startsWith('/admin/super-admins')) setActiveItem('System Admins');
    else if (pathname === '/admin/users/invite') setActiveItem('Invitations');
    else if (pathname.startsWith('/admin/users')) setActiveItem('Manage Users');
    else if (pathname.startsWith('/admin/ai/system-prompt')) setActiveItem('System Prompt');
    else if (pathname.startsWith('/admin/ai/global-knowledge')) setActiveItem('Global Knowledge');
    else if (pathname.startsWith('/admin/ai/widget')) setActiveItem('Widget');
    else if (pathname.startsWith('/admin/ai/models')) setActiveItem('Models');
    else if (pathname.startsWith('/admin/ai/chat-logs')) setActiveItem('Chat Logs');
    else if (pathname.startsWith('/admin/ai/tools')) setActiveItem('Connectors');
    else if (pathname.startsWith('/admin/ai/rules')) setActiveItem('Rules');
    else if (pathname.startsWith('/admin/agents')) setActiveItem('Manage Agents');
    else if (pathname.startsWith('/admin/workflows/schedules')) setActiveItem('Schedules');
    else if (pathname.startsWith('/admin/workflows/logs')) setActiveItem('Workflow Logs');
    else if (pathname === '/admin/workflows') setActiveItem('Manage Workflows');
    else if (pathname.startsWith('/admin/ai/costs')) setActiveItem('Running Costs');
    else if (pathname === '/admin/settings/analytics') setActiveItem('Analytics');
    else if (pathname.startsWith('/admin/settings')) setActiveItem('System Settings');
    else if (pathname.startsWith('/app/reports')) setActiveItem('Reports');
    else if (pathname === '/app/settings') setActiveItem('Organization Dashboard');
    else if (pathname.startsWith('/app/settings/team')) setActiveItem('Organization Team');
    else if (pathname.startsWith('/app/arcade/ronin')) setActiveItem('RoninsRun');
    else if (pathname.startsWith('/app/arcade')) setActiveItem('Arcade');
    else if (pathname === '/app') setActiveItem('Dashboard');
    else if (pathname.startsWith('/app/profile')) setActiveItem('Profile');
  }, [pathname]);

  return (
    <AnimatePresence mode="wait">
      {isSidebarOpen && (
        <motion.aside
          initial={{ x: -240, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -240, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30, mass: 1 }}
          className="fixed left-0 top-0 bottom-0 w-[240px] bg-sidebar border-r border-border-dim/50 flex flex-col z-50 shadow-2xl"
        >

          {/* Header Area */}
          <div className="flex items-center justify-between px-5 pt-8 pb-5">
            <Link href="/" className="flex items-center gap-3 group">
              {activeLogo ? (
                <img src={activeLogo} alt={settings.platformName} className="h-8 object-contain" />
              ) : (
                <div className="w-[30px] h-[30px] rounded-[8px] bg-card border border-border-dim flex items-center justify-center relative shadow-sm">
                  <div className="w-[18px] h-[18px] text-brand flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="w-full h-full">
                      <path d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m0-12.728l.707.707m11.314 11.314l.707.707" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  </div>
                </div>
              )}
              {!activeLogo && (
                <span className="font-bold text-[18px] text-foreground tracking-tight group-hover:opacity-90 transition-opacity">
                  {settings.platformName}
                </span>
              )}
            </Link>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="text-muted hover:text-foreground transition-colors border border-transparent hover:border-border-dim p-1.5 rounded-md"
            >
              <Sidebar className="w-[18px] h-[18px]" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col pt-6 pb-8 px-4 gap-6">

            <section>
              <div className="mb-3 px-3">
                <span className="text-[11px] font-mono tracking-[0.15em] text-muted uppercase">
                  {isAdmin ? t('admin') : t('navigation')}
                </span>
              </div>

              <nav>
                {isAdmin ? (
                  <>
                    <NavItem
                      icon={LayoutDashboard}
                      label={t('dashboard')}
                      href="/admin"
                      isActive={activeItem === 'Admin Dashboard' || (pathname === '/admin')}
                      onClick={() => setActiveItem('Admin Dashboard')}
                    />

                    {isSuperAdmin && (
                      <NavItem
                        icon={Building2}
                        label={t('companies')}
                        isActive={activeItem === 'Companies' || pathname.startsWith('/admin/companies')}
                        onClick={() => setActiveItem('Companies')}
                        hasChildren
                        isOpen={openSections.companies}
                        onToggle={() => toggleSection('companies')}
                      >
                        <SubNavItem label={t('manageCompanies')} href="/admin/companies" isActive={pathname.startsWith('/admin/companies')} onClick={() => setActiveItem('Companies')} />
                      </NavItem>
                    )}

                    <NavItem
                      icon={Bot}
                      label={t('ai')}
                      isActive={activeItem === 'Artificial Intelligence' || activeItem === 'System Prompt' || activeItem === 'Global Knowledge' || activeItem === 'Widget' || activeItem === 'Models' || activeItem === 'Rules' || activeItem === 'Chat Logs' || activeItem === 'Running Costs'}
                      onClick={() => setActiveItem('Artificial Intelligence')}
                      hasChildren
                      isOpen={openSections.ai}
                      onToggle={() => toggleSection('ai')}
                    >
                      <SubNavItem label={t('runningCosts')} href="/admin/ai/costs" isActive={activeItem === 'Running Costs' || pathname.startsWith('/admin/ai/costs')} onClick={() => setActiveItem('Running Costs')} />

                      {isSuperAdmin && (
                        <>
                          <SubNavItem label={t('chatLogs')} href="/admin/ai/chat-logs" isActive={activeItem === 'Chat Logs' || pathname.startsWith('/admin/ai/chat-logs')} onClick={() => setActiveItem('Chat Logs')} />
                          <SubNavItem label={t('rules')} href="/admin/ai/rules" isActive={activeItem === 'Rules' || pathname.startsWith('/admin/ai/rules')} onClick={() => setActiveItem('Rules')} />
                          <SubNavItem label={t('systemPrompt')} href="/admin/ai/system-prompt" isActive={activeItem === 'System Prompt' || pathname === '/admin/ai/system-prompt'} onClick={() => setActiveItem('System Prompt')} />
                          <SubNavItem label={t('globalKnowledge')} href="/admin/ai/global-knowledge" isActive={activeItem === 'Global Knowledge' || pathname.startsWith('/admin/ai/global-knowledge')} onClick={() => setActiveItem('Global Knowledge')} />
                          <SubNavItem label="Widget" href="/admin/ai/widget" isActive={activeItem === 'Widget' || pathname.startsWith('/admin/ai/widget')} onClick={() => setActiveItem('Widget')} />
                          <SubNavItem label={t('models')} href="/admin/ai/models" isActive={activeItem === 'Models' || pathname.startsWith('/admin/ai/models')} onClick={() => setActiveItem('Models')} />
                        </>
                      )}
                    </NavItem>

                    {isSuperAdmin && (
                      <NavItem
                        icon={Workflow}
                        label={t('agents')}
                        isActive={activeItem === 'Agents' || activeItem === 'Manage Agents' || activeItem === 'Connectors'}
                        onClick={() => setActiveItem('Agents')}
                        hasChildren
                        isOpen={openSections.agents}
                        onToggle={() => toggleSection('agents')}
                      >
                        <SubNavItem label={t('manageAgents')} href="/admin/agents" isActive={pathname.startsWith('/admin/agents')} onClick={() => setActiveItem('Manage Agents')} />
                        <SubNavItem label={t('connectors')} href="/admin/ai/tools" isActive={activeItem === 'Connectors' || pathname.startsWith('/admin/ai/tools')} onClick={() => setActiveItem('Connectors')} />
                      </NavItem>
                    )}

                    {isSuperAdmin && (
                      <NavItem
                        icon={Network}
                        label={t('workflows')}
                        isActive={activeItem === 'Workflows' || activeItem === 'Manage Workflows' || activeItem === 'Schedules' || activeItem === 'Workflow Logs'}
                        onClick={() => setActiveItem('Workflows')}
                        hasChildren
                        isOpen={openSections.workflows}
                        onToggle={() => toggleSection('workflows')}
                      >
                        <SubNavItem label={t('manageWorkflows')} href="/admin/workflows" isActive={pathname === '/admin/workflows'} onClick={() => setActiveItem('Manage Workflows')} />
                        <SubNavItem label={t('schedules')} href="/admin/workflows/schedules" isActive={pathname.startsWith('/admin/workflows/schedules')} onClick={() => setActiveItem('Schedules')} />
                        <SubNavItem label={t('workflowLogs')} href="/admin/workflows/logs" isActive={pathname.startsWith('/admin/workflows/logs')} onClick={() => setActiveItem('Workflow Logs')} />
                      </NavItem>
                    )}

                    {isSuperAdmin && (
                      <>
                        <NavItem
                          icon={ShieldCheck}
                          label={t('systemAdmins')}
                          isActive={activeItem === 'System Admins' || pathname.startsWith('/admin/super-admins')}
                          onClick={() => setActiveItem('System Admins')}
                          hasChildren
                          isOpen={openSections.superAdmins}
                          onToggle={() => toggleSection('superAdmins')}
                        >
                          <SubNavItem label={t('systemAdmins')} href="/admin/super-admins" isActive={pathname === '/admin/super-admins'} onClick={() => setActiveItem('System Admins')} />
                          <SubNavItem label={t('invitations')} href="/admin/super-admins/invite" isActive={pathname.startsWith('/admin/super-admins/invite')} onClick={() => setActiveItem('System Admins')} />
                        </NavItem>

                        <NavItem
                          icon={Settings}
                          label={t('settings')}
                          isActive={activeItem === 'System Settings' || activeItem === 'Analytics'}
                          onClick={() => setActiveItem('System Settings')}
                          hasChildren
                          isOpen={openSections.settings}
                          onToggle={() => toggleSection('settings')}
                        >
                          <SubNavItem label={t('systemSettings')} href="/admin/settings" isActive={activeItem === 'System Settings' && pathname === '/admin/settings'} onClick={() => setActiveItem('System Settings')} />
                          <SubNavItem label="Plans" href="/admin/settings/plans" isActive={activeItem === 'Plans' || pathname.startsWith('/admin/settings/plans')} onClick={() => setActiveItem('Plans')} />
                          <SubNavItem label={t('analytics')} href="/admin/settings/analytics" isActive={activeItem === 'Analytics' || pathname === '/admin/settings/analytics'} onClick={() => setActiveItem('Analytics')} />
                        </NavItem>
                      </>
                    )}
                  </>
                ) : (
                  <>
                    <NavItem
                      icon={LayoutDashboard}
                      label={t('dashboard')}
                      href="/app"
                      isActive={activeItem === 'Dashboard' || (pathname === '/app')}
                      onClick={() => setActiveItem('Dashboard')}
                    />

                    <NavItem
                      icon={FolderKanban}
                      label={t('workspace')}
                      isActive={activeItem === 'Workspace'}
                      onClick={() => setActiveItem('Workspace')}
                      hasChildren
                      isOpen={openSections.workspace}
                      onToggle={() => toggleSection('workspace')}
                    >
                      <SubNavItem label={`${settings.platformName} ${t('assistant')}`} href="/app/assistant" isActive={activeItem === 'Assistant'} onClick={() => setActiveItem('Assistant')} />
                      <SubNavItem label={t('agenticTesting')} href="/app/agentic-testing" isActive={activeItem === 'Agentic Testing'} onClick={() => setActiveItem('Assistant')} />
                    </NavItem>

                    <NavItem
                      icon={LineChart}
                      label="Reports"
                      isActive={activeItem === 'Reports'}
                      onClick={() => setActiveItem('Reports')}
                      hasChildren
                      isOpen={openSections.reports}
                      onToggle={() => toggleSection('reports')}
                    >
                      <SubNavItem label="Sales Report" href="/app/reports" isActive={activeItem === 'Reports'} onClick={() => setActiveItem('Reports')} />
                    </NavItem>

                    {!isSuperAdmin && user?.role === "ADMIN" && (
                      <NavItem
                        icon={Building2}
                        label="Organization"
                        isActive={activeItem === 'Organization Dashboard' || activeItem === 'Organization Team'}
                        onClick={() => setActiveItem('Organization Dashboard')}
                        hasChildren
                        isOpen={openSections.organization}
                        onToggle={() => toggleSection('organization')}
                      >
                        <SubNavItem label="Dashboard" href="/app/settings" isActive={activeItem === 'Organization Dashboard'} onClick={() => setActiveItem('Organization Dashboard')} />
                        <SubNavItem label="Team Members" href="/app/settings/team" isActive={activeItem === 'Organization Team'} onClick={() => setActiveItem('Organization Team')} />
                      </NavItem>
                    )}

                    {(settings as any).diagnosticRoutingEnabled && (
                      <NavItem
                        icon={Gamepad2}
                        label="Arcade"
                        isActive={activeItem === 'Arcade' || activeItem === 'RoninsRun'}
                        onClick={() => setActiveItem('Arcade')}
                        hasChildren
                        isOpen={openSections.arcade}
                        onToggle={() => toggleSection('arcade')}
                      >
                        <SubNavItem label="Ronin's Run" href="/app/arcade/ronin" isActive={activeItem === 'RoninsRun'} onClick={() => setActiveItem('RoninsRun')} />
                      </NavItem>
                    )}

                  </>
                )}
              </nav>
            </section>



          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
