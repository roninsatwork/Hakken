import Header from "@/src/ui/components/layout/Header";
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

const TOOLS = [
  {
    icon: Search,
    title: "Search",
    body: "The front door. Every collection starts here — and widening your library later is a ten-second job.",
  },
  {
    icon: Database,
    title: "Scraped Data",
    body: "Your growing library of listings — search by address, open the full details of any property, or delete what you no longer need.",
  },
  {
    icon: Activity,
    title: "Logs",
    body: "The control room: follow every run from dispatch to done, with counts updating as listings arrive.",
  },
];

const APIFY_POINTS = [
  {
    icon: ShieldCheck,
    title: "Proven, not homemade",
    body: "Extraction runs on a dedicated, battle-tested web-automation platform — infrastructure built for exactly this job.",
  },
  {
    icon: Fingerprint,
    title: "A real run ID, every time",
    body: "Every collection is a genuine Apify run with its own ID. Logs shows you the platform's own record — nothing summarised, nothing invented.",
  },
  {
    icon: Layers,
    title: "Scales as you do",
    body: "From ten listings to a thousand, from one search to fifty — the same engine takes it all in stride.",
  },
];

const TRUST_POINTS = [
  {
    icon: Globe,
    title: "Public listings only",
    body: "The agent gathers what's already public on Rightmove — the same details anyone browsing the site would see.",
  },
  {
    icon: Trash2,
    title: "Delete anytime",
    body: "Every property in your library can be removed with one click — with a confirmation step so nothing vanishes by accident.",
  },
  {
    icon: Activity,
    title: "Honest status, never guessed",
    body: "Logs mirrors the real state of every run. A collection is only marked complete when it truly is.",
  },
];

const COLLECTION_TIPS = [
  {
    icon: SlidersHorizontal,
    title: "Filter on Rightmove first",
    body: "The collection is only as good as the search. Narrow by area, price and beds before copying the link.",
  },
  {
    icon: Link2,
    title: "Use a for-sale search",
    body: "Links must be Rightmove property-for-sale search pages — a link to a single listing won't start a run.",
  },
  {
    icon: Gauge,
    title: "Start small, then scale",
    body: "A first run of 50–100 listings proves the search is right before you commit to a thousand.",
  },
  {
    icon: Hourglass,
    title: "Let it run",
    body: "Big runs take time. Start one before a meeting, and the listings will be waiting when you get back.",
  },
];

const FAQS = [
  {
    q: "What kind of link do I paste?",
    a: "A Rightmove search results page for properties for sale — the address in your browser after you've searched with your filters applied. It must be a rightmove.co.uk link.",
  },
  {
    q: "Why between 10 and 1,000 properties?",
    a: "Ten is the smallest run worth dispatching; a thousand keeps runs fast and focused. For bigger areas, run several narrower searches — they'll all land in the same library.",
  },
  {
    q: "How long does a collection take?",
    a: "It depends on the size of the run. Small runs land in minutes; larger ones take as long as they need — the Logs page tracks each one live.",
  },
  {
    q: "What details are captured for each property?",
    a: "Address, price, bedrooms, bathrooms, property type, the listing agent and the lead photo — plus the full description on each property's detail page.",
  },
  {
    q: "What actually does the scraping?",
    a: "Apify — an industry-standard web scraping platform, directed by your Rightmove Agent. The agent decides what to collect and files the results; Apify loads the pages and extracts the details.",
  },
  {
    q: "Do I need to keep the page open?",
    a: "No. Once dispatched, the run continues on its own. Come back to Logs whenever you like — pending runs re-check their status every 30 seconds automatically.",
  },
  {
    q: "Can I remove properties I don't want?",
    a: "Yes — every row in Scraped Data has a delete action, with a confirmation step first. Deleting is immediate and permanent.",
  },
  {
    q: "What happens if a run fails?",
    a: "It's marked Failed in Logs, plainly — no partial pretence. Your existing library is untouched; just start the search again.",
  },
];

const STATS = [
  { value: "1", label: "pasted link starts a collection" },
  { value: "1,000", label: "listings gathered in a single run" },
  { value: "30s", label: "between live status checks" },
  { value: "0", label: "copying and pasting by hand" },
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
  return (
    <>
      <Header />
      <div className="flex flex-col gap-8 pb-10">
        {/* Title */}
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-3">
            <Info className="w-6 h-6 text-brand" />
            How Property Collection Works
          </h1>
          <p className="text-[13px] text-secondary mt-1 max-w-2xl">
            A plain-English look at how one Rightmove link becomes a searchable
            library of property data — and how to watch it happen, live.
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
            <SectionEyebrow>How it works</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              From a Rightmove search to your library, in four steps
            </h2>
          </div>
          <CollectionFlow />
        </section>

        {/* The engine behind it */}
        <section className="rounded-[20px] border border-border-dim bg-sidebar/40 backdrop-blur-xl p-7 flex flex-col gap-5">
          <div className="flex flex-col gap-1">
            <SectionEyebrow>The engine behind it</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              Powered by Apify — the industry standard for web data
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
            <SectionEyebrow>One workflow, three tools</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground flex items-center gap-2.5">
              <Sparkles className="w-5 h-5" style={{ color: ACCENT }} />
              Search starts it. Data holds it. Logs proves it.
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              The Properties section is three pages working as one pipeline —
              you&apos;ll usually start in Search, live in Scraped Data, and
              glance at Logs while a run is underway.
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
            <SectionEyebrow>Built to be trusted</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              You stay in control of the data
            </h2>
            <p className="text-[14px] text-secondary leading-relaxed max-w-2xl">
              An autonomous collector is only useful if you can trust what it
              brings back — and remove what you don&apos;t want. The pipeline is
              built around both.
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
            <SectionEyebrow>Getting the best collection</SectionEyebrow>
            <h2 className="text-xl font-semibold text-foreground">
              Four small things that make a big difference
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
              Ready to build your library?
            </div>
            <div className="text-[13px] text-secondary mt-0.5">
              Paste your first Rightmove search and watch it fill.
            </div>
          </div>
          <Link
            href="/app/properties/search"
            className="flex items-center gap-2 px-4 py-2 rounded-[10px] text-[13px] bg-foreground text-background font-medium hover:bg-foreground/90 transition-all shadow-xl shadow-foreground/10"
          >
            <span>Start a collection</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    </>
  );
}
