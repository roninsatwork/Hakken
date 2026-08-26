import Header from "@/src/ui/components/layout/Header";
import { useTranslations } from "next-intl";
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

const buildTrustPoints = (t: ReturnType<typeof useTranslations>) => [
    { icon: Target, title: t("trust.yourNumbers.title"), body: t("trust.yourNumbers.body") },
    { icon: LayoutList, title: t("trust.comparable.title"), body: t("trust.comparable.body") },
    { icon: Lightbulb, title: t("trust.actionable.title"), body: t("trust.actionable.body") },
  ];

const buildGlossary = (t: ReturnType<typeof useTranslations>) => [
    { icon: Scale, title: t("glossary.weighted.title"), body: t("glossary.weighted.body") },
    { icon: CalendarClock, title: t("glossary.windows.title"), body: t("glossary.windows.body") },
    { icon: ShieldAlert, title: t("glossary.radar.title"), body: t("glossary.radar.body") },
    { icon: Percent, title: t("glossary.winRate.title"), body: t("glossary.winRate.body") },
  ];

const buildIngredients = (t: ReturnType<typeof useTranslations>) => [
    { icon: FileSpreadsheet, title: t("ingredients.pipeline.title"), body: t("ingredients.pipeline.body") },
    { icon: BookOpen, title: t("ingredients.knowledge.title"), body: t("ingredients.knowledge.body") },
    { icon: CalendarCheck, title: t("ingredients.schedule.title"), body: t("ingredients.schedule.body") },
  ];

const buildFaqs = (t: ReturnType<typeof useTranslations>) => [
    { q: t("faq.need.q"), a: t("faq.need.a") },
    { q: t("faq.knows.q"), a: t("faq.knows.a") },
    { q: t("faq.remembers.q"), a: t("faq.remembers.a") },
    { q: t("faq.retrieval.q"), a: t("faq.retrieval.a") },
    { q: t("faq.cadence.q"), a: t("faq.cadence.a") },
    { q: t("faq.share.q"), a: t("faq.share.a") },
    { q: t("faq.estimated.q"), a: t("faq.estimated.a") },
    { q: t("faq.noReports.q"), a: t("faq.noReports.a") },
  ];

const buildStats = (t: ReturnType<typeof useTranslations>) => [
    { value: "100%", label: t("stats.deals") },
    { value: "8", label: t("stats.sections") },
    { value: "1", label: t("stats.agent") },
    { value: "0", label: t("stats.hours") },
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
  const t = useTranslations("salesReports.information");
  const TRUST_POINTS = buildTrustPoints(t);
  const GLOSSARY = buildGlossary(t);
  const INGREDIENTS = buildIngredients(t);
  const FAQS = buildFaqs(t);
  const STATS = buildStats(t);
  return (
    <>
      <Header />
      <div className="flex flex-col gap-8 pb-10">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Info className="w-6 h-6 text-brand" />
            {t("pageTitle")}
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-2xl">
            {t("pageIntro")}
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
            <SectionEyebrow>{t("howItWorks")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              {t("howSubtitle")}
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
            <SectionEyebrow>{t("gettingStarted")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              {t("startSubtitle")}
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              {t("startBody")}
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
            <SectionEyebrow>{t("builtTrusted")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              {t("trustSubtitle")}
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              {t("trustBody")}
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
            <SectionEyebrow>{t("readingReport")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              {t("glossarySubtitle")}
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
            <SectionEyebrow>{t("commonQuestions")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              {t("faqSubtitle")}
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
              {t("ctaHeading")}
            </div>
            <div className="text-[13px] text-secondary mt-0.5">
              {t("ctaBody")}
            </div>
          </div>
          <Link
            href="/app/reports"
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            <span>{t("ctaButton")}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
