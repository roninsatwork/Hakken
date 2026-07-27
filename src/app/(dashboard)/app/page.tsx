"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import Header from "@/src/ui/components/layout/Header";
import SonaeModal from "@/src/ui/components/feedback/SonaeModal";

type Item = { title: string; body: string };

/**
 * The pitch, drawn once.
 *
 * The page said "we have already built the layer underneath your product" in
 * thirty-five paragraphs of prose. It is one picture: your product on top, and
 * the bands it stands on. Everything below this diagram is detail on a shape
 * the reader has already understood.
 *
 * Inline SVG, so it takes the theme's own colours and nothing has to be fetched
 * to draw the page.
 */
function LayersDiagram({ yours, yoursLabel, platform, rows }: {
  yours: string;
  yoursLabel: string;
  platform: string;
  rows: Item[];
}) {
  const rowHeight = 46;
  const gap = 8;
  const topHeight = 74;
  const width = 560;
  const height = topHeight + gap + rows.length * (rowHeight + gap);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-auto w-full"
      role="img"
      aria-label={`${yours} sits on top of ${platform}: ${rows.map((row) => row.title).join(", ")}`}
    >
      {/* Yours: solid, branded, and wider than the rest so it reads as the
          thing on top rather than another band in the stack. */}
      <g>
        <rect x="0" y="0" width={width} height={topHeight} rx="14" className="fill-brand/15 stroke-brand/55" strokeWidth="1.5" />
        <text x="24" y="32" className="fill-foreground text-[15px] font-semibold">{yours}</text>
        <text x="24" y="54" className="fill-secondary text-[12px]">{yoursLabel}</text>
        <text x={width - 24} y="34" textAnchor="end" className="fill-brand text-[11px] font-mono uppercase tracking-[0.16em]">
          You
        </text>
      </g>

      {rows.map((row, index) => {
        const y = topHeight + gap + index * (rowHeight + gap);
        return (
          <g key={row.title}>
            <rect x="0" y={y} width={width} height={rowHeight} rx="12" className="fill-foreground/[0.06] stroke-border-dim" strokeWidth="1.5" />
            <circle cx="26" cy={y + rowHeight / 2} r="4" className="fill-brand/70" />
            <text x="44" y={y + 20} className="fill-foreground text-[13px] font-medium">{row.title}</text>
            <text x="44" y={y + 36} className="fill-muted text-[11px]">{row.body}</text>
            {index === 0 ? (
              <text x={width - 24} y={y + 27} textAnchor="end" className="fill-muted text-[11px] font-mono uppercase tracking-[0.16em]">
                {platform}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Drawings, not icons.
 *
 * Every one of the thirty-five cards carried the same 20px glyph in the same
 * corner, which is what made the page read as a wall however good the words
 * were. These show the idea instead of decorating it.
 */
function Art({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 120 72" role="presentation" className="h-[72px] w-[120px] shrink-0">
      {children}
    </svg>
  );
}

function AnyModelArt() {
  return (
    <Art>
      <circle cx="60" cy="36" r="14" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <path d="M53 36l5 5 9-11" className="stroke-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {[[16, 14], [16, 58], [104, 14], [104, 58]].map(([x, y]) => (
        <g key={`${x}-${y}`}>
          <rect x={x - 12} y={y - 9} width="24" height="18" rx="5" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
          <line x1={x - 6} y1={y} x2={x + 6} y2={y} className="stroke-foreground/25" strokeWidth="2" strokeLinecap="round" />
        </g>
      ))}
      <path d="M28 18l18 12M28 54l18-12M92 18L74 30M92 54L74 42" className="stroke-foreground/20" strokeWidth="1.5" strokeDasharray="3 3" />
    </Art>
  );
}

function KnowledgeArt() {
  return (
    <Art>
      <rect x="8" y="10" width="44" height="54" rx="5" className="fill-foreground/5 stroke-foreground/15" strokeWidth="1.5" />
      <rect x="18" y="4" width="44" height="54" rx="5" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
      <line x1="27" y1="18" x2="52" y2="18" className="stroke-foreground/25" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="27" x2="46" y2="27" className="stroke-brand" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="36" x2="53" y2="36" className="stroke-foreground/25" strokeWidth="2" strokeLinecap="round" />
      <line x1="27" y1="45" x2="41" y2="45" className="stroke-foreground/25" strokeWidth="2" strokeLinecap="round" />
      <path d="M74 34h20" className="stroke-brand/50" strokeWidth="2" strokeDasharray="3 3" strokeLinecap="round" />
      <circle cx="104" cy="34" r="12" className="fill-brand/12 stroke-brand/45" strokeWidth="1.5" />
      <path d="M99 34l4 4 7-8" className="stroke-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Art>
  );
}

function AgentArt() {
  return (
    <Art>
      <path d="M28 20h26M66 20h26M28 52h26M66 52h26M28 20v32" className="stroke-foreground/20" strokeWidth="1.5" strokeDasharray="4 4" />
      <rect x="6" y="8" width="24" height="24" rx="7" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <rect x="48" y="8" width="24" height="24" rx="7" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
      <rect x="90" y="8" width="24" height="24" rx="7" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
      <rect x="48" y="40" width="24" height="24" rx="7" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
      <rect x="90" y="40" width="24" height="24" rx="7" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <path d="M13 20l4 4 7-9" className="stroke-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M97 52l4 4 7-9" className="stroke-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Art>
  );
}

/** An agent stopped at a gate, waiting for a person. */
function ApprovalArt() {
  return (
    <Art>
      <rect x="4" y="24" width="34" height="24" rx="7" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
      <line x1="13" y1="36" x2="29" y2="36" className="stroke-foreground/25" strokeWidth="2" strokeLinecap="round" />
      <line x1="52" y1="8" x2="52" y2="64" className="stroke-brand" strokeWidth="2.5" strokeDasharray="6 5" strokeLinecap="round" />
      <circle cx="52" cy="36" r="9" className="fill-brand/15 stroke-brand" strokeWidth="1.5" />
      <path d="M48 36l3 3 5-6" className="stroke-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <rect x="70" y="24" width="46" height="24" rx="7" className="fill-foreground/5 stroke-foreground/15" strokeWidth="1.5" strokeDasharray="4 4" />
      <line x1="80" y1="36" x2="106" y2="36" className="stroke-foreground/15" strokeWidth="2" strokeLinecap="round" />
    </Art>
  );
}

function WidgetArt() {
  return (
    <Art>
      <rect x="6" y="8" width="74" height="56" rx="7" className="fill-foreground/[0.06] stroke-foreground/20" strokeWidth="1.5" />
      <line x1="6" y1="20" x2="80" y2="20" className="stroke-foreground/15" strokeWidth="1.5" />
      <circle cx="14" cy="14" r="2" className="fill-foreground/25" />
      <circle cx="21" cy="14" r="2" className="fill-foreground/25" />
      <line x1="16" y1="32" x2="58" y2="32" className="stroke-foreground/20" strokeWidth="2" strokeLinecap="round" />
      <line x1="16" y1="42" x2="46" y2="42" className="stroke-foreground/20" strokeWidth="2" strokeLinecap="round" />
      <rect x="62" y="34" width="52" height="32" rx="11" className="fill-brand/15 stroke-brand/50" strokeWidth="1.5" />
      <circle cx="77" cy="50" r="3" className="fill-brand" />
      <circle cx="88" cy="50" r="3" className="fill-brand/60" />
      <circle cx="99" cy="50" r="3" className="fill-brand/35" />
    </Art>
  );
}

function BudgetArt() {
  return (
    <Art>
      <line x1="8" y1="18" x2="112" y2="18" className="stroke-brand" strokeWidth="2" strokeDasharray="5 4" strokeLinecap="round" />
      <text x="112" y="12" textAnchor="end" className="fill-brand text-[9px] font-mono uppercase tracking-widest">limit</text>
      <rect x="14" y="44" width="18" height="20" rx="4" className="fill-brand/30" />
      <rect x="40" y="34" width="18" height="30" rx="4" className="fill-brand/55" />
      <rect x="66" y="24" width="18" height="40" rx="4" className="fill-brand/80" />
      <rect x="92" y="24" width="18" height="40" rx="4" className="fill-foreground/10" />
    </Art>
  );
}

const CAPABILITY_ART = [AnyModelArt, KnowledgeArt, AgentArt, ApprovalArt, WidgetArt, BudgetArt];

function SectionHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="flex max-w-3xl flex-col gap-2">
      <h2 className="text-2xl font-light tracking-tight text-foreground md:text-3xl">{title}</h2>
      {subtitle ? <p className="text-[14px] leading-relaxed text-secondary">{subtitle}</p> : null}
    </div>
  );
}

function CheckMark() {
  return (
    <svg viewBox="0 0 20 20" role="presentation" className="mt-0.5 h-5 w-5 shrink-0">
      <circle cx="10" cy="10" r="9" className="fill-brand/10 stroke-brand/40" strokeWidth="1.5" />
      <path d="M6 10l3 3 5-6" className="stroke-brand" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

/** Three clouds drawn three ways, so they are not one icon printed thrice. */
function CloudArt({ index }: { index: number }) {
  const cloud = "M60 18a17 17 0 0 1 16 12 14 14 0 0 1-2 27H46a16 16 0 0 1-2-31 17 17 0 0 1 16-8z";
  const inner = [
    <path key="a" d="M52 40l6 6 13-15" className="stroke-brand" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
    <path key="b" d="M44 62c11 5 32 5 43 0" className="stroke-brand" strokeWidth="2.5" strokeLinecap="round" fill="none" />,
    <path key="c" d="M57 26L43 52h16l-4 11 21-27H59z" className="fill-brand/70" />,
  ];
  return (
    <svg viewBox="0 0 120 72" role="presentation" className="h-[72px] w-[120px] shrink-0">
      <path d={cloud} className={index === 0 ? "fill-brand/12 stroke-brand/45" : "fill-foreground/5 stroke-foreground/25"} strokeWidth="1.5" />
      {inner[index % inner.length]}
    </svg>
  );
}

/**
 * What Sonae already has, presented rather than listed.
 *
 * Same intent as before: this page tells a reader what the platform gives them.
 * What changed is that thirty-five cards covering roughly a dozen ideas became
 * twenty-one that each say something once — checks were described in three
 * separate sections, and sensitive-data handling and activity history each had
 * two homes. The model list is gone in favour of the actual claim, which is that
 * Sonae is not tied to one vendor, and the graded checks, run timelines,
 * approvals and health alerts built since are on the page for the first time.
 */
export default function AppDashboardPage() {
  const t = useTranslations("dashboard");
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);

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
  const capabilities = t.raw("capabilities.items") as Item[];
  const control = t.raw("control.items") as Item[];
  const proof = t.raw("proof.items") as Item[];
  const hosting = t.raw("hosting.items") as Item[];
  const useCases = t.raw("useCases.items") as Item[];

  return (
    <div className="flex flex-col gap-12 pb-16">
      <Header onOpenModal={() => setIsModalOpen(true)} />

      <section className="relative overflow-hidden rounded-[28px] border border-border-dim bg-sidebar/40 p-8 md:p-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,90,31,0.16),transparent_48%)]" />
        <div className="relative z-10 grid gap-10 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="flex flex-col gap-5">
            <span className="font-mono text-[12px] uppercase tracking-[0.16em] text-brand">{t("hero.eyebrow")}</span>
            <h1 className="text-3xl font-light leading-tight tracking-tight text-foreground md:text-5xl">
              {t("hero.title")}
            </h1>
            <p className="max-w-xl text-[16px] font-light leading-relaxed text-secondary">{t("hero.body")}</p>
            <div className="mt-2 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => router.push("/app/assistant")}
                className="inline-flex h-[48px] items-center gap-2 rounded-full bg-foreground px-6 text-[14px] font-semibold text-background transition-opacity hover:opacity-90"
              >
                {t("hero.primaryAction")}
                <ArrowRight className="h-4 w-4" />
              </button>
              <a
                href="#included"
                className="inline-flex h-[48px] items-center rounded-full border border-border-dim px-6 text-[14px] font-medium text-foreground transition-colors hover:bg-foreground/5"
              >
                {t("hero.secondaryAction")}
              </a>
            </div>
          </div>

          {/* The whole argument in one picture, beside the words making it. */}
          <div className="flex flex-col gap-3">
            <span className="text-[13px] text-secondary">{t("layers.title")}</span>
            <LayersDiagram
              yours={t("layers.yours")}
              yoursLabel={t("layers.yoursLabel")}
              platform={t("layers.platform")}
              rows={layerRows}
            />
          </div>
        </div>
      </section>

      <section id="included" className="flex scroll-mt-8 flex-col gap-5">
        <SectionHeading title={t("capabilities.title")} subtitle={t("capabilities.subtitle")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {capabilities.map((item, index) => {
            const Drawing = CAPABILITY_ART[index % CAPABILITY_ART.length];
            return (
              <article key={item.title} className="flex flex-col gap-4 rounded-[20px] border border-border-dim bg-card/40 p-6 transition-colors hover:border-brand/30">
                <Drawing />
                <div className="flex flex-col gap-2">
                  <h3 className="text-[16px] font-semibold text-foreground">{item.title}</h3>
                  <p className="text-[13px] leading-relaxed text-secondary">{item.body}</p>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* A numbered list, deliberately not another card grid, so the page has a
          rhythm rather than one shape repeated to the bottom. */}
      <section className="flex flex-col gap-5">
        <SectionHeading title={t("control.title")} subtitle={t("control.subtitle")} />
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 md:grid-cols-2">
          {control.map((item, index) => (
            <div key={item.title} className="flex items-start gap-4 border-t border-border-dim pt-5">
              <span className="mt-0.5 font-mono text-[12px] text-brand">{String(index + 1).padStart(2, "0")}</span>
              <div className="min-w-0">
                <h3 className="text-[15px] font-semibold text-foreground">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-relaxed text-secondary">{item.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-[28px] border border-border-dim bg-sidebar/30 p-8 md:p-10">
        <div className="grid gap-10 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
          <div className="flex flex-col gap-5">
            <SectionHeading title={t("proof.title")} subtitle={t("proof.subtitle")} />
            <div className="flex items-baseline gap-3">
              <span className="text-[48px] font-light leading-none text-brand">{t("proof.statValue")}</span>
              <span className="max-w-[170px] text-[12px] leading-relaxed text-secondary">{t("proof.statLabel")}</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            {proof.map((item) => (
              <div key={item.title} className="flex items-start gap-3">
                <CheckMark />
                <div className="min-w-0">
                  <h3 className="text-[14px] font-semibold text-foreground">{item.title}</h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-secondary">{item.body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading title={t("hosting.title")} subtitle={t("hosting.subtitle")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {hosting.map((item, index) => (
            <article key={item.title} className="flex flex-col gap-4 rounded-[20px] border border-border-dim bg-card/40 p-6">
              <CloudArt index={index} />
              <div>
                <h3 className="text-[16px] font-semibold text-foreground">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-secondary">{item.body}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-5">
        <SectionHeading title={t("useCases.title")} subtitle={t("useCases.subtitle")} />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {useCases.map((item, index) => (
            <article key={item.title} className="relative overflow-hidden rounded-[20px] border border-border-dim bg-card/40 p-6">
              <span className="pointer-events-none absolute -right-2 -top-6 font-mono text-[68px] leading-none text-brand/10">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="relative z-10 text-[16px] font-semibold text-foreground">{item.title}</h3>
              <p className="relative z-10 mt-2 text-[13px] leading-relaxed text-secondary">{item.body}</p>
            </article>
          ))}
        </div>
      </section>

      <SonaeModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Sonae">
        <p className="text-[13px] leading-relaxed text-secondary">{t("hero.body")}</p>
      </SonaeModal>
    </div>
  );
}
