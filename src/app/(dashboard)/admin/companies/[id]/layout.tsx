"use client";

import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { Id } from "@/convex/_generated/dataModel";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import {
  Activity,
  AppWindow,
  ArrowLeft,
  BookOpen,
  BrainCircuit,
  Building2,
  ClipboardCheck,
  Code2,
  Cpu,
  FileText,
  Gauge,
  LayoutDashboard,
  ListPlus,
  Loader2,
  MessageSquareText,
  Monitor,
  Palette,
  Puzzle,
  ShieldCheck,
  TerminalSquare,
  UserCheck,
  UserPlus,
  Users,
  Inbox,
  MessageCircleQuestion,
  NotebookPen,
  PhoneCall,
  CircleDollarSign,
} from "lucide-react";
import { DetailLayout } from "@/src/ui/components/screens/DetailLayout";

function matchesCompanyRoute(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function getWidgetSectionHref(companyHref: string, section: string) {
  return `${companyHref}/widget?section=${section}`;
}

export default function CompanyDashboardLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const companyId = params.id as Id<"companies">;
  const company = useQuery(api.companies.getCompanyById, { id: companyId });
  const router = useRouter();
  const currentUser = useQuery(api.users.getMe);
  const impersonateCompany = useMutation(api.users.impersonateCompany);
  const [isImpersonating, setIsImpersonating] = useState(false);

  const handleImpersonate = async () => {
    setIsImpersonating(true);
    try {
      await impersonateCompany({ companyId });
      router.push("/app");
    } catch (e) {
      console.error(e);
      setIsImpersonating(false);
    }
  };

  if (company === undefined) {
    return <div className="p-8 text-secondary">Loading workspace...</div>;
  }
  if (!company) {
    return <div className="p-8 text-red-500">Workspace not found</div>;
  }

  const companyHref = `/admin/companies/${companyId}`;
  const aiHref = `${companyHref}/ai`;
  const tabs = [
    { label: "Dashboard", href: companyHref, icon: LayoutDashboard },
    { label: "Overview", href: `${companyHref}/overview`, icon: FileText },
    {
      label: "Directory",
      href: `${companyHref}/directory`,
      icon: Users,
      matches: (pathname: string) => (
        matchesCompanyRoute(pathname, `${companyHref}/directory`)
        || matchesCompanyRoute(pathname, `${companyHref}/users`)
        || matchesCompanyRoute(pathname, `${companyHref}/invites`)
      ),
      dropdownItems: [
        {
          label: "Directory",
          href: `${companyHref}/directory/users`,
          icon: Users,
          matches: (pathname: string) => (
            pathname === `${companyHref}/directory`
            || matchesCompanyRoute(pathname, `${companyHref}/directory/users`)
            || matchesCompanyRoute(pathname, `${companyHref}/users`)
          ),
        },
        {
          label: "Invites",
          href: `${companyHref}/directory/invites`,
          icon: UserPlus,
          matches: (pathname: string) => (
            matchesCompanyRoute(pathname, `${companyHref}/directory/invites`)
            || matchesCompanyRoute(pathname, `${companyHref}/invites`)
          ),
        },
      ],
    },
    {
      label: "AI",
      href: aiHref,
      icon: BrainCircuit,
      matches: (pathname: string) => (
        matchesCompanyRoute(pathname, aiHref)
        || matchesCompanyRoute(pathname, `${companyHref}/knowledge`)
        || matchesCompanyRoute(pathname, `${companyHref}/system-prompt`)
        || matchesCompanyRoute(pathname, `${companyHref}/rules`)
        || matchesCompanyRoute(pathname, `${companyHref}/models`)
        || matchesCompanyRoute(pathname, `${companyHref}/chat-logs`)
      ),
      dropdownItems: [
        {
          label: "Overview",
          href: aiHref,
          icon: Gauge,
          matches: (pathname: string) => pathname === aiHref,
        },
        {
          // What used to be the company's Dashboard tab: tokens, quota, provider
          // spend. It was an AI usage report filed under a name nobody looking
          // for AI usage would open.
          label: "AI Usage",
          href: `${aiHref}/usage`,
          icon: Activity,
        },
        {
          // What the AI handled, in a person's hours (money view).
          label: "Value",
          href: `${aiHref}/money`,
          icon: CircleDollarSign,
        },
        {
          // The wiki replaced Knowledge as the way this company knows things
          // (wiki-replaces-knowledge plan, stage three): importing happens on
          // the Wiki screen and answers come from its pages. The old
          // Knowledge route stays reachable as the archive of source
          // documents behind each page's receipts, but it is no longer a
          // destination the menu offers.
          label: "Wiki",
          href: `${aiHref}/pages`,
          icon: BookOpen,
          matches: (pathname: string) => (
            matchesCompanyRoute(pathname, `${aiHref}/pages`)
            || matchesCompanyRoute(pathname, `${aiHref}/knowledge`)
            || matchesCompanyRoute(pathname, `${companyHref}/knowledge`)
          ),
        },
        {
          // Every brain's gaps get a dedicated screen (Anthony's ruling,
          // 2026-08-17) — this company's own, beside its Wiki.
          label: "Unanswered",
          href: `${aiHref}/unanswered`,
          icon: MessageCircleQuestion,
        },
        {
          // The brain's diary (watch-it-think plan, phase 4): what this
          // company's wiki learned, as a feed, beside the Wiki it feeds.
          label: "Diary",
          href: `${aiHref}/diary`,
          icon: NotebookPen,
        },
        // Saved Answers and Memory folded into the Wiki (one-brain-plan.md,
        // phase 3): answers file through the save button with the chat as
        // their receipt, facts live as pinned corrections, and instructions
        // as AI Rules. Their addresses redirect.
        {
          label: "Skills",
          href: `${aiHref}/skills`,
          icon: Puzzle,
        },
        {
          label: "Prompt",
          href: `${aiHref}/prompt`,
          icon: TerminalSquare,
          matches: (pathname: string) => (
            matchesCompanyRoute(pathname, `${aiHref}/prompt`)
            || matchesCompanyRoute(pathname, `${companyHref}/system-prompt`)
          ),
        },
        {
          label: "AI Rules",
          href: `${aiHref}/rules`,
          icon: ShieldCheck,
          matches: (pathname: string) => (
            matchesCompanyRoute(pathname, `${aiHref}/rules`)
            || matchesCompanyRoute(pathname, `${companyHref}/rules`)
          ),
        },
        {
          label: "AI Models",
          href: `${aiHref}/models`,
          icon: Cpu,
          matches: (pathname: string) => (
            matchesCompanyRoute(pathname, `${aiHref}/models`)
            || matchesCompanyRoute(pathname, `${companyHref}/models`)
          ),
        },
        {
          label: "Evals",
          href: `${aiHref}/evals`,
          icon: ClipboardCheck,
        },
        {
          label: "Chat Logs",
          href: `${aiHref}/chat-logs`,
          icon: MessageSquareText,
          matches: (pathname: string) => (
            matchesCompanyRoute(pathname, `${aiHref}/chat-logs`)
            || matchesCompanyRoute(pathname, `${companyHref}/chat-logs`)
          ),
        },
        {
          // Seeing the work (seven-gaps plan, phase 1): the calls the AI
          // took, beside the chats it had.
          label: "Calls",
          href: `${companyHref}/calls`,
          icon: PhoneCall,
        },
        {
          // The mail it handled — recorded from day one, on a screen at last.
          label: "Mailbox",
          href: `${companyHref}/mailbox`,
          icon: Inbox,
        },
      ],
    },
    {
      label: "Widget",
      href: `${companyHref}/widget`,
      icon: AppWindow,
      dropdownItems: [
        {
          label: "Appearance",
          href: `${companyHref}/widget`,
          icon: Palette,
          matches: (pathname: string, searchParams: URLSearchParams) => (
            pathname === `${companyHref}/widget`
            && (!searchParams.get("section") || searchParams.get("section") === "appearance")
          ),
        },
        {
          label: "Welcome Screen",
          href: getWidgetSectionHref(companyHref, "welcome-screen"),
          icon: Monitor,
          query: { section: "welcome-screen" },
        },
        {
          label: "Conversation Starters",
          href: getWidgetSectionHref(companyHref, "conversation-starters"),
          icon: ListPlus,
          query: { section: "conversation-starters" },
        },
        {
          label: "Greeting",
          href: getWidgetSectionHref(companyHref, "greeting"),
          icon: MessageSquareText,
          query: { section: "greeting" },
        },
        {
          label: "Integration",
          href: getWidgetSectionHref(companyHref, "integration"),
          icon: Code2,
          query: { section: "integration" },
        },
      ],
    },
  ];

  return (
    <DetailLayout
      leading={
        <Building2 className="w-6 h-6 text-brand shrink-0" />
      }
      title={`${company.name} Workspace`}
      description={company.description || "Manage workspace settings."}
      tabs={tabs}
      rootHref={companyHref}
      actions={
        <>
            {currentUser?.role === "SUPER_ADMIN" && (
                <button 
                  onClick={handleImpersonate}
                  disabled={isImpersonating}
                  className="px-5 py-2 rounded-[10px] bg-brand text-white font-medium hover:bg-brand/90 transition-all text-[13px] flex items-center gap-2 shadow-[0_0_15px_rgba(var(--brand-rgb),0.2)]"
                >
                  {isImpersonating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <UserCheck className="w-3.5 h-3.5" />}
                  Impersonate Workspace
                </button>
            )}

            <Link 
              href="/admin/companies" 
              className="px-5 py-2 rounded-[10px] bg-foreground/5 text-foreground font-medium hover:bg-foreground/10 transition-all text-[13px] flex items-center gap-2 border border-border-dim/50"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to Companies
            </Link>
        </>
      }
    >
      {children}
    </DetailLayout>
  );
}
