"use client";

import { useId, useState } from "react";
import { useTranslations } from "next-intl";
import {
  BookOpen,
  Brain,
  ClipboardList,
  FileCheck,
  LineChart,
  Newspaper,
  ShieldAlert,
} from "lucide-react";

const ACCENT = "#f0d8a8"; // Board Reports gold
const STORY = "#f0d8a8";
const NUMBERS = "#8fb8e0";
const RISKS = "#eda4a4";
const ACTIONS = "#a9d7b6";
const PIPELINE = "#8fb8e0";
const KNOWLEDGE = "#b9dcc4";
const MEMORY = "#c7bfe6";
const REPORT = "#f0d8a8";

// The amber ramp the real risk radar uses for its three tiers, each read
// alongside its own written tier name rather than by colour alone.
const RISK_AMBER = "#fbbf24";
const RISK_QUIET = "var(--color-secondary)";

type ReportGroup = "story" | "numbers" | "risks" | "actions";

// ---------------------------------------------------------------------------
// The interactive anatomy: a wireframe of the real board report, viewBox
// 0 0 420 560. Regions mirror the eight sections of the generated report.
// ---------------------------------------------------------------------------

const LEGEND: {
  group: ReportGroup;
  icon: typeof Newspaper;
  tint: string;
}[] = [
  { group: "story", icon: Newspaper, tint: STORY },
  { group: "numbers", icon: LineChart, tint: NUMBERS },
  { group: "risks", icon: ShieldAlert, tint: RISKS },
  { group: "actions", icon: ClipboardList, tint: ACTIONS },
];

const RISK_ROWS: {
  y: number;
  tier: "critical" | "atRisk" | "quiet";
  fill: string;
  dotOpacity: number;
  barWidth: number;
}[] = [
  { y: 332, tier: "critical", fill: RISK_AMBER, dotOpacity: 1, barWidth: 96 },
  { y: 364, tier: "atRisk", fill: RISK_AMBER, dotOpacity: 0.45, barWidth: 110 },
  { y: 396, tier: "quiet", fill: RISK_QUIET, dotOpacity: 0.5, barWidth: 88 },
];

function groupOpacity(selected: ReportGroup | null, group: ReportGroup) {
  if (selected === null) return 1;
  return selected === group ? 1 : 0.12;
}

function SectionTag({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x}
      y={y}
      style={{ fill: "var(--color-muted)" }}
      fontSize={7.5}
      letterSpacing={1.6}
      fontFamily="ui-monospace, monospace"
    >
      {children}
    </text>
  );
}

export function ReportAnatomy() {
  const t = useTranslations("salesReports.information.visuals");
  const [selected, setSelected] = useState<ReportGroup | null>(null);
  const glowId = useId();

  const storyO = groupOpacity(selected, "story");
  const numbersO = groupOpacity(selected, "numbers");
  const risksO = groupOpacity(selected, "risks");
  const actionsO = groupOpacity(selected, "actions");
  const fade = { transition: "opacity 300ms ease" };

  return (
    <div className="grid lg:grid-cols-2 gap-2">
      <div className="flex items-center justify-center p-6 bg-background/40">
        <svg
          viewBox="0 0 420 560"
          className="w-full h-auto max-w-[400px] mx-auto"
          role="img"
          aria-label={t("wireframe")}
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

          {/* The report page itself */}
          <rect
            x={70}
            y={22}
            width={280}
            height={516}
            rx={16}
            fill="currentColor"
            className="text-foreground"
            opacity={0.04}
          />
          <rect
            x={70}
            y={22}
            width={280}
            height={516}
            rx={16}
            fill="none"
            style={{ stroke: "var(--color-border-dim)" }}
            strokeWidth={1.5}
          />

          {/* Section 1 — headline + executive summary */}
          <g style={{ ...fade, opacity: storyO }}>
            <SectionTag x={90} y={54}>
              {t("wireframeTags.headline")}
            </SectionTag>
            <rect
              x={90}
              y={64}
              width={172}
              height={11}
              rx={5.5}
              fill={STORY}
              filter={selected === "story" ? `url(#${glowId})` : undefined}
            />
            {[
              [86, 240],
              [97, 218],
              [108, 152],
            ].map(([y, w]) => (
              <rect
                key={y}
                x={90}
                y={y}
                width={w}
                height={5}
                rx={2.5}
                style={{ fill: "var(--color-secondary)" }}
                opacity={0.35}
              />
            ))}
          </g>

          {/* Sections 2–4 — KPIs + charts */}
          <g style={{ ...fade, opacity: numbersO }}>
            <SectionTag x={90} y={140}>
              {t("wireframeTags.numbers")}
            </SectionTag>
            {[90, 172, 254].map((x) => (
              <g key={x}>
                <rect
                  x={x}
                  y={148}
                  width={76}
                  height={42}
                  rx={8}
                  fill="currentColor"
                  className="text-foreground"
                  opacity={0.05}
                />
                <rect
                  x={x}
                  y={148}
                  width={76}
                  height={42}
                  rx={8}
                  fill="none"
                  style={{ stroke: "var(--color-border-dim)" }}
                  strokeWidth={1}
                />
                <rect
                  x={x + 10}
                  y={158}
                  width={36}
                  height={8}
                  rx={3}
                  fill={NUMBERS}
                  opacity={0.9}
                  filter={selected === "numbers" ? `url(#${glowId})` : undefined}
                />
                <rect
                  x={x + 10}
                  y={172}
                  width={48}
                  height={4}
                  rx={2}
                  style={{ fill: "var(--color-secondary)" }}
                  opacity={0.35}
                />
              </g>
            ))}
            <rect
              x={90}
              y={198}
              width={240}
              height={94}
              rx={10}
              fill="currentColor"
              className="text-foreground"
              opacity={0.04}
            />
            <rect
              x={90}
              y={198}
              width={240}
              height={94}
              rx={10}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1}
            />
            {[224, 248, 272].map((y) => (
              <line
                key={y}
                x1={98}
                y1={y}
                x2={322}
                y2={y}
                style={{ stroke: "var(--color-secondary)" }}
                strokeWidth={0.75}
                strokeDasharray="2 4"
                opacity={0.25}
              />
            ))}
            <path
              d="M98 272 C130 252 150 262 178 242 C206 224 232 238 258 216 C284 202 302 210 322 206 L322 284 L98 284 Z"
              fill={NUMBERS}
              opacity={0.16}
            />
            <path
              d="M98 272 C130 252 150 262 178 242 C206 224 232 238 258 216 C284 202 302 210 322 206"
              fill="none"
              stroke={NUMBERS}
              strokeWidth={2}
              strokeLinecap="round"
              filter={selected === "numbers" ? `url(#${glowId})` : undefined}
            />
            <path
              d="M98 280 C132 268 158 274 186 260 C214 248 244 254 274 240 C296 230 310 234 322 230"
              fill="none"
              stroke={NUMBERS}
              strokeWidth={1.2}
              strokeLinecap="round"
              opacity={0.4}
            />
          </g>

          {/* Section 5 — risk radar */}
          <g style={{ ...fade, opacity: risksO }}>
            <SectionTag x={90} y={314}>
              {t("wireframeTags.riskRadar")}
            </SectionTag>
            {RISK_ROWS.map((row) => (
              <g key={row.y}>
                <circle
                  cx={100}
                  cy={row.y}
                  r={5}
                  style={{ fill: row.fill }}
                  opacity={row.dotOpacity}
                  filter={selected === "risks" ? `url(#${glowId})` : undefined}
                />
                <text
                  x={114}
                  y={row.y + 2.5}
                  style={{ fill: "var(--color-muted)" }}
                  fontSize={7.5}
                  letterSpacing={1.2}
                  fontFamily="ui-monospace, monospace"
                >
                  {t(`riskTiers.${row.tier}`)}
                </text>
                <rect
                  x={322 - row.barWidth}
                  y={row.y - 2.5}
                  width={row.barWidth}
                  height={5}
                  rx={2.5}
                  fill={RISKS}
                  opacity={0.55}
                />
              </g>
            ))}
          </g>

          {/* Sections 6–8 — team, patterns, priorities */}
          <g style={{ ...fade, opacity: actionsO }}>
            <SectionTag x={90} y={428}>
              {t("wireframeTags.thisWeek")}
            </SectionTag>
            {[
              { y: 450, w: 190 },
              { y: 484, w: 164 },
              { y: 518, w: 204 },
            ].map((row, i) => (
              <g key={row.y}>
                <circle
                  cx={101}
                  cy={row.y}
                  r={9}
                  style={{ fill: "var(--color-background)" }}
                  stroke={ACTIONS}
                  strokeWidth={1.5}
                  filter={selected === "actions" ? `url(#${glowId})` : undefined}
                />
                <text
                  x={101}
                  y={row.y + 3}
                  textAnchor="middle"
                  fontSize={9}
                  fontWeight={700}
                  fill={ACTIONS}
                >
                  {i + 1}
                </text>
                <rect
                  x={120}
                  y={row.y - 3.5}
                  width={row.w}
                  height={7}
                  rx={3.5}
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
            {t("anatomyKicker")}
          </span>
          <h2 className="text-xl font-semibold text-foreground">
            {t("anatomyTitle")}
          </h2>
          <p className="text-[14px] text-secondary leading-relaxed">
            {t("anatomyBody")}
          </p>
          <p className="text-[12px] text-muted">
            {t("anatomyHint")}
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
                    {t(`anatomy.${item.group}.label`)}
                  </div>
                  <div className="text-[12px] text-secondary tabular-nums">
                    {t(`anatomy.${item.group}.count`)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Description of the selected part */}
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
                {active ? t(`anatomy.${active.group}.description`) : t("anatomy.defaultDescription")}
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The hero: the report agent at the centre of everything it draws on —
// your pipeline, your company's knowledge, its own memory — and the report
// it writes from them. viewBox 0 0 420 560.
// ---------------------------------------------------------------------------

type SourceGroup = "pipeline" | "knowledge" | "memory" | "report";

const SOURCE_LEGEND: {
  group: SourceGroup;
  icon: typeof LineChart;
  tint: string;
}[] = [
  { group: "pipeline", icon: LineChart, tint: PIPELINE },
  { group: "knowledge", icon: BookOpen, tint: KNOWLEDGE },
  { group: "memory", icon: Brain, tint: MEMORY },
  { group: "report", icon: FileCheck, tint: REPORT },
];

function sourceOpacity(selected: SourceGroup | null, group: SourceGroup) {
  if (selected === null) return 1;
  return selected === group ? 1 : 0.12;
}

function NodeTag({ x, y, children }: { x: number; y: number; children: string }) {
  return (
    <text
      x={x}
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

function FlowArrow({
  x1,
  y1,
  x2,
  y2,
  angle,
  tint,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  angle: number;
  tint?: string;
}) {
  const stroke = tint ? { stroke: tint } : { stroke: "var(--color-secondary)" };
  return (
    <g opacity={tint ? 0.8 : 0.5}>
      <line
        x1={x1}
        y1={y1}
        x2={x2}
        y2={y2}
        style={stroke}
        strokeWidth={1.5}
        strokeDasharray="3 5"
      />
      <path
        d="M-8 -4 L0 0 L-8 4"
        fill="none"
        style={stroke}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        transform={`translate(${x2} ${y2}) rotate(${angle})`}
      />
    </g>
  );
}

export function AgentSources() {
  const t = useTranslations("salesReports.information.visuals");
  const [selected, setSelected] = useState<SourceGroup | null>(null);
  const glowId = useId();

  const pipelineO = sourceOpacity(selected, "pipeline");
  const knowledgeO = sourceOpacity(selected, "knowledge");
  const memoryO = sourceOpacity(selected, "memory");
  const reportO = sourceOpacity(selected, "report");
  const fade = { transition: "opacity 300ms ease" };

  return (
    <div className="grid lg:grid-cols-2 gap-2">
      <div className="flex items-center justify-center p-6 bg-background/40">
        <svg
          viewBox="0 0 420 560"
          className="w-full h-auto max-w-[400px] mx-auto"
          role="img"
          aria-label={t("agentCentre")}
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

          {/* Your pipeline — every deal, read in full */}
          <g style={{ ...fade, opacity: pipelineO }}>
            <rect
              x={54}
              y={62}
              width={124}
              height={88}
              rx={10}
              fill="currentColor"
              className="text-foreground"
              opacity={0.04}
            />
            <rect
              x={54}
              y={62}
              width={124}
              height={88}
              rx={10}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1.2}
            />
            <rect
              x={66}
              y={74}
              width={44}
              height={5}
              rx={2.5}
              style={{ fill: "var(--color-secondary)" }}
              opacity={0.5}
            />
            {[92, 112, 132].map((y, i) => (
              <g key={y}>
                <circle cx={71} cy={y} r={2.5} fill={PIPELINE} opacity={0.8} />
                <rect
                  x={80}
                  y={y - 3}
                  width={44 - i * 6}
                  height={6}
                  rx={3}
                  style={{ fill: "var(--color-secondary)" }}
                  opacity={0.35}
                />
                <rect
                  x={138}
                  y={y - 3}
                  width={28}
                  height={6}
                  rx={3}
                  fill={PIPELINE}
                  opacity={0.75}
                  filter={selected === "pipeline" ? `url(#${glowId})` : undefined}
                />
              </g>
            ))}
            <NodeTag x={116} y={166}>
              {t("nodeTags.pipeline")}
            </NodeTag>
            <FlowArrow x1={152} y1={154} x2={192} y2={246} angle={66.5} />
          </g>

          {/* Your company's knowledge — with the right passage lit up */}
          <g style={{ ...fade, opacity: knowledgeO }}>
            <rect
              x={246}
              y={72}
              width={84}
              height={88}
              rx={8}
              fill="currentColor"
              className="text-foreground"
              opacity={0.03}
            />
            <rect
              x={246}
              y={72}
              width={84}
              height={88}
              rx={8}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1}
              opacity={0.6}
            />
            <rect
              x={256}
              y={62}
              width={84}
              height={88}
              rx={8}
              style={{ fill: "var(--color-background)" }}
            />
            <rect
              x={256}
              y={62}
              width={84}
              height={88}
              rx={8}
              fill="currentColor"
              className="text-foreground"
              opacity={0.05}
            />
            <rect
              x={256}
              y={62}
              width={84}
              height={88}
              rx={8}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1.2}
            />
            {[76, 88, 112, 124, 136].map((y) => (
              <rect
                key={y}
                x={266}
                y={y}
                width={y === 88 ? 48 : 64}
                height={4.5}
                rx={2.25}
                style={{ fill: "var(--color-secondary)" }}
                opacity={0.3}
              />
            ))}
            {/* The retrieved passage — the one line the agent needed */}
            <rect
              x={266}
              y={98}
              width={64}
              height={6}
              rx={3}
              fill={KNOWLEDGE}
              opacity={0.9}
              filter={selected === "knowledge" ? `url(#${glowId})` : undefined}
            />
            <NodeTag x={296} y={176}>
              {t("nodeTags.knowledge")}
            </NodeTag>
            <FlowArrow x1={272} y1={166} x2={228} y2={246} angle={117.6} />
          </g>

          {/* The agent — always in focus */}
          <g>
            <circle
              cx={210}
              cy={272}
              r={40}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1}
              strokeDasharray="2 5"
              opacity={0.6}
            />
            <line
              x1={210}
              y1={254}
              x2={210}
              y2={242}
              stroke={ACCENT}
              strokeWidth={1.6}
            />
            <circle cx={210} cy={239} r={3} fill={ACCENT} />
            <rect
              x={188}
              y={254}
              width={44}
              height={34}
              rx={10}
              fill={ACCENT}
              opacity={0.16}
            />
            <rect
              x={188}
              y={254}
              width={44}
              height={34}
              rx={10}
              fill="none"
              stroke={ACCENT}
              strokeWidth={1.6}
            />
            <circle cx={201} cy={271} r={4} fill={ACCENT} />
            <circle cx={219} cy={271} r={4} fill={ACCENT} />
            <NodeTag x={210} y={336}>
              {t("nodeTags.agent")}
            </NodeTag>
          </g>

          {/* What it remembers — echoes of past runs */}
          <g style={{ ...fade, opacity: memoryO }}>
            <rect
              x={60}
              y={390}
              width={104}
              height={72}
              rx={10}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1}
              opacity={0.35}
            />
            <rect
              x={68}
              y={398}
              width={104}
              height={72}
              rx={10}
              style={{ fill: "var(--color-background)" }}
            />
            <rect
              x={68}
              y={398}
              width={104}
              height={72}
              rx={10}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1}
              opacity={0.6}
            />
            <rect
              x={76}
              y={406}
              width={104}
              height={72}
              rx={10}
              style={{ fill: "var(--color-background)" }}
            />
            <rect
              x={76}
              y={406}
              width={104}
              height={72}
              rx={10}
              fill="currentColor"
              className="text-foreground"
              opacity={0.05}
            />
            <rect
              x={76}
              y={406}
              width={104}
              height={72}
              rx={10}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1.2}
            />
            <path
              d={`M96 424 L97.5 428 L101.5 429.5 L97.5 431 L96 435 L94.5 431 L90.5 429.5 L94.5 428 Z`}
              fill={MEMORY}
              filter={selected === "memory" ? `url(#${glowId})` : undefined}
            />
            <rect
              x={108}
              y={426}
              width={56}
              height={6}
              rx={3}
              fill={MEMORY}
              opacity={0.7}
              filter={selected === "memory" ? `url(#${glowId})` : undefined}
            />
            <rect
              x={88}
              y={444}
              width={72}
              height={5}
              rx={2.5}
              style={{ fill: "var(--color-secondary)" }}
              opacity={0.35}
            />
            <rect
              x={88}
              y={456}
              width={52}
              height={5}
              rx={2.5}
              style={{ fill: "var(--color-secondary)" }}
              opacity={0.25}
            />
            <NodeTag x={120} y={496}>
              {t("nodeTags.memory")}
            </NodeTag>
            <FlowArrow x1={148} y1={386} x2={194} y2={298} angle={-62.4} />
          </g>

          {/* The report it writes — the output, in gold */}
          <g style={{ ...fade, opacity: reportO }}>
            <rect
              x={252}
              y={386}
              width={88}
              height={110}
              rx={8}
              fill="currentColor"
              className="text-foreground"
              opacity={0.05}
            />
            <rect
              x={252}
              y={386}
              width={88}
              height={110}
              rx={8}
              fill="none"
              style={{ stroke: "var(--color-border-dim)" }}
              strokeWidth={1.2}
            />
            <rect
              x={262}
              y={398}
              width={52}
              height={7}
              rx={3.5}
              fill={REPORT}
              filter={selected === "report" ? `url(#${glowId})` : undefined}
            />
            {[412, 421].map((y) => (
              <rect
                key={y}
                x={262}
                y={y}
                width={y === 412 ? 68 : 56}
                height={4}
                rx={2}
                style={{ fill: "var(--color-secondary)" }}
                opacity={0.3}
              />
            ))}
            <path
              d="M262 448 C270 442 276 446 284 438 C292 432 300 436 308 428 C316 423 324 425 330 423"
              fill="none"
              stroke={REPORT}
              strokeWidth={1.5}
              strokeLinecap="round"
              opacity={0.8}
            />
            {[462, 476].map((y, i) => (
              <g key={y}>
                <circle
                  cx={267}
                  cy={y}
                  r={5}
                  style={{ fill: "var(--color-background)" }}
                  stroke={REPORT}
                  strokeWidth={1}
                />
                <text
                  x={267}
                  y={y + 2.5}
                  textAnchor="middle"
                  fontSize={6.5}
                  fontWeight={700}
                  fill={REPORT}
                >
                  {i + 1}
                </text>
                <rect
                  x={278}
                  y={y - 2.5}
                  width={44}
                  height={5}
                  rx={2.5}
                  style={{ fill: "var(--color-secondary)" }}
                  opacity={0.35}
                />
              </g>
            ))}
            <NodeTag x={296} y={514}>
              {t("nodeTags.report")}
            </NodeTag>
            <FlowArrow x1={226} y1={298} x2={264} y2={382} angle={65.7} tint={REPORT} />
          </g>
        </svg>
      </div>

      <div className="flex flex-col justify-center gap-5 p-7">
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: ACCENT }}
          >
            {t("sourcesKicker")}
          </span>
          <h2 className="text-xl font-semibold text-foreground">
            {t("sourcesTitle")}
          </h2>
          <p className="text-[14px] text-secondary leading-relaxed">
            {t("sourcesBody")}
          </p>
          <p className="text-[12px] text-muted">
            {t("sourcesHint")}
          </p>
        </div>
        <div className="grid grid-cols-2 gap-2.5">
          {SOURCE_LEGEND.map((item) => {
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
                    {t(`sources.${item.group}.label`)}
                  </div>
                  <div className="text-[12px] text-secondary tabular-nums">
                    {t(`sources.${item.group}.count`)}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Description of the selected source */}
        {(() => {
          const active = SOURCE_LEGEND.find((item) => item.group === selected) ?? null;
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
                {active ? t(`sources.${active.group}.description`) : t("sources.defaultDescription")}
              </p>
            </div>
          );
        })()}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Four-step flow: from a spreadsheet of deals to a board-ready report.
// ---------------------------------------------------------------------------

const FLOW = ["teach", "reads", "finds", "writes"] as const;

export function ReportFlow() {
  const t = useTranslations("salesReports.information.visuals");
  const gradientId = useId();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {FLOW.map((step, index) => (
        <div
          key={step}
          className="relative flex flex-col gap-2 rounded-[16px] border border-border-dim bg-card/60 p-4 backdrop-blur-xl"
        >
          <div className="flex items-center gap-2.5">
            <span
              className="flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-bold"
              style={{ background: "rgba(240,216,168,0.15)", color: ACCENT }}
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
          <h3 className="text-[15px] font-semibold text-foreground">{t(`flow.${step}.title`)}</h3>
          <p className="text-[13px] leading-relaxed text-secondary">{t(`flow.${step}.body`)}</p>
        </div>
      ))}
    </div>
  );
}
