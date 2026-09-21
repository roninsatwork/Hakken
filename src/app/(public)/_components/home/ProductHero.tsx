"use client";

import { useEffect, useRef } from "react";
import { ArrowRight } from "lucide-react";
import { ContactLink } from "../ContactLink";
import { ensureGsap, prefersReducedMotion } from "../../_motion/motion";

/**
 * The hero is one deep forest panel: a single wide product screen up top, the
 * headline running along the bottom.
 *
 * The screen is the platform dashboard rather than a task list, because a list
 * of ticked rows has no energy next to the demo panels below. It is drawn as
 * real interface rather than captured, so there is no fixture branding, no
 * customer data on it, and nothing to re-shoot.
 */
const RAIL = [
  { label: "Assistant", on: false },
  { label: "Agents", on: true },
  { label: "Knowledge", on: false },
  { label: "Reports", on: false },
  { label: "Governance", on: false },
];

/* Thirty days of AI activity — a plausible rising series, not a real one. */
const ACTIVITY = [
  12, 18, 15, 22, 19, 28, 24, 31, 27, 35, 30, 38, 33, 42, 37,
  45, 40, 49, 44, 52, 47, 56, 50, 58, 54, 62, 57, 66, 60, 71,
];

/* Runs per day, banded by how each one ended. */
const RUNS: [number, number, number][] = [
  [8, 2, 1], [11, 1, 0], [9, 3, 1], [14, 2, 0], [12, 1, 1], [16, 3, 0], [13, 2, 1],
  [18, 2, 0], [15, 4, 1], [20, 2, 0], [17, 3, 1], [22, 2, 0], [19, 3, 1], [24, 2, 0],
];
const BAND_COLOURS = ["#a8d4b8", "#efd49b", "#f5c4b2"];

const LEDGER = [
  { name: "Weekly board report", meta: "Scheduled · Mon 07:00", state: "Waiting" },
  { name: "Rightmove collection", meta: "Trigger · 986 listings", state: "Done" },
  { name: "Knowledge re-index", meta: "Scheduled · nightly", state: "Done" },
  { name: "Posture routine export", meta: "Manual · 2 files", state: "Done" },
];

const CHART_W = 640;
const CHART_H = 150;

/** A smoothed path through the series, so the line reads as a curve not a saw. */
function buildPaths(values: number[]) {
  const max = Math.max(...values);
  const points = values.map((v, i) => [
    (i / (values.length - 1)) * CHART_W,
    CHART_H - 8 - (v / max) * (CHART_H - 26),
  ]);

  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    const mx = (x1 + x2) / 2;
    d += ` C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
  }
  return { line: d, area: `${d} L ${CHART_W} ${CHART_H} L 0 ${CHART_H} Z` };
}

const { line: LINE_PATH, area: AREA_PATH } = buildPaths(ACTIVITY);
const MAX_RUN = Math.max(...RUNS.map((r) => r[0] + r[1] + r[2]));

export function ProductHero() {
  const rootRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const root = rootRef.current;
    if (!root) return;
    const { gsap } = ensureGsap();

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
      tl.from("[data-hero-line]", { autoAlpha: 0, y: 20, duration: 0.6, stagger: 0.07 })
        .from("[data-hero-screen]", { autoAlpha: 0, y: 44, duration: 0.85 }, "-=0.35")
        .from("[data-tile]", { autoAlpha: 0, y: 12, duration: 0.45, stagger: 0.07 }, "-=0.45")
        .from(
          "[data-bar]",
          { scaleY: 0, transformOrigin: "bottom", duration: 0.5, stagger: 0.015 },
          "-=0.3"
        );

      // The line draws itself in — the one real moment on the fold.
      const path = root.querySelector<SVGPathElement>("[data-chart-line]");
      if (path) {
        const len = path.getTotalLength();
        gsap.fromTo(
          path,
          { strokeDasharray: len, strokeDashoffset: len },
          { strokeDashoffset: 0, duration: 1.5, ease: "power2.inOut", delay: 0.55 }
        );
        gsap.from("[data-chart-area]", { autoAlpha: 0, duration: 1.2, delay: 0.8 });
      }
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <section ref={rootRef} className="ps-hero">
      {/* ---- the product ---- */}
      <div className="ps-hero-stage">
        <div className="ps-hero-screen" data-hero-screen>
          <div className="ps-ws-bar">
            <span className="ps-ws-dots">
              <i />
              <i />
              <i />
            </span>
            <span className="ps-ws-name">Hakken · Acme workspace</span>
            <span className="ps-ws-user">JS</span>
          </div>

          <div className="ps-ws-body">
            <nav className="ps-ws-rail">
              {RAIL.map((item) => (
                <span key={item.label} className="ps-ws-rail-item" data-on={item.on}>
                  {item.label}
                </span>
              ))}
              <span className="ps-ws-rail-note">4 providers connected</span>
            </nav>

            <div className="ps-ws-main">
              <div className="ps-ws-tiles">
                <div className="ps-ws-tile" data-tile>
                  <span className="ps-ws-kicker">Agent runs today</span>
                  <span className="ps-ws-tile-num">128</span>
                  <span className="ps-ws-tile-note">across 6 workflows</span>
                </div>
                <div className="ps-ws-tile" data-tile>
                  <span className="ps-ws-kicker">Waiting for a person</span>
                  <span className="ps-ws-tile-num" data-accent="sand">2</span>
                  <span className="ps-ws-tile-note">nothing sends without it</span>
                </div>
                <div className="ps-ws-tile" data-tile>
                  <span className="ps-ws-kicker">Spend today</span>
                  <span className="ps-ws-tile-num">£38</span>
                  <div className="ps-ws-meter">
                    <i />
                  </div>
                  <span className="ps-ws-tile-note">ceiling £50 · hard stop</span>
                </div>
              </div>

              <div className="ps-ws-chart">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="ps-ws-kicker">AI activity · last 30 days</span>
                  <span className="ps-ws-live">
                    <i />
                    Live
                  </span>
                </div>
                <svg viewBox={`0 0 ${CHART_W} ${CHART_H}`} preserveAspectRatio="none" aria-hidden>
                  <defs>
                    <linearGradient id="ps-act" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#a8d4b8" stopOpacity="0.42" />
                      <stop offset="100%" stopColor="#a8d4b8" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  {[0.3, 0.6].map((g) => (
                    <line
                      key={g}
                      x1="0"
                      x2={CHART_W}
                      y1={CHART_H * g}
                      y2={CHART_H * g}
                      stroke="rgba(254,253,251,0.08)"
                      strokeWidth="1"
                    />
                  ))}
                  <path d={AREA_PATH} fill="url(#ps-act)" data-chart-area />
                  <path
                    d={LINE_PATH}
                    fill="none"
                    stroke="#a8d4b8"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    vectorEffect="non-scaling-stroke"
                    data-chart-line
                  />
                </svg>
              </div>

              <div className="ps-ws-runs">
                <span className="ps-ws-kicker">Runs by day, and how they ended</span>
                <div className="ps-ws-bars">
                  {RUNS.map((bands, i) => (
                    <span key={i} className="ps-ws-barcol">
                      {bands.map((v, band) => (
                        <i
                          key={band}
                          data-bar
                          style={{
                            height: `${(v / MAX_RUN) * 100}%`,
                            background: BAND_COLOURS[band],
                          }}
                        />
                      ))}
                    </span>
                  ))}
                </div>
              </div>

              <div className="ps-ws-approve" data-hero-approve>
                <div>
                  <span className="ps-ws-approve-kicker">Waiting for a person</span>
                  <div className="ps-ws-approve-title">
                    Send the weekly board report?
                  </div>
                </div>
                <span className="ps-obj-yes">Approve</span>
              </div>
            </div>

            <aside className="ps-ws-side">
              <span className="ps-ws-kicker">Today</span>
              <div className="ps-ws-ledger">
                {LEDGER.map((row) => (
                  <div key={row.name} className="ps-ws-row">
                    <div className="min-w-0">
                      <div className="ps-ws-row-name">{row.name}</div>
                      <div className="ps-ws-row-meta">{row.meta}</div>
                    </div>
                    <span className="ps-ws-state" data-state={row.state}>
                      {row.state}
                    </span>
                  </div>
                ))}
              </div>
            </aside>
          </div>
        </div>
      </div>

      {/* ---- the type band ---- */}
      <div className="ps-hero-band">
        <div className="grid items-end gap-x-10 gap-y-7 lg:grid-cols-[minmax(0,1fr)_minmax(0,390px)]">
          <div>
            <span className="ps-hero-eyebrow" data-hero-line>
              備え · Be Prepared
            </span>
            <h1 className="ps-display ps-hero-h1 mt-4" data-hero-line>
              Build agent-powered
              <br className="hidden lg:block" /> products with
              <br className="hidden lg:block" /> governance built in
            </h1>
          </div>

          <div data-hero-line>
            <p className="ps-hero-sub">
              Start with the foundations already in place: knowledge,
              permissions, approvals, cost control, and a record of every agent
              run. Then build the product your customers came for.
            </p>
            <div className="mt-6">
              <ContactLink className="ps-hero-btn ps-hero-btn-light group">
                <span>Talk to us</span>
                <ArrowRight className="h-4 w-4" />
              </ContactLink>
            </div>
          </div>
        </div>
      </div>

      {/* the cream page rising over the panel */}
      <div className="ps-hero-shelf" />
    </section>
  );
}
