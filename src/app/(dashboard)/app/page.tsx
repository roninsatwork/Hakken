"use client";

import { useEffect } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { CompactList } from "@/src/ui/components/screens/CompactList";
import { ArrowRight } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";

type Item = { title: string; body: string };
type Capability = Item & { tags: string[] };
type Segment = { text: string; kind: "plain" | "struck" | "redacted" };
type Gate = Item & { verdict: string; clean?: boolean };
type LearnStep = { name: string; title: string; body: string; auto: boolean };
type LedgerRow = { time: string; what: string; who: string; tag: string; tone: string };
type ProofStep = Item & { stage: string };
type Figure = { value: string; label: string };

/* ------------------------------------------------------------------ *
 * Shared furniture
 * ------------------------------------------------------------------ */

function Eyebrow({ children, brand = false }: { children: ReactNode; brand?: boolean }) {
  return (
    <span
      className={`font-mono text-[12px] font-medium uppercase tracking-[0.19em] ${
        brand ? "text-brand" : "text-secondary"
      }`}
    >
      {children}
    </span>
  );
}

/**
 * Every section opens the same way, from one place.
 *
 * The previous page set its spacing per section, which is how a page ends up
 * with six different gaps above six headings.
 */
function BandHead({ eyebrow, title, subtitle, brand = false }: {
  eyebrow: string;
  title: string;
  subtitle?: string;
  brand?: boolean;
}) {
  return (
    <div className="mb-8 flex max-w-3xl flex-col gap-3 md:mb-12">
      <Eyebrow brand={brand}>{eyebrow}</Eyebrow>
      <h2 className="sonae-display text-[clamp(24px,2.9vw,38px)] leading-[1.1] text-foreground">
        {title}
      </h2>
      {subtitle ? <p className="max-w-[62ch] text-[16px] leading-relaxed text-secondary">{subtitle}</p> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ *
 * Drawings — the idea, not an icon of it
 * ------------------------------------------------------------------ */

function Art({ children, className = "h-[72px] w-[120px]" }: { children: ReactNode; className?: string }) {
  return (
    <svg viewBox="0 0 120 72" role="presentation" className={`${className} shrink-0`}>
      {children}
    </svg>
  );
}

function AgentArt() {
  return (
    <svg viewBox="0 0 300 150" role="presentation" className="h-auto w-full max-w-[300px]">
      <path d="M70 40h60M170 40h60M70 110h60M170 110h60M70 40v70M230 40v70" className="stroke-border-dim" strokeWidth="1.5" strokeDasharray="4 5" fill="none" />
      <rect x="16" y="22" width="54" height="36" rx="11" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <path d="M34 40l6 6 12-14" className="stroke-brand" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="130" y="22" width="54" height="36" rx="11" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <path d="M148 40l6 6 12-14" className="stroke-brand" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="230" y="22" width="54" height="36" rx="11" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <circle cx="248" cy="40" r="2.5" className="fill-muted" />
      <circle cx="257" cy="40" r="2.5" className="fill-muted" />
      <circle cx="266" cy="40" r="2.5" className="fill-muted" />
      <rect x="16" y="92" width="54" height="36" rx="11" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <path d="M34 110l6 6 12-14" className="stroke-brand" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="130" y="92" width="54" height="36" rx="11" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <rect x="230" y="92" width="54" height="36" rx="11" className="fill-foreground/[0.03] stroke-border-dim" strokeWidth="1.5" strokeDasharray="4 4" />
    </svg>
  );
}

function KnowledgeArt() {
  return (
    <Art>
      <rect x="8" y="10" width="44" height="54" rx="6" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <rect x="18" y="4" width="44" height="54" rx="6" className="fill-card stroke-border-dim" strokeWidth="1.5" />
      <line x1="27" y1="18" x2="52" y2="18" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="27" x2="46" y2="27" className="stroke-brand" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="36" x2="53" y2="36" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="45" x2="41" y2="45" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
      <path d="M74 34h20" className="stroke-brand/50" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      <circle cx="104" cy="34" r="12" className="fill-brand/12 stroke-brand/45" strokeWidth="1.5" />
      <path d="M99 34l4 4 7-8" className="stroke-brand" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </Art>
  );
}

function ApprovalArt() {
  return (
    <Art>
      <rect x="4" y="24" width="34" height="24" rx="8" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <line x1="13" y1="36" x2="29" y2="36" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
      <line x1="52" y1="8" x2="52" y2="64" className="stroke-brand" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
      <circle cx="52" cy="36" r="9" className="fill-brand/15 stroke-brand" strokeWidth="1.5" />
      <path d="M48 36l3 3 5-6" className="stroke-brand" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="70" y="24" width="46" height="24" rx="8" fill="none" className="stroke-border-dim" strokeWidth="1.5" strokeDasharray="4 4" />
    </Art>
  );
}

function AnyModelArt() {
  return (
    <Art>
      <circle cx="60" cy="36" r="14" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <path d="M53 36l5 5 9-11" className="stroke-brand" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      {[[16, 14], [16, 58], [104, 14], [104, 58]].map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x - 12} y={y - 9} width="24" height="18" rx="6" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      ))}
      <path d="M28 18l18 12M28 54l18-12M92 18L74 30M92 54L74 42" className="stroke-border-dim" strokeWidth="1.5" strokeDasharray="3 3" />
    </Art>
  );
}

function WidgetArt() {
  return (
    <Art>
      <rect x="4" y="8" width="72" height="56" rx="8" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
      <line x1="4" y1="21" x2="76" y2="21" className="stroke-border-dim" strokeWidth="1.5" />
      <circle cx="13" cy="14.5" r="2" className="fill-muted" />
      <circle cx="20" cy="14.5" r="2" className="fill-muted" />
      <line x1="15" y1="34" x2="56" y2="34" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
      <line x1="15" y1="44" x2="44" y2="44" className="stroke-muted" strokeWidth="2" strokeLinecap="round" />
      <rect x="62" y="34" width="52" height="32" rx="12" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <circle cx="77" cy="50" r="3" className="fill-brand" />
      <circle cx="88" cy="50" r="3" className="fill-brand/60" />
      <circle cx="99" cy="50" r="3" className="fill-brand/35" />
    </Art>
  );
}

function BudgetArt() {
  return (
    <Art>
      <line x1="4" y1="18" x2="116" y2="18" className="stroke-brand" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      <rect x="14" y="44" width="18" height="20" rx="4" className="fill-brand/30" />
      <rect x="40" y="34" width="18" height="30" rx="4" className="fill-brand/55" />
      <rect x="66" y="24" width="18" height="40" rx="4" className="fill-brand/80" />
      <rect x="92" y="24" width="18" height="40" rx="4" className="fill-foreground/10" />
    </Art>
  );
}

const CAPABILITY_ART = [AgentArt, KnowledgeArt, ApprovalArt, AnyModelArt, WidgetArt, BudgetArt];

/**
 * The three clouds, drawn rather than fetched.
 *
 * Monochrome on purpose: three vendors' brand palettes dropped into a page
 * built on one accent would be the loudest thing on it, and nothing here is
 * an official asset — these are simplified marks that say which cloud, in
 * the page's own voice.
 */
const HOST_MARKS = [
  /* Google Cloud: the cloud, and nothing else in it. */
  <g key="gcp">
    <path
      d="M31 23.5H11.5a6.8 6.8 0 0 1-1.1-13.5 8.9 8.9 0 0 1 16.4-2.4A6.3 6.3 0 0 1 32.6 13a5.3 5.3 0 0 1-1.6 10.5z"
      strokeWidth="1.9"
      strokeLinejoin="round"
    />
  </g>,
  /* AWS: the one arc that runs under the wordmark, and its arrowhead. */
  <g key="aws">
    <path d="M5.5 16.2c7.6 6.2 21.2 6.6 29 1" strokeWidth="2" strokeLinecap="round" />
    <path d="M29.8 13.6l4.9 3.4-3.5 4.4" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </g>,
  /* Azure: the two planes that lean into each other to make its A. */
  <g key="azure">
    <path d="M17.2 4h7.2l10.6 21.5H21.8l6.3-5-10.8-1.7z" strokeWidth="1.9" strokeLinejoin="round" />
    <path d="M15.1 9L5 25.5h9.6l4.4-3.5z" strokeWidth="1.9" strokeLinejoin="round" />
  </g>,
];

function HostMark({ index }: { index: number }) {
  return (
    <svg
      viewBox="0 0 40 30"
      role="presentation"
      fill="none"
      className="h-9 w-12 shrink-0 stroke-brand"
    >
      {HOST_MARKS[index % HOST_MARKS.length]}
    </svg>
  );
}

const GOVERNANCE_GLYPHS = [
  <g key="register"><rect x="3.5" y="2.5" width="13" height="15" rx="2.5" /><path d="M7 7h6M7 10.5h6M7 14h3.5" /></g>,
  <g key="risk"><path d="M10 2.5l6.5 3v4.7c0 3.6-2.6 6.4-6.5 7.3-3.9-.9-6.5-3.7-6.5-7.3V5.5l6.5-3z" /><path d="M10 7.5v3M10 13v.01" /></g>,
  <g key="auditor"><circle cx="9" cy="9" r="5.5" /><path d="M13.2 13.2L17 17" /></g>,
  <g key="person"><circle cx="10" cy="6.75" r="3.25" /><path d="M4 17c.6-3.2 3-5 6-5s5.4 1.8 6 5" /></g>,
  <g key="pack"><path d="M5 2.5h6.5L16 6.5V17h-11z" /><path d="M11.5 2.5V7H16" /></g>,
  <g key="rules"><path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h8" /><circle cx="15" cy="14.5" r="1" /></g>,
  <g key="tenants"><rect x="2.5" y="7" width="6" height="10.5" rx="1.5" /><rect x="11.5" y="3.5" width="6" height="14" rx="1.5" /></g>,
];

/**
 * The four learning loops, drawn as a loop.
 *
 * A list would have said the same words; only the ring says the thing runs
 * round and starts again, which is the whole claim.
 */
function LoopFigure({ value, label, names }: { value: string; label: string; names: string[] }) {
  const nodes = [
    { cx: 160, cy: 42, labelY: 18 },
    { cx: 278, cy: 160, labelY: 197 },
    { cx: 160, cy: 278, labelY: 309 },
    { cx: 42, cy: 160, labelY: 197 },
  ];
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
      <svg viewBox="0 0 320 320" role="img" aria-label={names.join(", ")} className="absolute inset-0 h-full w-full">
        <circle cx="160" cy="160" r="118" fill="none" className="stroke-border-dim" strokeWidth="1" />
        <circle
          cx="160" cy="160" r="118" fill="none"
          className="stroke-brand" strokeWidth="1.5" strokeLinecap="round"
          strokeDasharray="510 232" transform="rotate(-84 160 160)"
        />
        {nodes.map((node, index) => (
          <g key={node.cx + "-" + node.cy}>
            <circle cx={node.cx} cy={node.cy} r="15" className={`fill-card ${index < 2 ? "stroke-brand/50" : "stroke-border-dim"}`} strokeWidth="1" />
            <circle cx={node.cx} cy={node.cy} r="4" className={index < 2 ? "fill-brand" : "fill-muted"} />
            <text
              x={node.cx}
              y={node.labelY}
              textAnchor="middle"
              className="fill-secondary font-mono text-[11px] uppercase tracking-[0.14em]"
            >
              {names[index]}
            </text>
          </g>
        ))}
      </svg>
      <div className="absolute inset-[34%] flex flex-col items-center justify-center gap-0.5 text-center">
        <b className="sonae-display text-[28px] font-normal leading-none text-foreground">{value}</b>
        <span className="font-mono text-[11px] uppercase tracking-[0.16em] text-secondary">{label}</span>
      </div>
    </div>
  );
}

/** The audit trail, shown as itself. Describing it convinces nobody. */
function LedgerTagTone(tone: string) {
  if (tone === "waiting") return "text-warning border-warning/40";
  if (tone === "approved") return "text-success border-success/40";
  if (tone === "action") return "text-brand border-brand/40";
  return "text-secondary border-border-dim";
}

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

export default function AppDashboardPage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const user = useQuery(api.users.getMe);

  useEffect(() => {
    if (user && user.role === "SUPER_ADMIN") {
      const redirected = sessionStorage.getItem("admin_redirected");
      if (!redirected) {
        sessionStorage.setItem("admin_redirected", "true");
        router.push("/admin");
      }
    }
  }, [user, router]);

  const layerRows = t.raw("layers.rows") as Item[];
  const capabilities = t.raw("capabilities.items") as Capability[];
  const incoming = t.raw("safety.incoming") as Segment[];
  const gates = t.raw("safety.gates") as Gate[];
  const learnSteps = t.raw("learning.steps") as LearnStep[];
  const control = t.raw("control.items") as Item[];
  const govPoints = t.raw("governance.points") as Item[];
  const ledgerRows = t.raw("governance.ledger.rows") as LedgerRow[];
  const ledgerFooter = t.raw("governance.ledger.footer") as string[];
  const proof = t.raw("proof.items") as ProofStep[];
  const figures = t.raw("engineering.figures") as Figure[];
  const engineering = t.raw("engineering.items") as Item[];
  const hosting = t.raw("hosting.items") as Item[];
  const useCases = t.raw("useCases.items") as Item[];

  return (
    <div className="flex flex-col pb-16">
      <Header />

      {/* ---------------- Hero: the pitch beside the picture of it ----------
          Copy on the left, the stack on the right. The stack IS the argument,
          so it sits with the words making it rather than under them. */}
      <section className="relative overflow-hidden rounded-[28px] border border-border-dim bg-sidebar/40 p-6 md:p-10 lg:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(var(--brand-rgb),0.16),transparent_48%)]" />

        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="flex flex-col items-start gap-5">
            <Eyebrow brand>{t("hero.eyebrow")}</Eyebrow>
            <h1 className="sonae-display hakken-hero-h1 text-foreground">{t("hero.title")}</h1>
            <p className="max-w-[46ch] text-[clamp(15px,1.25vw,18px)] font-light leading-[1.5] text-secondary">
              {t("hero.body")}
            </p>
            <div className="mt-1 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/app/assistant")}
                className="inline-flex h-[52px] items-center gap-2.5 rounded-full bg-foreground px-[26px] text-[16px] font-semibold text-background transition-opacity hover:opacity-90"
              >
                {t("hero.primaryAction")}
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#included"
                className="inline-flex h-[52px] items-center rounded-full border border-border-dim px-[26px] text-[16px] font-semibold text-foreground transition-colors hover:bg-hover"
              >
                {t("hero.secondaryAction")}
              </a>
            </div>
          </div>

          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-[15px] text-secondary">{t("layers.title")}</span>
              <Eyebrow>{t("layers.platform")}</Eyebrow>
            </div>

            <div className="flex flex-col gap-2">
              <div className="mb-1.5 flex items-center gap-4 rounded-[14px] border border-brand/45 bg-brand/10 px-5 py-4">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" />
                <span className="min-w-0">
                  <strong className="block text-[17px] font-medium tracking-tight text-foreground">{t("layers.yours")}</strong>
                  <span className="mt-0.5 block text-[13px] text-secondary">{t("layers.yoursLabel")}</span>
                </span>
                <span className="ml-auto shrink-0 font-mono text-[11px] uppercase tracking-[0.17em] text-brand">
                  {t("layers.youLabel")}
                </span>
              </div>

              {layerRows.map((row) => (
                <div key={row.title} className="flex items-center gap-4 rounded-[13px] border border-border-dim bg-card/50 px-5 py-3">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand/70" />
                  <span className="min-w-0">
                    <strong className="block text-[15px] font-semibold tracking-tight text-foreground">{row.title}</strong>
                    <span className="mt-0.5 block text-[12px] leading-snug text-secondary">{row.body}</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- What it does: weighted cells, not a uniform grid --- */}
      <section id="included" className="scroll-mt-8 pt-16 md:pt-24">
        <BandHead eyebrow={t("capabilities.eyebrow")} title={t("capabilities.title")} subtitle={t("capabilities.subtitle")} />

        <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-6">
          {/* The anchor runs the full width and lays out sideways, so the space
              goes to the drawing instead of to a column of empty card. */}
          <article className="col-span-2 flex flex-col gap-6 rounded-[18px] border border-border-dim bg-card/50 p-6 transition-colors hover:border-brand/30 lg:col-span-6 lg:flex-row lg:items-center lg:gap-12 lg:p-9">
            <div className="shrink-0 lg:w-[300px]">
              <AgentArt />
            </div>
            <div className="flex min-w-0 flex-col gap-3">
              <h3 className="sonae-display text-[clamp(21px,2.1vw,30px)] font-normal text-foreground">
                {capabilities[0].title}
              </h3>
              <p className="max-w-[62ch] text-[16px] leading-relaxed text-secondary">{capabilities[0].body}</p>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {capabilities[0].tags.map((tag) => (
                  <span key={tag} className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-brand">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </article>

          {capabilities.slice(1).map((item, sliceIndex) => {
            const index = sliceIndex + 1;
            const Drawing = CAPABILITY_ART[index % CAPABILITY_ART.length];
            return (
              <article
                key={item.title}
                className={`${index < 3 ? "col-span-2 lg:col-span-3" : "col-span-2"} flex flex-col gap-3 rounded-[18px] border border-border-dim bg-card/50 p-6 transition-colors hover:border-brand/30`}
              >
                <div className="mb-auto">
                  <Drawing />
                </div>
                <h3 className="text-[18px] font-semibold tracking-tight text-foreground">{item.title}</h3>
                <p className="max-w-[42ch] text-[16px] leading-relaxed text-secondary">{item.body}</p>
                {item.tags.length > 0 ? (
                  <div className="flex flex-wrap gap-1.5 pt-0.5">
                    {item.tags.map((tag) => (
                      <span key={tag} className="rounded-full border border-brand/30 bg-brand/10 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.1em] text-brand">
                        {tag}
                      </span>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>

      {/* ---------------- Safety: a sequence, so it is numbered -------------- */}
      <section className="mt-16 rounded-[28px] border border-border-dim bg-sidebar/30 p-6 md:mt-24 md:p-10">
        <BandHead eyebrow={t("safety.eyebrow")} title={t("safety.title")} subtitle={t("safety.subtitle")} brand />

        <div className="grid items-end gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
          <div className="rounded-[14px] border border-border-dim bg-card p-5 font-mono text-[15px] leading-[1.72] shadow-sm">
            <span className="mb-2.5 block font-mono text-[11px] uppercase tracking-[0.17em] text-secondary">
              {t("safety.incomingLabel")}
            </span>
            <p className="text-foreground">
              {incoming.map((segment, index) => {
                if (segment.kind === "struck") {
                  return (
                    <span key={index} className="text-destructive line-through decoration-destructive/60 decoration-1">
                      {segment.text}
                    </span>
                  );
                }
                if (segment.kind === "redacted") {
                  return (
                    <span key={index} className="rounded bg-foreground/10 px-1 tracking-[0.12em] text-secondary">
                      {segment.text}
                    </span>
                  );
                }
                return <span key={index}>{segment.text}</span>;
              })}
            </p>
          </div>
          <p className="text-[15px] leading-relaxed text-secondary">{t("safety.note")}</p>
        </div>

        <div className="mt-9 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {gates.map((gate, index) => (
            <div key={gate.title} className="relative flex flex-col gap-2 overflow-hidden rounded-[16px] border border-border-dim bg-card p-5 pb-4">
              <span className="flex items-center gap-2.5 font-mono text-[12px] tracking-[0.15em] text-brand">
                {String(index + 1).padStart(2, "0")}
                <span className="h-px flex-1 bg-border-dim" />
              </span>
              <h3 className="text-[16px] font-semibold tracking-tight text-foreground">{gate.title}</h3>
              <p className="text-[15px] leading-relaxed text-secondary">{gate.body}</p>
              <span className={`mt-auto flex items-center gap-1.5 pt-2.5 font-mono text-[12px] tracking-[0.08em] ${
                gate.clean ? "text-success" : "text-destructive"
              }`}>
                <span className="h-1 w-1 rounded-full bg-current" />
                {gate.verdict}
              </span>
              <span className="absolute inset-x-0 bottom-0 h-0.5 bg-brand" />
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Learning: a loop, drawn as a loop ------------------ */}
      <section className="pt-16 md:pt-24">
        <BandHead eyebrow={t("learning.eyebrow")} title={t("learning.title")} subtitle={t("learning.subtitle")} />

        <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:gap-16">
          <LoopFigure
            value={t("learning.coreValue")}
            label={t("learning.coreLabel")}
            names={learnSteps.map((step) => step.name)}
          />

          <dl className="flex flex-col">
            {learnSteps.map((step, index) => (
              <div
                key={step.name}
                className={`grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-5 py-[18px] ${
                  index === 0 ? "" : "border-t border-border-dim"
                }`}
              >
                <dt className="pt-0.5 font-mono text-[12px] uppercase tracking-[0.15em] text-brand">{step.name}</dt>
                <dd className="m-0">
                  <h3 className="mb-1 text-[16px] font-semibold tracking-tight text-foreground">{step.title}</h3>
                  <p className="text-[15px] leading-relaxed text-secondary">{step.body}</p>
                  <span className={`mt-2 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-[0.1em] ${
                    step.auto ? "text-success" : "text-warning"
                  }`}>
                    <span className="h-1 w-1 rounded-full bg-current" />
                    {step.auto ? t("learning.autoLabel") : t("learning.askLabel")}
                  </span>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- Control: a set, so no numbering -------------------- */}
      <section className="pt-16 md:pt-24">
        <BandHead eyebrow={t("control.eyebrow")} title={t("control.title")} subtitle={t("control.subtitle")} />

        <dl className="border-t border-border-dim">
          {control.map((item) => (
            <div key={item.title} className="grid gap-1.5 border-b border-border-dim py-[22px] md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] md:items-baseline md:gap-10">
              <dt className="text-[16px] font-semibold tracking-tight text-foreground">{item.title}</dt>
              <dd className="m-0 max-w-[62ch] text-[16px] leading-relaxed text-secondary">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Governance: shown as itself ------------------------ */}
      <section className="mt-16 rounded-[28px] border border-border-dim bg-sidebar/30 p-6 md:mt-24 md:p-10">
        <BandHead eyebrow={t("governance.eyebrow")} title={t("governance.title")} subtitle={t("governance.subtitle")} brand />

        <div className="grid items-start gap-10 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] xl:gap-14">
          <div className="flex flex-col gap-6">
            {govPoints.map((point, index) => (
              <div key={point.title} className="flex gap-3.5">
                <svg viewBox="0 0 20 20" role="presentation" fill="none" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" className="mt-0.5 h-[18px] w-[18px] shrink-0 stroke-brand">
                  {GOVERNANCE_GLYPHS[index % GOVERNANCE_GLYPHS.length]}
                </svg>
                <div className="min-w-0">
                  <h3 className="mb-0.5 text-[16px] font-semibold tracking-tight text-foreground">{point.title}</h3>
                  <p className="text-[15px] leading-relaxed text-secondary">{point.body}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="overflow-hidden rounded-[16px] border border-border-dim bg-card shadow-sm">
            <div className="flex flex-wrap items-center gap-2 border-b border-border-dim bg-foreground/[0.04] px-4 py-3">
              <b className="text-[15px] font-semibold tracking-tight text-foreground">{t("governance.ledger.title")}</b>
              <span className="text-[15px] text-secondary">· {t("governance.ledger.subject")}</span>
              <span className="ml-auto font-mono text-[12px] uppercase tracking-[0.19em] text-secondary">
                {t("governance.ledger.reference")}
              </span>
            </div>

            <div className="overflow-x-auto">
              <CompactList<LedgerRow>
                rows={ledgerRows}
                rowKey={(row) => row.time + row.what}
                minWidthClassName="min-w-[34rem]"
                empty={t("governance.ledger.empty")}
                columns={[
                  {
                    key: "time",
                    className: "w-px whitespace-nowrap font-mono text-[15px] tabular-nums text-secondary",
                    cell: (row) => row.time,
                  },
                  { key: "what", className: "text-[15px] text-foreground", cell: (row) => row.what },
                  {
                    key: "who",
                    className: "whitespace-nowrap text-[15px] text-secondary",
                    cell: (row) => row.who,
                  },
                  {
                    key: "tag",
                    align: "right",
                    className: "w-px",
                    cell: (row) => (
                      <span
                        className={`whitespace-nowrap rounded-full border px-2 py-1 font-mono text-[11px] uppercase tracking-[0.1em] ${LedgerTagTone(row.tone)}`}
                      >
                        {row.tag}
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-border-dim px-4 py-3 font-mono text-[12px] tabular-nums text-secondary">
              {ledgerFooter.map((entry) => <span key={entry}>{entry}</span>)}
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Proof: the life of an agent, in order --------------
          A spine rather than another grid of glyph-title-paragraph. These four
          genuinely happen in this sequence, so the page draws the sequence. */}
      <section className="pt-16 md:pt-24">
        <BandHead eyebrow={t("proof.eyebrow")} title={t("proof.title")} subtitle={t("proof.subtitle")} />

        <ol className="relative ml-1 flex flex-col border-l border-border-dim">
          {proof.map((item) => (
            <li key={item.title} className="relative pb-9 pl-8 last:pb-0 md:pl-10">
              <span className="absolute -left-[5px] top-[7px] h-2.5 w-2.5 rounded-full border-2 border-background bg-brand" />
              <span className="font-mono text-[12px] uppercase tracking-[0.15em] text-brand">{item.stage}</span>
              <h3 className="mt-2 text-[clamp(17px,1.5vw,21px)] font-semibold tracking-tight text-foreground">
                {item.title}
              </h3>
              <p className="mt-1.5 max-w-[68ch] text-[15px] leading-relaxed text-secondary">{item.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------- Engineering: the numbers carry it ------------------
          Deliberately the quietest section on the page. No drawings, no
          glyphs — four large figures and four flat statements, because the
          claim being made here is that nothing is being dressed up. */}
      <section className="mt-16 rounded-[28px] border border-border-dim bg-sidebar/30 p-6 md:mt-24 md:p-10">
        <BandHead eyebrow={t("engineering.eyebrow")} title={t("engineering.title")} subtitle={t("engineering.subtitle")} brand />

        {/* Dividers are borders on the cells, not a gap-px grid showing a
            background through: this band is translucent, so a solid colour
            behind the gaps would not match it in either theme. Which cell
            starts a row changes with the breakpoint, hence the split rules. */}
        <div className="mb-10 grid border-y border-border-dim sm:grid-cols-2 lg:grid-cols-4 md:mb-12">
          {figures.map((figure, index) => {
            const startsRow =
              index === 1 || index === 3
                ? "sm:border-l sm:border-border-dim sm:pl-6"
                : index === 2
                  ? "lg:border-l lg:border-border-dim lg:pl-6"
                  : "";
            return (
              <div key={figure.label} className={`py-6 pr-6 ${startsRow}`}>
                <b className="sonae-display block text-[clamp(30px,3vw,42px)] font-normal leading-none tabular-nums text-brand">
                  {figure.value}
                </b>
                <span className="mt-2.5 block max-w-[26ch] text-[15px] leading-relaxed text-secondary">{figure.label}</span>
              </div>
            );
          })}
        </div>

        <dl className="grid gap-x-12 gap-y-0 md:grid-cols-2">
          {engineering.map((item) => (
            <div key={item.title} className="border-t border-border-dim py-5">
              <dt className="text-[16px] font-semibold tracking-tight text-foreground">{item.title}</dt>
              <dd className="m-0 mt-1.5 max-w-[62ch] text-[15px] leading-relaxed text-secondary">{item.body}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* ---------------- Hosting: a hairline band, deliberately not cards --- */}
      <section className="pt-16 md:pt-24">
        <BandHead eyebrow={t("hosting.eyebrow")} title={t("hosting.title")} subtitle={t("hosting.subtitle")} />

        <div className="grid md:grid-cols-3">
          {hosting.map((item, index) => (
            <div
              key={item.title}
              className={`flex flex-col gap-2.5 border-t border-border-dim py-6 md:pr-8 ${index > 0 ? "md:border-l md:pl-8" : ""}`}
            >
              <HostMark index={index} />
              <b className="mt-1 text-[16px] font-semibold tracking-tight text-foreground">{item.title}</b>
              <p className="text-[15px] leading-relaxed text-secondary">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------------- Close ---------------------------------------------- */}
      <section className="relative mt-16 overflow-hidden rounded-[24px] border border-border-dim bg-card/50 p-6 md:mt-24 md:p-12">
        <div className="pointer-events-none absolute -bottom-[60%] left-[40%] right-0 h-[26rem] bg-[radial-gradient(ellipse_at_50%_100%,rgba(var(--brand-rgb),0.12),transparent_65%)]" />
        <div className="relative grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
          <div className="flex flex-col items-start gap-4">
            <Eyebrow brand>{t("useCases.eyebrow")}</Eyebrow>
            <h2 className="sonae-display text-[clamp(24px,2.9vw,38px)] leading-[1.1] text-foreground">
              {t("useCases.title")}
            </h2>
            <p className="max-w-[34ch] text-[16px] leading-relaxed text-secondary">{t("useCases.subtitle")}</p>
            <button
              type="button"
              onClick={() => router.push("/app/assistant")}
              className="mt-1 inline-flex h-[52px] items-center gap-2.5 rounded-full bg-foreground px-[26px] text-[16px] font-semibold text-background transition-opacity hover:opacity-90"
            >
              {t("hero.primaryAction")}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col">
            {useCases.map((item, index) => (
              <div key={item.title} className={`py-[17px] ${index === 0 ? "" : "border-t border-border-dim"}`}>
                <b className="mb-0.5 block text-[16px] font-semibold tracking-tight text-foreground">{item.title}</b>
                <p className="text-[15px] leading-relaxed text-secondary">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}