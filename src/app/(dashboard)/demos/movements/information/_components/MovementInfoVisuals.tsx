"use client";

import { useId, useState } from "react";
import { Eye, Hand, PersonStanding, ScanFace } from "lucide-react";
import {
  MOVEMENT_SALMON,
} from "../../_lib/movementPalette";

const BODY = MOVEMENT_SALMON; // Posture Studio salmon
const FACE = MOVEMENT_SALMON;
const HANDS = "#8fb8e0";
const EYES = "#ff5a1f";

type CaptureGroup = "body" | "face" | "hands" | "eyes";

// ---------------------------------------------------------------------------
// Geometry — a front-facing figure in an A-pose, viewBox 0 0 420 640.
// Joint layout follows the real MediaPipe pose topology (incl. heels + toes).
// ---------------------------------------------------------------------------

const J = {
  neck: [210, 124],
  shoulderL: [163, 150],
  shoulderR: [257, 150],
  elbowL: [135, 228],
  elbowR: [285, 228],
  wristL: [117, 300],
  wristR: [303, 300],
  hipL: [184, 290],
  hipR: [236, 290],
  kneeL: [179, 410],
  kneeR: [241, 410],
  ankleL: [176, 522],
  ankleR: [244, 522],
  heelL: [168, 550],
  heelR: [252, 550],
  toeL: [192, 560],
  toeR: [228, 560],
} as const;

type JointName = keyof typeof J;

const BONES: [JointName, JointName][] = [
  ["neck", "shoulderL"],
  ["neck", "shoulderR"],
  ["shoulderL", "elbowL"],
  ["elbowL", "wristL"],
  ["shoulderR", "elbowR"],
  ["elbowR", "wristR"],
  ["shoulderL", "hipL"],
  ["shoulderR", "hipR"],
  ["hipL", "hipR"],
  ["hipL", "kneeL"],
  ["kneeL", "ankleL"],
  ["hipR", "kneeR"],
  ["kneeR", "ankleR"],
  // Feet: ankle -> heel -> toes -> back to ankle, as MediaPipe tracks them.
  ["ankleL", "heelL"],
  ["heelL", "toeL"],
  ["ankleL", "toeL"],
  ["ankleR", "heelR"],
  ["heelR", "toeR"],
  ["ankleR", "toeR"],
];

// Soft human silhouette behind the skeleton (mirrors the A-pose joints).
const SILHOUETTE =
  "M210 30 C 187 30 174 47 174 70 C 174 86 180 99 189 107 " +
  "C 168 114 152 124 143 140 C 128 166 116 224 104 292 C 100 312 122 318 130 300 " +
  "C 140 268 150 236 158 214 C 160 250 162 276 160 300 C 156 356 160 430 166 470 " +
  "C 170 508 168 540 166 556 C 165 568 178 572 192 570 C 202 569 206 562 204 552 " +
  "C 202 528 202 490 204 452 C 206 420 208 388 210 360 C 212 388 214 420 216 452 " +
  "C 218 490 218 528 216 552 C 214 562 218 569 228 570 C 242 572 255 568 254 556 " +
  "C 252 540 250 508 254 470 C 260 430 264 356 260 300 C 258 276 260 250 262 214 " +
  "C 270 236 280 268 290 300 C 298 318 320 312 316 292 C 304 224 292 166 277 140 " +
  "C 268 124 252 114 231 107 C 240 99 246 86 246 70 C 246 47 233 30 210 30 Z";

// Deterministic pseudo-random for stable dot fields (no hydration mismatch).
function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function ellipseRing(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  count: number,
): [number, number][] {
  const pts: [number, number][] = [];
  for (let i = 0; i < count; i += 1) {
    const a = (i / count) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]);
  }
  return pts;
}

// The face field is structured like a real face mesh: an oval, brows, eye
// rings, nose line, lips, and a fill across cheeks and forehead.
function facePoints(): [number, number][] {
  const cx = 210;
  const cy = 72;
  const pts: [number, number][] = [];

  pts.push(...ellipseRing(cx, cy, 30, 38, 30)); // face oval
  for (let i = 0; i < 6; i += 1) {
    // brows
    const t = i / 5;
    pts.push([188 + t * 15, 59 - Math.sin(t * Math.PI) * 3]);
    pts.push([217 + t * 15, 59 - Math.sin(t * Math.PI) * 3]);
  }
  pts.push(...ellipseRing(cx - 15, 68, 7.5, 4, 10)); // eye outlines
  pts.push(...ellipseRing(cx + 15, 68, 7.5, 4, 10));
  for (let i = 0; i < 4; i += 1) pts.push([cx, 62 + i * 7]); // nose bridge
  pts.push([cx - 7, 88], [cx + 7, 88], [cx - 3.5, 90], [cx + 3.5, 90]); // nostrils
  pts.push(...ellipseRing(cx, 99, 11, 4.5, 12)); // outer lips
  pts.push(...ellipseRing(cx, 99, 6.5, 2.2, 8)); // inner lips

  // Cheek + forehead fill, avoiding the eye and mouth regions.
  const rand = seeded(11);
  let placed = 0;
  while (placed < 66) {
    const x = (rand() * 2 - 1) * 27;
    const y = (rand() * 2 - 1) * 35;
    if ((x * x) / (27 * 27) + (y * y) / (35 * 35) > 1) continue;
    const px = cx + x;
    const py = cy + y;
    const nearEyeL = Math.hypot(px - (cx - 15), py - 68) < 10;
    const nearEyeR = Math.hypot(px - (cx + 15), py - 68) < 10;
    const nearMouth = Math.hypot(px - cx, py - 99) < 13;
    if (nearEyeL || nearEyeR || nearMouth) continue;
    pts.push([px, py]);
    placed += 1;
  }
  return pts;
}

// A real MediaPipe hand: wrist + 5 fingers x 4 joints = 21 points.
function handPoints(
  wx: number,
  wy: number,
  dir: 1 | -1,
): { dots: [number, number][]; bones: [[number, number], [number, number]][] } {
  const dots: [number, number][] = [[wx, wy]];
  const bones: [[number, number], [number, number]][] = [];
  // Finger base angles in degrees, 0 = straight down, positive = outward.
  const fingers = [
    { angle: 58, lengths: [14, 10, 8, 7] }, // thumb
    { angle: 26, lengths: [20, 12, 9, 8] }, // index
    { angle: 8, lengths: [21, 13, 10, 8] }, // middle
    { angle: -10, lengths: [20, 12, 9, 8] }, // ring
    { angle: -28, lengths: [17, 10, 8, 7] }, // pinky
  ];
  for (const finger of fingers) {
    const rad = ((finger.angle * dir + 180) * Math.PI) / 180;
    let px = wx;
    let py = wy;
    // Knuckle sits a short step from the wrist along the finger direction.
    let step = 12;
    for (const len of finger.lengths) {
      const nx = px - Math.sin(rad) * step;
      const ny = py - Math.cos(rad) * step;
      bones.push([
        [px, py],
        [nx, ny],
      ]);
      dots.push([nx, ny]);
      px = nx;
      py = ny;
      step = len;
    }
  }
  return { dots, bones };
}

// ---------------------------------------------------------------------------
// The interactive explorer: figure + clickable legend.
// ---------------------------------------------------------------------------

const LEGEND: {
  group: CaptureGroup;
  icon: typeof PersonStanding;
  label: string;
  count: string;
  tint: string;
  description: string;
}[] = [
  {
    group: "body",
    icon: PersonStanding,
    label: "Body & joints",
    count: "33 points",
    tint: BODY,
    description:
      "Shoulders, elbows and wrists; hips, knees and ankles — right down to each heel and toe. These points carry your whole posture: how you stand, bend, balance and move.",
  },
  {
    group: "face",
    icon: ScanFace,
    label: "Face & expression",
    count: "478 points",
    tint: FACE,
    description:
      "A fine mesh across your jawline, brows, eyes, nose, lips and cheeks, plus 52 expression readings — so focus, effort and smiles come through on the avatar.",
  },
  {
    group: "hands",
    icon: Hand,
    label: "Each hand",
    count: "21 points",
    tint: HANDS,
    description:
      "The wrist, every knuckle, each finger joint and every fingertip — 21 points per hand. It's how gestures and hand positions carry over faithfully.",
  },
  {
    group: "eyes",
    icon: Eye,
    label: "Eyes & gaze",
    count: "Both irises",
    tint: EYES,
    description:
      "The centre of each iris, tracked live, telling us where you're looking — the detail that makes the avatar's gaze feel natural and alive.",
  },
];

const DEFAULT_DESCRIPTION =
  "Together these add up to 553 tracked points, captured in every single scan.";

function groupOpacity(selected: CaptureGroup | null, group: CaptureGroup) {
  if (selected === null) return 1;
  return selected === group ? 1 : 0.12;
}

export function CaptureExplorer() {
  const [selected, setSelected] = useState<CaptureGroup | null>(null);
  const glowId = useId();

  const face = facePoints();
  const handL = handPoints(J.wristL[0], J.wristL[1], -1);
  const handR = handPoints(J.wristR[0], J.wristR[1], 1);

  const bodyO = groupOpacity(selected, "body");
  const faceO = groupOpacity(selected, "face");
  const handsO = groupOpacity(selected, "hands");
  const eyesO = groupOpacity(selected, "eyes");
  const fade = { transition: "opacity 300ms ease" };

  return (
    <div className="grid lg:grid-cols-2 gap-2">
      <div className="flex items-center justify-center p-6 bg-background/40">
        <svg
          viewBox="0 0 420 640"
          className="w-full h-auto max-w-[400px] mx-auto"
          role="img"
          aria-label="A figure showing the 553 points tracked across the body, face, hands and eyes"
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

          {/* Body silhouette — the outline BodyPix sees */}
          <path
            d={SILHOUETTE}
            fill="currentColor"
            className="text-foreground"
            opacity={0.05}
          />
          <path
            d={SILHOUETTE}
            fill="none"
            style={{ stroke: "var(--color-border-dim)" }}
            strokeWidth={1.5}
          />

          {/* Skeleton bones */}
          <g style={{ ...fade, opacity: bodyO }}>
            {BONES.map(([a, b]) => (
              <line
                key={`${a}-${b}`}
                x1={J[a][0]}
                y1={J[a][1]}
                x2={J[b][0]}
                y2={J[b][1]}
                style={{ stroke: "var(--color-secondary)" }}
                strokeWidth={2}
                strokeLinecap="round"
                opacity={0.55}
              />
            ))}
            {(Object.keys(J) as JointName[]).map((name) => (
              <circle
                key={name}
                cx={J[name][0]}
                cy={J[name][1]}
                r={selected === "body" ? 5.2 : 4.4}
                fill={BODY}
                style={{ stroke: "var(--color-background)" }}
                strokeWidth={2}
                filter={selected === "body" ? `url(#${glowId})` : undefined}
              />
            ))}
          </g>

          {/* Face mesh */}
          <g style={{ ...fade, opacity: faceO }}>
            {face.map(([x, y], i) => (
              <circle
                key={`f${i}`}
                cx={x}
                cy={y}
                r={selected === "face" ? 1.7 : 1.4}
                fill={FACE}
                opacity={0.92}
                filter={selected === "face" ? `url(#${glowId})` : undefined}
              />
            ))}
          </g>

          {/* Hands */}
          <g style={{ ...fade, opacity: handsO }}>
            {[...handL.bones, ...handR.bones].map(([[x1, y1], [x2, y2]], i) => (
              <line
                key={`hb${i}`}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke={HANDS}
                strokeWidth={1.1}
                opacity={0.45}
              />
            ))}
            {[...handL.dots, ...handR.dots].map(([x, y], i) => (
              <circle
                key={`h${i}`}
                cx={x}
                cy={y}
                r={selected === "hands" ? 2.6 : 2.1}
                fill={HANDS}
                filter={selected === "hands" ? `url(#${glowId})` : undefined}
              />
            ))}
          </g>

          {/* Eyes & gaze */}
          <g style={{ ...fade, opacity: eyesO }}>
            {[
              [195, 68],
              [225, 68],
            ].map(([x, y], i) => (
              <g key={`e${i}`}>
                <circle
                  cx={x}
                  cy={y}
                  r={selected === "eyes" ? 4.2 : 3.4}
                  fill={EYES}
                  filter={selected === "eyes" ? `url(#${glowId})` : undefined}
                />
                {selected === "eyes" && (
                  <line
                    x1={x}
                    y1={y}
                    x2={x + (i === 0 ? -14 : 14)}
                    y2={y - 10}
                    stroke={EYES}
                    strokeWidth={1.4}
                    strokeDasharray="2 3"
                    opacity={0.8}
                  />
                )}
              </g>
            ))}
          </g>
        </svg>
      </div>

      <div className="flex flex-col justify-center gap-5 p-7">
        <div className="flex flex-col gap-2">
          <span
            className="text-[11px] font-bold uppercase tracking-[0.14em]"
            style={{ color: BODY }}
          >
            What we capture
          </span>
          <h2 className="text-xl font-semibold text-foreground">
            553 points on your body, every moment
          </h2>
          <p className="text-[14px] text-secondary leading-relaxed">
            We don&apos;t just track a rough stick figure. Every capture reads
            hundreds of precise points across your body, face and hands — even
            the direction of your gaze — so the avatar can follow you with real
            detail.
          </p>
          <p className="text-[12px] text-muted">
            Select a category to see what it tracks on the figure.
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

        {/* Description of the selected category */}
        {(() => {
          const active = LEGEND.find((item) => item.group === selected) ?? null;
          return (
            <div
              className="rounded-[12px] border border-border-dim bg-card/40 px-4 py-3.5 min-h-[86px] flex items-center gap-3 transition-colors"
              style={
                active
                  ? { borderColor: `${active.tint}4d` }
                  : undefined
              }
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
// Four-step capture flow (unchanged).
// ---------------------------------------------------------------------------

type FlowStep = {
  title: string;
  body: string;
};

const FLOW: FlowStep[] = [
  { title: "See you", body: "Your camera watches you move, live, in the browser." },
  { title: "Understand the pose", body: "AI reads 553 points across your body every moment." },
  { title: "Map to the avatar", body: "Your movement is translated onto the 3D character." },
  { title: "Replay it faithfully", body: "The avatar mirrors what you did, at your real pace." },
];

export function CaptureFlow() {
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
              style={{ background: "rgba(246,204,190,0.15)", color: BODY }}
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
                    <stop offset="0" stopColor={BODY} stopOpacity="0.6" />
                    <stop offset="1" stopColor={BODY} stopOpacity="0.1" />
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
