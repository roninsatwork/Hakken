"use client";

import Header from "@/src/ui/components/layout/Header";
import Link from "next/link";
import {
  Info,
  ArrowRight,
  ChevronDown,
  Sparkles,
  Target,
  LayoutList,
  Lightbulb,
  Scale,
  CalendarClock,
  ShieldAlert,
  Percent,
  FileSpreadsheet,
  BookOpen,
  CalendarCheck,
} from "lucide-react";
import { AgentSources, ReportAnatomy, ReportFlow } from "./_components/ReportInfoVisuals";

const ACCENT = "#f0d8a8";

const TRUST_POINTS = [
  {
    icon: Target,
    title: "Your numbers, not ours",
    body: "Every figure is computed from your own pipeline. The report reads your business — it never invents it.",
  },
  {
    icon: LayoutList,
    title: "Comparable, week on week",
    body: "The format never changes, so what's changed in your business stands out the moment you open the report.",
  },
  {
    icon: Lightbulb,
    title: "Advice you can act on",
    body: "Every risk is paired with a reason and a recommendation — the report ends in actions, not observations.",
  },
];

const GLOSSARY = [
  {
    icon: Scale,
    title: "Weighted pipeline",
    body: "Each deal's value multiplied by its probability of closing. £100k at 30% counts as £30k — a more honest forecast than the raw total.",
  },
  {
    icon: CalendarClock,
    title: "Closing windows",
    body: "Deals grouped by when they're expected to land — this month, next month, and beyond — so timing is never a surprise.",
  },
  {
    icon: ShieldAlert,
    title: "Risk radar",
    body: "Critical needs intervention this week. At-risk is deteriorating. Quiet simply hasn't been touched in a while and is worth a nudge.",
  },
  {
    icon: Percent,
    title: "Win rate",
    body: "Of the deals that reached a decision, the share you won — tracked with its direction of travel from the previous report.",
  },
];

const INGREDIENTS = [
  {
    icon: FileSpreadsheet,
    title: "Your pipeline, as it is today",
    body: "An export of your deals from whatever you use now — no integrations, no IT project, no new process to learn.",
  },
  {
    icon: BookOpen,
    title: "Anything your team knows",
    body: "Add pricing, playbooks and account notes over time. The more it knows about how you sell, the sharper its reports get.",
  },
  {
    icon: CalendarCheck,
    title: "A schedule that suits you",
    body: "Weekly for a board cadence, or on demand. The agent runs on its own — you just open the result.",
  },
];

const FAQS = [
  {
    q: "What do I need to give it?",
    a: "An export of your pipeline — the same spreadsheet of deals your team already keeps. From there, add any documents you'd like it to know: pricing, playbooks, account notes. Everything else is the agent's job.",
  },
  {
    q: "What does it know about my company?",
    a: "Exactly what you share with it, and nothing more. Your pipeline, plus the documents your team adds — all private to your workspace.",
  },
  {
    q: "Does it remember previous reports?",
    a: "Yes. Lessons from one run carry into the next, and its memory of your business compounds — the agent is sharper in month three than in week one.",
  },
  {
    q: "How does it find the right information?",
    a: "When it's writing, it searches everything you've shared and pulls in only the passages that matter to this week's report — nothing is pasted in wholesale.",
  },
  {
    q: "How often do I get a new report?",
    a: "As often as you like. Most teams schedule a weekly run ahead of their board or pipeline meeting, and trigger an extra one after a big change — this page always shows the latest.",
  },
  {
    q: "Can I share it with the board?",
    a: "Yes. Export to Board captures the entire report as a single high-resolution image, ready to drop into a deck, a document or an email.",
  },
  {
    q: "Are the numbers ever estimated?",
    a: "The figures are computed from your own pipeline. Where the report offers judgement — risk tiers, recommendations, patterns — it's the agent's reading of your data, always tied to specific, named deals so you can check it yourself.",
  },
  {
    q: "Why does it say 'No Reports Available'?",
    a: "The agent hasn't run yet. Share your pipeline with it and schedule or trigger its first run — this page fills in automatically when it finishes.",
  },
];

const STATS = [
  { value: "100%", label: "of your deals read on every run" },
  { value: "8", label: "board-ready sections, every week" },
  { value: "1", label: "agent behind every report" },
  { value: "0", label: "analyst hours needed to produce it" },
];

function SectionEyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="text-[11px] font-bold uppercase tracking-[0.14em]"
      style={{ color: ACCENT }}
    >
      {children}
    </span>
  );
}

export default function ReportsInformationPage() {
  return (
    <>
      <Header />
      <div className="flex flex-col gap-8 pb-10">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Info className="w-6 h-6 text-brand" />
            How Board Reports Work
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-2xl">
            A plain-English look at the analyst behind your board reports —
            what it reads, what it remembers, and why you can trust every line
            it writes.
          </p>
        </div>

        {/* Stat band */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
            >
              <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">
                {stat.value}
              </div>
              <div className="text-[12px] text-secondary mt-1 leading-snug">
                {stat.label}
              </div>
            </div>
          ))}
        </div>

        {/* The agent and its sources — interactive hero */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl overflow-hidden">
          <AgentSources />
        </section>

        {/* How it works */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              From what your team knows to what your board sees
            </h2>
          </div>
          <ReportFlow />
        </section>

        {/* What you get — the report anatomy */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl overflow-hidden">
          <ReportAnatomy />
        </section>

        {/* Getting started */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Getting started</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              Small to start. Smarter every week.
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              There&apos;s no setup project. The agent starts with what you
              already have, and everything you add from then on makes it a
              better analyst.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {INGREDIENTS.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2.5 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <item.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Built for the boardroom */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl p-7 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Built to be trusted</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              A report you can defend in the room
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              A board report is only useful if you can stand behind every line
              of it. The report is built around one rule: read what&apos;s in
              the data, and say what to do about it.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {TRUST_POINTS.map((point) => (
              <div key={point.title} className="flex flex-col gap-2.5">
                <point.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {point.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {point.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Reading the report */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Reading the report</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Four terms, translated
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {GLOSSARY.map((item) => (
              <div
                key={item.title}
                className="flex flex-col gap-2.5 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <item.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[14px] font-semibold text-foreground">
                  {item.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {item.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>Common questions</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Everything else you might be wondering
            </h2>
          </div>
          <div className="flex flex-col gap-2">
            {FAQS.map((faq) => (
              <details
                key={faq.q}
                className="group rounded-[14px] border border-border-dim bg-card/60 backdrop-blur-xl open:bg-card/80 transition-colors"
              >
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                  <span className="text-[14px] font-medium text-foreground">
                    {faq.q}
                  </span>
                  <ChevronDown className="w-4 h-4 shrink-0 text-secondary transition-transform group-open:rotate-180" />
                </summary>
                <p className="px-5 pb-4 text-[13px] text-secondary leading-relaxed max-w-3xl">
                  {faq.a}
                </p>
              </details>
            ))}
          </div>
        </section>

        {/* Footer CTA */}
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-[16px] border border-border-dim bg-sidebar/40 px-6 py-5 backdrop-blur-xl">
          <div>
            <div className="text-[15px] font-semibold text-foreground">
              Ready to see your pipeline this clearly?
            </div>
            <div className="text-[13px] text-secondary mt-0.5">
              Open the latest board report, written from your own business.
            </div>
          </div>
          <Link
            href="/app/reports"
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            <span>Open Board Reports</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
