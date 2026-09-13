"use client";

import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Bot,
  Workflow,
  ShieldCheck,
  Settings,
  Wrench,
  Globe,
  Home,
  LineChart,
  ListChecks,
  MonitorSpeaker,
  Phone,
  Gamepad2,
} from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { CORE_MODULES } from "@/convex/utils/coreModules";
import {
  POSTURE_STUDIO_MODULE_KEY,
  PROPERTIES_MODULE_KEY,
  REPORTS_MODULE_KEY,
} from "@/convex/utils/coreModules";
import {
  NavItem,
  OptionalNavSection,
  SalesDataNavItem,
  SubNavItem,
  isSystemSettingsRoute,
} from "./SidebarNavigation";

export function AdminNavTree({
  activeItem,
  setActiveItem,
  openSections,
  toggleSection,
  isAuditor,
  canSeeAdminSections,
  pendingApprovals,
  pendingWorkflowApprovals,
}: {
  activeItem: string;
  setActiveItem: Dispatch<SetStateAction<string>>;
  openSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  isAuditor: boolean;
  canSeeAdminSections: boolean;
  pendingApprovals: { count: number; atLimit: boolean } | undefined;
  pendingWorkflowApprovals: { count: number; atLimit: boolean } | undefined;
}) {
  const t = useTranslations('sidebar');
  const pathname = usePathname();

  return (
    <>
  {!isAuditor && (
    <NavItem
      icon={LayoutDashboard}
      label={t('dashboard')}
      href="/admin"
      isActive={activeItem === 'Admin Dashboard' || (pathname === '/admin')}
      onClick={() => setActiveItem('Admin Dashboard')}
    />
  )}

  {canSeeAdminSections && (
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
    isActive={activeItem === 'Artificial Intelligence' || pathname.startsWith('/admin/ai')}
    onClick={() => setActiveItem('Artificial Intelligence')}
    hasChildren
    isOpen={openSections.ai}
    onToggle={() => toggleSection('ai')}
  >
    <SubNavItem label={t('manageGlobalAi')} href="/admin/ai" isActive={pathname === '/admin/ai' || (pathname.startsWith('/admin/ai') && !pathname.startsWith('/admin/ai/tools') && !pathname.startsWith('/admin/ai/tool-servers'))} onClick={() => setActiveItem('Artificial Intelligence')} />
    {/* Nothing linked here. The tool catalogue was reachable
        only by typing the URL, which is why the one screen
        deciding what an agent can actually do had never been
        opened. */}
    <SubNavItem label={t('tools')} href="/admin/ai/tools" isActive={pathname === '/admin/ai/tools' || (pathname.startsWith('/admin/ai/tools/') && !pathname.startsWith('/admin/ai/tool-servers'))} onClick={() => setActiveItem('Tools')} />
    <SubNavItem label={t('toolServers')} href="/admin/ai/tool-servers" isActive={pathname.startsWith('/admin/ai/tool-servers')} onClick={() => setActiveItem('Tool Servers')} />
  </NavItem>

  {canSeeAdminSections && (
    <NavItem
      icon={Workflow}
      label={t('agents')}
      isActive={
        activeItem === 'Agents' || 
        activeItem === 'Agent Approvals' ||
        activeItem === 'Manage Agents' || 
        activeItem === 'Workflows' || 
        activeItem === 'Manage Workflows' ||
        activeItem === 'Workflow Runs' || 
        activeItem === 'Schedules'
      }
      onClick={() => setActiveItem('Agents')}
      hasChildren
      isOpen={openSections.agents}
      onToggle={() => toggleSection('agents')}
    >
      <SubNavItem label={t('manageAgents')} href="/admin/agents" isActive={pathname.startsWith('/admin/agents')} onClick={() => setActiveItem('Manage Agents')} />

      <SubNavItem label={t('manageWorkflows')} href="/admin/workflows" isActive={pathname === '/admin/workflows'} onClick={() => setActiveItem('Manage Workflows')} />
      <SubNavItem label={t('workflowRuns')} href="/admin/workflows/executions" isActive={pathname.startsWith('/admin/workflows/executions')} onClick={() => setActiveItem('Workflow Runs')} badge={pendingWorkflowApprovals?.count} badgeAtLimit={pendingWorkflowApprovals?.atLimit} />
      <SubNavItem label={t('schedules')} href="/admin/workflows/schedules" isActive={pathname.startsWith('/admin/workflows/schedules')} onClick={() => setActiveItem('Schedules')} />
    </NavItem>
  )}

  {/*
    After Agents and before Settings, at the top level.

    Top level rather than a child of Artificial Intelligence:
    the person who opens this is a compliance officer or an
    executive rather than an AI administrator, and buried one
    level down under a heading about AI they would never find
    it. Sat above Companies for a while and read as the first
    thing the product was about, which it is not — it belongs
    beside the things it governs, after the assistants and
    workflows and before the platform's own settings.

    Approvals moved here from under Agents and the audit trail
    was promoted out of Settings — both live here now and
    nowhere else, because two places showing the same queue is
    worse than one place in the wrong section.
  */}
  <NavItem
    icon={ShieldCheck}
    label={t('governance')}
    isActive={pathname.startsWith('/admin/governance')}
    onClick={() => setActiveItem('Governance')}
    hasChildren
    isOpen={openSections.governance}
    onToggle={() => toggleSection('governance')}
  >
    <SubNavItem label={t('governanceOverview')} href="/admin/governance" isActive={pathname === '/admin/governance'} onClick={() => setActiveItem('Governance')} />
    <SubNavItem label={t('aiRegister')} href="/admin/governance/register" isActive={pathname.startsWith('/admin/governance/register')} onClick={() => setActiveItem('Governance')} />
    <SubNavItem label={t('governanceApprovals')} href="/admin/governance/approvals" isActive={pathname.startsWith('/admin/governance/approvals')} onClick={() => setActiveItem('Governance')} badge={pendingApprovals?.count} badgeAtLimit={pendingApprovals?.atLimit} />
    <SubNavItem label={t('auditTrail')} href="/admin/governance/audit-trail" isActive={pathname.startsWith('/admin/governance/audit-trail')} onClick={() => setActiveItem('Governance')} />
    <SubNavItem label={t('policiesInForce')} href="/admin/governance/policies" isActive={pathname.startsWith('/admin/governance/policies')} onClick={() => setActiveItem('Governance')} />
  </NavItem>

  {canSeeAdminSections && (
    <>
      <NavItem
        icon={Settings}
        label={t('settings')}
        isActive={(pathname.startsWith('/admin/settings') &&
          !pathname.startsWith('/admin/settings/scripts')) ||
          activeItem === 'System Settings' ||
          activeItem === 'API Keys' ||
          activeItem === 'Webhook Deliveries' ||
          activeItem === 'Analytics'}
        onClick={() => setActiveItem('System Settings')}
        hasChildren
        isOpen={openSections.settings}
        onToggle={() => toggleSection('settings')}
      >
        <SubNavItem label={t('systemSettings')} href="/admin/settings" isActive={isSystemSettingsRoute(pathname)} onClick={() => setActiveItem('System Settings')} />
        <SubNavItem label={t('plans')} href="/admin/settings/plans" isActive={activeItem === 'Plans' || pathname.startsWith('/admin/settings/plans')} onClick={() => setActiveItem('Plans')} />
        <SubNavItem label={t('apiKeys')} href="/admin/settings/api-keys" isActive={activeItem === 'API Keys' || pathname.startsWith('/admin/settings/api-keys')} onClick={() => setActiveItem('API Keys')} />
        <SubNavItem label={t('analytics')} href="/admin/settings/analytics" isActive={activeItem === 'Analytics' || pathname === '/admin/settings/analytics'} onClick={() => setActiveItem('Analytics')} />
      </NavItem>

      <NavItem
        icon={Wrench}
        label={t('maintenance')}
        isActive={activeItem === 'Maintenance' ||
          activeItem === 'Health' ||
          activeItem === 'Scripts' ||
          activeItem === 'Auth Diagnostics' ||
          pathname.startsWith('/admin/health') ||
          pathname.startsWith('/admin/connections') ||
          pathname.startsWith('/admin/settings/scripts') ||
          pathname.startsWith('/admin/auth-diagnostics')}
        onClick={() => setActiveItem('Maintenance')}
        hasChildren
        isOpen={openSections.maintenance}
        onToggle={() => toggleSection('maintenance')}
      >
        {/* One screen. Run Observatory asked "how are my agents
            doing" and System Health asked "is anything broken" —
            the same question at two altitudes, answered twice in
            different words, both leading with counters that read
            zero on a healthy platform. */}
        <SubNavItem label={t('health')} href="/admin/health" isActive={pathname.startsWith('/admin/health')} onClick={() => setActiveItem('Health')} />
        {/* Health reads the platform's own tables; this one
            asks the outside world whether it is still there
            (seven-gaps plan, phase 2). */}
        <SubNavItem label={t('connections')} href="/admin/connections" isActive={pathname.startsWith('/admin/connections')} onClick={() => setActiveItem('Connections')} />
        <SubNavItem label={t('scripts')} href="/admin/settings/scripts" isActive={activeItem === 'Scripts' || pathname.startsWith('/admin/settings/scripts')} onClick={() => setActiveItem('Scripts')} />
        <SubNavItem label={t('authDiagnostics')} href="/admin/auth-diagnostics" isActive={activeItem === 'Auth Diagnostics' || pathname.startsWith('/admin/auth-diagnostics')} onClick={() => setActiveItem('Auth Diagnostics')} />
      </NavItem>

      <NavItem
        icon={ShieldCheck}
        label={t('userManagement')}
        isActive={activeItem === 'System Admins' || pathname.startsWith('/admin/super-admins')}
        onClick={() => setActiveItem('System Admins')}
        hasChildren
        isOpen={openSections.superAdmins}
        onToggle={() => toggleSection('superAdmins')}
      >
        <SubNavItem label={t('allUsers')} href="/admin/directory" isActive={pathname.startsWith('/admin/directory')} onClick={() => setActiveItem('All Users')} />
        <SubNavItem label={t('systemAdmins')} href="/admin/super-admins" isActive={pathname === '/admin/super-admins'} onClick={() => setActiveItem('System Admins')} />
        <SubNavItem label={t('invitations')} href="/admin/super-admins/invite" isActive={pathname.startsWith('/admin/super-admins/invite')} onClick={() => setActiveItem('System Admins')} />
      </NavItem>
    </>
  )}
    </>
  );
}

export function UserNavTree({
  activeItem,
  setActiveItem,
  openSections,
  toggleSection,
  isSuperAdmin,
  hasCapability,
  user,
}: {
  activeItem: string;
  setActiveItem: Dispatch<SetStateAction<string>>;
  openSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  isSuperAdmin: boolean;
  hasCapability: (key: string) => boolean;
  user: Doc<"users"> | null | undefined;
}) {
  const t = useTranslations('sidebar');
  const pathname = usePathname();
  const settings = useSystemSettings();

  return (
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
    label={t('askPlatform', { platformName: settings.platformName })}
    href="/app/assistant"
    isActive={activeItem === 'Assistant' || pathname.startsWith('/app/assistant')}
    onClick={() => setActiveItem('Assistant')}
  />

  {hasCapability(CORE_MODULES.tasks) && (
  <NavItem
    icon={ListChecks}
    label={t('tasks')}
    href="/app/tasks"
    isActive={activeItem === 'Tasks' || pathname.startsWith('/app/tasks')}
    onClick={() => setActiveItem('Tasks')}
  />
  )}

  {hasCapability(CORE_MODULES.calls) && (
  <NavItem
    icon={Phone}
    label={t('calls')}
    href="/app/calls"
    isActive={activeItem === 'Calls' || pathname.startsWith('/app/calls')}
    onClick={() => setActiveItem('Calls')}
  />
  )}

  {hasCapability(CORE_MODULES.reception) && (
  <NavItem
    icon={MonitorSpeaker}
    label={t('reception')}
    href="/app/reception"
    isActive={activeItem === 'Reception' || pathname.startsWith('/app/reception')}
    onClick={() => setActiveItem('Reception')}
  />
  )}

  {/* template:remove:start salesReports */}
  {hasCapability(REPORTS_MODULE_KEY) && (
  <NavItem
    icon={LineChart}
    label={t('reports')}
    isActive={activeItem === 'Reports'}
    onClick={() => setActiveItem('Reports')}
    hasChildren
    isOpen={openSections.reports}
    onToggle={() => toggleSection('reports')}
  >
    <SubNavItem label={t('information')} href="/app/reports/information" isActive={pathname.startsWith('/app/reports/information')} onClick={() => setActiveItem('Reports')} />
    <SubNavItem label={t('salesReport')} href="/app/reports" isActive={pathname === '/app/reports'} onClick={() => setActiveItem('Reports')} />
  </NavItem>
  )}
  {/* template:remove:end */}

  {/* template:remove:start properties */}
  {hasCapability(PROPERTIES_MODULE_KEY) && (
  <NavItem
    icon={Home}
    label={t('properties')}
    isActive={activeItem === 'Properties' || pathname.startsWith('/app/properties')}
    onClick={() => setActiveItem('Properties')}
    hasChildren
    isOpen={openSections.properties}
    onToggle={() => toggleSection('properties')}
  >
    <SubNavItem label={t('information')} href="/app/properties/information" isActive={pathname.startsWith('/app/properties/information')} onClick={() => setActiveItem('Properties')} />
    <SubNavItem label={t('propertiesSearch')} href="/app/properties/search" isActive={pathname === '/app/properties/search'} onClick={() => setActiveItem('Properties')} />
    <SubNavItem label={t('propertiesScrapedData')} href="/app/properties/scraped-data" isActive={pathname === '/app/properties/scraped-data'} onClick={() => setActiveItem('Properties')} />
    <SubNavItem label={t('logs')} href="/app/properties/logs" isActive={pathname === '/app/properties/logs'} onClick={() => setActiveItem('Properties')} />
  </NavItem>
  )}
  {/* template:remove:end */}

  {/* template:remove:start salesData */}
  <OptionalNavSection>
    <SalesDataNavItem
      isSignedIn={!!user}
      pathname={pathname}
      activeItem={activeItem}
      isOpen={openSections.salesData}
      onToggle={() => toggleSection('salesData')}
      onSelect={() => setActiveItem('Sales Data')}
      t={t}
    />
  </OptionalNavSection>
  {/* template:remove:end */}

  {/* template:remove:start movement */}
  {hasCapability(POSTURE_STUDIO_MODULE_KEY) && (
  <NavItem
    icon={Globe}
    label={t('postureStudio')}
    isActive={activeItem === 'Demos' || pathname.startsWith('/demos')}
    onClick={() => setActiveItem('Demos')}
    hasChildren
    isOpen={openSections.demos}
    onToggle={() => toggleSection('demos')}
  >
    <SubNavItem label={t('information')} href="/demos/movements/information" isActive={pathname.startsWith('/demos/movements/information')} onClick={() => setActiveItem('Demos')} />
    <SubNavItem label={t('studioLibrary')} href="/demos/movements" isActive={pathname === '/demos/movements'} onClick={() => setActiveItem('Demos')} />
    <SubNavItem label={t('replayAlignment')} href="/demos/movements/replay-lab" isActive={pathname.startsWith('/demos/movements/replay-lab')} onClick={() => setActiveItem('Demos')} />

  </NavItem>
  )}
  {/* template:remove:end */}

  {/*
    The customer's own governance section, scoped to their
    workspace. Offered to the people who run a workspace and
    to anyone brought in to audit it — the compliance officer
    this whole layer exists for is one of the latter, and
    never a platform administrator.
  */}
  {(user?.role === "ADMIN" || user?.role === "AUDITOR") && (
    <NavItem
      icon={ShieldCheck}
      label={t('governance')}
      isActive={pathname.startsWith('/app/governance')}
      onClick={() => setActiveItem('Workspace Governance')}
      hasChildren
      isOpen={openSections.workspaceGovernance}
      onToggle={() => toggleSection('workspaceGovernance')}
    >
      <SubNavItem label={t('governanceOverview')} href="/app/governance" isActive={pathname === '/app/governance'} onClick={() => setActiveItem('Workspace Governance')} />
      <SubNavItem label={t('aiRegister')} href="/app/governance/register" isActive={pathname.startsWith('/app/governance/register')} onClick={() => setActiveItem('Workspace Governance')} />
      <SubNavItem label={t('auditTrail')} href="/app/governance/audit-trail" isActive={pathname.startsWith('/app/governance/audit-trail')} onClick={() => setActiveItem('Workspace Governance')} />
      <SubNavItem label={t('policiesInForce')} href="/app/governance/policies" isActive={pathname.startsWith('/app/governance/policies')} onClick={() => setActiveItem('Workspace Governance')} />
    </NavItem>
  )}

  {!isSuperAdmin && user?.role === "ADMIN" && (
    <NavItem
      icon={Building2}
      label={t('organization')}
      isActive={activeItem === 'Organization Dashboard' || activeItem === 'Organization Team' || activeItem === 'Auth Diagnostics'}
      onClick={() => setActiveItem('Organization Dashboard')}
      hasChildren
      isOpen={openSections.organization}
      onToggle={() => toggleSection('organization')}
    >
      <SubNavItem label={t('dashboard')} href="/app/settings" isActive={activeItem === 'Organization Dashboard'} onClick={() => setActiveItem('Organization Dashboard')} />
      <SubNavItem label={t('teamMembers')} href="/app/settings/team" isActive={activeItem === 'Organization Team'} onClick={() => setActiveItem('Organization Team')} />
      <SubNavItem label={t('authDiagnostics')} href="/app/settings/auth-diagnostics" isActive={activeItem === 'Auth Diagnostics' || pathname.startsWith('/app/settings/auth-diagnostics')} onClick={() => setActiveItem('Auth Diagnostics')} />
    </NavItem>
  )}

  {/* template:remove:start arcade */}
  {settings.diagnosticRoutingEnabled && (
    <NavItem
      icon={Gamepad2}
      label={t('arcade')}
      isActive={activeItem === 'Arcade' || activeItem === 'RoninsRun' || activeItem === 'RoninsRun3D'}
      onClick={() => setActiveItem('Arcade')}
      hasChildren
      isOpen={openSections.arcade}
      onToggle={() => toggleSection('arcade')}
    >
      <SubNavItem label={t('roninsRun')} href="/app/arcade/ronins-run" isActive={activeItem === 'RoninsRun'} onClick={() => setActiveItem('RoninsRun')} />
      <SubNavItem label={t('roninsRun3D')} href="/app/arcade/ronins-run-3d" isActive={activeItem === 'RoninsRun3D'} onClick={() => setActiveItem('RoninsRun3D')} />
    </NavItem>
  )}
  {/* template:remove:end */}

    </>
  );
}
