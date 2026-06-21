"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import Link from "next/link";
import { useMutation, usePaginatedQuery, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { BarChart3, BrainCircuit, Loader2, Plus, Search, ShieldCheck, Sparkles, UploadCloud } from "lucide-react";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";
import { ADMIN_PAGE_SIZE } from "@/src/app/(dashboard)/admin/_lib/pagination";

type SkillStatus = Doc<"agentSkills">["status"];
type SkillRisk = Doc<"agentSkills">["riskLevel"];

const emptyForm = {
  name: "",
  description: "",
  category: "GENERAL",
  riskLevel: "MEDIUM" as SkillRisk,
  status: "DRAFT" as SkillStatus,
  instruction: "",
  requiredToolMappings: "[]",
  recommendedToolMappings: "[]",
  suggestedEvalFixtures: "[]",
};

function riskTone(risk: SkillRisk) {
  if (risk === "HIGH") return "border-red-500/20 bg-red-500/10 text-red-400";
  if (risk === "MEDIUM") return "border-amber-500/20 bg-amber-500/10 text-amber-400";
  return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
}

function statusTone(status: SkillStatus) {
  if (status === "ACTIVE") return "border-emerald-500/20 bg-emerald-500/10 text-emerald-400";
  if (status === "ARCHIVED") return "border-border-dim bg-foreground/5 text-muted";
  return "border-sky-500/20 bg-sky-500/10 text-sky-400";
}

function formatCount(value: number | undefined) {
  return typeof value === "number" ? value.toLocaleString("en-GB") : "...";
}

export default function AgentSkillsCatalogPage() {
  const createSkill = useMutation(api.agentSkills.createSkill);
  const importSkillBundle = useMutation(api.agentSkills.importSkillBundle);
  const seedStarterSkills = useMutation(api.agentSkills.seedStarterSkills);
  const analytics = useQuery(api.agentSkills.getSkillCatalogAnalytics, {});
  const [searchTerm, setSearchTerm] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isImportOpen, setIsImportOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [bundleJson, setBundleJson] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSeeding, setIsSeeding] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [importedSkillId, setImportedSkillId] = useState<Id<"agentSkills"> | null>(null);
  const {
    results: skills,
    status,
    loadMore,
  } = usePaginatedQuery(
    api.agentSkills.getPaginatedSkills,
    { searchTerm },
    { initialNumItems: ADMIN_PAGE_SIZE }
  );

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setIsSaving(true);
    setError("");
    try {
      await createSkill({
        name: form.name,
        description: form.description || undefined,
        category: form.category,
        status: form.status,
        riskLevel: form.riskLevel,
        instruction: form.instruction,
        requiredToolMappingsJson: form.requiredToolMappings,
        recommendedToolMappingsJson: form.recommendedToolMappings,
        suggestedEvalFixturesJson: form.suggestedEvalFixtures,
      });
      setForm(emptyForm);
      setIsCreateOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skill could not be created.");
    } finally {
      setIsSaving(false);
    }
  };

  const seedStarters = async () => {
    setIsSeeding(true);
    setError("");
    setFeedback("");
    try {
      const result = await seedStarterSkills({});
      setFeedback(`Created ${result.createdCount} starter skill${result.createdCount === 1 ? "" : "s"}; skipped ${result.skippedCount} existing.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Starter skills could not be seeded.");
    } finally {
      setIsSeeding(false);
    }
  };

  const importBundle = async (event: FormEvent) => {
    event.preventDefault();
    setIsImporting(true);
    setError("");
    setFeedback("");
    setImportedSkillId(null);
    try {
      const result = await importSkillBundle({ bundleJson });
      setImportedSkillId(result.skillId);
      setBundleJson("");
      setIsImportOpen(false);
      setFeedback("Skill bundle imported as a draft.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Skill bundle could not be imported.");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="flex flex-col gap-5 h-full pb-12">
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 className="text-[24px] font-semibold tracking-tight text-foreground flex items-center gap-2">
            <BrainCircuit className="w-6 h-6 text-brand" />
            Agent skills
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-3xl">
            Reusable, eval-backed capability packages that can be attached to agents.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              setIsImportOpen(true);
              setError("");
              setFeedback("");
            }}
            className="h-10 px-4 rounded-[8px] border border-border-dim bg-card text-[13px] font-medium text-secondary flex items-center gap-2 hover:text-foreground transition-colors"
          >
            <UploadCloud className="w-4 h-4 text-brand" />
            Import bundle
          </button>
          <button
            type="button"
            onClick={seedStarters}
            disabled={isSeeding}
            className="h-10 px-4 rounded-[8px] border border-border-dim bg-card text-[13px] font-medium text-secondary flex items-center gap-2 hover:text-foreground transition-colors disabled:opacity-50"
          >
            {isSeeding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-brand" />}
            Seed starters
          </button>
          <button
            type="button"
            onClick={() => setIsCreateOpen(true)}
            className="h-10 px-4 rounded-[8px] bg-brand text-white text-[13px] font-medium flex items-center gap-2 hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            New skill
          </button>
        </div>
      </header>

      {(feedback || error) && (
        <div className={`rounded-[8px] border p-3 text-[12px] ${
          feedback
            ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-300"
            : "border-red-500/20 bg-red-500/10 text-red-300"
        }`}>
          {feedback || error}
          {importedSkillId && (
            <Link href={`/admin/agents/skills/${importedSkillId}`} className="ml-2 font-semibold underline underline-offset-2">
              Open imported skill
            </Link>
          )}
        </div>
      )}

      <section className="border border-border-dim rounded-[8px] bg-card px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-foreground flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-brand" />
              Skill rollout health
            </h2>
            <p className="text-[12px] text-secondary mt-1">
              Adoption, upgrade lag, and current smoke evidence across the reusable skill catalog.
            </p>
          </div>
          {analytics === undefined && (
            <div className="text-[12px] text-muted flex items-center gap-2">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              Loading analytics
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-2">
          {[
            { label: "Skills", value: analytics?.totals.skills },
            { label: "Enabled agents", value: analytics?.totals.enabledBindings },
            { label: "Outdated", value: analytics?.totals.outdatedBindings },
            { label: "Validated", value: analytics?.totals.validatedBindings },
            { label: "Needs smoke", value: analytics?.totals.needsSmokeBindings },
          ].map((stat) => (
            <div key={stat.label} className="rounded-[8px] border border-border-dim bg-black/15 px-3 py-2 min-w-0">
              <div className="text-[10px] uppercase tracking-widest font-mono text-muted truncate">{stat.label}</div>
              <div className="text-[18px] font-semibold text-foreground mt-1">{formatCount(stat.value)}</div>
            </div>
          ))}
        </div>
        {analytics && analytics.needsAttention.length > 0 ? (
          <div className="flex flex-col gap-2">
            <div className="text-[11px] uppercase tracking-widest font-mono text-muted">Needs attention</div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {analytics.needsAttention.slice(0, 4).map((row: {
                skillId: Id<"agentSkills">;
                name: string;
                category: string;
                riskLevel: SkillRisk;
                outdatedAgents: number;
                needsSmokeAgents: number;
                validatedAgents: number;
              }) => (
                <Link
                  key={row.skillId}
                  href={`/admin/agents/skills/${row.skillId}`}
                  className="rounded-[8px] border border-border-dim bg-white/[0.02] px-3 py-2 hover:border-brand/40 transition-colors flex flex-col gap-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[12px] font-semibold text-foreground">{row.name}</span>
                    <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-0.5 rounded-md border ${riskTone(row.riskLevel)}`}>
                      {row.riskLevel.toLowerCase()}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-2 text-[10px] uppercase tracking-widest font-mono text-muted">
                    <span>{row.category}</span>
                    <span>{row.outdatedAgents} outdated</span>
                    <span>{row.needsSmokeAgents} needs smoke</span>
                    <span>{row.validatedAgents} validated</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        ) : analytics ? (
          <div className="rounded-[8px] border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-300">
            No enabled skill bindings need upgrade or smoke validation.
          </div>
        ) : null}
      </section>

      <div className="relative">
        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="Search skills"
          className="w-full h-10 pl-9 pr-3 rounded-[8px] border border-border-dim bg-card text-[13px] text-foreground outline-none focus:border-brand/50"
        />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {status === "LoadingFirstPage" ? (
          <div className="col-span-full border border-border-dim rounded-[8px] p-8 text-secondary flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading skills
          </div>
        ) : skills.length === 0 ? (
          <div className="col-span-full border border-dashed border-border-dim rounded-[8px] p-10 text-center text-secondary">
            No skills have been created yet.
          </div>
        ) : (
          skills.map((skill) => (
            <Link
              key={skill._id}
              href={`/admin/agents/skills/${skill._id}`}
              className="border border-border-dim rounded-[8px] bg-card px-4 py-4 hover:border-brand/40 transition-colors flex flex-col gap-3"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-[16px] font-semibold text-foreground truncate">{skill.name}</h2>
                    <span className="text-[10px] uppercase font-mono tracking-widest text-muted">{skill.category}</span>
                  </div>
                  <p className="text-[12px] text-secondary mt-1 line-clamp-2">{skill.description || "No description provided."}</p>
                </div>
                <ShieldCheck className="w-4 h-4 text-brand shrink-0" />
              </div>
              <div className="flex flex-wrap gap-2">
                <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${statusTone(skill.status)}`}>
                  {skill.status.toLowerCase()}
                </span>
                <span className={`text-[10px] uppercase font-mono tracking-widest px-2 py-1 rounded-md border ${riskTone(skill.riskLevel)}`}>
                  {skill.riskLevel.toLowerCase()} risk
                </span>
              </div>
            </Link>
          ))
        )}
      </div>

      {status === "CanLoadMore" && (
        <button
          type="button"
          onClick={() => loadMore(ADMIN_PAGE_SIZE)}
          className="self-center h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground hover:bg-hover transition-colors"
        >
          Load more
        </button>
      )}

      <SonaeModal isOpen={isCreateOpen} onClose={() => setIsCreateOpen(false)} title="New agent skill" size="lg">
        <form onSubmit={submit} className="flex flex-col gap-4 px-1 pb-2">
          {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Name
              <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Category
              <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Status
              <select className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as SkillStatus })}>
                <option value="DRAFT">Draft</option>
                <option value="ACTIVE">Active</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Risk
              <select className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.riskLevel} onChange={(event) => setForm({ ...form, riskLevel: event.target.value as SkillRisk })}>
                <option value="LOW">Low</option>
                <option value="MEDIUM">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
          </div>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Description
            <input className="h-10 rounded-[8px] border border-border-dim bg-card px-3 text-foreground" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Instruction
            <textarea className="min-h-36 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={form.instruction} onChange={(event) => setForm({ ...form, instruction: event.target.value })} required />
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Required tool mappings JSON
              <textarea className="min-h-20 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={form.requiredToolMappings} onChange={(event) => setForm({ ...form, requiredToolMappings: event.target.value })} />
            </label>
            <label className="flex flex-col gap-1 text-[12px] text-secondary">
              Suggested eval fixtures JSON
              <textarea className="min-h-20 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]" value={form.suggestedEvalFixtures} onChange={(event) => setForm({ ...form, suggestedEvalFixtures: event.target.value })} />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsCreateOpen(false)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Cancel</button>
            <button type="submit" disabled={isSaving} className="h-9 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium flex items-center gap-2 disabled:opacity-50">
              {isSaving && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Create
            </button>
          </div>
        </form>
      </SonaeModal>

      <SonaeModal isOpen={isImportOpen} onClose={() => setIsImportOpen(false)} title="Import skill bundle" size="lg">
        <form onSubmit={importBundle} className="flex flex-col gap-4 px-1 pb-2">
          {error && <div className="rounded-[8px] border border-red-500/20 bg-red-500/10 p-3 text-[12px] text-red-300">{error}</div>}
          <label className="flex flex-col gap-1 text-[12px] text-secondary">
            Bundle JSON
            <textarea
              className="min-h-64 rounded-[8px] border border-border-dim bg-card p-3 text-foreground font-mono text-[12px]"
              value={bundleJson}
              onChange={(event) => setBundleJson(event.target.value)}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setIsImportOpen(false)} className="h-9 px-4 rounded-[8px] border border-border-dim text-[12px] text-secondary hover:text-foreground">Cancel</button>
            <button type="submit" disabled={isImporting} className="h-9 px-4 rounded-[8px] bg-brand text-white text-[12px] font-medium flex items-center gap-2 disabled:opacity-50">
              {isImporting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              Import draft
            </button>
          </div>
        </form>
      </SonaeModal>
    </div>
  );
}
