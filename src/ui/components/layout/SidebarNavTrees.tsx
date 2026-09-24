"use client";

import type { Dispatch, SetStateAction } from "react";
import { useTranslations } from "next-intl";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Building2,
  Globe,
  Bot,
  Workflow,
  ShieldCheck,
  Settings,
  CreditCard,
  Wrench,



  ListChecks,
  MonitorSpeaker,
  Phone,
  Gamepad2,
} from "lucide-react";
import type { Doc } from "@/convex/_generated/dataModel";
import { useSystemSettings } from "@/src/context/SystemSettingsContext";
import { CORE_MODULES } from "@/convex/utils/coreModules";
import {
} from "@/convex/utils/coreModules";
import {
  NavItem,

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
  canManageBilling = false,
  pendingApprovals,
  pendingWorkflowApprovals,
}: {
  activeItem: string;
  setActiveItem: Dispatch<SetStateAction<string>>;
  openSections: Record<string, boolean>;
  toggleSection: (section: string) => void;
  isAuditor: boolean;
  canSeeAdminSections: boolean;
  canManageBilling?: boolean;
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

  {/*
    Websites, in a section of its own rather than under Companies. A website is
    the core object of this product, not an administrative detail of a tenant,
    and the screens that come next — the fetch queue, cost per target, the
    collecting agent's runs — belong beside it rather than inside company
    management.
  */}
  {canSeeAdminSections && (
    <NavItem
      icon={Globe}
      label={t('websites')}
      isActive={activeItem === 'Websites' || pathname.startsWith('/admin/websites')}
      onClick={() => setActiveItem('Websites')}
      hasChildren
      isOpen={openSections.websites}
      onToggle={() => toggleSection('websites')}
    >
      {/*
        All Websites must not light up while Data Collection is open, so its
        active test excludes the collection routes rather than matching the
        whole prefix. Two lit rows is how a reader stops trusting the sidebar.
      */}
      <SubNavItem label={t('allWebsites')} href="/admin/websites" isActive={pathname.startsWith('/admin/websites') && !pathname.startsWith('/admin/websites/collection') && !pathname.startsWith('/admin/websites/costs')} onClick={() => setActiveItem('Websites')} />
      <SubNavItem label={t('seoCollection')} href="/admin/websites/collection" isActive={pathname.startsWith('/admin/websites/collection')} onClick={() => setActiveItem('Websites')} />
      <SubNavItem label={t('seoCosts')} href="/admin/websites/costs" isActive={pathname.startsWith('/admin/websites/costs')} onClick={() => setActiveItem('Websites')} />
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
          activeItem === 'Analytics' || activeItem === 'PlatformBilling'}
        onClick={() => setActiveItem('System Settings')}
        hasChildren
        isOpen={openSections.settings}
        onToggle={() => toggleSection('settings')}
      >
        <SubNavItem label={t('systemSettings')} href="/admin/settings" isActive={isSystemSettingsRoute(pathname)} onClick={() => setActiveItem('System Settings')} />
        <SubNavItem label={t('plans')} href="/admin/settings/plans" isActive={activeItem === 'Plans' || pathname.startsWith('/admin/settings/plans')} onClick={() => setActiveItem('Plans')} />
        {canManageBilling && <SubNavItem label={t('billing')} href="/admin/settings/billing" isActive={pathname.startsWith('/admin/settings/billing')} onClick={() => setActiveItem('PlatformBilling')} />}
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

  <NavItem
    icon={Globe}
    label={t('sites')}
    href="/app/sites"
    isActive={activeItem === 'Sites' || pathname.startsWith('/app/sites')}
    onClick={() => setActiveItem('Sites')}
  />

  {hasCapability(CORE_MODULES.reception) && (
  <NavItem
    icon={MonitorSpeaker}
    label={t('reception')}
    href="/app/reception"
    isActive={activeItem === 'Reception' || pathname.startsWith('/app/reception')}
    onClick={() => setActiveItem('Reception')}
  />
  )}





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

  {!isSuperAdmin && user?.role === "ADMIN" && !user.impersonatingCompanyId && (
    <NavItem icon={CreditCard} label={t('billing')} href="/app/settings/billing"
      isActive={pathname.startsWith('/app/settings/billing')} onClick={() => setActiveItem('Billing')} />
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
