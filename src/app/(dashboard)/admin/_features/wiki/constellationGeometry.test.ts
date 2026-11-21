import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA,
  MAP_MOTION,
  MAX_DISTANCE,
  MIN_DISTANCE,
  buildConstellation,
  clampDistance,
  projectPoint,
  wheelZoomFactor,
} from "./constellationGeometry";
import { runForceLayout, type WikiMapRow } from "./wikiMapLayout";

const rows: WikiMapRow[] = [
  { pageId: "p_a", kind: "POLICY", title: "Returns", subjectKey: "returns", links: ["PRODUCT:sofa"] },
  { pageId: "p_b", kind: "PRODUCT", title: "Sofa", subjectKey: "sofa", links: ["CUSTOMER:acme"] },
  { pageId: "p_c", kind: "CUSTOMER", title: "Acme", subjectKey: "acme", links: [] },
  { pageId: "p_d", kind: "GOAL", title: "Loose page", subjectKey: "loose", links: [] },
];
const extra = new Map([
  ["p_a", { usage: 12, learnedAt: 300 }],
  ["p_b", { usage: 0, learnedAt: 100 }],
  ["p_c", { usage: 4, learnedAt: 200 }],
  ["p_d", { usage: 0, learnedAt: 400 }],
]);

describe("buildConstellation", () => {
  const layout = runForceLayout(rows);
  const constellation = buildConstellation(layout, extra);
  const byId = (id: string) => constellation.nodes.find((node) => node.pageId === id)!;

  it("keeps every page and every link, and knows each page's neighbours", () => {
    expect(constellation.nodes).toHaveLength(4);
    expect(constellation.edges).toHaveLength(2);
    const b = constellation.nodes.indexOf(byId("p_b"));
    expect(constellation.neighbours[b].map((i) => constellation.nodes[i].pageId).sort()).toEqual(["p_a", "p_c"]);
    expect(constellation.neighbours[constellation.nodes.indexOf(byId("p_d"))]).toEqual([]);
  });

  it("ranks pages in the order the wiki learned them, for Watch it grow", () => {
    expect(["p_b", "p_c", "p_a", "p_d"].map((id) => byId(id).rank)).toEqual([0, 1, 2, 3]);
  });

  it("draws a used page bigger, and the same wiki the same way every visit", () => {
    expect(byId("p_a").size).toBeGreaterThan(byId("p_b").size);
    expect(byId("p_a").usage).toBe(12);
    expect(buildConstellation(layout, extra)).toEqual(constellation);
  });

  it("spreads a small wiki to fill the frame, centred where it turns", () => {
    const reach = Math.max(...constellation.nodes.map((node) => Math.hypot(node.p[0], node.p[1])));
    expect(reach).toBeCloseTo(340, 0);
    const midX = constellation.nodes.reduce((sum, node) => sum + node.p[0], 0) / constellation.nodes.length;
    expect(Math.abs(midX)).toBeLessThan(1);
  });

  it("gives every page a cloud of dots", () => {
    for (const node of constellation.nodes) expect(node.dots.length).toBeGreaterThanOrEqual(30);
  });
});

describe("projectPoint", () => {
  it("puts the centre in the middle of the screen", () => {
    const [x, y] = projectPoint([0, 0, 0], DEFAULT_CAMERA, 800, 600)!;
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(300);
  });

  it("draws nearer things larger, and nothing behind the eye", () => {
    const near = projectPoint([0, 0, 0], { yaw: 0, pitch: 0, distance: 300, target: [0, 0, 0] as [number, number, number] }, 800, 600)!;
    const far = projectPoint([0, 0, 0], { yaw: 0, pitch: 0, distance: 900, target: [0, 0, 0] as [number, number, number] }, 800, 600)!;
    expect(near[2]).toBeGreaterThan(far[2]);
    expect(projectPoint([0, 0, -500], { yaw: 0, pitch: 0, distance: 300, target: [0, 0, 0] as [number, number, number] }, 800, 600)).toBeNull();
  });
});

describe("the point the eye circles", () => {
  it("puts the page you fly to in the middle of the screen", () => {
    const node = buildConstellation(runForceLayout(rows), extra).nodes[0];
    const camera = { yaw: 1.1, pitch: -0.4, distance: 40, target: node.p };
    const [x, y, scale] = projectPoint(node.p, camera, 800, 600)!;
    expect(x).toBeCloseTo(400);
    expect(y).toBeCloseTo(300);
    // Close enough that the page's cloud fills the view.
    expect(scale).toBeGreaterThan(10);
  });
});

describe("clampDistance", () => {
  it("keeps flying inside the map's limits", () => {
    expect(clampDistance(1)).toBe(MIN_DISTANCE);
    expect(clampDistance(1e6)).toBe(MAX_DISTANCE);
    expect(clampDistance(500)).toBe(500);
  });
});

// Anthony, 2026-11-12: "the wiki graph move is too sensitive and we need to
// slow it down a little".
describe("how gently the map moves", () => {
  it("lets a light pinch zoom a little, not a whole step", () => {
    // A trackpad pinch arrives as many ticks of a few pixels each.
    const pinchTick = wheelZoomFactor(-3);
    expect(pinchTick).toBeLessThan(1);
    expect(1 - pinchTick).toBeLessThan(0.01);
    // The old rule flew 11% closer on every tick, however small.
    expect(pinchTick).toBeGreaterThan(0.89);
  });

  it("still takes one clear step for a mouse-wheel notch, a little smaller than before", () => {
    const notchIn = wheelZoomFactor(-100);
    const notchOut = wheelZoomFactor(100);
    expect(notchIn).toBeGreaterThan(0.89);
    expect(notchIn).toBeLessThan(0.95);
    expect(notchOut).toBeLessThan(1.12);
    expect(notchOut).toBeGreaterThan(1.05);
  });

  it("reads a wheel that counts in lines as the pixels it means", () => {
    expect(wheelZoomFactor(-3, 1)).toBeCloseTo(wheelZoomFactor(-48, 0));
  });

  it("turns and glides more slowly than it did", () => {
    expect(MAP_MOTION.dragPerPixel).toBeLessThan(0.006);
    expect(MAP_MOTION.glide).toBeLessThan(0.08);
  });
});
