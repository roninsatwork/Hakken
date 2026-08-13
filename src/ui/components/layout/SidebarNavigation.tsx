"use client";

import { Component, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  // template:remove:start arcade
  Gamepad2,
  // template:remove:end
  LayoutDashboard,
  Building2,
  // template:remove:start salesReports
  LineChart,
  // template:remove:end
  ChevronDown,
  Sidebar,
  // template:remove:start movement
  Globe,
  // template:remove:end
  Bot,
  ListChecks,
  Eye,
  ShieldCheck,
  Settings,
  Workflow,
  // template:remove:start properties
  Home,
  // template:remove:end
  // template:remove:start salesData
  Table2,
  // template:remove:end
  Wrench
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
// template:remove:start salesData
import { SALES_DATA_MODULE_KEY } from "@/convex/utils/salesDataModule";
import { isWorkspaceSectionPath, workspaceSlug } from "@/src/lib/workspaceSlug";
// template:remove:end

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

function SubNavItem({ label, isActive, onClick, href, badge, badgeAtLimit }: { label: string, isActive: boolean, onClick: () => void, href?: string, badge?: number, badgeAtLimit?: boolean }) {
  // Absent at zero rather than a grey "0". A badge that is always there stops
  // being read, and the whole point of this one is that it means something.
  const showBadge = typeof badge === "number" && badge > 0;

  const content = (
    <>
      {isActive && (
        <motion.div
          layoutId="active-pill"
          className="absolute inset-0 bg-foreground/10 border border-border-dim rounded-[8px] z-0 shadow-sm"
          transition={{ type: "spring", stiffness: 350, damping: 30 }}
        />
      )}
      <span className="relative z-10 flex items-center justify-between gap-2">
        <span className="truncate">{label}</span>
        {showBadge && (
          <span
            aria-label={`${badge}${badgeAtLimit ? "+" : ""} waiting`}
            className="shrink-0 min-w-[18px] px-1.5 py-0.5 rounded-full bg-[#f59e0b]/20 border border-[#f59e0b]/30 text-[#f59e0b] text-[10px] font-semibold leading-none text-center tabular-nums"
          >
            {badge}{badgeAtLimit ? "+" : ""}
          </span>
        )}
      </span>
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

/**
 * Keeps one optional nav entry from taking the dashboard down with it.
 *
 * Convex's `useQuery` throws during render when its function is missing or
 * errors — and a throw inside the sidebar propagates to `DashboardLayout`,
 * which white-screens the whole app for every user, including the ones whose
 * workspace does not have the module at all. That is exactly what happened
 * when the sales-data query was called before the backend had been deployed.
 *
 * A navigation entry is not worth a broken dashboard. A section that cannot
 * establish whether it applies simply does not draw itself; the routes behind
 * it still enforce their own access, so hiding it costs nothing but a link.
 */
class OptionalNavSection extends Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    // Logged rather than swallowed: the section vanishing should be
    // diagnosable, not mysterious.
    console.error("Optional navigation section failed to render", error);
  }

  render() {
    if (this.state.failed) return null;
    return this.props.children;
  }
}

// template:remove:start salesData
/**
 * The sales data entry, which draws only for a workspace that has the module.
 *
 * It runs its own query rather than receiving the answer as a prop so that the
 * `useQuery` call sits inside `OptionalNavSection`. A hook called in the
 * sidebar's own body is outside any boundary the sidebar renders, so a failure
 * there cannot be contained — which is the whole point of this split.
 *
 * The label is the workspace's own name. Nothing here, or anywhere in the
 * platform, holds a customer's name as a string.
 */
function SalesDataNavItem({
  isSignedIn,
  pathname,
  activeItem,
  isOpen,
  onToggle,
  onSelect,
  t,
}: {
  isSignedIn: boolean;
  pathname: string;
  activeItem: string;
  isOpen: boolean;
  onToggle: () => void;
  onSelect: () => void;
  t: (key: string) => string;
}) {
  /*
   * Skipped until there is a signed-in user, like every other guarded query in
   * this sidebar. `getMyWorkspaceModules` is a `tenantQuery`, so calling it
   * without an identity throws `Unauthenticated` on the server — and the
   * dashboard layout mounts this sidebar for the whole route group, including
   * the moment after sign-out when the token has cleared but the tree has not
   * unmounted yet.
   *
   * The boundary above caught the throw, so the only visible trace was a
   * failed query on every sign-out in the Convex logs. A section that hides
   * itself for a tick is the right outcome; asking the server a question it
   * cannot answer is not.
   */
  const workspace = useQuery(
    api.companies.getMyWorkspaceModules,
    isSignedIn ? {} : "skip"
  );

  // Undefined while loading. Drawing the section before the answer arrives
  // would flash a link at workspaces that never get one.
  //
  // `enabledModules` is optional-chained too: a workspace record that arrives
  // without the field threw here and took the whole navigation section down
  // into its error boundary. Reaching this with no module list means "no
  // modules", not "crash".
  if (!workspace?.enabledModules?.includes(SALES_DATA_MODULE_KEY)) return null;

  // The section lives under the workspace's own name, so Comax reads
  // /app/comax/... and the next client reads their own — from the company
  // record, never written down here.
  const base = `/app/${workspaceSlug(workspace.companyName ?? '')}`;
  const importHref = `${base}/import-data`;
  const tablesHref = `${base}/spreadsheet-import`;
  const customersHref = `${base}/customers`;
  const opportunityHref = `${base}/opportunity-report`;

  return (
    <NavItem
      icon={Table2}
      label={workspace.companyName ?? t('salesData')}
      isActive={activeItem === 'Sales Data' || pathname.startsWith(`${base}/`)}
      onClick={onSelect}
      hasChildren
      isOpen={isOpen}
      onToggle={onToggle}
    >
      <SubNavItem label={t('salesDataImport')} href={importHref} isActive={pathname === importHref} onClick={onSelect} />
      <SubNavItem label={t('salesDataTables')} href={tablesHref} isActive={pathname === tablesHref} onClick={onSelect} />
      <SubNavItem label={t('salesDataCustomers')} href={customersHref} isActive={pathname.startsWith(customersHref)} onClick={onSelect} />
      {/* Lives here, not under Reports: Anthony went looking for it beside
          Customers, and where a person looks is where a screen belongs. */}
      <SubNavItem label={t('salesDataOpportunityReport')} href={opportunityHref} isActive={pathname === opportunityHref} onClick={onSelect} />
    </NavItem>
  );
}
// template:remove:end

/**
 * The system settings screens, as opposed to the other things that live under
 * `/admin/settings/`.
 *
 * Plans, API Keys, Analytics and Scripts are sibling routes with their own
 * sidebar entries, so "System Settings" cannot simply claim the whole path.
 * It used to match `/admin/settings` exactly, which stopped working when the
 * one tabbed page became a route per section.
 */
const SYSTEM_SETTINGS_SECTIONS = ['identity', 'security', 'white-label', 'options'];

function isSystemSettingsRoute(pathname: string) {
  if (pathname === '/admin/settings') return true;
  return SYSTEM_SETTINGS_SECTIONS.some((section) => (
    pathname === `/admin/settings/${section}` || pathname.startsWith(`/admin/settings/${section}/`)
  ));
}

function getActiveItemFromPathname(pathname: string) {
  if (pathname === '/admin') return 'Admin Dashboard';
  if (pathname.startsWith('/admin/health')) return 'Health';
  if (pathname.startsWith('/admin/companies')) return 'Companies';
  if (pathname.startsWith('/admin/directory')) return 'All Users';
  if (pathname.startsWith('/admin/super-admins')) return 'System Admins';
  if (pathname === '/admin/users/invite') return 'Invitations';
  if (pathname.startsWith('/admin/users')) return 'Manage Users';
  if (pathname.startsWith('/admin/ai/tools')) return 'Tools';
  if (pathname.startsWith('/admin/ai')) return 'Artificial Intelligence';
  if (pathname.startsWith('/admin/governance')) return 'Governance';
  if (pathname.startsWith('/app/governance')) return 'Workspace Governance';
  if (pathname.startsWith('/admin/agents')) return 'Manage Agents';
  if (pathname.startsWith('/admin/auth-diagnostics')) return 'Auth Diagnostics';
  if (pathname.startsWith('/admin/workflows/schedules')) return 'Schedules';
  if (pathname.startsWith('/admin/workflows/executions')) return 'Workflow Runs';
  if (pathname === '/admin/workflows') return 'Manage Workflows';
  if (pathname.startsWith('/admin/settings/scripts')) return 'Scripts';
  if (pathname.startsWith('/admin/settings/api-keys')) return 'API Keys';
  if (pathname.startsWith('/admin/settings/plans')) return 'Plans';
  if (pathname === '/admin/settings/analytics') return 'Analytics';
  if (isSystemSettingsRoute(pathname)) return 'System Settings';
  if (pathname === '/app') return 'Dashboard';
  if (pathname.startsWith('/app/assistant')) return 'Assistant';
  if (pathname.startsWith('/app/tasks')) return 'Tasks';
  if (pathname.startsWith('/app/watching')) return 'Watching';
  // template:remove:start properties
  if (pathname.startsWith('/app/properties')) return 'Properties';
  // template:remove:end
  // template:remove:start salesReports
  if (pathname.startsWith('/app/reports')) return 'Reports';
  // template:remove:end
  // template:remove:start salesData
  if (isWorkspaceSectionPath(pathname)) return 'Sales Data';
  // template:remove:end
  if (pathname.startsWith('/app/profile')) return 'Profile';
  if (pathname === '/app/settings') return 'Organization Dashboard';
  if (pathname.startsWith('/app/settings/team')) return 'Organization Team';
  if (pathname.startsWith('/app/settings/saved-answers')) return 'Saved Answers';
  if (pathname.startsWith('/app/settings/auth-diagnostics')) return 'Auth Diagnostics';
  if (pathname.startsWith('/app/agents')) return 'Agents';
  // template:remove:start arcade
  if (pathname.startsWith('/app/arcade/ronins-run')) return 'RoninsRun';
  // template:remove:end
  if (pathname.startsWith('/app/ai/rules')) return 'AIRules';
  // template:remove:start movement
  if (pathname.startsWith('/demos')) return 'Demos';
  // template:remove:end
  return pathname.startsWith('/admin') ? 'Admin Dashboard' : '';
}

function getDefaultOpenSections(pathname: string): Record<string, boolean> {
  const isAgentsActive = pathname.startsWith('/admin/agents') || pathname.startsWith('/admin/workflows');

  return {
    workspace: true,
    governance: pathname.startsWith('/admin/governance'),
    workspaceGovernance: pathname.startsWith('/app/governance'),
    businessHub: false,
    clients: false,
    companies: pathname.startsWith('/admin/companies'),
    superAdmins: pathname.startsWith('/admin/super-admins'),
    ai: pathname.startsWith('/admin/ai'),
    agents: isAgentsActive,
    workflows: false,
    users: false,
    settings: pathname.startsWith('/admin/settings') &&
      !pathname.startsWith('/admin/settings/scripts'),
    maintenance: pathname.startsWith('/admin/health') ||
      pathname.startsWith('/admin/settings/scripts') ||
      pathname.startsWith('/admin/auth-diagnostics'),
    // template:remove:start salesReports
    reports: false,
    // template:remove:end
    organization: false,
    // template:remove:start arcade
    arcade: false,
    // template:remove:end
    // template:remove:start properties
    properties: false,
    // template:remove:end
    // template:remove:start salesData
    salesData: isWorkspaceSectionPath(pathname),
    // template:remove:end
    // template:remove:start movement
    demos: false,
    // template:remove:end
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
  /**
   * Whether the admin menu shows its sections.
   *
   * Every section below was gated on being a super admin, because until the
   * oversight roles existed nobody else could open the admin area at all. A
   * read-only account now can, and a menu offering it only "Dashboard" would
   * make the rest of the section unreachable — visible in principle, and
   * impossible to get to.
   *
   * Deliberately not used for impersonation, which is a write.
   */
  const canSeeAdminSections = isSuperAdmin || user?.role === "READ_ONLY";
  /**
   * An auditor reaches Governance and nothing else, so the menu shows Governance
   * and nothing else. Offering links that bounce them back here would be worse
   * than offering none.
   */
  const isAuditor = user?.role === "AUDITOR";
  const router = useRouter();
  const impersonateCompany = useMutation(api.users.impersonateCompany);
  const impersonatedCompany = useQuery(
    api.companies.getCompanyById,
    user?.impersonatingCompanyId ? { id: user.impersonatingCompanyId } : "skip"
  );
  // A run parked on an approval waits indefinitely and nothing else on the
  // platform says so: the only other mention is a health tile that stays
  // at zero for the first thirty minutes. Skipped unless this is an admin area
  // super admin, because the query is super-admin only and the page is too.
  const pendingApprovals = useQuery(
    api.agentRuns.getPendingApprovalCount,
    isAdmin && canSeeAdminSections ? {} : "skip"
  );
  // Same reasoning as the agent queue: a workflow halted on a Human Approval node
  // waits indefinitely, and until this badge nothing on the platform said so.
  const pendingWorkflowApprovals = useQuery(
    api.scheduler.getPendingWorkflowApprovalCount,
    isAdmin && canSeeAdminSections ? {} : "skip"
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
                      <SubNavItem label={t('manageGlobalAi')} href="/admin/ai" isActive={pathname === '/admin/ai' || (pathname.startsWith('/admin/ai') && !pathname.startsWith('/admin/ai/tools'))} onClick={() => setActiveItem('Artificial Intelligence')} />
                      {/* Nothing linked here. The tool catalogue was reachable
                          only by typing the URL, which is why the one screen
                          deciding what an agent can actually do had never been
                          opened. */}
                      <SubNavItem label={t('tools')} href="/admin/ai/tools" isActive={pathname.startsWith('/admin/ai/tools')} onClick={() => setActiveItem('Tools')} />
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
                          <SubNavItem label="Plans" href="/admin/settings/plans" isActive={activeItem === 'Plans' || pathname.startsWith('/admin/settings/plans')} onClick={() => setActiveItem('Plans')} />
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
                      icon={ListChecks}
                      label="Tasks"
                      href="/app/tasks"
                      isActive={activeItem === 'Tasks' || pathname.startsWith('/app/tasks')}
                      onClick={() => setActiveItem('Tasks')}
                    />

                    <NavItem
                      icon={Eye}
                      label="Watching"
                      href="/app/watching"
                      isActive={activeItem === 'Watching' || pathname.startsWith('/app/watching')}
                      onClick={() => setActiveItem('Watching')}
                    />

                    {/* template:remove:start salesReports */}
                    <NavItem
                      icon={LineChart}
                      label="Reports"
                      isActive={activeItem === 'Reports'}
                      onClick={() => setActiveItem('Reports')}
                      hasChildren
                      isOpen={openSections.reports}
                      onToggle={() => toggleSection('reports')}
                    >
                      <SubNavItem label="Information" href="/app/reports/information" isActive={pathname.startsWith('/app/reports/information')} onClick={() => setActiveItem('Reports')} />
                      <SubNavItem label="Sales Report" href="/app/reports" isActive={pathname === '/app/reports'} onClick={() => setActiveItem('Reports')} />
                    </NavItem>
                    {/* template:remove:end */}

                    {/* template:remove:start properties */}
                    <NavItem
                      icon={Home}
                      label={t('properties')}
                      isActive={activeItem === 'Properties' || pathname.startsWith('/app/properties')}
                      onClick={() => setActiveItem('Properties')}
                      hasChildren
                      isOpen={openSections.properties}
                      onToggle={() => toggleSection('properties')}
                    >
                      <SubNavItem label="Information" href="/app/properties/information" isActive={pathname.startsWith('/app/properties/information')} onClick={() => setActiveItem('Properties')} />
                      <SubNavItem label={t('propertiesSearch')} href="/app/properties/search" isActive={pathname === '/app/properties/search'} onClick={() => setActiveItem('Properties')} />
                      <SubNavItem label={t('propertiesScrapedData')} href="/app/properties/scraped-data" isActive={pathname === '/app/properties/scraped-data'} onClick={() => setActiveItem('Properties')} />
                      <SubNavItem label="Logs" href="/app/properties/logs" isActive={pathname === '/app/properties/logs'} onClick={() => setActiveItem('Properties')} />
                    </NavItem>
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
                    <NavItem
                      icon={Globe}
                      label="Posture Studio"
                      isActive={activeItem === 'Demos' || pathname.startsWith('/demos')}
                      onClick={() => setActiveItem('Demos')}
                      hasChildren
                      isOpen={openSections.demos}
                      onToggle={() => toggleSection('demos')}
                    >
                      <SubNavItem label="Information" href="/demos/movements/information" isActive={pathname.startsWith('/demos/movements/information')} onClick={() => setActiveItem('Demos')} />
                      <SubNavItem label="Studio Library" href="/demos/movements" isActive={pathname === '/demos/movements'} onClick={() => setActiveItem('Demos')} />
                      <SubNavItem label="Replay Alignment" href="/demos/movements/replay-lab" isActive={pathname.startsWith('/demos/movements/replay-lab')} onClick={() => setActiveItem('Demos')} />

                    </NavItem>
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
                        label="Organization"
                        isActive={activeItem === 'Organization Dashboard' || activeItem === 'Organization Team' || activeItem === 'Saved Answers' || activeItem === 'Auth Diagnostics'}
                        onClick={() => setActiveItem('Organization Dashboard')}
                        hasChildren
                        isOpen={openSections.organization}
                        onToggle={() => toggleSection('organization')}
                      >
                        <SubNavItem label="Dashboard" href="/app/settings" isActive={activeItem === 'Organization Dashboard'} onClick={() => setActiveItem('Organization Dashboard')} />
                        <SubNavItem label="Team Members" href="/app/settings/team" isActive={activeItem === 'Organization Team'} onClick={() => setActiveItem('Organization Team')} />
                        <SubNavItem label="Saved Answers" href="/app/settings/saved-answers" isActive={activeItem === 'Saved Answers' || pathname.startsWith('/app/settings/saved-answers')} onClick={() => setActiveItem('Saved Answers')} />
                        <SubNavItem label={t('authDiagnostics')} href="/app/settings/auth-diagnostics" isActive={activeItem === 'Auth Diagnostics' || pathname.startsWith('/app/settings/auth-diagnostics')} onClick={() => setActiveItem('Auth Diagnostics')} />
                      </NavItem>
                    )}

                    {/* template:remove:start arcade */}
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
                    {/* template:remove:end */}

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
