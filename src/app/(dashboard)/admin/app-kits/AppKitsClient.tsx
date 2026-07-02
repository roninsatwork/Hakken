"use client";

import { use, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  ClipboardList,
  Gauge,
  Layers3,
  Loader2,
  Rocket,
  Search,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { getErrorMessage } from "@/src/lib/errors";

type RiskProfile = "LOW" | "MEDIUM" | "HIGH";
type LifecycleStatus = "ACTIVE" | "NEEDS_REVIEW" | "ARCHIVED";

type Template = {
  id: string;
  category: string;
  name: string;
  tagline: string;
  description: string;
  riskProfile: RiskProfile;
  primaryUsers: string[];
  recommendedConnectorKeys: string[];
  recommendedSkills: string[];
  agents: string[];
  knowledgeScopes: string[];
  workflows: string[];
  evalFixtures: string[];
  dashboardCards: string[];
  publishTargets: string[];
  readinessChecks: string[];
  developerFollowUps: string[];
  extensionPoints: string[];
  implementationPointers: ImplementationPointer[];
};

type ImplementationPointer = {
  label: string;
  filePath: string;
  notes: string;
};

type LaunchPlan = {
  _id: Id<"appLaunchPlans">;
  templateName: string;
  category: string;
  riskProfile: RiskProfile;
  status: "DRAFT" | "MATERIALIZED" | "ARCHIVED";
  targetCompanyName?: string;
  notes?: string;
  createdAt: number;
};

type AgentSkill = Doc<"agentSkills">;

type CatalogRegistryItem = {
  templateId: string;
  templateName: string;
  category: string;
  riskProfile: RiskProfile;
  registry: {
    templateId: string;
    lifecycleStatus: LifecycleStatus;
    ownerEmail?: string;
    editorialNotes?: string;
    lastSyncedAt: number;
    updatedAt: number;
  } | null;
  isSynced: boolean;
};

type SetupStep = "use-case" | "workspace" | "integrations" | "knowledge" | "resources" | "safety" | "review";
type CatalogView = "browse" | "plans" | "guide" | "registry";

const riskClassName = {
  LOW: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  MEDIUM: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  HIGH: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

const inputClassName = "w-full bg-transparent border border-border-dim rounded-[8px] px-3 py-2 text-[13px] text-foreground placeholder:text-muted/50 outline-none focus:border-brand/40";
const textareaClassName = "w-full resize-none bg-transparent border border-border-dim rounded-[8px] px-3 py-2 text-[13px] text-foreground placeholder:text-muted/50 outline-none focus:border-brand/40";

const setupSteps: Array<{ key: SetupStep; label: string; summary: string }> = [
  { key: "use-case", label: "Use case", summary: "Confirm this kit fits the customer problem." },
  { key: "workspace", label: "Workspace", summary: "Name the workspace and capture launch ownership." },
  { key: "integrations", label: "Integrations", summary: "Plan connector ownership and setup notes." },
  { key: "knowledge", label: "Knowledge", summary: "Identify source material and policy owners." },
  { key: "resources", label: "Resources", summary: "Review draft agents, workflows, and surfaces." },
  { key: "safety", label: "Safety", summary: "Check approvals, tests, and draft-only behavior." },
  { key: "review", label: "Review", summary: "Create the draft build plan." },
];

const setupStepGuidance: Record<SetupStep, { decision: string; defaultHelp: string }> = {
  "use-case": {
    decision: "Decide whether this starter matches the customer problem before collecting setup details.",
    defaultHelp: "No fields are required here. Continue when the use case, audience, and safety model look right.",
  },
  workspace: {
    decision: "Capture the customer workspace, first owner, product label, and model-use defaults for the draft plan.",
    defaultHelp: "Leave unknown fields blank. The plan can still be saved and completed from the maintenance dashboard.",
  },
  integrations: {
    decision: "Record who owns connector setup and which integrations this launch expects.",
    defaultHelp: "If connector keys are blank, the kit recommendations are applied to the draft plan.",
  },
  knowledge: {
    decision: "Identify the source material that must exist before agents can answer safely.",
    defaultHelp: "If source candidates are blank, the kit knowledge areas are used as placeholders.",
  },
  resources: {
    decision: "Review the inactive agents, workflows, dashboard cards, and surfaces planned for this build.",
    defaultHelp: "This step captures surface intent only. No widgets, app surfaces, agents, or workflows are published here.",
  },
  safety: {
    decision: "Capture launch constraints and confirm the checks that keep the build in review.",
    defaultHelp: "Developer notes are optional but useful when a kit needs custom integration, policy, or UI work.",
  },
  review: {
    decision: "Confirm the handoff summary before creating the durable draft build plan.",
    defaultHelp: "Saving sends you to the maintenance dashboard. It does not activate resources or contact customers.",
  },
};

const catalogIntroSteps = [
  {
    label: "Choose a starter",
    summary: "Match the customer problem to a governed kit with known agents, workflows, and safety checks.",
  },
  {
    label: "Run setup",
    summary: "Capture workspace, connector, knowledge, surface, and approval details in one guided flow.",
  },
  {
    label: "Create drafts",
    summary: "Generate inactive build resources for review before anything customer-facing is enabled.",
  },
];

const catalogViews: Array<{ key: CatalogView; label: string; href: string; icon: typeof Rocket }> = [
  { key: "browse", label: "Browse Kits", href: "/admin/app-kits", icon: Rocket },
  { key: "plans", label: "Draft Plans", href: "/admin/app-kits?view=plans", icon: ClipboardList },
  { key: "guide", label: "Launch Guide", href: "/admin/app-kits?view=guide", icon: BookOpen },
  { key: "registry", label: "Registry", href: "/admin/app-kits?view=registry", icon: Layers3 },
];

function getCatalogView(value: string | null): CatalogView {
  if (value === "plans" || value === "guide" || value === "registry") return value;
  return "browse";
}

function normalizeConnectorName(key: string) {
  return key
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function TemplateChip({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center rounded-[6px] bg-foreground/5 border border-border-dim px-2 py-1 text-[11px] text-secondary">
      {children}
    </span>
  );
}

function SectionList({ title, items, icon = "check" }: { title: string; items: string[]; icon?: "check" | "gauge" }) {
  return (
    <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
      <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 mt-3">
        {items.map((item) => (
          <div key={item} className="flex items-start gap-2 text-[12px] text-secondary leading-relaxed">
            {icon === "gauge" ? (
              <Gauge className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
            )}
            <span>{item}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillRecommendationList({ title, items, activeSkills }: { title: string; items: string[]; activeSkills: AgentSkill[] }) {
  const activeSkillByName = new Map(activeSkills.map((skill) => [skill.name.trim().toLowerCase(), skill]));

  return (
    <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
      <h2 className="text-[13px] font-semibold text-foreground">{title}</h2>
      <div className="flex flex-col gap-2 mt-3">
        {items.map((item) => {
          const activeSkill = activeSkillByName.get(item.trim().toLowerCase());
          const content = (
            <>
              <BrainIcon />
              <span className="min-w-0">
                <span className="block text-[12px] text-secondary leading-relaxed">{item}</span>
                <span className="block text-[10px] font-mono uppercase tracking-widest text-muted">
                  {activeSkill ? `${activeSkill.riskLevel.toLowerCase()} risk · active library skill` : "review library match"}
                </span>
              </span>
            </>
          );

          return activeSkill ? (
            <Link
              key={item}
              href={`/admin/ai/skills/${activeSkill._id}`}
              className="flex items-start gap-2 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2 hover:border-brand/40"
            >
              {content}
            </Link>
          ) : (
            <div key={item} className="flex items-start gap-2 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
              {content}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BrainIcon() {
  return <Bot className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />;
}

function FieldLabel({ children }: { children: string }) {
  return <label className="text-[11px] font-medium text-secondary">{children}</label>;
}

function SummaryRow({ label, value }: { label: string; value?: string }) {
  return (
    <div className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
      <div className="text-[10px] font-mono uppercase text-muted">{label}</div>
      <div className="text-[12px] text-foreground mt-1 break-words">{value?.trim() || "Not provided yet"}</div>
    </div>
  );
}

function LoadingAppKits() {
  const [showLoadingHelp, setShowLoadingHelp] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowLoadingHelp(true), 6000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="flex-1 w-full min-h-[420px] flex items-center justify-center">
      <div className="border border-border-dim bg-card/60 rounded-[8px] p-6 max-w-md text-center">
        <Loader2 className="w-6 h-6 animate-spin text-muted mx-auto" />
        <h1 className="text-[16px] font-semibold text-foreground mt-4">Loading App Kits</h1>
        <p className="text-[13px] text-secondary mt-2">
          Fetching app kits and build plan data.
        </p>
        {showLoadingHelp ? (
          <div className="mt-4 text-left border border-amber-500/20 bg-amber-500/10 rounded-[8px] p-3">
            <p className="text-[12px] text-amber-500 font-medium">Still waiting for Convex data.</p>
            <p className="text-[12px] text-secondary mt-1">
              Try refreshing this page. If it keeps spinning, restart the local app so the latest generated Convex bindings are loaded.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-3 px-3 py-1.5 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90"
            >
              Refresh
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function useAppKitData() {
  const templates = useQuery(api.appTemplates.getAppTemplateGallery) as Template[] | undefined;
  const recentPlans = useQuery(api.appTemplates.getRecentLaunchPlans) as LaunchPlan[] | undefined;
  const catalogRegistry = useQuery(api.appTemplates.getAppTemplateCatalogRegistry) as CatalogRegistryItem[] | undefined;
  const activeSkills = useQuery(api.agentSkills.getActiveSkills, {}) as AgentSkill[] | undefined;
  return { templates, recentPlans, catalogRegistry, activeSkills };
}

function getRegistryStatus(item: CatalogRegistryItem | undefined) {
  if (!item?.registry) return "Not saved";
  return item.isSynced ? "Saved · synced" : "Saved · needs sync";
}

function parseCommaList(value: string) {
  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function buildToggledListValue(
  currentValue: string,
  defaultItems: string[],
  item: string,
  shouldInclude: boolean,
  useDefaultItemsWhenBlank: boolean,
) {
  const sourceItems = currentValue.trim()
    ? parseCommaList(currentValue)
    : useDefaultItemsWhenBlank ? defaultItems : [];
  const nextItems = shouldInclude
    ? Array.from(new Set([...sourceItems, item]))
    : sourceItems.filter((sourceItem) => sourceItem !== item);
  return nextItems.join(", ");
}

function formatListPreview(items: string[], fallback: string, limit = 2) {
  if (items.length === 0) return fallback;
  const visibleItems = items.slice(0, limit).join(", ");
  const remainingCount = items.length - limit;
  return remainingCount > 0 ? `${visibleItems} +${remainingCount} more` : visibleItems;
}

function SetupChecklistOption({
  checked,
  label,
  onChange,
  supportingText,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  supportingText?: string;
}) {
  return (
    <label className="flex items-start gap-3 rounded-[8px] border border-border-dim bg-background/30 px-3 py-2 text-left">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 rounded border-border-dim accent-brand"
      />
      <span className="min-w-0">
        <span className="block text-[12px] font-medium text-foreground">{label}</span>
        {supportingText ? <span className="block text-[11px] text-muted leading-relaxed mt-0.5">{supportingText}</span> : null}
      </span>
    </label>
  );
}

function createSetupOverrides({
  brandProductName,
  brandAccentHex,
  firstAdminEmail,
  invitePolicyNotes,
  modelDefaultUseCases,
  targetPlanName,
  connectorOwnerEmail,
  selectedConnectorKeys,
  connectorBundleNotes,
  knowledgeOwnerEmail,
  starterKnowledgeSources,
  knowledgeSourceNotes,
  surfaceOwnerEmail,
  selectedPublishTargets,
  publishSurfaceNotes,
}: {
  brandProductName: string;
  brandAccentHex: string;
  firstAdminEmail: string;
  invitePolicyNotes: string;
  modelDefaultUseCases: string;
  targetPlanName: string;
  connectorOwnerEmail: string;
  selectedConnectorKeys: string;
  connectorBundleNotes: string;
  knowledgeOwnerEmail: string;
  starterKnowledgeSources: string;
  knowledgeSourceNotes: string;
  surfaceOwnerEmail: string;
  selectedPublishTargets: string;
  publishSurfaceNotes: string;
}) {
  const parsedUseCases = Array.from(new Set(modelDefaultUseCases
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)));
  const parsedKnowledgeSources = Array.from(new Set(starterKnowledgeSources
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)));
  const parsedConnectorKeys = Array.from(new Set(selectedConnectorKeys
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)));
  const parsedPublishTargets = Array.from(new Set(selectedPublishTargets
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean)));

  return {
    ...(brandProductName.trim() ? { brandProductName: brandProductName.trim() } : {}),
    ...(brandAccentHex.trim() ? { brandAccentHex: brandAccentHex.trim() } : {}),
    ...(firstAdminEmail.trim() ? { firstAdminEmail: firstAdminEmail.trim() } : {}),
    ...(invitePolicyNotes.trim() ? { invitePolicyNotes: invitePolicyNotes.trim() } : {}),
    ...(parsedUseCases.length > 0 ? { modelDefaultUseCases: parsedUseCases } : {}),
    ...(targetPlanName.trim() ? { targetPlanName: targetPlanName.trim() } : {}),
    ...(connectorOwnerEmail.trim() ? { connectorOwnerEmail: connectorOwnerEmail.trim() } : {}),
    ...(parsedConnectorKeys.length > 0 ? { selectedConnectorKeys: parsedConnectorKeys } : {}),
    ...(connectorBundleNotes.trim() ? { connectorBundleNotes: connectorBundleNotes.trim() } : {}),
    ...(knowledgeOwnerEmail.trim() ? { knowledgeOwnerEmail: knowledgeOwnerEmail.trim() } : {}),
    ...(parsedKnowledgeSources.length > 0 ? { starterKnowledgeSources: parsedKnowledgeSources } : {}),
    ...(knowledgeSourceNotes.trim() ? { knowledgeSourceNotes: knowledgeSourceNotes.trim() } : {}),
    ...(surfaceOwnerEmail.trim() ? { surfaceOwnerEmail: surfaceOwnerEmail.trim() } : {}),
    ...(parsedPublishTargets.length > 0 ? { selectedPublishTargets: parsedPublishTargets } : {}),
    ...(publishSurfaceNotes.trim() ? { publishSurfaceNotes: publishSurfaceNotes.trim() } : {}),
  };
}

export function AppKitsCatalogPage() {
  const { templates, recentPlans, catalogRegistry } = useAppKitData();
  const searchParams = useSearchParams();
  const activeCatalogView = getCatalogView(searchParams?.get("view") ?? null);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [activeRisk, setActiveRisk] = useState<"ALL" | RiskProfile>("ALL");

  const categories = useMemo(() => {
    const values = templates ? Array.from(new Set(templates.map((template) => template.category))).sort() : [];
    return ["All", ...values];
  }, [templates]);

  const registryByTemplateId = useMemo(() => {
    return new Map((catalogRegistry ?? []).map((item) => [item.templateId, item]));
  }, [catalogRegistry]);

  const registrySummary = useMemo(() => {
    const items = catalogRegistry ?? [];
    return {
      persistedCount: items.filter((item) => item.registry).length,
      staleCount: items.filter((item) => item.registry && !item.isSynced).length,
    };
  }, [catalogRegistry]);

  const registryLifecycleSummary = useMemo(() => {
    const items = catalogRegistry ?? [];
    return {
      activeCount: items.filter((item) => item.registry?.lifecycleStatus === "ACTIVE").length,
      needsReviewCount: items.filter((item) => item.registry?.lifecycleStatus === "NEEDS_REVIEW").length,
      archivedCount: items.filter((item) => item.registry?.lifecycleStatus === "ARCHIVED").length,
      unsavedCount: (templates ?? []).filter((template) => !registryByTemplateId.get(template.id)?.registry).length,
    };
  }, [catalogRegistry, registryByTemplateId, templates]);

  const filteredTemplates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return (templates ?? []).filter((template) => {
      const matchesCategory = activeCategory === "All" || template.category === activeCategory;
      const matchesRisk = activeRisk === "ALL" || template.riskProfile === activeRisk;
      const searchable = [
        template.name,
        template.tagline,
        template.description,
        template.category,
        ...template.primaryUsers,
        ...template.recommendedConnectorKeys,
        ...template.recommendedSkills,
        ...template.agents,
        ...template.workflows,
        ...template.knowledgeScopes,
        ...template.implementationPointers.map((pointer) => `${pointer.label} ${pointer.filePath}`),
      ].join(" ").toLowerCase();
      return matchesCategory && matchesRisk && (!query || searchable.includes(query));
    });
  }, [activeCategory, activeRisk, searchTerm, templates]);

  if (templates === undefined) {
    return <LoadingAppKits />;
  }

  const visibleRecentPlans = recentPlans ?? [];

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <AdminPageHeader
        icon={<Rocket className="w-6 h-6 text-brand" />}
        title="App Kits"
        description="Find a starter kit, review what it creates, then run setup when the scope is right."
      />

      <nav className="flex items-center gap-1 border-b border-border-dim/50 pb-px overflow-x-auto custom-scrollbar" aria-label="App kit views">
        {catalogViews.map((view) => {
          const Icon = view.icon;
          const isActive = activeCatalogView === view.key;

          return (
            <Link
              key={view.key}
              href={view.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex h-11 shrink-0 items-center gap-2 rounded-t-[8px] border-b-2 px-4 text-[13px] font-medium transition-colors whitespace-nowrap ${
                isActive
                  ? "border-brand bg-brand/5 text-brand"
                  : "border-transparent text-secondary hover:border-foreground/30 hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" />
              {view.label}
            </Link>
          );
        })}
      </nav>

      {activeCatalogView === "browse" ? (
        <>
          <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
            <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto] gap-4">
              <div className="w-full flex items-center gap-2 px-4 py-3 bg-background/30 border border-border-dim rounded-[10px]">
                <Search className="w-4 h-4 text-muted" />
                <input
                  value={searchTerm}
                  onChange={(event) => setSearchTerm(event.target.value)}
                  placeholder="Search templates, connectors, agents, or use cases..."
                  className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
                />
              </div>
              <div className="flex items-center gap-3 text-[11px] text-secondary">
                <span>{templates.length} kits</span>
                <span>{categories.length - 1} categories</span>
                <span>{registrySummary.persistedCount}/{templates.length} saved</span>
                {registrySummary.staleCount > 0 ? <span className="text-amber-500">{registrySummary.staleCount} need sync</span> : null}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 mt-4">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1.5 rounded-[8px] border text-[12px] transition-colors ${
                    activeCategory === category
                      ? "border-brand/40 bg-brand/10 text-foreground"
                      : "border-border-dim bg-background/30 text-secondary hover:text-foreground"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 mt-3">
              {(["ALL", "LOW", "MEDIUM", "HIGH"] as const).map((risk) => (
                <button
                  key={risk}
                  type="button"
                  onClick={() => setActiveRisk(risk)}
                  className={`px-3 py-1.5 rounded-[8px] border text-[12px] transition-colors ${
                    activeRisk === risk
                      ? "border-foreground/30 bg-foreground/10 text-foreground"
                      : "border-border-dim bg-background/30 text-secondary hover:text-foreground"
                  }`}
                >
                  {risk === "ALL" ? "All risk" : risk.charAt(0) + risk.slice(1).toLowerCase()}
                </button>
              ))}
            </div>
          </section>

          <section className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredTemplates.map((template) => {
              const registryItem = registryByTemplateId.get(template.id);
              return (
                <Link
                  key={template.id}
                  href={`/admin/app-kits/${template.id}`}
                  className="group border border-border-dim rounded-[8px] p-4 bg-card/50 hover:border-brand/40 focus-visible:border-brand/50 focus-visible:outline-none transition-colors"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-bold uppercase text-brand bg-brand/10 border border-brand/20 rounded-[6px] px-2 py-0.5">
                          {template.category}
                        </span>
                        <span className={`text-[10px] font-bold uppercase rounded-[6px] border px-2 py-0.5 ${riskClassName[template.riskProfile]}`}>
                          {template.riskProfile}
                        </span>
                      </div>
                      <h2 className="text-[15px] font-semibold text-foreground mt-3 group-hover:text-brand transition-colors">{template.name}</h2>
                      <p className="text-[12px] text-secondary mt-1 leading-relaxed">{template.tagline}</p>
                    </div>
                    <ArrowRight className="w-4 h-4 text-muted group-hover:text-brand flex-shrink-0 transition-colors" />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted">Best for</div>
                      <p className="text-[11px] text-secondary leading-relaxed mt-1">{formatListPreview(template.primaryUsers, "Teams validating an AI workflow")}</p>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted">Needs</div>
                      <p className="text-[11px] text-secondary leading-relaxed mt-1">
                        {formatListPreview(template.recommendedConnectorKeys.map(normalizeConnectorName), "Connector ownership")} · {formatListPreview(template.knowledgeScopes, "Knowledge sources", 1)}
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted">Creates</div>
                      <p className="text-[11px] text-secondary leading-relaxed mt-1">
                        {template.agents.length} agents, {template.recommendedSkills.length} skills, {template.workflows.length} workflows
                      </p>
                    </div>
                    <div>
                      <div className="text-[10px] font-mono uppercase text-muted">Safety</div>
                      <p className="text-[11px] text-secondary leading-relaxed mt-1">Draft-only resources · {getRegistryStatus(registryItem)}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 mt-4 pt-3 border-t border-border-dim">
                    <span className="text-[11px] text-muted">Setup creates a reviewable build plan first.</span>
                    <span className="inline-flex items-center gap-1 text-[12px] font-medium text-brand whitespace-nowrap">
                      Review kit
                      <ArrowRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </Link>
              );
            })}
            {filteredTemplates.length === 0 ? (
              <div className="lg:col-span-2 border border-dashed border-border-dim rounded-[8px] py-12 text-center text-[13px] text-muted">
                No app kits match the current filters.
              </div>
            ) : null}
          </section>
        </>
      ) : null}

      {activeCatalogView === "plans" ? (
        <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-foreground">Recent Build Plans</h2>
              <p className="text-[12px] text-secondary mt-1">Saved drafts remain developer checkpoints before creating companies, agents, workflows, knowledge, widgets, or custom surfaces.</p>
            </div>
            <span className="text-[11px] font-mono text-muted">{visibleRecentPlans.length} drafts</span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 mt-4">
            {recentPlans === undefined ? (
              <div className="md:col-span-2 xl:col-span-4 border border-dashed border-border-dim rounded-[8px] py-8 text-center">
                <Loader2 className="w-4 h-4 animate-spin text-muted mx-auto" />
                <p className="text-[13px] text-muted mt-2">Loading recent build plans...</p>
              </div>
            ) : visibleRecentPlans.length > 0 ? visibleRecentPlans.map((plan) => (
              <Link key={plan._id} href={`/admin/app-kits/plans/${plan._id}`} className="block border border-border-dim rounded-[8px] p-3 bg-background/40 hover:border-brand/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-brand">{plan.category}</span>
                    <h3 className="text-[13px] font-semibold text-foreground mt-1 truncate">{plan.targetCompanyName || plan.templateName}</h3>
                    <p className="text-[11px] text-secondary mt-1 truncate">{plan.templateName}</p>
                  </div>
                  <span className={`text-[9px] font-bold uppercase rounded-[6px] border px-2 py-0.5 ${riskClassName[plan.riskProfile]}`}>
                    {plan.riskProfile}
                  </span>
                </div>
                {plan.notes ? <p className="text-[11px] text-muted mt-3 line-clamp-2">{plan.notes}</p> : null}
                <div className="flex items-center justify-between mt-3 text-[10px] text-muted">
                  <span>{plan.status}</span>
                  <span>{new Date(plan.createdAt).toLocaleDateString()}</span>
                </div>
              </Link>
            )) : (
              <div className="md:col-span-2 xl:col-span-4 border border-dashed border-border-dim rounded-[8px] py-8 text-center text-[13px] text-muted">
                No draft build plans saved yet.
              </div>
            )}
          </div>
        </section>
      ) : null}

      {activeCatalogView === "guide" ? (
        <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
          <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1.6fr)] gap-4">
            <div>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand">Guided launch path</span>
              <h2 className="text-[16px] font-semibold text-foreground mt-2">Start with a safe draft, then review before release.</h2>
              <p className="text-[12px] text-secondary leading-relaxed mt-2">
                App Kits are reusable blueprints for common AI products. Each kit turns setup answers into a draft build plan before any customer-facing resource is enabled.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {catalogIntroSteps.map((step, index) => (
                <div key={step.label} className="border border-border-dim bg-background/30 rounded-[8px] p-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-[6px] bg-brand/10 text-[11px] font-bold text-brand border border-brand/20">
                      {index + 1}
                    </span>
                    <h3 className="text-[12px] font-semibold text-foreground">{step.label}</h3>
                  </div>
                  <p className="text-[11px] text-secondary leading-relaxed mt-2">{step.summary}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {activeCatalogView === "registry" ? (
        <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-[15px] font-semibold text-foreground">Catalog Registry</h2>
            <p className="text-[12px] text-secondary">
              Internal persistence and sync status for app kit metadata. Edit individual registry records from each kit detail page.
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-6 gap-3 mt-4">
            {[
              { label: "Saved", value: registrySummary.persistedCount },
              { label: "Needs sync", value: registrySummary.staleCount },
              { label: "Active", value: registryLifecycleSummary.activeCount },
              { label: "Needs review", value: registryLifecycleSummary.needsReviewCount },
              { label: "Archived", value: registryLifecycleSummary.archivedCount },
              { label: "Unsaved", value: registryLifecycleSummary.unsavedCount },
            ].map((item) => (
              <div key={item.label} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-3">
                <div className="text-[10px] font-mono uppercase text-muted">{item.label}</div>
                <div className="text-[20px] font-semibold text-foreground mt-1">{item.value}</div>
              </div>
            ))}
          </div>

          {catalogRegistry === undefined ? (
            <div className="border border-dashed border-border-dim rounded-[8px] py-8 text-center mt-4">
              <Loader2 className="w-4 h-4 animate-spin text-muted mx-auto" />
              <p className="text-[13px] text-muted mt-2">Loading catalog registry...</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-4">
              {templates.map((template) => {
                const item = registryByTemplateId.get(template.id);
                return (
                  <Link
                    key={template.id}
                    href={`/admin/app-kits/${template.id}`}
                    className="group rounded-[8px] border border-border-dim bg-background/30 p-3 transition-colors hover:border-brand/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[10px] font-bold uppercase text-brand">{template.category}</span>
                          <span className={`text-[9px] font-bold uppercase rounded-[6px] border px-2 py-0.5 ${riskClassName[template.riskProfile]}`}>
                            {template.riskProfile}
                          </span>
                        </div>
                        <h3 className="text-[13px] font-semibold text-foreground mt-1 group-hover:text-brand">{template.name}</h3>
                        <p className="text-[11px] text-secondary mt-1">
                          {item?.registry
                            ? `${item.registry.lifecycleStatus.replaceAll("_", " ")} · ${item.isSynced ? "synced" : "needs sync"}`
                            : "Not saved"}
                        </p>
                      </div>
                      <ArrowRight className="w-4 h-4 text-muted group-hover:text-brand flex-shrink-0 transition-colors" />
                    </div>
                    {item?.registry?.ownerEmail ? (
                      <p className="text-[11px] text-muted mt-3 truncate">Owner: {item.registry.ownerEmail}</p>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      ) : null}
    </div>
  );
}

export function AppKitDetailPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = use(params);
  return <AppKitDetailContent templateId={templateId} />;
}

export function AppKitDetailContent({ templateId }: { templateId: string }) {
  const { templates, catalogRegistry, activeSkills } = useAppKitData();
  const syncCatalogRegistry = useMutation(api.appTemplates.syncAppTemplateCatalogRegistry);
  const updateCatalogItem = useMutation(api.appTemplates.updateAppTemplateCatalogItem);
  const [catalogLifecycleStatus, setCatalogLifecycleStatus] = useState<LifecycleStatus>("ACTIVE");
  const [catalogOwnerEmail, setCatalogOwnerEmail] = useState("");
  const [catalogEditorialNotes, setCatalogEditorialNotes] = useState("");
  const [isSyncingCatalog, setIsSyncingCatalog] = useState(false);
  const [isUpdatingCatalog, setIsUpdatingCatalog] = useState(false);
  const [catalogMessage, setCatalogMessage] = useState("");
  const [catalogError, setCatalogError] = useState("");

  const selectedTemplate = useMemo(() => {
    return (templates ?? []).find((template) => template.id === templateId);
  }, [templateId, templates]);

  const selectedCatalogItem = useMemo(() => {
    if (!selectedTemplate || !catalogRegistry) return undefined;
    return catalogRegistry.find((item) => item.templateId === selectedTemplate.id);
  }, [catalogRegistry, selectedTemplate]);

  const registrySummary = useMemo(() => {
    const items = catalogRegistry ?? [];
    return {
      persistedCount: items.filter((item) => item.registry).length,
      staleCount: items.filter((item) => item.registry && !item.isSynced).length,
    };
  }, [catalogRegistry]);

  useEffect(() => {
    if (!selectedTemplate) return;
    setCatalogLifecycleStatus(selectedCatalogItem?.registry?.lifecycleStatus ?? "ACTIVE");
    setCatalogOwnerEmail(selectedCatalogItem?.registry?.ownerEmail ?? "");
    setCatalogEditorialNotes(selectedCatalogItem?.registry?.editorialNotes ?? "");
    setCatalogMessage("");
    setCatalogError("");
  }, [selectedCatalogItem, selectedTemplate]);

  const handleSyncCatalog = async () => {
    if (isSyncingCatalog) return;
    setIsSyncingCatalog(true);
    setCatalogError("");
    setCatalogMessage("");
    try {
      const result = await syncCatalogRegistry({});
      setCatalogMessage(`Registry synced: ${result.createdCount} created, ${result.updatedCount} updated.`);
    } catch (error) {
      setCatalogError(getErrorMessage(error, "Could not sync app kit registry."));
    } finally {
      setIsSyncingCatalog(false);
    }
  };

  const handleUpdateCatalogItem = async () => {
    if (!selectedTemplate || isUpdatingCatalog) return;
    setIsUpdatingCatalog(true);
    setCatalogError("");
    setCatalogMessage("");
    try {
      await updateCatalogItem({
        templateId: selectedTemplate.id,
        lifecycleStatus: catalogLifecycleStatus,
        ownerEmail: catalogOwnerEmail,
        editorialNotes: catalogEditorialNotes,
      });
      setCatalogMessage("Registry item saved.");
    } catch (error) {
      setCatalogError(getErrorMessage(error, "Could not update app kit registry item."));
    } finally {
      setIsUpdatingCatalog(false);
    }
  };

  if (templates === undefined) {
    return <LoadingAppKits />;
  }

  if (!selectedTemplate) {
    return (
      <div className="flex flex-col gap-5 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
        <Link href="/admin/app-kits" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" />
          App Kits
        </Link>
        <div className="border border-dashed border-border-dim rounded-[8px] py-12 text-center">
          <h1 className="text-[16px] font-semibold text-foreground">App kit not found</h1>
          <p className="text-[13px] text-secondary mt-2">The requested template is not available in the current catalog.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <Link href="/admin/app-kits" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-foreground transition-colors w-max">
        <ArrowLeft className="w-4 h-4" />
        App Kits
      </Link>

      <header className="border border-border-dim bg-card/50 rounded-[8px] p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[10px] font-bold uppercase text-brand bg-brand/10 border border-brand/20 rounded-[6px] px-2 py-0.5">
                {selectedTemplate.category}
              </span>
              <span className={`text-[10px] font-bold uppercase rounded-[6px] border px-2 py-0.5 ${riskClassName[selectedTemplate.riskProfile]}`}>
                {selectedTemplate.riskProfile}
              </span>
              <span className="text-[10px] font-mono text-muted">{getRegistryStatus(selectedCatalogItem)}</span>
            </div>
            <h1 className="text-2xl font-bold text-foreground mt-3">{selectedTemplate.name}</h1>
            <p className="text-[13px] text-secondary mt-2 leading-relaxed max-w-3xl">{selectedTemplate.description}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href={`/admin/app-kits/${selectedTemplate.id}/setup`} className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90">
              Start setup
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
            <Link href="/admin/agents" className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5">
              <Bot className="w-3.5 h-3.5" />
              Agents
            </Link>
            <Link href="/admin/workflows" className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5">
              <Workflow className="w-3.5 h-3.5" />
              Workflows
            </Link>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-4">
          {selectedTemplate.primaryUsers.map((user) => (
            <TemplateChip key={user}>{user}</TemplateChip>
          ))}
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-5">
        <div className="flex flex-col gap-5 min-w-0">
          <section className="grid grid-cols-1 lg:grid-cols-3 gap-3">
            <div className="border border-border-dim bg-card/50 rounded-[8px] p-4">
              <h2 className="text-[13px] font-semibold text-foreground">What this kit does</h2>
              <p className="text-[12px] text-secondary mt-2 leading-relaxed">{selectedTemplate.tagline}</p>
            </div>
            <div className="border border-border-dim bg-card/50 rounded-[8px] p-4">
              <h2 className="text-[13px] font-semibold text-foreground">What it creates</h2>
              <p className="text-[12px] text-secondary mt-2 leading-relaxed">
                {selectedTemplate.agents.length} draft agents, {selectedTemplate.workflows.length} workflows, and {selectedTemplate.evalFixtures.length} test cases.
              </p>
            </div>
            <div className="border border-border-dim bg-card/50 rounded-[8px] p-4">
              <h2 className="text-[13px] font-semibold text-foreground">What stays safe</h2>
              <p className="text-[12px] text-secondary mt-2 leading-relaxed">
                Draft resources stay inactive and need human approval before customer-facing use.
              </p>
            </div>
          </section>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <SectionList title="Agents" items={selectedTemplate.agents} />
            <SkillRecommendationList title="Recommended skills" items={selectedTemplate.recommendedSkills} activeSkills={activeSkills ?? []} />
            <SectionList title="Workflows" items={selectedTemplate.workflows} />
            <SectionList title="Knowledge areas" items={selectedTemplate.knowledgeScopes} />
            <SectionList title="Test cases before launch" items={selectedTemplate.evalFixtures} />
          </div>

          <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
            <h2 className="text-[13px] font-semibold text-foreground">Recommended integrations</h2>
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedTemplate.recommendedConnectorKeys.map((key) => (
                <TemplateChip key={key}>{normalizeConnectorName(key)}</TemplateChip>
              ))}
            </div>
          </section>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <SectionList title="Readiness Checks" items={selectedTemplate.readinessChecks} icon="gauge" />
            <SectionList title="Developer work still needed" items={selectedTemplate.developerFollowUps} />
          </div>

          <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
            <h2 className="text-[13px] font-semibold text-foreground">Where this can be customized</h2>
            <div className="flex flex-wrap gap-2 mt-3">
              {selectedTemplate.extensionPoints.map((point) => (
                <TemplateChip key={point}>{point}</TemplateChip>
              ))}
            </div>
          </section>

          <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
            <h2 className="text-[13px] font-semibold text-foreground">Developer reference files</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
              {selectedTemplate.implementationPointers.map((pointer) => (
                <div key={`${pointer.label}-${pointer.filePath}`} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                  <div className="text-[12px] font-medium text-foreground">{pointer.label}</div>
                  <div className="text-[11px] font-mono text-brand mt-1 break-all">{pointer.filePath}</div>
                  <p className="text-[11px] text-secondary mt-2 leading-relaxed">{pointer.notes}</p>
                </div>
              ))}
            </div>
          </section>
        </div>

        <aside className="flex flex-col gap-4">
          <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Layers3 className="w-4 h-4 text-brand" />
                  <h2 className="text-[13px] font-semibold text-foreground">Internal catalog status</h2>
                </div>
                <p className="text-[12px] text-secondary mt-2">
                  {selectedCatalogItem?.registry
                    ? `${selectedCatalogItem.registry.lifecycleStatus.replaceAll("_", " ")} · ${selectedCatalogItem.isSynced ? "synced" : "needs sync"}`
                    : "Not persisted yet"}
                </p>
              </div>
              <span className="text-[10px] font-mono text-muted whitespace-nowrap">
                {registrySummary.persistedCount}/{templates.length} saved
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 mt-3">
              <select
                value={catalogLifecycleStatus}
                onChange={(event) => setCatalogLifecycleStatus(event.target.value as LifecycleStatus)}
                aria-label="Catalog lifecycle status"
                className={inputClassName}
              >
                <option value="ACTIVE">Active</option>
                <option value="NEEDS_REVIEW">Needs review</option>
                <option value="ARCHIVED">Archived</option>
              </select>
              <input
                value={catalogOwnerEmail}
                onChange={(event) => setCatalogOwnerEmail(event.target.value)}
                placeholder="Catalog owner email"
                className={inputClassName}
              />
              <textarea
                value={catalogEditorialNotes}
                onChange={(event) => setCatalogEditorialNotes(event.target.value)}
                placeholder="Catalog registry notes"
                rows={2}
                className={textareaClassName}
              />
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={handleSyncCatalog}
                  disabled={isSyncingCatalog}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5 disabled:opacity-50"
                >
                  {isSyncingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Sync registry
                </button>
                <button
                  type="button"
                  onClick={handleUpdateCatalogItem}
                  disabled={isUpdatingCatalog}
                  className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
                >
                  {isUpdatingCatalog ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                  Save registry item
                </button>
              </div>
              {registrySummary.staleCount > 0 ? (
                <p className="text-[11px] text-amber-500">{registrySummary.staleCount} registry item{registrySummary.staleCount === 1 ? "" : "s"} need source sync.</p>
              ) : null}
              {catalogMessage ? <p className="text-[11px] text-emerald-500">{catalogMessage}</p> : null}
              {catalogError ? <p className="text-[11px] text-rose-500">{catalogError}</p> : null}
            </div>
          </section>

          <section className="border border-border-dim bg-card/50 rounded-[8px] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-brand" />
              <h2 className="text-[13px] font-semibold text-foreground">Create draft build plan</h2>
            </div>
            <p className="text-[12px] text-secondary mt-2 leading-relaxed">
              The guided setup captures workspace, integration, knowledge, safety, and developer notes before saving anything.
            </p>
            <Link
              href={`/admin/app-kits/${selectedTemplate.id}/setup`}
              className="inline-flex items-center justify-between gap-3 w-full mt-4 px-3 py-2 rounded-[8px] bg-foreground text-background text-[13px] font-medium hover:opacity-90"
            >
              <span>Start setup</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          </section>
        </aside>
      </section>
    </div>
  );
}

export function AppKitSetupPage({ params }: { params: Promise<{ templateId: string }> }) {
  const { templateId } = use(params);
  return <AppKitSetupContent templateId={templateId} />;
}

export function AppKitSetupContent({ templateId }: { templateId: string }) {
  const router = useRouter();
  const { templates, activeSkills } = useAppKitData();
  const createLaunchPlan = useMutation(api.appTemplates.createLaunchPlan);
  const [activeStepIndex, setActiveStepIndex] = useState(0);
  const [targetCompanyName, setTargetCompanyName] = useState("");
  const [brandProductName, setBrandProductName] = useState("");
  const [brandAccentHex, setBrandAccentHex] = useState("");
  const [firstAdminEmail, setFirstAdminEmail] = useState("");
  const [invitePolicyNotes, setInvitePolicyNotes] = useState("");
  const [modelDefaultUseCases, setModelDefaultUseCases] = useState("agent, workflow, chat, report, router, embedding");
  const [targetPlanName, setTargetPlanName] = useState("");
  const [connectorOwnerEmail, setConnectorOwnerEmail] = useState("");
  const [selectedConnectorKeys, setSelectedConnectorKeys] = useState("");
  const [connectorSelectionTouched, setConnectorSelectionTouched] = useState(false);
  const [connectorBundleNotes, setConnectorBundleNotes] = useState("");
  const [knowledgeOwnerEmail, setKnowledgeOwnerEmail] = useState("");
  const [starterKnowledgeSources, setStarterKnowledgeSources] = useState("");
  const [knowledgeSelectionTouched, setKnowledgeSelectionTouched] = useState(false);
  const [knowledgeSourceNotes, setKnowledgeSourceNotes] = useState("");
  const [surfaceOwnerEmail, setSurfaceOwnerEmail] = useState("");
  const [selectedPublishTargets, setSelectedPublishTargets] = useState("");
  const [publishTargetSelectionTouched, setPublishTargetSelectionTouched] = useState(false);
  const [publishSurfaceNotes, setPublishSurfaceNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [createError, setCreateError] = useState("");

  const selectedTemplate = useMemo(() => {
    return (templates ?? []).find((template) => template.id === templateId);
  }, [templateId, templates]);

  if (templates === undefined) {
    return <LoadingAppKits />;
  }

  if (!selectedTemplate) {
    return (
      <div className="flex flex-col gap-5 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
        <Link href="/admin/app-kits" className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-foreground transition-colors w-max">
          <ArrowLeft className="w-4 h-4" />
          App Kits
        </Link>
        <div className="border border-dashed border-border-dim rounded-[8px] py-12 text-center">
          <h1 className="text-[16px] font-semibold text-foreground">App kit not found</h1>
          <p className="text-[13px] text-secondary mt-2">The requested template is not available in the current catalog.</p>
        </div>
      </div>
    );
  }

  const activeStep = setupSteps[activeStepIndex];
  const isFirstStep = activeStepIndex === 0;
  const isLastStep = activeStepIndex === setupSteps.length - 1;
  const activeStepGuidance = setupStepGuidance[activeStep.key];
  const effectiveConnectorKeys = connectorSelectionTouched ? selectedConnectorKeys : selectedTemplate.recommendedConnectorKeys.join(", ");
  const effectiveKnowledgeSources = knowledgeSelectionTouched ? starterKnowledgeSources : selectedTemplate.knowledgeScopes.join(", ");
  const effectivePublishTargets = publishTargetSelectionTouched ? selectedPublishTargets : selectedTemplate.publishTargets.join(", ");
  const selectedConnectorKeyValues = parseCommaList(effectiveConnectorKeys);
  const selectedKnowledgeSourceValues = parseCommaList(effectiveKnowledgeSources);
  const selectedPublishTargetValues = parseCommaList(effectivePublishTargets);

  const handleCreateLaunchPlan = async () => {
    if (isCreatingPlan) return;
    setIsCreatingPlan(true);
    setCreateError("");
    try {
      const planId = await createLaunchPlan({
        templateId: selectedTemplate.id,
        targetCompanyName: targetCompanyName.trim() || undefined,
        notes: notes.trim() || undefined,
        setupOverrides: createSetupOverrides({
          brandProductName,
          brandAccentHex,
          firstAdminEmail,
          invitePolicyNotes,
          modelDefaultUseCases,
          targetPlanName,
          connectorOwnerEmail,
          selectedConnectorKeys: effectiveConnectorKeys,
          connectorBundleNotes,
          knowledgeOwnerEmail,
          starterKnowledgeSources: effectiveKnowledgeSources,
          knowledgeSourceNotes,
          surfaceOwnerEmail,
          selectedPublishTargets: effectivePublishTargets,
          publishSurfaceNotes,
        }),
      });
      router.push(`/admin/app-kits/plans/${planId}`);
    } catch (error) {
      setCreateError(getErrorMessage(error, "Could not create build plan."));
      setIsCreatingPlan(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <Link href={`/admin/app-kits/${selectedTemplate.id}`} className="inline-flex items-center gap-2 text-[13px] text-muted hover:text-foreground transition-colors w-max">
        <ArrowLeft className="w-4 h-4" />
        Kit overview
      </Link>

      <header className="border border-border-dim bg-card/50 rounded-[8px] p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <div className="text-[10px] font-mono uppercase text-muted">Guided setup</div>
            <h1 className="text-2xl font-bold text-foreground mt-2">{selectedTemplate.name}</h1>
            <p className="text-[13px] text-secondary mt-2 max-w-3xl">
              Work through the setup details, review what will be created, then save a draft build plan. Nothing is activated, published, connected, or invited from this wizard.
            </p>
          </div>
          <span className="rounded-[6px] border border-brand/20 bg-brand/10 px-2 py-1 text-[10px] font-bold uppercase text-brand w-max">
            Step {activeStepIndex + 1} of {setupSteps.length}
          </span>
        </div>
      </header>

      <section className="grid grid-cols-1 xl:grid-cols-[280px_minmax(0,1fr)] gap-5">
        <aside className="border border-border-dim bg-card/50 rounded-[8px] p-3 h-max">
          <div className="flex flex-col gap-1">
            {setupSteps.map((step, index) => {
              const stepState = index < activeStepIndex ? "Complete" : index === activeStepIndex ? "Current" : "Upcoming";
              return (
                <button
                  key={step.key}
                  type="button"
                  onClick={() => setActiveStepIndex(index)}
                  className={`text-left rounded-[8px] px-3 py-2 transition-colors ${
                    index === activeStepIndex ? "bg-brand/10 text-foreground" : "text-secondary hover:bg-foreground/5 hover:text-foreground"
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-[12px] font-semibold">{step.label}</div>
                    <span className={`text-[9px] font-bold uppercase ${index === activeStepIndex ? "text-brand" : "text-muted"}`}>
                      {stepState}
                    </span>
                  </div>
                  <div className="text-[11px] text-muted mt-0.5">{step.summary}</div>
                </button>
              );
            })}
          </div>
        </aside>

        <div className="border border-border-dim bg-card/50 rounded-[8px] p-5 min-w-0">
          <div>
            <div className="text-[10px] font-mono uppercase text-muted">Step {activeStepIndex + 1}</div>
            <h2 className="text-[18px] font-semibold text-foreground mt-1">{activeStep.label}</h2>
            <p className="text-[13px] text-secondary mt-1">{activeStep.summary}</p>
          </div>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
              <div className="text-[10px] font-mono uppercase text-muted">What to decide</div>
              <p className="text-[12px] text-secondary leading-relaxed mt-1">{activeStepGuidance.decision}</p>
            </div>
            <div className="rounded-[8px] border border-border-dim bg-background/30 p-3">
              <div className="text-[10px] font-mono uppercase text-muted">Safe to leave blank</div>
              <p className="text-[12px] text-secondary leading-relaxed mt-1">{activeStepGuidance.defaultHelp}</p>
            </div>
          </div>

          <div className="mt-5">
            {activeStep.key === "use-case" ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Best for</h3>
                  <div className="flex flex-wrap gap-2 mt-3">
                    {selectedTemplate.primaryUsers.map((user) => <TemplateChip key={user}>{user}</TemplateChip>)}
                  </div>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Outcome</h3>
                  <p className="text-[12px] text-secondary mt-2 leading-relaxed">{selectedTemplate.description}</p>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Safety</h3>
                  <p className="text-[12px] text-secondary mt-2 leading-relaxed">The wizard only saves a draft build plan. Agents and workflows stay inactive until later review.</p>
                </div>
              </div>
            ) : null}

            {activeStep.key === "workspace" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Target workspace name</FieldLabel>
                  <input value={targetCompanyName} onChange={(event) => setTargetCompanyName(event.target.value)} placeholder="Target workspace name" className={inputClassName} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Product or app name</FieldLabel>
                  <input value={brandProductName} onChange={(event) => setBrandProductName(event.target.value)} placeholder="Product or app name" className={inputClassName} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Brand accent</FieldLabel>
                  <input value={brandAccentHex} onChange={(event) => setBrandAccentHex(event.target.value)} placeholder="Brand accent HEX, e.g. #0f766e" className={inputClassName} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>First tenant admin</FieldLabel>
                  <input value={firstAdminEmail} onChange={(event) => setFirstAdminEmail(event.target.value)} placeholder="First tenant admin email" className={inputClassName} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Model use cases</FieldLabel>
                  <input value={modelDefaultUseCases} onChange={(event) => setModelDefaultUseCases(event.target.value)} placeholder="Model default use cases" className={inputClassName} />
                </div>
                <div className="flex flex-col gap-1.5">
                  <FieldLabel>Target plan</FieldLabel>
                  <input value={targetPlanName} onChange={(event) => setTargetPlanName(event.target.value)} placeholder="Target plan name" className={inputClassName} />
                </div>
                <div className="md:col-span-2 flex flex-col gap-1.5">
                  <FieldLabel>Invite policy</FieldLabel>
                  <textarea value={invitePolicyNotes} onChange={(event) => setInvitePolicyNotes(event.target.value)} placeholder="Invite policy note" rows={3} className={textareaClassName} />
                </div>
              </div>
            ) : null}

            {activeStep.key === "integrations" ? (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Connector owner</FieldLabel>
                    <input value={connectorOwnerEmail} onChange={(event) => setConnectorOwnerEmail(event.target.value)} placeholder="Connector owner email" className={inputClassName} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Selected connector keys</FieldLabel>
                    <input
                      value={selectedConnectorKeys}
                      onChange={(event) => {
                        setConnectorSelectionTouched(true);
                        setSelectedConnectorKeys(event.target.value);
                      }}
                      placeholder="Connector keys, comma separated"
                      className={inputClassName}
                    />
                    <p className="text-[11px] text-muted">Use the checklist to keep or remove recommended integrations, or type custom keys here.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Connector notes</FieldLabel>
                    <textarea value={connectorBundleNotes} onChange={(event) => setConnectorBundleNotes(event.target.value)} placeholder="Connector setup notes or missing integrations" rows={4} className={textareaClassName} />
                  </div>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Recommended integrations</h3>
                  <div className="flex flex-col gap-2 mt-3">
                    {selectedTemplate.recommendedConnectorKeys.map((key) => (
                      <SetupChecklistOption
                        key={key}
                        checked={selectedConnectorKeyValues.includes(key)}
                        label={normalizeConnectorName(key)}
                        supportingText="Included in the draft plan"
                        onChange={(checked) => {
                          setConnectorSelectionTouched(true);
                          setSelectedConnectorKeys(buildToggledListValue(effectiveConnectorKeys, selectedTemplate.recommendedConnectorKeys, key, checked, !connectorSelectionTouched));
                        }}
                      />
                    ))}
                  </div>
                  <p className="text-[12px] text-secondary mt-3 leading-relaxed">This step captures intent only. Actual connector installation stays in the tools area.</p>
                </div>
              </div>
            ) : null}

            {activeStep.key === "knowledge" ? (
              <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-4">
                <div className="grid grid-cols-1 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Knowledge owner</FieldLabel>
                    <input value={knowledgeOwnerEmail} onChange={(event) => setKnowledgeOwnerEmail(event.target.value)} placeholder="Knowledge owner email" className={inputClassName} />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Selected source candidates</FieldLabel>
                    <input
                      value={starterKnowledgeSources}
                      onChange={(event) => {
                        setKnowledgeSelectionTouched(true);
                        setStarterKnowledgeSources(event.target.value);
                      }}
                      placeholder="Source candidates, comma separated"
                      className={inputClassName}
                    />
                    <p className="text-[11px] text-muted">Use the checklist to keep or remove kit knowledge areas, or type customer-specific source names here.</p>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <FieldLabel>Knowledge notes</FieldLabel>
                    <textarea value={knowledgeSourceNotes} onChange={(event) => setKnowledgeSourceNotes(event.target.value)} placeholder="Knowledge import notes or missing sources" rows={4} className={textareaClassName} />
                  </div>
                </div>
                <div className="rounded-[8px] border border-border-dim bg-background/30 p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Knowledge areas from this kit</h3>
                  <div className="flex flex-col gap-2 mt-3">
                    {selectedTemplate.knowledgeScopes.map((source) => (
                      <SetupChecklistOption
                        key={source}
                        checked={selectedKnowledgeSourceValues.includes(source)}
                        label={source}
                        supportingText="Used as a starter source placeholder"
                        onChange={(checked) => {
                          setKnowledgeSelectionTouched(true);
                          setStarterKnowledgeSources(buildToggledListValue(effectiveKnowledgeSources, selectedTemplate.knowledgeScopes, source, checked, !knowledgeSelectionTouched));
                        }}
                      />
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {activeStep.key === "resources" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <SectionList title="Draft agents" items={selectedTemplate.agents} />
                <SkillRecommendationList title="Recommended skills" items={selectedTemplate.recommendedSkills} activeSkills={activeSkills ?? []} />
                <SectionList title="Draft workflows" items={selectedTemplate.workflows} />
                <SectionList title="Dashboard cards" items={selectedTemplate.dashboardCards} />
                <div className="border border-border-dim bg-background/30 rounded-[8px] p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Publish surface plan</h3>
                  <div className="flex flex-col gap-2 mt-3">
                    {selectedTemplate.publishTargets.map((target) => (
                      <SetupChecklistOption
                        key={target}
                        checked={selectedPublishTargetValues.includes(target)}
                        label={target}
                        supportingText="Planned as a release surface"
                        onChange={(checked) => {
                          setPublishTargetSelectionTouched(true);
                          setSelectedPublishTargets(buildToggledListValue(effectivePublishTargets, selectedTemplate.publishTargets, target, checked, !publishTargetSelectionTouched));
                        }}
                      />
                    ))}
                    <input value={surfaceOwnerEmail} onChange={(event) => setSurfaceOwnerEmail(event.target.value)} placeholder="Surface owner email" className={inputClassName} />
                    <input
                      value={selectedPublishTargets}
                      onChange={(event) => {
                        setPublishTargetSelectionTouched(true);
                        setSelectedPublishTargets(event.target.value);
                      }}
                      placeholder="Target surfaces, comma separated"
                      className={inputClassName}
                    />
                    <textarea value={publishSurfaceNotes} onChange={(event) => setPublishSurfaceNotes(event.target.value)} placeholder="Surface notes, embed needs, or callback work" rows={3} className={textareaClassName} />
                  </div>
                </div>
              </div>
            ) : null}

            {activeStep.key === "safety" ? (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <SectionList title="Readiness checks" items={selectedTemplate.readinessChecks} icon="gauge" />
                <SectionList title="Test cases before launch" items={selectedTemplate.evalFixtures} />
                <div className="border border-border-dim bg-background/30 rounded-[8px] p-4">
                  <h3 className="text-[13px] font-semibold text-foreground">Developer notes</h3>
                  <textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Developer notes, constraints, or custom work needed" rows={7} className={`${textareaClassName} mt-3`} />
                </div>
              </div>
            ) : null}

            {activeStep.key === "review" ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <SummaryRow label="Workspace" value={targetCompanyName} />
                <SummaryRow label="Product" value={brandProductName} />
                <SummaryRow label="First admin" value={firstAdminEmail} />
                <SummaryRow label="Connectors" value={effectiveConnectorKeys} />
                <SummaryRow label="Knowledge sources" value={effectiveKnowledgeSources} />
                <SummaryRow label="Target surfaces" value={effectivePublishTargets} />
                <div className="md:col-span-2 rounded-[8px] border border-brand/20 bg-brand/5 px-3 py-3">
                  <h3 className="text-[13px] font-semibold text-foreground">Ready to create draft build plan</h3>
                  <p className="text-[12px] text-secondary mt-2 leading-relaxed">
                    Saving creates a draft plan and sends you to the maintenance dashboard. It does not activate agents, publish surfaces, install connectors, or invite users.
                  </p>
                  {createError ? <p className="text-[12px] text-rose-500 mt-3">{createError}</p> : null}
                </div>
              </div>
            ) : null}
          </div>

          <div className="flex items-center justify-between gap-3 mt-6 border-t border-border-dim pt-4">
            <button
              type="button"
              onClick={() => setActiveStepIndex((index) => Math.max(0, index - 1))}
              disabled={isFirstStep || isCreatingPlan}
              className="px-3 py-2 rounded-[8px] border border-border-dim text-[12px] text-foreground hover:bg-foreground/5 disabled:opacity-50"
            >
              Back
            </button>
            {isLastStep ? (
              <button
                type="button"
                onClick={handleCreateLaunchPlan}
                disabled={isCreatingPlan}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90 disabled:opacity-50"
              >
                {isCreatingPlan ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : null}
                Create draft build plan
              </button>
            ) : (
              <button
                type="button"
                onClick={() => setActiveStepIndex((index) => Math.min(setupSteps.length - 1, index + 1))}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-[8px] bg-foreground text-background text-[12px] font-medium hover:opacity-90"
              >
                Next
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
