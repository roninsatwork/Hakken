"use client";

import { useId, useState } from "react";
import { Activity, Bot, Database, Link2 } from "lucide-react";

const ACCENT = "#b9dcc4"; // Properties sage
const LINK = "#b9dcc4";
const AGENT = "#ffb38a";
const DATA = "#8fb8e0";
const LOGS = "#f0d8a8";

type JourneyGroup = "link" | "agent" | "data" | "logs";

// ---------------------------------------------------------------------------
// The interactive journey: one Rightmove link travelling down the pipeline —
// browser → agent → listings → logs. viewBox 0 0 420 640.
// ---------------------------------------------------------------------------

const LEGEND: {
  group: JourneyGroup;
  icon: typeof Link2;
  label: string;
  count: string;
  tint: string;
  description: string;
}[] = [
  {
    group: "link",
    icon: Link2,
    label: "Paste a link",
    count: "Search",
    tint: LINK,
    description:
      "Build your search on Rightmove itself — area, price range, bedrooms, radius — then copy the address of the results page and paste it in. That one link describes everything to collect.",
  },
  {
    group: "agent",
    icon: Bot,
    label: "The agent takes over",
    count: "Runs on Apify",
    tint: AGENT,
    description:
      "The Rightmove Agent reads your link and hands the heavy lifting to Apify, the industry-standard scraping platform. You set the ceiling — anywhere from 10 to 1,000 listings.",
  },
  {
    group: "data",
    icon: Database,
    label: "Listings captured",
    count: "Scraped Data",
    tint: DATA,
    description:
      "Each listing lands in Scraped Data with its full details and photo — searchable, browsable, and one click from a complete view.",
  },
  {
    group: "logs",
    icon: Activity,
    label: "Watch it live",
    count: "Logs",
    tint: LOGS,
    description:
      "Every run appears in Logs with its live status — in progress, completed or failed — and a count of what it captured. No refreshing, no guessing.",
  },
];

const DEFAULT_DESCRIPTION =
  "Four stages, one journey — from a link you paste to a library you own.";

function groupOpacity(selected: JourneyGroup | null, group: JourneyGroup) {
  if (selected === null) return 1;
  return selected === group ? 1 : 0.12;
}

function Connector({ y1, y2 }: { y1: number; y2: number }) {
  return (
    <g opacity={0.5}>
      <line
        x1={210}
        y1={y1}
        x2={210}
        y2={y2 - 6}
        style={{ stroke: "var(--color-secondary)" }}
        strokeWidth={1.5}
        strokeDasharray="3 5"
      />
      <path
        d={`M205 ${y2 - 8} L210 ${y2 - 2} L215 ${y2 - 8}`}
        fill="none"
        style={{ stroke: "var(--color-secondary)" }}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

function StageTag({ y, children }: { y: number; children: string }) {
  return (
    <text
      x={210}
      y={y}
      textAnchor="middle"
      style={{ fill: "var(--color-muted)" }}
      fontSize={7.5}
      letterSpacing={1.6}
      fontFamily="ui-monospace, monospace"
    >
      {children}
    </text>
  );
}

// A tiny house glyph for the listing card image areas.
function HouseGlyph({ cx, cy, tint }: { cx: number; cy: number; tint: string }) {
  return (
    <g stroke={tint} strokeWidth={1.6} fill="none" strokeLinejoin="round">
      <path d={`M${cx - 11} ${cy + 1} L${cx} ${cy - 8} L${cx + 11} ${cy + 1}`} />
      <path
        d={`M${cx - 7.5} ${cy - 1} V${cy + 9} H${cx + 7.5} V${cy - 1}`}
        strokeLinecap="round"
      />
    </g>
  );
}

export function CollectionJourney() {
  const [selected, setSelected] = useState<JourneyGroup | null>(null);
  const glowId = useId();

  const linkO = groupOpacity(selected, "link");
  const agentO = groupOpacity(selected, "agent");
  const dataO = groupOpacity(selected, "data");
  const logsO = groupOpacity(selected, "logs");
  const fade = { transition: "opacity 300ms ease" };

  return (
    <div className="grid lg:grid-cols-2 gap-2">
      <div className="flex items-center justify-center p-6 bg-background/40">
        <svg
          viewBox="0 0 420 640"
          className="w-full h-auto max-w-[400px] mx-auto"
          role="img"
          aria-label="The collection journey: a Rightmove search link travels to the agent, becomes property listings, and is tracked in the run logs"
        >
          <defs>
            <filter id={glowId} x="-80%" y="-80%" width="260%" height="260%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          {/* Stage 1 — the Rightmove search in your browser */}
          <g style={{ ...fade, opacity: linkO }}>
            <rect
              x={70}
              y={24}
              width={280}
              height={88}
              rx={12}
              fill="currentColor"
              className="text-foreground"
              opacity={0.04}
            />
            <rect
              x={70}
              y={24}
              width={280}
              height={88}
              rx={12}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1.5}
            />
            {[86, 98, 110].map((cx) => (
              <circle
                key={cx}
                cx={cx}
                cy={38}
                r={3}
                style={{ fill: "var(--color-secondary)" }}
                opacity={0.4}
              />
            ))}
            <rect
              x={84}
              y={52}
              width={252}
              height={22}
              rx={11}
              fill={LINK}
              opacity={0.12}
              filter={selected === "link" ? `url(#${glowId})` : undefined}
            />
            <rect
              x={84}
              y={52}
              width={252}
              height={22}
              rx={11}
              fill="none"
              stroke={LINK}
              strokeWidth={1.2}
              opacity={0.7}
            />
            <text
              x={96}
              y={66.5}
              fontSize={9}
              fontFamily="ui-monospace, monospace"
              style={{ fill: "var(--color-secondary)" }}
            >
              rightmove.co.uk/property-for-sale/…
            </text>
            {/* Filter pills — the search you shaped on Rightmove */}
            {[
              { x: 84, w: 72 },
              { x: 164, w: 56 },
              { x: 228, w: 64 },
            ].map((pill) => (
              <rect
                key={pill.x}
                x={pill.x}
                y={84}
                width={pill.w}
                height={16}
                rx={8}
                style={{ fill: "var(--color-secondary)" }}
                opacity={0.2}
              />
            ))}
          </g>

          <Connector y1={116} y2={150} />

          {/* Stage 2 — the Rightmove Agent */}
          <g style={{ ...fade, opacity: agentO }}>
            <circle
              cx={210}
              cy={196}
              r={42}
              fill="none"
              stroke={AGENT}
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.6}
            />
            <g filter={selected === "agent" ? `url(#${glowId})` : undefined}>
              <line
                x1={210}
                y1={178}
                x2={210}
                y2={166}
                stroke={AGENT}
                strokeWidth={1.6}
              />
              <circle cx={210} cy={163} r={3} fill={AGENT} />
              <rect
                x={188}
                y={178}
                width={44}
                height={34}
                rx={10}
                fill={AGENT}
                opacity={0.16}
              />
              <rect
                x={188}
                y={178}
                width={44}
                height={34}
                rx={10}
                fill="none"
                stroke={AGENT}
                strokeWidth={1.6}
              />
              <circle cx={201} cy={195} r={4} fill={AGENT} />
              <circle cx={219} cy={195} r={4} fill={AGENT} />
            </g>
            {/* Sparks of activity around the agent */}
            {[
              [162, 168],
              [259, 224],
              [256, 165],
            ].map(([x, y]) => (
              <path
                key={`${x}-${y}`}
                d={`M${x} ${y - 4} L${x + 1.2} ${y - 1.2} L${x + 4} ${y} L${x + 1.2} ${y + 1.2} L${x} ${y + 4} L${x - 1.2} ${y + 1.2} L${x - 4} ${y} L${x - 1.2} ${y - 1.2} Z`}
                fill={AGENT}
                opacity={0.7}
              />
            ))}
            <StageTag y={252}>RIGHTMOVE AGENT · APIFY</StageTag>
          </g>

          <Connector y1={258} y2={288} />

          {/* Stage 3 — listings arriving as data */}
          <g style={{ ...fade, opacity: dataO }}>
            {[72, 166, 260].map((x, i) => (
              <g key={x}>
                <rect
                  x={x}
                  y={296}
                  width={88}
                  height={112}
                  rx={10}
                  fill="currentColor"
                  className="text-foreground"
                  opacity={0.04}
                />
                <rect
                  x={x}
                  y={296}
                  width={88}
                  height={112}
                  rx={10}
                  fill="none"
                  style={{ stroke: "var(--color-border-dim)" }}
                  strokeWidth={1.2}
                />
                <rect
                  x={x + 6}
                  y={302}
                  width={76}
                  height={48}
                  rx={6}
                  fill={DATA}
                  opacity={0.14}
                  filter={selected === "data" ? `url(#${glowId})` : undefined}
                />
                <HouseGlyph cx={x + 44} cy={326} tint={DATA} />
                <rect
                  x={x + 8}
                  y={360}
                  width={64}
                  height={5}
                  rx={2.5}
                  style={{ fill: "var(--color-secondary)" }}
                  opacity={0.45}
                />
                <rect
                  x={x + 8}
                  y={370}
                  width={44 + i * 6}
                  height={4}
                  rx={2}
                  style={{ fill: "var(--color-secondary)" }}
                  opacity={0.3}
                />
                <rect
                  x={x + 8}
                  y={384}
                  width={40}
                  height={10}
                  rx={5}
                  fill={DATA}
                  opacity={0.85}
                  filter={selected === "data" ? `url(#${glowId})` : undefined}
                />
                <rect
                  x={x + 54}
                  y={385}
                  width={26}
                  height={8}
                  rx={4}
                  fill="none"
                  style={{ stroke: "var(--color-border-dim)" }}
                  strokeWidth={1}
                />
              </g>
            ))}
          </g>

          <Connector y1={414} y2={452} />

          {/* Stage 4 — the run logs */}
          <g style={{ ...fade, opacity: logsO }}>
            <rect
              x={70}
              y={458}
              width={280}
              height={156}
              rx={12}
              fill="currentColor"
              className="text-foreground"
              opacity={0.04}
            />
            <rect
              x={70}
              y={458}
              width={280}
              height={156}
              rx={12}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1.5}
            />
            <text
              x={86}
              y={482}
              style={{ fill: "var(--color-muted)" }}
              fontSize={7.5}
              letterSpacing={1.6}
              fontFamily="ui-monospace, monospace"
            >
              EXTRACTION LOGS
            </text>
            {[
              { y: 504, dot: "#22c55e", pending: false, idW: 92, countW: 30 },
              { y: 540, dot: "#22c55e", pending: false, idW: 84, countW: 36 },
              { y: 576, dot: "#facc15", pending: true, idW: 98, countW: 24 },
            ].map((row) => (
              <g key={row.y}>
                {row.pending && (
                  <circle
                    cx={96}
                    cy={row.y}
                    r={9}
                    fill="none"
                    stroke={row.dot}
                    strokeWidth={1}
                    strokeDasharray="2 3"
                    opacity={0.7}
                  />
                )}
                <circle
                  cx={96}
                  cy={row.y}
                  r={5}
                  fill={row.dot}
                  filter={selected === "logs" ? `url(#${glowId})` : undefined}
                />
                <rect
                  x={112}
                  y={row.y - 3.5}
                  width={row.idW}
                  height={7}
                  rx={3.5}
                  fill={LOGS}
                  opacity={0.5}
                />
                <rect
                  x={334 - row.countW}
                  y={row.y - 3}
                  width={row.countW}
                  height={6}
                  rx={3}
                  style={{ fill: "var(--color-secondary)" }}
                  opacity={0.45}
                />
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="flex flex-col justify-center gap-5 p-7">
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: ACCENT }}
          >
            From link to library
          </span>
          <h2 className="text-xl font-semibold text-foreground">
            One link in, a property library out
          </h2>
          <p className="text-[14px] text-secondary leading-relaxed">
            You don&apos;t fill in forms or copy listings by hand. You describe
            what you want with a Rightmove search, and the pipeline does the
            rest — collecting, filing and reporting as it goes.
          </p>
          <p className="text-[12px] text-muted">
            Select a stage to see what happens there.
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {LEGEND.map((item) => {
            const isActive = selected === item.group;
            return (
              <button
                key={item.group}
                type="button"
                aria-pressed={isActive}
                onClick={() => setSelected(isActive ? null : item.group)}
                className={`flex items-center gap-3 rounded-[12px] border px-3 py-2.5 text-left transition-all ${
                  isActive
                    ? "bg-card"
                    : "border-border-dim bg-card/50 hover:bg-card/80"
                }`}
                style={
                  isActive
                    ? { borderColor: `${item.tint}80`, boxShadow: `0 0 18px ${item.tint}26` }
                    : undefined
                }
              >
                <item.icon className="w-5 h-5 shrink-0" style={{ color: item.tint }} />
                <div className="min-w-0">
                  <div className="text-[13px] font-medium text-foreground truncate">
                    {item.label}
                  </div>
                  <div className="text-[12px] text-secondary tabular-nums">
                    {item.count}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Description of the selected stage */}
        {(() => {
          const active = LEGEND.find((item) => item.group === selected) ?? null;
          return (
            <div
              className="rounded-[12px] border border-border-dim bg-card/40 px-4 py-3.5 min-h-[86px] flex items-center gap-3 transition-colors"
              style={active ? { borderColor: `${active.tint}4d` } : undefined}
              aria-live="polite"
            >
              {active && (
                <active.icon
                  className="w-5 h-5 shrink-0"
                  style={{ color: active.tint }}
                />
              )}
              <p
                key={active?.group ?? "all"}
                className={`text-[13px] leading-relaxed ${active ? "text-foreground/90" : "text-secondary"}`}
              >
                {active ? active.description : DEFAULT_DESCRIPTION}
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Four-step collection flow.
// ---------------------------------------------------------------------------

type FlowStep = {
  title: string;
  body: string;
};

const FLOW: FlowStep[] = [
  {
    title: "Search on Rightmove",
    body: "Use Rightmove's own filters to describe exactly the properties you care about.",
  },
  {
    title: "Paste the link",
    body: "Drop the search URL in, choose how many listings to gather, and press go.",
  },
  {
    title: "The agent collects",
    body: "The extraction kicks off on its own — no tabs to babysit.",
  },
  {
    title: "Browse your library",
    body: "Listings arrive in Scraped Data, with every run tracked in Logs.",
  },
];

export function CollectionFlow() {
  const gradientId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {FLOW.map((step, index) => (
        <div
          key={step.title}
          className="relative flex flex-col gap-2 rounded-[16px] border border-border-dim bg-card/60 p-4 backdrop-blur-xl"
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: "rgba(185,220,196,0.15)", color: ACCENT }}
            >
              {index + 1}
            </span>
            {index < FLOW.length - 1 && (
              <svg
                className="hidden lg:block absolute -right-3 top-6 h-4 w-6"
                viewBox="0 0 24 16"
                aria-hidden
              >
                <defs>
                  <linearGradient id={`${gradientId}-${index}`} x1="0" x2="1">
                    <stop offset="0" stopColor={ACCENT} stopOpacity="0.6" />
                    <stop offset="1" stopColor={ACCENT} stopOpacity="0.1" />
                  </linearGradient>
                </defs>
                <path
                  d="M0 8 H18 M13 3 L19 8 L13 13"
                  fill="none"
                  stroke={`url(#${gradientId}-${index})`}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            )}
          </div>
          <h3 className="text-[15px] font-semibold text-foreground">{step.title}</h3>
          <p className="text-[13px] leading-relaxed text-secondary">{step.body}</p>
        </div>
      ))}
    </div>
  );
}
