"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Gauge,
  Layers3,
  Loader2,
  Rocket,
  Search,
  ShieldCheck,
  Sparkles,
  Workflow,
} from "lucide-react";
import { AdminPageHeader } from "@/src/app/(dashboard)/admin/_components/AdminPageHeader";
import { getErrorMessage } from "@/src/lib/errors";

type Template = {
  id: string;
  category: string;
  name: string;
  tagline: string;
  description: string;
  riskProfile: "LOW" | "MEDIUM" | "HIGH";
  primaryUsers: string[];
  recommendedConnectorKeys: string[];
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
  riskProfile: "LOW" | "MEDIUM" | "HIGH";
  status: "DRAFT" | "MATERIALIZED" | "ARCHIVED";
  targetCompanyName?: string;
  notes?: string;
  createdAt: number;
};

const riskClassName = {
  LOW: "text-emerald-500 bg-emerald-500/10 border-emerald-500/20",
  MEDIUM: "text-amber-500 bg-amber-500/10 border-amber-500/20",
  HIGH: "text-rose-500 bg-rose-500/10 border-rose-500/20",
};

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

function PreviewList({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">{title}</span>
      <div className="flex flex-col gap-1.5">
        {items.slice(0, 4).map((item) => (
          <div key={item} className="flex items-start gap-2 text-[12px] text-secondary leading-relaxed">
            <CheckCircle2 className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
            <span>{item}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LaunchPage() {
  const templates = useQuery(api.appTemplates.getAppTemplateGallery) as Template[] | undefined;
  const recentPlans = useQuery(api.appTemplates.getRecentLaunchPlans) as LaunchPlan[] | undefined;
  const createLaunchPlan = useMutation(api.appTemplates.createLaunchPlan);
  const [searchTerm, setSearchTerm] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [targetCompanyName, setTargetCompanyName] = useState("");
  const [notes, setNotes] = useState("");
  const [isCreatingPlan, setIsCreatingPlan] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdPlanId, setCreatedPlanId] = useState<string | null>(null);
  const [showLoadingHelp, setShowLoadingHelp] = useState(false);

  useEffect(() => {
    if (templates !== undefined) {
      setShowLoadingHelp(false);
      return;
    }

    const timer = window.setTimeout(() => setShowLoadingHelp(true), 6000);
    return () => window.clearTimeout(timer);
  }, [templates]);

  const categories = useMemo(() => {
    const values = templates ? Array.from(new Set(templates.map((template) => template.category))).sort() : [];
    return ["All", ...values];
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return (templates ?? []).filter((template) => {
      const matchesCategory = activeCategory === "All" || template.category === activeCategory;
      const searchable = [
        template.name,
        template.tagline,
        template.description,
        template.category,
        ...template.primaryUsers,
        ...template.recommendedConnectorKeys,
        ...template.agents,
        ...template.implementationPointers.map((pointer) => `${pointer.label} ${pointer.filePath}`),
      ].join(" ").toLowerCase();
      return matchesCategory && (!query || searchable.includes(query));
    });
  }, [activeCategory, searchTerm, templates]);

  const selectedTemplate = useMemo(() => {
    return (templates ?? []).find((template) => template.id === selectedTemplateId) ?? filteredTemplates[0];
  }, [filteredTemplates, selectedTemplateId, templates]);

  const handleCreateLaunchPlan = async () => {
    if (!selectedTemplate || isCreatingPlan) return;
    setIsCreatingPlan(true);
    setCreateError("");
    setCreatedPlanId(null);
    try {
      const planId = await createLaunchPlan({
        templateId: selectedTemplate.id,
        targetCompanyName: targetCompanyName.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      setCreatedPlanId(planId);
      setNotes("");
    } catch (error) {
      setCreateError(getErrorMessage(error, "Could not create build plan."));
    } finally {
      setIsCreatingPlan(false);
    }
  };

  if (templates === undefined) {
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

  const visibleRecentPlans = recentPlans ?? [];

  return (
    <div className="flex flex-col gap-6 w-full pb-12 animate-in fade-in slide-in-from-bottom-2">
      <AdminPageHeader
        icon={<Rocket className="w-6 h-6 text-brand" />}
        title="App Kits"
        description="Choose a developer-ready app starter, save a draft build plan, and identify the agents, connectors, knowledge, workflows, evals, and custom code still needed."
      />

      <section className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_380px] gap-5">
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
              <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Templates</span>
              <div className="flex items-end gap-2 mt-2">
                <span className="text-3xl font-bold text-foreground">{templates.length}</span>
              <span className="text-[12px] text-secondary mb-1">developer starters</span>
              </div>
            </div>
            <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
              <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Coverage</span>
              <div className="flex items-end gap-2 mt-2">
                <span className="text-3xl font-bold text-foreground">{categories.length - 1}</span>
                <span className="text-[12px] text-secondary mb-1">categories</span>
              </div>
            </div>
            <div className="border border-border-dim bg-card/60 rounded-[8px] p-4">
              <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Safety</span>
              <div className="flex items-center gap-2 mt-3 text-[13px] text-secondary">
                <ShieldCheck className="w-4 h-4 text-brand" />
                Draft-first build plans
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="w-full flex items-center gap-2 px-4 py-3 bg-card/40 border border-border-dim rounded-[14px]">
              <Search className="w-4 h-4 text-muted" />
              <input
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
                placeholder="Search templates, connectors, agents, or use cases..."
                className="w-full bg-transparent border-none outline-none text-[13px] tracking-wide placeholder:text-muted/60 text-foreground"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              {categories.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1.5 rounded-[8px] border text-[12px] transition-colors ${
                    activeCategory === category
                      ? "border-brand/40 bg-brand/10 text-foreground"
                      : "border-border-dim bg-card/40 text-secondary hover:text-foreground"
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {filteredTemplates.map((template) => (
              <button
                key={template.id}
                type="button"
                onClick={() => setSelectedTemplateId(template.id)}
                className={`text-left border rounded-[8px] p-4 bg-card/50 hover:border-brand/40 transition-colors ${
                  selectedTemplate?.id === template.id ? "border-brand/50" : "border-border-dim"
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-brand bg-brand/10 border border-brand/20 rounded-[6px] px-2 py-0.5">
                        {template.category}
                      </span>
                      <span className={`text-[10px] font-bold tracking-[0.12em] uppercase rounded-[6px] border px-2 py-0.5 ${riskClassName[template.riskProfile]}`}>
                        {template.riskProfile}
                      </span>
                    </div>
                    <h2 className="text-[15px] font-semibold text-foreground mt-3">{template.name}</h2>
                    <p className="text-[12px] text-secondary mt-1 leading-relaxed">{template.tagline}</p>
                  </div>
                  <Sparkles className="w-4 h-4 text-brand flex-shrink-0" />
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 text-[11px] text-muted">
                  <span>{template.agents.length} agents</span>
                  <span>{template.workflows.length} workflows</span>
                  <span>{template.evalFixtures.length} evals</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        <aside className="border border-border-dim bg-card/60 rounded-[8px] p-4 h-max sticky top-6">
          {selectedTemplate ? (
            <div className="flex flex-col gap-5">
              <div>
                <div className="flex items-center gap-2">
                  <Layers3 className="w-4 h-4 text-brand" />
                  <span className="text-[11px] font-mono tracking-[0.16em] uppercase text-muted">Draft Build Plan</span>
                </div>
                <h2 className="text-xl font-bold text-foreground mt-3">{selectedTemplate.name}</h2>
                <p className="text-[13px] text-secondary mt-2 leading-relaxed">{selectedTemplate.description}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedTemplate.primaryUsers.map((user) => (
                  <TemplateChip key={user}>{user}</TemplateChip>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-4">
                <PreviewList title="Agents" items={selectedTemplate.agents} />
                <PreviewList title="Workflows" items={selectedTemplate.workflows} />
                <PreviewList title="Knowledge" items={selectedTemplate.knowledgeScopes} />
                <PreviewList title="Release Evals" items={selectedTemplate.evalFixtures} />
                <PreviewList title="Developer Follow-Up" items={selectedTemplate.developerFollowUps} />
              </div>

              <div className="border-t border-border-dim pt-4">
                <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Suggested Connectors</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTemplate.recommendedConnectorKeys.map((key) => (
                    <TemplateChip key={key}>{normalizeConnectorName(key)}</TemplateChip>
                  ))}
                </div>
              </div>

              <div className="border-t border-border-dim pt-4">
                <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Readiness Checks</span>
                <div className="flex flex-col gap-2 mt-2">
                  {selectedTemplate.readinessChecks.map((check) => (
                    <div key={check} className="flex items-start gap-2 text-[12px] text-secondary">
                      <Gauge className="w-3.5 h-3.5 text-brand mt-0.5 flex-shrink-0" />
                      <span>{check}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="border-t border-border-dim pt-4">
                <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Extension Points</span>
                <div className="flex flex-wrap gap-2 mt-2">
                  {selectedTemplate.extensionPoints.slice(0, 5).map((point) => (
                    <TemplateChip key={point}>{point}</TemplateChip>
                  ))}
                </div>
              </div>

              <div className="border-t border-border-dim pt-4">
                <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Code Pointers</span>
                <div className="flex flex-col gap-2 mt-2">
                  {selectedTemplate.implementationPointers.slice(0, 4).map((pointer) => (
                    <div key={`${pointer.label}-${pointer.filePath}`} className="rounded-[8px] border border-border-dim bg-background/30 px-3 py-2">
                      <div className="text-[12px] font-medium text-foreground">{pointer.label}</div>
                      <div className="text-[11px] font-mono text-brand mt-1 break-all">{pointer.filePath}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 border-t border-border-dim pt-4">
                <div className="flex flex-col gap-2">
                  <span className="text-[10px] font-mono tracking-[0.16em] uppercase text-muted">Save Build Plan</span>
                  <input
                    value={targetCompanyName}
                    onChange={(event) => setTargetCompanyName(event.target.value)}
                    placeholder="Target workspace name"
                    className="w-full bg-transparent border border-border-dim rounded-[8px] px-3 py-2 text-[13px] text-foreground placeholder:text-muted/50 outline-none focus:border-brand/40"
                  />
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    placeholder="Developer notes, constraints, or custom work needed"
                    rows={3}
                    className="w-full resize-none bg-transparent border border-border-dim rounded-[8px] px-3 py-2 text-[13px] text-foreground placeholder:text-muted/50 outline-none focus:border-brand/40"
                  />
                  {createError ? <p className="text-[12px] text-rose-500">{createError}</p> : null}
                  {createdPlanId ? <p className="text-[12px] text-emerald-500">Draft build plan saved.</p> : null}
                  <button
                    type="button"
                    onClick={handleCreateLaunchPlan}
                    disabled={isCreatingPlan}
                    className="inline-flex items-center justify-between gap-3 px-3 py-2 rounded-[8px] bg-foreground text-background text-[13px] font-medium hover:opacity-90 disabled:opacity-60"
                  >
                    <span>{isCreatingPlan ? "Saving plan..." : "Save draft build plan"}</span>
                    {isCreatingPlan ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
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
            </div>
          ) : (
            <div className="py-12 text-center text-[13px] text-muted">No templates match the current filters.</div>
          )}
        </aside>
      </section>

      <section className="border border-border-dim bg-card/60 rounded-[8px] p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[15px] font-semibold text-foreground">Recent Build Plans</h2>
            <p className="text-[12px] text-secondary mt-1">Saved drafts are developer checkpoints before creating companies, agents, workflows, knowledge, widgets, or custom surfaces.</p>
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
            <Link key={plan._id} href={`/admin/launch/plans/${plan._id}`} className={`block border rounded-[8px] p-3 bg-background/40 hover:border-brand/40 transition-colors ${createdPlanId === plan._id ? "border-brand/50" : "border-border-dim"}`}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <span className="text-[10px] font-bold tracking-[0.12em] uppercase text-brand">{plan.category}</span>
                  <h3 className="text-[13px] font-semibold text-foreground mt-1 truncate">{plan.targetCompanyName || plan.templateName}</h3>
                  <p className="text-[11px] text-secondary mt-1 truncate">{plan.templateName}</p>
                </div>
                <span className={`text-[9px] font-bold tracking-[0.12em] uppercase rounded-[6px] border px-2 py-0.5 ${riskClassName[plan.riskProfile]}`}>
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
    </div>
  );
}
