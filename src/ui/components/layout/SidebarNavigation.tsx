"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Gamepad2,
  LayoutDashboard,
  Building2,
  LineChart,
  ChevronDown,
  Sidebar,
  Globe,
  Bot,
  ShieldCheck,
  Settings,
  Workflow,
  Home,
  Wrench,
  Rocket
} from "lucide-react";
import { cn } from "@/src/ui/lib/utils";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUI } from "@/src/context/UIContext";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { useTheme } from "next-themes";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";

interface NavItemProps {
  icon: React.ElementType<{ className?: string }>;
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

function getActiveItemFromPathname(pathname: string) {
  if (pathname === '/admin') return 'Admin Dashboard';
  if (pathname.startsWith('/admin/app-kits') || pathname.startsWith('/admin/launch')) return 'App Kits';
  if (pathname.startsWith('/admin/releases')) return 'Release Center';
  if (pathname.startsWith('/admin/run-observatory')) return 'Run Observatory';
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
  if (pathname.startsWith('/admin/agents/approvals')) return 'Agent Approvals';
  if (pathname.startsWith('/admin/agents/skills')) return 'Agent Skills';
  if (pathname.startsWith('/admin/agents')) return 'Manage Agents';
  if (pathname.startsWith('/admin/auth-diagnostics')) return 'Auth Diagnostics';
  if (pathname.startsWith('/admin/workflows/schedules')) return 'Schedules';
  if (pathname.startsWith('/admin/workflows/logs')) return 'Workflow Logs';
  if (pathname === '/admin/workflows') return 'Manage Workflows';
  if (pathname.startsWith('/admin/ai/rules')) return 'Rules';
  if (pathname.startsWith('/admin/settings/system-health')) return 'System Health';
  if (pathname.startsWith('/admin/settings/scripts')) return 'Scripts';
  if (pathname.startsWith('/admin/settings/webhook-deliveries')) return 'Webhook Deliveries';
  if (pathname.startsWith('/admin/settings/api-keys')) return 'API Keys';
  if (pathname === '/admin/settings/analytics') return 'Analytics';
  if (pathname.startsWith('/admin/settings')) return 'System Settings';
  if (pathname === '/app') return 'Dashboard';
  if (pathname.startsWith('/app/assistant')) return 'Assistant';
  if (pathname.startsWith('/app/properties')) return 'Properties';
  if (pathname.startsWith('/app/reports')) return 'Reports';
  if (pathname.startsWith('/app/profile')) return 'Profile';
  if (pathname === '/app/settings') return 'Organization Dashboard';
  if (pathname.startsWith('/app/settings/team')) return 'Organization Team';
  if (pathname.startsWith('/app/settings/auth-diagnostics')) return 'Auth Diagnostics';
  if (pathname.startsWith('/app/agents')) return 'Agents';
  if (pathname.startsWith('/app/arcade/ronins-run')) return 'RoninsRun';
  if (pathname.startsWith('/app/ai/rules')) return 'AIRules';
  if (pathname.startsWith('/demos')) return 'Demos';
  return pathname.startsWith('/admin') ? 'Admin Dashboard' : '';
}

function getDefaultOpenSections(pathname: string): Record<string, boolean> {
  const isAgentsActive = pathname.startsWith('/admin/app-kits') || pathname.startsWith('/admin/launch') || pathname.startsWith('/admin/releases') || pathname.startsWith('/admin/run-observatory') || pathname.startsWith('/admin/agents') || pathname.startsWith('/admin/workflows') || pathname.startsWith('/admin/ai/tools');

  return {
    workspace: true,
    businessHub: false,
    clients: false,
    companies: pathname.startsWith('/admin/companies'),
    superAdmins: pathname.startsWith('/admin/super-admins'),
    ai: true,
    agents: isAgentsActive,
    workflows: false,
    users: false,
    settings: pathname.startsWith('/admin/settings') &&
      !pathname.startsWith('/admin/settings/scripts') &&
      !pathname.startsWith('/admin/settings/system-health'),
    maintenance: pathname.startsWith('/admin/settings/scripts') ||
      pathname.startsWith('/admin/settings/system-health') ||
      pathname.startsWith('/admin/auth-diagnostics'),
    reports: false,
    organization: false,
    arcade: false,
    properties: false,
    demos: false,
  };
}

export default function SidebarNavigation() {
  const t = useTranslations('sidebar');
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
  const router = useRouter();
  const impersonateCompany = useMutation(api.users.impersonateCompany);
  const impersonatedCompany = useQuery(
    api.companies.getCompanyById,
    user?.impersonatingCompanyId ? { id: user.impersonatingCompanyId } : "skip"
  );

  const handleExitImpersonation = async () => {
    await impersonateCompany({ companyId: undefined });
    router.push("/admin/companies");
  };

  const pathnameActiveItem = getActiveItemFromPathname(pathname);
  const [manualActiveItem, setActiveItem] = useState(pathnameActiveItem);
  const activeItem = pathnameActiveItem || manualActiveItem;
  const defaultOpenSections = getDefaultOpenSections(pathname);
  const [sectionOverrides, setSectionOverrides] = useState<Record<string, boolean>>({});
  const openSections = { ...defaultOpenSections, ...sectionOverrides };

  const toggleSection = (section: string) => {
    setSectionOverrides(prev => ({ ...prev, [section]: !openSections[section] }));
  };

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
                <Image src={activeLogo} alt={settings.platformName} width={128} height={32} unoptimized className="h-8 w-auto object-contain" />
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
                        icon={Rocket}
                        label={t('launch')}
                        href="/admin/app-kits"
                        isActive={activeItem === 'App Kits' || pathname.startsWith('/admin/app-kits') || pathname.startsWith('/admin/launch')}
                        onClick={() => setActiveItem('App Kits')}
                      />
                    )}

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
                        isActive={
                          activeItem === 'Agents' || 
                          activeItem === 'Agent Approvals' ||
                          activeItem === 'Agent Skills' ||
                          activeItem === 'Release Center' ||
                          activeItem === 'Run Observatory' ||
                          activeItem === 'Manage Agents' || 
                          activeItem === 'Connectors' || 
                          activeItem === 'Workflows' || 
                          activeItem === 'Manage Workflows' || 
                          activeItem === 'Schedules' || 
                          activeItem === 'Workflow Logs'
                        }
                        onClick={() => setActiveItem('Agents')}
                        hasChildren
                        isOpen={openSections.agents}
                        onToggle={() => toggleSection('agents')}
                      >
                        <SubNavItem label={t('agentApprovals')} href="/admin/agents/approvals" isActive={pathname.startsWith('/admin/agents/approvals')} onClick={() => setActiveItem('Agent Approvals')} />
                        <SubNavItem label={t('agentSkills')} href="/admin/agents/skills" isActive={pathname.startsWith('/admin/agents/skills')} onClick={() => setActiveItem('Agent Skills')} />
                        <SubNavItem label={t('releaseCenter')} href="/admin/releases" isActive={pathname.startsWith('/admin/releases')} onClick={() => setActiveItem('Release Center')} />
                        <SubNavItem label={t('runObservatory')} href="/admin/run-observatory" isActive={pathname.startsWith('/admin/run-observatory')} onClick={() => setActiveItem('Run Observatory')} />
                        <SubNavItem label={t('manageAgents')} href="/admin/agents" isActive={pathname.startsWith('/admin/agents') && !pathname.startsWith('/admin/agents/approvals') && !pathname.startsWith('/admin/agents/skills')} onClick={() => setActiveItem('Manage Agents')} />
                        <SubNavItem label={t('connectors')} href="/admin/ai/tools" isActive={activeItem === 'Connectors' || pathname.startsWith('/admin/ai/tools')} onClick={() => setActiveItem('Connectors')} />
                        
                        <SubNavItem label={t('manageWorkflows')} href="/admin/workflows" isActive={pathname === '/admin/workflows'} onClick={() => setActiveItem('Manage Workflows')} />
                        <SubNavItem label={t('schedules')} href="/admin/workflows/schedules" isActive={pathname.startsWith('/admin/workflows/schedules')} onClick={() => setActiveItem('Schedules')} />
                        <SubNavItem label={t('workflowLogs')} href="/admin/workflows/logs" isActive={pathname.startsWith('/admin/workflows/logs')} onClick={() => setActiveItem('Workflow Logs')} />
                      </NavItem>
                    )}

                    {isSuperAdmin && (
                      <>
                        <NavItem
                          icon={Settings}
                          label={t('settings')}
                          isActive={(pathname.startsWith('/admin/settings') &&
                            !pathname.startsWith('/admin/settings/scripts') &&
                            !pathname.startsWith('/admin/settings/system-health')) ||
                            activeItem === 'System Settings' ||
                            activeItem === 'API Keys' ||
                            activeItem === 'Webhook Deliveries' ||
                            activeItem === 'Analytics'}
                          onClick={() => setActiveItem('System Settings')}
                          hasChildren
                          isOpen={openSections.settings}
                          onToggle={() => toggleSection('settings')}
                        >
                          <SubNavItem label={t('systemSettings')} href="/admin/settings" isActive={activeItem === 'System Settings' && pathname === '/admin/settings'} onClick={() => setActiveItem('System Settings')} />
                          <SubNavItem label="Plans" href="/admin/settings/plans" isActive={activeItem === 'Plans' || pathname.startsWith('/admin/settings/plans')} onClick={() => setActiveItem('Plans')} />
                          <SubNavItem label={t('apiKeys')} href="/admin/settings/api-keys" isActive={activeItem === 'API Keys' || pathname.startsWith('/admin/settings/api-keys')} onClick={() => setActiveItem('API Keys')} />
                          <SubNavItem label={t('webhookDeliveries')} href="/admin/settings/webhook-deliveries" isActive={activeItem === 'Webhook Deliveries' || pathname.startsWith('/admin/settings/webhook-deliveries')} onClick={() => setActiveItem('Webhook Deliveries')} />
                          <SubNavItem label={t('analytics')} href="/admin/settings/analytics" isActive={activeItem === 'Analytics' || pathname === '/admin/settings/analytics'} onClick={() => setActiveItem('Analytics')} />
                        </NavItem>

                        <NavItem
                          icon={Wrench}
                          label={t('maintenance')}
                          isActive={activeItem === 'Maintenance' ||
                            activeItem === 'Scripts' ||
                            activeItem === 'System Health' ||
                            activeItem === 'Auth Diagnostics' ||
                            pathname.startsWith('/admin/settings/scripts') ||
                            pathname.startsWith('/admin/settings/system-health') ||
                            pathname.startsWith('/admin/auth-diagnostics')}
                          onClick={() => setActiveItem('Maintenance')}
                          hasChildren
                          isOpen={openSections.maintenance}
                          onToggle={() => toggleSection('maintenance')}
                        >
                          <SubNavItem label={t('systemHealth')} href="/admin/settings/system-health" isActive={activeItem === 'System Health' || pathname.startsWith('/admin/settings/system-health')} onClick={() => setActiveItem('System Health')} />
                          <SubNavItem label={t('scripts')} href="/admin/settings/scripts" isActive={activeItem === 'Scripts' || pathname.startsWith('/admin/settings/scripts')} onClick={() => setActiveItem('Scripts')} />
                          <SubNavItem label={t('authDiagnostics')} href="/admin/auth-diagnostics" isActive={activeItem === 'Auth Diagnostics' || pathname.startsWith('/admin/auth-diagnostics')} onClick={() => setActiveItem('Auth Diagnostics')} />
                        </NavItem>

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
                      icon={Bot}
                      label={`Ask ${settings.platformName}`}
                      href="/app/assistant"
                      isActive={activeItem === 'Assistant' || pathname.startsWith('/app/assistant')}
                      onClick={() => setActiveItem('Assistant')}
                    />

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

                    <NavItem
                      icon={Home}
                      label={t('properties')}
                      isActive={activeItem === 'Properties' || pathname.startsWith('/app/properties')}
                      onClick={() => setActiveItem('Properties')}
                      hasChildren
                      isOpen={openSections.properties}
                      onToggle={() => toggleSection('properties')}
                    >
                      <SubNavItem label={t('propertiesSearch')} href="/app/properties/search" isActive={pathname === '/app/properties/search'} onClick={() => setActiveItem('Properties')} />
                      <SubNavItem label={t('propertiesScrapedData')} href="/app/properties/scraped-data" isActive={pathname === '/app/properties/scraped-data'} onClick={() => setActiveItem('Properties')} />
                      <SubNavItem label="Logs" href="/app/properties/logs" isActive={pathname === '/app/properties/logs'} onClick={() => setActiveItem('Properties')} />
                    </NavItem>

                    <NavItem
                      icon={Globe}
                      label="Posture Studio"
                      isActive={activeItem === 'Demos' || pathname.startsWith('/demos')}
                      onClick={() => setActiveItem('Demos')}
                      hasChildren
                      isOpen={openSections.demos}
                      onToggle={() => toggleSection('demos')}
                    >
                      <SubNavItem label="Studio Library" href="/demos/movements" isActive={pathname === '/demos/movements'} onClick={() => setActiveItem('Demos')} />

                    </NavItem>

                    {!isSuperAdmin && user?.role === "ADMIN" && (
                      <NavItem
                        icon={Building2}
                        label="Organization"
                        isActive={activeItem === 'Organization Dashboard' || activeItem === 'Organization Team' || activeItem === 'Auth Diagnostics'}
                        onClick={() => setActiveItem('Organization Dashboard')}
                        hasChildren
                        isOpen={openSections.organization}
                        onToggle={() => toggleSection('organization')}
                      >
                        <SubNavItem label="Dashboard" href="/app/settings" isActive={activeItem === 'Organization Dashboard'} onClick={() => setActiveItem('Organization Dashboard')} />
                        <SubNavItem label="Team Members" href="/app/settings/team" isActive={activeItem === 'Organization Team'} onClick={() => setActiveItem('Organization Team')} />
                        <SubNavItem label={t('authDiagnostics')} href="/app/settings/auth-diagnostics" isActive={activeItem === 'Auth Diagnostics' || pathname.startsWith('/app/settings/auth-diagnostics')} onClick={() => setActiveItem('Auth Diagnostics')} />
                      </NavItem>
                    )}

                    {settings.diagnosticRoutingEnabled && (
                      <NavItem
                        icon={Gamepad2}
                        label="Arcade"
                        isActive={activeItem === 'Arcade' || activeItem === 'RoninsRun'}
                        onClick={() => setActiveItem('Arcade')}
                        hasChildren
                        isOpen={openSections.arcade}
                        onToggle={() => toggleSection('arcade')}
                      >
                        <SubNavItem label="Ronin's Run" href="/app/arcade/ronins-run" isActive={activeItem === 'RoninsRun'} onClick={() => setActiveItem('RoninsRun')} />
                      </NavItem>
                    )}

                  </>
                )}
              </nav>
            </section>

            {user?.role === "SUPER_ADMIN" && user?.impersonatingCompanyId && (
              <div className="mt-auto border-t border-border-dim/30 pt-4 flex flex-col gap-3">
                <div className="p-3.5 rounded-[16px] bg-foreground/[0.02] border border-border-dim/50 flex flex-col gap-2.5">
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] font-mono tracking-widest text-secondary uppercase">
                      {t('impersonatingLabel')}
                    </span>
                    <span className="text-[13px] font-light text-foreground tracking-wide truncate">
                      {impersonatedCompany?.name || "Loading..."}
                    </span>
                  </div>
                  <button
                    onClick={handleExitImpersonation}
                    className="w-full text-center py-2 px-3 rounded-[8px] bg-foreground/5 hover:bg-foreground/10 text-foreground text-[11px] font-medium tracking-[0.08em] transition-all border border-border-dim/50 hover:scale-[1.02]"
                  >
                    {t('exitWorkspace')}
                  </button>
                </div>
              </div>
            )}

          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
