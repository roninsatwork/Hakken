import Header from "@/src/ui/components/layout/Header";
import { useTranslations } from "next-intl";
import Link from "next/link";
import {
  Info,
  ArrowRight,
  ChevronDown,
  Sparkles,
  Search,
  Database,
  Activity,
  SlidersHorizontal,
  Link2,
  Gauge,
  Hourglass,
  Globe,
  Trash2,
  ShieldCheck,
  Fingerprint,
  Layers,
} from "lucide-react";
import { CollectionJourney, CollectionFlow } from "./_components/PropertyInfoVisuals";

const ACCENT = "#b9dcc4";

const buildTools = (t: ReturnType<typeof useTranslations>) => [
    { icon: Search, title: t("tools.search.title"), body: t("tools.search.body") },
    { icon: Database, title: t("tools.scraped.title"), body: t("tools.scraped.body") },
    { icon: Activity, title: t("tools.logs.title"), body: t("tools.logs.body") },
  ];

const buildApifyPoints = (t: ReturnType<typeof useTranslations>) => [
    { icon: ShieldCheck, title: t("apify.proven.title"), body: t("apify.proven.body") },
    { icon: Fingerprint, title: t("apify.runId.title"), body: t("apify.runId.body") },
    { icon: Layers, title: t("apify.scales.title"), body: t("apify.scales.body") },
  ];

const buildTrustPoints = (t: ReturnType<typeof useTranslations>) => [
    { icon: Globe, title: t("trust.publicOnly.title"), body: t("trust.publicOnly.body") },
    { icon: Trash2, title: t("trust.deleteAnytime.title"), body: t("trust.deleteAnytime.body") },
    { icon: Activity, title: t("trust.honestStatus.title"), body: t("trust.honestStatus.body") },
  ];

const buildCollectionTips = (t: ReturnType<typeof useTranslations>) => [
    { icon: SlidersHorizontal, title: t("tips.filterFirst.title"), body: t("tips.filterFirst.body") },
    { icon: Link2, title: t("tips.forSale.title"), body: t("tips.forSale.body") },
    { icon: Gauge, title: t("tips.startSmall.title"), body: t("tips.startSmall.body") },
    { icon: Hourglass, title: t("tips.letItRun.title"), body: t("tips.letItRun.body") },
  ];

const buildFaqs = (t: ReturnType<typeof useTranslations>) => [
    { q: t("faq.link.q"), a: t("faq.link.a") },
    { q: t("faq.range.q"), a: t("faq.range.a") },
    { q: t("faq.duration.q"), a: t("faq.duration.a") },
    { q: t("faq.details.q"), a: t("faq.details.a") },
    { q: t("faq.scraper.q"), a: t("faq.scraper.a") },
    { q: t("faq.keepOpen.q"), a: t("faq.keepOpen.a") },
    { q: t("faq.remove.q"), a: t("faq.remove.a") },
    { q: t("faq.fails.q"), a: t("faq.fails.a") },
  ];

const buildStats = (t: ReturnType<typeof useTranslations>) => [
    { value: "1", label: t("stats.paste") },
    { value: "1,000", label: t("stats.gathered") },
    { value: "30s", label: t("stats.checks") },
    { value: "0", label: t("stats.manual") },
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

export default function PropertiesInformationPage() {
  const t = useTranslations("properties.information");
  const TOOLS = buildTools(t);
  const APIFY_POINTS = buildApifyPoints(t);
  const TRUST_POINTS = buildTrustPoints(t);
  const COLLECTION_TIPS = buildCollectionTips(t);
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

        {/* The journey — interactive visual */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl overflow-hidden">
          <CollectionJourney />
        </section>

        {/* How it works */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>{t("howItWorks")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              {t("howSubtitle")}
            </h2>
          </div>
          <CollectionFlow />
        </section>

        {/* The engine behind it */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl p-7 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>{t("engineBehind")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              {t("engineSubtitle")}
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              The heavy lifting — loading every listing, reading every detail,
              handling the scale — is done by Apify, the web-automation
              platform trusted by data teams worldwide. Your agent directs the
              work; Apify does the digging.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {APIFY_POINTS.map((point) => (
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

        {/* The three tools */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>{t("oneWorkflow")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              {t("workflowSubtitle")}
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              {t("workflowBody")}
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {TOOLS.map((tool) => (
              <div
                key={tool.title}
                className="flex flex-col gap-2.5 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <tool.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[15px] font-semibold text-foreground">
                  {tool.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {tool.body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* You stay in control */}
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

        {/* Collection tips */}
        <section className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>{t("bestCollection")}</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              {t("tipsSubtitle")}
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {COLLECTION_TIPS.map((tip) => (
              <div
                key={tip.title}
                className="flex flex-col gap-2.5 rounded-[16px] border border-border-dim bg-card/60 p-5 backdrop-blur-xl"
              >
                <tip.icon className="w-5 h-5" style={{ color: ACCENT }} />
                <h3 className="text-[14px] font-semibold text-foreground">
                  {tip.title}
                </h3>
                <p className="text-[13px] text-secondary leading-relaxed">
                  {tip.body}
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
            href="/app/properties/search"
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            <span>{t("ctaTitle")}</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
