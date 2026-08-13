"use client";

import { useEffect, useRef } from "react";
import { ensureGsap, prefersReducedMotion } from "../../_motion/motion";
import { ContactLink } from "../ContactLink";

/**
 * Slide-over demo panels: each panel sticks to the top of the viewport and the
 * next one slides over it while the one beneath scales back and dims.
 *
 * All three share one shell — the same top and bottom padding, the same screen
 * treatment — so the rhythm is identical down the stack. What differs is the
 * product UI inside each screen, which is drawn as real interface rather than
 * placeholder shapes.
 */

/*
 * Real build times, supplied by Anthony. Anything still null renders no badge
 * at all, because an invented figure is worse than no figure.
 */
const PROPERTIES_BUILD_TIME: string | null = "Built in one sprint";
const REPORTS_BUILD_TIME: string | null = "Built in one sprint";
const STUDIO_BUILD_TIME: string | null = "Built in 4 sprints";
const SALES_BUILD_TIME: string | null = "Built in one sprint";

/* Representative listings for the library screen — shape and density are real. */
const LISTINGS = [
  { price: "£425,000", addr: "Ash Road, Guildford", meta: "3 bed · semi-detached", tag: "New" },
  { price: "£380,000", addr: "Wodeland Avenue", meta: "2 bed · terraced", tag: "Chain free" },
  { price: "£549,950", addr: "Pewley Hill", meta: "4 bed · detached", tag: "New" },
  { price: "£310,000", addr: "Woodbridge Road", meta: "2 bed · flat", tag: "Reduced" },
  { price: "£465,000", addr: "Chesham Mews", meta: "3 bed · end terrace", tag: "New" },
  { price: "£729,000", addr: "Warwicks Bench", meta: "5 bed · detached", tag: "Chain free" },
  { price: "£295,000", addr: "Bright Hill", meta: "1 bed · flat", tag: "New" },
  { price: "£512,500", addr: "Nightingale Road", meta: "3 bed · semi-detached", tag: "Reduced" },
  { price: "£399,000", addr: "Denzil Road", meta: "3 bed · terraced", tag: "New" },
  { price: "£645,000", addr: "Farnham Road", meta: "4 bed · semi-detached", tag: "Chain free" },
  { price: "£274,950", addr: "Guildford Park Road", meta: "1 bed · flat", tag: "Reduced" },
  { price: "£489,000", addr: "Cline Road", meta: "3 bed · detached", tag: "New" },
];

const PIPELINE = [
  { m: "May", v: 46 },
  { m: "Jun", v: 58 },
  { m: "Jul", v: 51 },
  { m: "Aug", v: 72 },
  { m: "Sep", v: 88 },
];

const RISKS = [
  {
    level: "Critical",
    deal: "Halden Group · £96k",
    note: "No contact for 19 days and the sponsor has changed.",
    action: "Ask the sponsor for a written next step this week.",
  },
  {
    level: "At risk",
    deal: "Ferndale · £54k",
    note: "Slipped twice, and legal has not seen the contract.",
    action: "Send the contract to legal before Friday.",
  },
  {
    level: "Healthy",
    deal: "Norwood · £128k",
    note: "Signed off internally and waiting on a date.",
    action: "Confirm the start date and close it.",
  },
];

/*
 * The opportunity report screen. Names and figures are invented, and the sector
 * is never named, because the client this was built for is under NDA. What is
 * real is the shape: three streams of work priced into one table, and a line on
 * every row saying how that figure was reached.
 */
const OPPORTUNITY_TABS = [
  "Upsell existing customers",
  "Prospects in their groups",
  "Suspects — new groups",
];

const OPPORTUNITY_ROWS = [
  {
    site: "Marden Court",
    group: "Marden Group",
    kind: "New business",
    value: "£34,600",
    how: "Priced by size against three sister sites already supplied.",
  },
  {
    site: "Beckmere Grange",
    group: "Northbrook Group",
    kind: "Upsell",
    value: "£19,400",
    how: "Six categories its sister sites buy and this account does not.",
  },
  {
    site: "Stone Cross House",
    group: "Halden Group",
    kind: "Suspect",
    value: "£41,200",
    how: "A group nobody here has sold to, found and priced on the type average.",
  },
  {
    site: "Ashfield Lodge",
    group: "Ashfield Group",
    kind: "New business",
    value: "£28,900",
    how: "No size on file, so the average of the group's existing accounts.",
  },
  {
    site: "Kellerton Park",
    group: "Marden Group",
    kind: "Upsell",
    value: "£12,750",
    how: "Two categories missing against the group's own buying mix.",
  },
];

/* Joint readout for the capture screen — a real motion-capture output shape. */
const JOINTS = [
  { name: "Hip flexion", value: "92°" },
  { name: "Thoracic rotation", value: "14°" },
  { name: "Knee extension", value: "178°" },
  { name: "Shoulder abduction", value: "63°" },
  { name: "Neck tilt", value: "6°" },
];

/*
 * Figure geometry lifted from the in-app Posture Studio information page, so
 * the marketing site draws the same body the product does — real MediaPipe pose
 * topology (heels and toes included) rather than an approximated stick figure.
 */
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
  ["neck", "shoulderL"], ["neck", "shoulderR"],
  ["shoulderL", "elbowL"], ["elbowL", "wristL"],
  ["shoulderR", "elbowR"], ["elbowR", "wristR"],
  ["shoulderL", "hipL"], ["shoulderR", "hipR"], ["hipL", "hipR"],
  ["hipL", "kneeL"], ["kneeL", "ankleL"],
  ["hipR", "kneeR"], ["kneeR", "ankleR"],
  ["ankleL", "heelL"], ["heelL", "toeL"], ["ankleL", "toeL"],
  ["ankleR", "heelR"], ["heelR", "toeR"], ["ankleR", "toeR"],
];

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

/* Deterministic pseudo-random, so the dot field is identical on server and client. */
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
  count: number
): [number, number][] {
  return Array.from({ length: count }, (_, i) => {
    const a = (i / count) * Math.PI * 2;
    return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry] as [number, number];
  });
}

/* The face mesh: oval, brows, eye rings, nose, lips, then a cheek and forehead fill. */
function facePoints(): [number, number][] {
  const cx = 210;
  const cy = 72;
  const pts: [number, number][] = [];

  pts.push(...ellipseRing(cx, cy, 30, 38, 30));
  for (let i = 0; i < 6; i += 1) {
    const t = i / 5;
    pts.push([188 + t * 15, 59 - Math.sin(t * Math.PI) * 3]);
    pts.push([217 + t * 15, 59 - Math.sin(t * Math.PI) * 3]);
  }
  pts.push(...ellipseRing(cx - 15, 68, 7.5, 4, 10));
  pts.push(...ellipseRing(cx + 15, 68, 7.5, 4, 10));
  for (let i = 0; i < 4; i += 1) pts.push([cx, 62 + i * 7]);
  pts.push([cx - 7, 88], [cx + 7, 88], [cx - 3.5, 90], [cx + 3.5, 90]);
  pts.push(...ellipseRing(cx, 99, 11, 4.5, 12));
  pts.push(...ellipseRing(cx, 99, 6.5, 2.2, 8));

  const rand = seeded(11);
  let placed = 0;
  while (placed < 66) {
    const x = (rand() * 2 - 1) * 27;
    const y = (rand() * 2 - 1) * 35;
    if ((x * x) / (27 * 27) + (y * y) / (35 * 35) > 1) continue;
    const px = cx + x;
    const py = cy + y;
    if (Math.hypot(px - (cx - 15), py - 68) < 10) continue;
    if (Math.hypot(px - (cx + 15), py - 68) < 10) continue;
    if (Math.hypot(px - cx, py - 99) < 13) continue;
    pts.push([px, py]);
    placed += 1;
  }
  return pts;
}

/* A real MediaPipe hand: wrist plus five fingers of four joints each — 21 points. */
function handPoints(wx: number, wy: number, dir: 1 | -1) {
  const dots: [number, number][] = [[wx, wy]];
  const bones: [[number, number], [number, number]][] = [];
  const fingers = [
    { angle: 58, lengths: [14, 10, 8, 7] },
    { angle: 26, lengths: [20, 12, 9, 8] },
    { angle: 8, lengths: [21, 13, 10, 8] },
    { angle: -10, lengths: [20, 12, 9, 8] },
    { angle: -28, lengths: [17, 10, 8, 7] },
  ];
  for (const finger of fingers) {
    const rad = ((finger.angle * dir + 180) * Math.PI) / 180;
    let px = wx;
    let py = wy;
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

const FACE_POINTS = facePoints();
const HAND_L = handPoints(J.wristL[0], J.wristL[1], -1);
const HAND_R = handPoints(J.wristR[0], J.wristR[1], 1);

export function ProductPanels() {
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    if (!window.matchMedia("(min-width: 901px)").matches) return;
    const { gsap, ScrollTrigger } = ensureGsap();
    const root = rootRef.current;
    if (!root) return;

    const panels = Array.from(root.querySelectorAll<HTMLElement>(".ps-panel"));
    const ctx = gsap.context(() => {
      panels.forEach((panel, i) => {
        const next = panels[i + 1];
        if (!next) return;
        gsap.fromTo(
          panel,
          { scale: 1, filter: "brightness(1)", y: 0 },
          {
            scale: 0.95,
            filter: "brightness(0.92)",
            y: -26,
            ease: "none",
            scrollTrigger: {
              trigger: next,
              start: "top bottom",
              end: "top top",
              scrub: 0.4,
            },
          }
        );
      });
      ScrollTrigger.refresh();
    }, root);
    return () => ctx.revert();
  }, []);

  return (
    <div ref={rootRef}>
      {/* template:remove:start properties */}
      <section className="ps-panel ps-panel-props ps-demo-full">
        <div className="ps-demo-full-inner">
          <div className="ps-demo-head">
            <div className="ps-demo-metarow">
              <span className="ps-pill bg-[#3E7A55]">Property Intelligence</span>
              {PROPERTIES_BUILD_TIME && (
                <span className="ps-demo-time">{PROPERTIES_BUILD_TIME}</span>
              )}
            </div>
            <h2 className="ps-display ps-demo-h2 mt-5">
              A research tool that looks for exactly the properties that match
              your profile.
            </h2>
            <p className="ps-demo-lede mt-4">
              We set up an automated search agent that consistently monitors
              Rightmove for properties that match your investment criteria, it
              brings them down to your own database, classifies each one and
              then prepares a full investment report for the top findings.
            </p>
            <div className="mt-6">
              <ContactLink className="ps-cta-quiet">Talk to us</ContactLink>
            </div>
          </div>

          <div className="ps-demo-stage">
            <div className="ps-demo-screen">
              <div className="ps-lib-bar">
                <span className="ps-lib-url">
                  rightmove.co.uk/<b className="text-[var(--ps-ink)]">property-for-sale</b>
                  /find.html?searchLocation=Guildford&amp;radius=3
                </span>
                <span className="ps-lib-live">
                  <i />
                  986 collected
                </span>
              </div>
              <div className="ps-lib-chips">
                <span className="ps-lib-chip" data-on="true">All listings</span>
                <span className="ps-lib-chip">£300k–£500k</span>
                <span className="ps-lib-chip">3+ beds</span>
                <span className="ps-lib-chip">Chain free</span>
                <span className="ps-lib-chip">Added this week</span>
              </div>
              <div className="ps-lib-grid">
                {LISTINGS.map((listing) => (
                  <div key={listing.addr} className="ps-lib-card">
                    <div className="ps-lib-thumb">
                      <span>{listing.tag}</span>
                    </div>
                    <div className="ps-lib-body">
                      <div className="ps-lib-price">{listing.price}</div>
                      <div className="ps-lib-addr">{listing.addr}</div>
                      <div className="ps-lib-meta">{listing.meta}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="ps-lib-foot">
                <span>986 listings · collected in one run</span>
                <span>Updated 2 minutes ago</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* template:remove:end */}

      {/* template:remove:start salesReports */}
      <section className="ps-panel ps-panel-reports ps-demo-full">
        <div className="ps-demo-full-inner">
          <div className="ps-demo-head">
            <div className="ps-demo-metarow">
              <span className="ps-pill bg-[#A87B1B]">Board Reports</span>
              {REPORTS_BUILD_TIME && (
                <span className="ps-demo-time">{REPORTS_BUILD_TIME}</span>
              )}
            </div>
            <h2 className="ps-display ps-demo-h2 mt-5">
              Creating automated management reports from spreadsheets.
            </h2>
            <p className="ps-demo-lede mt-4">
              We built this prototype for a client that had their business
              running off spreadsheets, we could ingest their sales performance
              weekly and produce structured management reports with our agents
              and secure platform.
            </p>
            <div className="mt-6">
              <ContactLink className="ps-cta-quiet">Talk to us</ContactLink>
            </div>
          </div>

          <div className="ps-demo-stage">
            <div className="ps-demo-screen">
              <div className="ps-lib-bar">
                <span className="ps-rep-title">
                  Weekly board report
                  <em>Week 31 · generated Monday 07:00</em>
                </span>
                <span className="ps-rep-status">Waiting for approval</span>
              </div>

              <div className="ps-rep-body">
                <div className="ps-rep-metrics">
                  {[
                    { k: "Weighted pipeline", v: "£486k", d: "▲ 12% on last week" },
                    { k: "Closing this month", v: "8", d: "of 38 open deals" },
                    { k: "Needs attention", v: "5", d: "2 critical" },
                  ].map((metric) => (
                    <div key={metric.k} className="ps-rep-metric">
                      <span className="ps-rep-metric-k">{metric.k}</span>
                      <span className="ps-rep-metric-v">{metric.v}</span>
                      <span className="ps-rep-metric-d">{metric.d}</span>
                    </div>
                  ))}
                </div>

                <div className="ps-rep-chart">
                  <span className="ps-rep-section">Weighted pipeline by month</span>
                  <div className="ps-rep-bars">
                    {PIPELINE.map((bar, i) => (
                      <div key={bar.m} className="ps-rep-bar">
                        <i
                          style={{
                            height: `${bar.v}%`,
                            background: i === PIPELINE.length - 1 ? "#A87B1B" : "#E4D2A6",
                          }}
                        />
                        <span>{bar.m}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="ps-rep-risks">
                  <span className="ps-rep-section">Risks, each with a recommendation</span>
                  {RISKS.map((risk) => (
                    <div key={risk.deal} className="ps-rep-risk">
                      <span className="ps-rep-level" data-level={risk.level}>
                        {risk.level}
                      </span>
                      <div>
                        <div className="ps-rep-deal">{risk.deal}</div>
                        <div className="ps-rep-note">{risk.note}</div>
                      </div>
                      <div className="ps-rep-action">{risk.action}</div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="ps-lib-foot">
                <span>8 board-ready sections · 38 deals read</span>
                <span>0 analyst hours</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* template:remove:end */}

      {/* template:remove:start movement */}
      <section className="ps-panel ps-panel-studio ps-demo-full">
        <div className="ps-demo-full-inner">
          <div className="ps-demo-head">
            <div className="ps-demo-metarow">
              <span className="ps-pill bg-[#C05B3C]">Posture Studio</span>
              {STUDIO_BUILD_TIME && (
                <span className="ps-demo-time">{STUDIO_BUILD_TIME}</span>
              )}
            </div>
            <h2 className="ps-display ps-demo-h2 mt-5">
              Maintain better posture and movement through your webcam.
            </h2>
            <p className="ps-demo-lede mt-4">
              It runs in your browser on any laptop with a webcam, tracking 553
              points on you around 14 times a second across four AI vision
              systems working together. Everything is processed on your own
              device, so no video of you is ever uploaded or stored, and your
              movement data is never used to train a model.
            </p>
            <div className="mt-6">
              <ContactLink className="ps-cta-quiet">Talk to us</ContactLink>
            </div>
          </div>

          <div className="ps-demo-stage">
            <div className="ps-demo-screen">
              <div className="ps-lib-bar">
                <span className="ps-rep-title">
                  Roll down
                  <em>Beginner · take 3</em>
                </span>
                <span className="ps-cap-rec">
                  <i />
                  Capturing · 00:14
                </span>
              </div>

              <div className="ps-cap-body">
                <div className="ps-cap-stage">
                  <svg viewBox="0 0 420 640" preserveAspectRatio="xMidYMid meet" aria-hidden>
                    <path d={SILHOUETTE} fill="rgba(245,196,178,0.07)" />

                    {/* face mesh */}
                    {FACE_POINTS.map(([x, y], i) => (
                      <circle key={`f${i}`} cx={x} cy={y} r={1.1} fill="rgba(245,196,178,0.62)" />
                    ))}

                    {/* hands — 21 tracked points each */}
                    {[HAND_L, HAND_R].map((hand, h) => (
                      <g key={`h${h}`}>
                        {hand.bones.map(([from, to], i) => (
                          <line
                            key={`hb${h}-${i}`}
                            x1={from[0]}
                            y1={from[1]}
                            x2={to[0]}
                            y2={to[1]}
                            stroke="rgba(245,196,178,0.42)"
                            strokeWidth="1.3"
                            strokeLinecap="round"
                          />
                        ))}
                        {hand.dots.map(([x, y], i) => (
                          <circle key={`hd${h}-${i}`} cx={x} cy={y} r={1.7} fill="#F5C4B2" />
                        ))}
                      </g>
                    ))}

                    {BONES.map(([a, z]) => (
                      <line
                        key={`${a}-${z}`}
                        x1={J[a][0]}
                        y1={J[a][1]}
                        x2={J[z][0]}
                        y2={J[z][1]}
                        stroke="rgba(245,196,178,0.5)"
                        strokeWidth="2.4"
                        strokeLinecap="round"
                      />
                    ))}
                    {(Object.keys(J) as JointName[]).map((name) => (
                      <circle key={name} cx={J[name][0]} cy={J[name][1]} r={4.2} fill="#F5C4B2" />
                    ))}
                  </svg>
                  <span className="ps-cap-badge">Avatar replay · live</span>
                </div>

                <div className="ps-cap-side">
                  <span className="ps-rep-section">Live joint angles</span>
                  {JOINTS.map((joint) => (
                    <div key={joint.name} className="ps-cap-joint">
                      <span>{joint.name}</span>
                      <b>{joint.value}</b>
                    </div>
                  ))}
                  <div className="ps-cap-privacy">
                    Processed on your device. Nothing is uploaded and no video is
                    kept.
                  </div>
                </div>
              </div>

              <div className="ps-lib-foot">
                <span>553 points tracked live · ~14 scans a second</span>
                <span>0 frames of video stored</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* template:remove:end */}

      {/* template:remove:start salesData */}
      <section className="ps-panel ps-panel-sales ps-demo-full">
        <div className="ps-demo-full-inner">
          <div className="ps-demo-head">
            <div className="ps-demo-metarow">
              <span className="ps-pill bg-[#3C6079]">
                Agentic Research and Upsells
              </span>
              {SALES_BUILD_TIME && (
                <span className="ps-demo-time">{SALES_BUILD_TIME}</span>
              )}
            </div>
            <h2 className="ps-display ps-demo-h2 mt-5">
              Finding the revenue already sitting inside your own sales data.
            </h2>
            <p className="ps-demo-lede mt-4">
              For businesses that have great systems and know what is happening
              day to day but lack the modern research and vision that agentic AI
              can bring. This customer exported their customer and sales data
              into spreadsheets, and as a rapid proof of concept we imported the
              history, turned it into a real CRM, then put three research agents
              on top: one finds products existing customers are not buying that
              their sister sites are, one finds new sites inside the groups they
              already supply, and one goes out looking for groups they have
              never sold to.
            </p>
            <div className="mt-6">
              <ContactLink className="ps-cta-quiet">Talk to us</ContactLink>
            </div>
          </div>

          <div className="ps-demo-stage">
            <div className="ps-demo-screen">
              <div className="ps-lib-bar">
                <span className="ps-rep-title">
                  Opportunity report
                  <em>Priced from sales-history.xlsx · 412 accounts · 6 months</em>
                </span>
                <span className="ps-opp-status">Report ready</span>
              </div>

              <div className="ps-opp-body">
                <div className="ps-rep-metrics">
                  {[
                    { k: "Total opportunity", v: "£1.24m", d: "over the next six months" },
                    { k: "New sites to win", v: "£780k", d: "61 sites across 18 groups" },
                    { k: "Upsell at existing accounts", v: "£462k", d: "204 product gaps" },
                  ].map((metric) => (
                    <div key={metric.k} className="ps-rep-metric">
                      <span className="ps-rep-metric-k">{metric.k}</span>
                      <span className="ps-rep-metric-v">{metric.v}</span>
                      <span className="ps-rep-metric-d">{metric.d}</span>
                    </div>
                  ))}
                </div>

                <div>
                  <span className="ps-rep-section">
                    Three agents, one table
                  </span>
                  <div className="ps-opp-tabs">
                    {OPPORTUNITY_TABS.map((tab, i) => (
                      <span key={tab} className="ps-opp-tab" data-on={i === 0}>
                        {tab}
                      </span>
                    ))}
                  </div>
                  <div className="ps-opp-rows">
                    {OPPORTUNITY_ROWS.map((row) => (
                      <div key={row.site} className="ps-opp-row">
                        <div>
                          <div className="ps-rep-deal">{row.site}</div>
                          <div className="ps-opp-group">{row.group}</div>
                        </div>
                        <span className="ps-opp-kind" data-kind={row.kind}>
                          {row.kind}
                        </span>
                        <div className="ps-opp-how">{row.how}</div>
                        <div className="ps-opp-value">{row.value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="ps-lib-foot">
                <span>412 accounts read · 61 groups searched</span>
                <span>One press · 4 minutes</span>
              </div>
            </div>
          </div>
        </div>
      </section>
      {/* template:remove:end */}
    </div>
  );
}
