"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Maximize2, Minimize2, Minus, Plus, RotateCcw, X } from "lucide-react";

import { cn } from "@/src/ui/lib/utils";
import { useReducedMotion } from "@/src/hooks/useReducedMotion";
import { LAYER } from "@/src/ui/lib/layers";
import { Button, buttonClasses } from "@/src/ui/components/screens/Button";
import { TableSearchInput } from "@/src/ui/components/screens/TableControls";
import { WIKI_KIND_RGB } from "@/src/ui/components/charts/chartPalette";
import {
  DOTS_GROUND,
  DOTS_LABEL,
  DOTS_LABEL_FOCUS,
  DOTS_LINK,
  DOTS_LINK_DUST,
  DOTS_LINK_DUST_LIT,
  DOTS_LINK_FADED,
  DOTS_LINK_LIT,
  DOTS_STAR,
} from "@/src/ui/components/dots/dotsPalette";
import {
  DEFAULT_CAMERA,
  KIND_ORDER,
  MAP_MOTION,
  clampDistance,
  projectPoint,
  wheelZoomFactor,
  type Camera,
  type Constellation,
} from "./constellationGeometry";

/** How long Watch it grow takes to bring every page in. */
const GROW_MS = 7000;
/** How slowly it turns on its own, in radians a frame. */
const TURN_SPEED = 0.0016;

const rgb = (kind: string, alpha = 1) => {
  const [r, g, b] = WIKI_KIND_RGB[kind] ?? WIKI_KIND_RGB.SOURCE;
  return alpha === 1 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${alpha})`;
};

type Pointing = { index: number; pageId: string; x: number; y: number } | null;

/**
 * The wiki as a living constellation (Anthony, 2026-11-12, in the upstream
 * framework: "give it more of a particle feel, perhaps this can animate, we
 * can rotate it around, zoom through it"; brought over on 2026-11-21 in the
 * same look, wiki-sonae-catch-up-plan-2026-11-21.md, S3).
 *
 * Every page is a small cloud of shimmering dots in its kind's colour, sized
 * by how linked and how used it is, and every link a faint line with a mote
 * of dust running along it. It turns slowly on its own until touched. Drag
 * to turn it; scroll, or press + and −, to fly in and through it. Pointing at
 * a page lights it and the pages it's joined to and names only those, so names
 * never pile up the way the old flat map's did. Clicking a page opens a small
 * card with Open the page and Show only its neighbours. Find a page flies to
 * it. Watch it grow replays the wiki filling up in the order it learned its
 * pages. Anyone who has asked for less motion gets a still map that only
 * moves when they move it.
 *
 * The canvas is a picture; every page is also a link in a list a screen reader
 * or keyboard can reach, and the key names every colour in words.
 */
export function WikiConstellation({ constellation, basePath }: { constellation: Constellation; basePath: string }) {
  const t = useTranslations("aiPages");
  const common = useTranslations("common");
  const reducedMotion = useReducedMotion();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const cameraRef = useRef<Camera>({ ...DEFAULT_CAMERA, target: [...DEFAULT_CAMERA.target] });
  /** Where the eye is heading: the page you flew towards, or the middle. */
  const aimRef = useRef<[number, number, number]>([...DEFAULT_CAMERA.target]);
  const targetDistanceRef = useRef(DEFAULT_CAMERA.distance);
  const dragRef = useRef<{ x: number; y: number; moved: boolean } | null>(null);
  const overRef = useRef(false);
  /** Each page's marker as last drawn: its index, centre, size and how far away it is. */
  const screenRef = useRef<Array<[number, number, number, number, number]>>([]);
  const growStartRef = useRef<number | null>(null);

  const [pointingAt, setPointing] = useState<Pointing>(null);
  // The chosen page is held by its id, never its place in the list. The list
  // reorders whenever the wiki learns or the AI uses a page, and a place
  // then named a different page, so the card could open the wrong one and
  // the drawing could stop on a place that was gone (2026-11-12).
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [onlyNeighbours, setOnlyNeighbours] = useState(false);
  const [query, setQuery] = useState("");
  const [turning, setTurning] = useState(true);
  const [growShown, setGrowShown] = useState<number | null>(null);
  const [nudge, setNudge] = useState(false);
  // Fill the window (Anthony, 2026-11-12: "almost like a full screen
  // option"): the map covers the whole browser window, over the menus, until
  // the same button or Esc brings it back.
  const [filling, setFilling] = useState(false);
  useEffect(() => {
    if (!filling) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setFilling(false);
    };
    window.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [filling]);


  const { nodes, edges, neighbours } = constellation;
  const selectedIndex = selectedId === null ? -1 : nodes.findIndex((node) => node.pageId === selectedId);
  const selected = selectedIndex >= 0 ? selectedIndex : null;
  const setSelected = (index: number | null) => setSelectedId(index === null ? null : (nodes[index]?.pageId ?? null));
  const pointing = pointingAt && nodes[pointingAt.index]?.pageId === pointingAt.pageId ? pointingAt : null;

  // The drawing loop reads the latest of these without starting again.
  const live = useRef({ pointing, selected, onlyNeighbours, query, turning, growShown });
  useEffect(() => {
    live.current = { pointing, selected, onlyNeighbours, query, turning, growShown };
  }, [pointing, selected, onlyNeighbours, query, turning, growShown]);

  const counts = useMemo(() => {
    const byKind = new Map<string, number>();
    for (const node of nodes) byKind.set(node.kind, (byKind.get(node.kind) ?? 0) + 1);
    return byKind;
  }, [nodes]);

  /**
   * The page whose marker is under a point on the map. Only the markers are
   * pages; the soft dots round them are decoration and never answer the
   * pointer, so flying close to one page can't swallow every click (Anthony,
   * 2026-11-12: "I cannot click on anything else other than this … can we
   * distinguish the clickable one against the decoration"). `slack` widens
   * the search, for flying in towards the nearest page.
   */
  const pickAt = useCallback((x: number, y: number, slack = 0) => {
    let best: { index: number; x: number; y: number } | null = null;
    let bestDistance = Infinity;
    for (const [index, sx, sy, marker] of screenRef.current) {
      const distance = Math.hypot(sx - x, sy - y);
      if (distance < Math.max(marker + 12, 22, slack) && distance < bestDistance) {
        bestDistance = distance;
        best = { index, x: sx, y: sy };
      }
    }
    return best;
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // Hakken's live setting (src/hooks/useReducedMotion.ts): turning it on or off redraws the map at once.
    const lessMotion = reducedMotion;
    const font = getComputedStyle(canvas).fontFamily;
    const start = performance.now();
    let frame = 0;
    let lastShown = -1;
    let nudgeTimer: ReturnType<typeof setTimeout> | undefined;

    // Scrolling the page never moves the map (Anthony, 2026-11-12: "only make
    // the map move with a key press and a scroll"). Ctrl or ⌘ with the wheel
    // flies in and out, and so does a trackpad pinch, which the browser sends
    // as a wheel with Ctrl held. A plain scroll carries on down the page and
    // shows a short note saying which key to hold.
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) {
        setNudge(true);
        clearTimeout(nudgeTimer);
        nudgeTimer = setTimeout(() => setNudge(false), 1600);
        return;
      }
      event.preventDefault();
      const closer = event.deltaY < 0;
      targetDistanceRef.current = clampDistance(targetDistanceRef.current * wheelZoomFactor(event.deltaY, event.deltaMode));
      // Flying in heads for the page under the pointer, so you can go right
      // into its cloud; flying back out to the whole map heads home.
      if (closer) {
        const bounds = canvas.getBoundingClientRect();
        const hit = pickAt(event.clientX - bounds.left, event.clientY - bounds.top, 160);
        if (hit) aimRef.current = [...nodes[hit.index].p];
      } else if (targetDistanceRef.current >= DEFAULT_CAMERA.distance) {
        aimRef.current = [...DEFAULT_CAMERA.target];
      }
      setTurning(false);
    };
    canvas.addEventListener("wheel", onWheel, { passive: false });

    const draw = (now: number) => {
      const state = live.current;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = DOTS_GROUND;
      ctx.fillRect(0, 0, width, height);

      const camera = cameraRef.current;
      const seconds = (now - start) / 1000;
      // It holds still while the pointer is over it, so a page never drifts
      // out from under the pointer you are aiming with (Anthony, 2026-11-12:
      // "it's really hard to select an item").
      if (state.turning && !dragRef.current && !overRef.current && !lessMotion) camera.yaw += TURN_SPEED;
      camera.distance += (targetDistanceRef.current - camera.distance) * MAP_MOTION.glide;
      for (let axis = 0; axis < 3; axis++) camera.target[axis] += (aimRef.current[axis] - camera.target[axis]) * MAP_MOTION.glide;

      // Watch it grow: pages come in one by one, in the order they were learned.
      let visible = nodes.length;
      if (growStartRef.current !== null) {
        const progress = Math.min(1, (now - growStartRef.current) / GROW_MS);
        visible = Math.max(1, Math.ceil(progress * nodes.length));
        if (visible !== lastShown) {
          lastShown = visible;
          setGrowShown(progress >= 1 ? null : visible);
        }
        if (progress >= 1) growStartRef.current = null;
      }

      const focus = state.selected ?? state.pointing?.index ?? null;
      const lit = focus !== null ? new Set([focus, ...(neighbours[focus] ?? [])]) : null;
      const search = state.query.trim().toLowerCase();
      const only = state.onlyNeighbours && state.selected !== null ? lit : null;
      const shown = (i: number) => nodes[i].rank < visible && (only ? only.has(i) : true);

      // A slow drift of loose stars behind everything, as on the home page.
      ctx.fillStyle = DOTS_STAR;
      for (let i = 0; i < 140; i++) {
        const sx = ((i * 97.3 + (lessMotion ? 0 : seconds * ((i % 5) + 1) * 0.6)) % (width + 20)) - 10;
        const sy = (i * 53.7) % height;
        ctx.globalAlpha = lessMotion ? 0.3 : 0.15 + 0.25 * Math.abs(Math.sin(seconds * 0.7 + i));
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
      ctx.globalAlpha = 1;

      const projected = nodes.map((node) => projectPoint(node.p, camera, width, height));

      for (const [a, b, phase] of edges) {
        if (!shown(a) || !shown(b)) continue;
        const from = projected[a];
        const to = projected[b];
        if (!from || !to) continue;
        const isLit = lit !== null && (a === focus || b === focus);
        ctx.strokeStyle = isLit ? DOTS_LINK_LIT : lit ? DOTS_LINK_FADED : DOTS_LINK;
        ctx.lineWidth = isLit ? 1.2 : 0.8;
        ctx.beginPath();
        ctx.moveTo(from[0], from[1]);
        ctx.lineTo(to[0], to[1]);
        ctx.stroke();
        if (!lessMotion) {
          const along = (seconds * 0.25 + phase) % 1;
          ctx.fillStyle = isLit ? DOTS_LINK_DUST_LIT : DOTS_LINK_DUST;
          ctx.fillRect(from[0] + (to[0] - from[0]) * along - 1, from[1] + (to[1] - from[1]) * along - 1, 2, 2);
        }
      }

      const order = nodes
        .map((_, i) => i)
        .filter(shown)
        .sort((x, y) => (projected[y]?.[3] ?? 0) - (projected[x]?.[3] ?? 0));
      // First the decoration: each page's soft cloud, far to near. It sits
      // behind every marker and is never clicked.
      for (const i of order) {
        const node = nodes[i];
        if (!projected[i]) continue;
        const faded = (lit !== null && !lit.has(i)) || (search !== "" && !node.title.toLowerCase().includes(search));
        const bloom = growStartRef.current !== null && node.rank === visible - 1 ? 1.8 : 1;
        const size = node.size * bloom;
        ctx.fillStyle = rgb(node.kind);
        for (const [dx, dy, dz, twinkle] of node.dots) {
          const wobble = lessMotion ? 0 : Math.sin(seconds * 1.3 + twinkle) * 1.4;
          const dot = projectPoint([node.p[0] + dx * size + wobble, node.p[1] + dy * size, node.p[2] + dz * size], camera, width, height);
          if (!dot) continue;
          // Nearer dots are drawn bigger, as a real zoom should (Anthony,
          // 2026-11-12: "the dots never get bigger the closer I get"). Far
          // away they are tiny square sparks, as on the home page; close up
          // they are soft round discs that fade the bigger they get, so they
          // read as the background you are flying through, never as pages.
          const r = Math.min(90, Math.max(1.5, 3 * dot[2]));
          const shimmer = lessMotion ? 0.8 : 0.55 + 0.45 * Math.sin(seconds * 2 + twinkle * 3);
          const soft = r < 3 ? 1 : r < 10 ? 0.7 : 0.4;
          ctx.globalAlpha = (faded ? 0.12 : 1) * shimmer * soft * Math.min(1, dot[2] * 1.9);
          if (r < 3) {
            ctx.fillRect(dot[0] - r / 2, dot[1] - r / 2, r, r);
          } else {
            ctx.beginPath();
            ctx.arc(dot[0], dot[1], r / 2, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      }
      ctx.globalAlpha = 1;

      // Then the pages themselves: one solid dot in the kind's colour with a
      // white ring, drawn over all the decoration, so what you can click is
      // never in doubt. Names go under the nearest markers without pointing,
      // as many as fit without overlapping, and always under the page you
      // point at, the page you picked and the pages joined to it.
      const screen: Array<[number, number, number, number, number]> = [];
      const placed: Array<[number, number, number, number]> = [];
      const labelBudget = new Set(
        order
          .filter((i) => projected[i])
          .sort((x, y) => (projected[y]?.[2] ?? 0) - (projected[x]?.[2] ?? 0))
          .slice(0, 12),
      );
      ctx.textAlign = "center";
      for (const i of order) {
        const node = nodes[i];
        const centre = projected[i];
        if (!centre || centre[0] < -40 || centre[0] > width + 40 || centre[1] < -40 || centre[1] > height + 40) continue;
        const faded = (lit !== null && !lit.has(i)) || (search !== "" && !node.title.toLowerCase().includes(search));
        const marker = Math.min(11, Math.max(4.5, (3 + 2.2 * centre[2]) * node.size));
        const picked = i === state.pointing?.index || i === state.selected;
        ctx.globalAlpha = faded ? 0.35 : 1;
        if (picked) {
          ctx.strokeStyle = DOTS_LINK_LIT;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(centre[0], centre[1], marker + 7, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.fillStyle = rgb(node.kind);
        ctx.beginPath();
        ctx.arc(centre[0], centre[1], marker, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = DOTS_LABEL_FOCUS;
        ctx.lineWidth = picked ? 2.5 : 1.5;
        ctx.stroke();
        screen.push([i, centre[0], centre[1], marker, centre[3]]);

        const must = (lit !== null && lit.has(i)) || (search !== "" && node.title.toLowerCase().includes(search));
        if (i === state.pointing?.index || faded || (!must && !labelBudget.has(i))) continue;
        const text = node.title.length > 32 ? `${node.title.slice(0, 31)}…` : node.title;
        ctx.font = `${i === focus ? 600 : 400} 13px ${font}`;
        const half = ctx.measureText(text).width / 2 + 4;
        const ty = centre[1] + marker + 16;
        const box: [number, number, number, number] = [centre[0] - half, ty - 12, centre[0] + half, ty + 4];
        const clash = placed.some((o) => box[0] < o[2] && box[2] > o[0] && box[1] < o[3] && box[3] > o[1]);
        if (clash && !must) continue;
        placed.push(box);
        ctx.fillStyle = i === focus ? DOTS_LABEL_FOCUS : DOTS_LABEL;
        ctx.fillText(text, centre[0], ty);
      }
      ctx.globalAlpha = 1;
      screenRef.current = screen;
    };

    // The map rests while nobody can see it: scrolled out of view, or the tab in the background
    // (wiki-sonae-catch-up-plan-2026-11-21.md, S3). It picks up where it was when it comes back.
    let onScreen = true;
    const wanted = () => onScreen && document.visibilityState !== "hidden";
    const loop = (now: number) => {
      draw(now);
      frame = wanted() ? requestAnimationFrame(loop) : 0;
    };
    const wake = () => {
      if (frame === 0 && wanted()) frame = requestAnimationFrame(loop);
    };
    const watcher = typeof IntersectionObserver === "function"
      ? new IntersectionObserver((entries) => {
        onScreen = entries.some((entry) => entry.isIntersecting);
        wake();
      })
      : null;
    watcher?.observe(canvas);
    document.addEventListener("visibilitychange", wake);
    frame = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(frame);
      watcher?.disconnect();
      document.removeEventListener("visibilitychange", wake);
      clearTimeout(nudgeTimer);
      canvas.removeEventListener("wheel", onWheel);
    };
  }, [nodes, edges, neighbours, pickAt, filling, reducedMotion]);

  const pick = (x: number, y: number) => pickAt(x, y);

  const local = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    dragRef.current = { x: event.clientX, y: event.clientY, moved: false };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const onPointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    if (drag) {
      const dx = event.clientX - drag.x;
      const dy = event.clientY - drag.y;
      drag.x = event.clientX;
      drag.y = event.clientY;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      const camera = cameraRef.current;
      camera.yaw += dx * MAP_MOTION.dragPerPixel;
      camera.pitch = Math.max(-1.3, Math.min(1.3, camera.pitch + dy * MAP_MOTION.dragPerPixel));
      return;
    }
    const { x, y } = local(event);
    const hit = pick(x, y);
    // The name label stays inside the map's frame, however near the edge the page is.
    const width = event.currentTarget.clientWidth;
    if (hit?.index !== pointing?.index) {
      setPointing(hit ? { ...hit, pageId: nodes[hit.index].pageId, x: Math.max(116, Math.min(hit.x, width - 116)) } : null);
    }
  };
  const onPointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) {
      const { x, y } = local(event);
      setSelected(pick(x, y)?.index ?? null);
      setOnlyNeighbours(false);
    } else if (drag) {
      setTurning(false);
    }
  };

  const flyBy = (factor: number) => {
    targetDistanceRef.current = clampDistance(targetDistanceRef.current * factor);
    // Flying in heads for the page you picked, or else the page nearest the
    // middle of the map, so + never flies you into empty space.
    if (factor < 1) {
      const canvas = canvasRef.current;
      const nearest = selected ?? (canvas ? pickAt(canvas.clientWidth / 2, canvas.clientHeight / 2, Infinity)?.index : undefined);
      if (nearest !== undefined && nearest !== null && nodes[nearest]) aimRef.current = [...nodes[nearest].p];
    }
    if (factor > 1 && targetDistanceRef.current >= DEFAULT_CAMERA.distance) aimRef.current = [...DEFAULT_CAMERA.target];
    setTurning(false);
  };
  const reset = () => {
    targetDistanceRef.current = DEFAULT_CAMERA.distance;
    cameraRef.current.pitch = DEFAULT_CAMERA.pitch;
    aimRef.current = [...DEFAULT_CAMERA.target];
    setTurning(true);
    setSelected(null);
    setOnlyNeighbours(false);
    setQuery("");
  };
  /** Fly to a page and open its card. */
  const goTo = (index: number) => {
    aimRef.current = [...nodes[index].p];
    targetDistanceRef.current = clampDistance(220);
    setTurning(false);
    setOnlyNeighbours(false);
    setSelected(index);
  };
  const find = (value: string) => {
    setQuery(value);
    const needle = value.trim().toLowerCase();
    const hit = needle ? nodes.findIndex((node) => node.title.toLowerCase().includes(needle)) : -1;
    if (hit >= 0) goTo(hit);
  };
  const grow = () => {
    growStartRef.current = performance.now();
    setSelected(null);
    setGrowShown(1);
  };

  const card = selected !== null ? nodes[selected] : null;
  const hovered = pointing ? nodes[pointing.index] : null;

  // The map's frame. Filling the window lifts it to the top of the page, so
  // nothing the app draws (the main menu, the top bar) can sit over it.
  const frame = (
    <div
      data-filling={filling || undefined}
      className={cn(
        "overflow-hidden",
        filling ? cn("fixed inset-0", LAYER.OVERLAY) : "relative h-[440px] rounded-[4px] border border-border-dim lg:h-[600px]",
      )}
      style={{ backgroundColor: DOTS_GROUND }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={t("map.summary", { pages: nodes.length, links: edges.length })}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerEnter={() => {
          overRef.current = true;
        }}
        onPointerLeave={() => {
          overRef.current = false;
          dragRef.current = null;
          setPointing(null);
        }}
        className={cn("block h-full w-full touch-none font-sans", hovered ? "cursor-pointer" : "cursor-grab")}
      />

      <div className={cn("absolute right-3 top-3 flex gap-1", LAYER.RAISED)}>
        <Button variant="icon" aria-label={t("map.zoomIn")} title={t("map.zoomIn")} onClick={() => flyBy(0.78)} className="rounded-[6px] border border-border-dim bg-background/60">
          <Plus className="h-4 w-4" />
        </Button>
        <Button variant="icon" aria-label={t("map.zoomOut")} title={t("map.zoomOut")} onClick={() => flyBy(1.28)} className="rounded-[6px] border border-border-dim bg-background/60">
          <Minus className="h-4 w-4" />
        </Button>
        <Button variant="icon" aria-label={t("map.zoomReset")} title={t("map.zoomReset")} onClick={reset} className="rounded-[6px] border border-border-dim bg-background/60">
          <RotateCcw className="h-4 w-4" />
        </Button>
        <Button
          variant="icon"
          aria-label={filling ? t("map.fillLeave") : t("map.fillWindow")}
          title={filling ? t("map.fillLeave") : t("map.fillWindow")}
          aria-pressed={filling}
          onClick={() => setFilling((current) => !current)}
          className="rounded-[6px] border border-border-dim bg-background/60"
        >
          {filling ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>

      {hovered && pointing ? (
        <div
          role="status"
          className={cn("pointer-events-none absolute max-w-[220px] rounded-[4px] border border-border-dim bg-card/95 px-2.5 py-1.5 text-center", LAYER.RAISED)}
          style={{
            left: pointing.x,
            top: pointing.y,
            transform: pointing.y < 72 ? "translate(-50%, 18px)" : "translate(-50%, calc(-100% - 14px))",
          }}
        >
          <span className="block break-words text-[13px] font-semibold text-foreground">{hovered.title}</span>
          <span className="block text-[13px] text-secondary">
            {t(`kinds.${hovered.kind}`)} · {t("map.joinedTo", { count: neighbours[pointing.index].length })}
          </span>
        </div>
      ) : null}

      {card && selected !== null ? (
        <aside
          aria-label={t("map.cardLabel")}
          className={cn("absolute right-3 top-14 flex max-h-[calc(100%-68px)] w-[min(300px,calc(100%-24px))] flex-col gap-2.5 overflow-y-auto rounded-[4px] border border-border-dim bg-card/95 p-4", LAYER.RAISED)}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <span className="flex items-center gap-1.5 text-[13px] text-secondary">
                <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: rgb(card.kind) }} />
                {t(`kinds.${card.kind}`)}
              </span>
              <h3 className="mt-1 break-words text-[16px] font-semibold text-foreground">{card.title}</h3>
            </div>
            <Button variant="icon" aria-label={t("map.close")} onClick={() => setSelected(null)} className="shrink-0">
              <X className="h-4 w-4" />
            </Button>
          </div>
          <p className="text-[13px] leading-relaxed text-secondary">
            {t("map.cardLine", { used: card.usage })}
          </p>
          {neighbours[selected].length > 0 ? (
            <div className="flex flex-col gap-1">
              <span className="text-[13px] font-medium text-muted">{t("map.joinedHeading")}</span>
              <ul className="flex flex-col">
                {neighbours[selected].map((index) => (
                  <li key={nodes[index].pageId}>
                    <Button
                      variant="ghost"
                      onClick={() => goTo(index)}
                      className="flex w-full items-center gap-2 px-1.5 py-1 text-left text-[13px] text-foreground"
                    >
                      <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: rgb(nodes[index].kind) }} />
                      <span className="min-w-0 flex-1 break-words">{nodes[index].title}</span>
                      <span className="shrink-0 text-[13px] text-muted">{t(`kinds.${nodes[index].kind}`)}</span>
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Link href={`${basePath}/${card.pageId}`} className={buttonClasses("primary", "px-4 py-2 text-[13px] shadow-none")}>
              {t("map.openPage")}
            </Link>
            <Button variant="outline" onClick={() => setOnlyNeighbours((current) => !current)}>
              {onlyNeighbours ? t("map.showEverything") : t("map.onlyNeighbours")}
            </Button>
          </div>
        </aside>
      ) : null}

      {nudge ? (
        <p role="status" className={cn("pointer-events-none absolute left-1/2 top-1/2 max-w-[calc(100%-24px)] -translate-x-1/2 -translate-y-1/2 rounded-[4px] bg-background/85 px-3 py-2 text-center text-[13px] text-foreground", LAYER.RAISED)}>
          {t("map.scrollNudge")}
        </p>
      ) : null}

      {growShown !== null ? (
        <p className={cn("absolute bottom-3 left-3 rounded-[4px] bg-background/80 px-2.5 py-1.5 text-[13px] tabular-nums text-secondary", LAYER.RAISED)}>
          {t("map.growLine", { shown: growShown, total: nodes.length })}
        </p>
      ) : null}
    </div>
  );

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-[1_1_260px]">
          <TableSearchInput value={query} onChange={find} placeholder={t("map.find")} clearLabel={common("clearSearch")} />
        </div>
        {/* Watch it grow is all motion, so it isn't offered to anyone who has asked for less. */}
        {!reducedMotion && (
          <Button variant="outline" onClick={grow} disabled={growShown !== null}>
            {growShown !== null ? t("map.growing") : t("map.grow")}
          </Button>
        )}
        {/* The map never turns for anyone who has asked for less motion, so there's nothing to stop or start. */}
        {!reducedMotion && (
          <Button variant="outline" aria-pressed={turning} onClick={() => setTurning((current) => !current)}>
            {turning ? t("map.turnStop") : t("map.turnStart")}
          </Button>
        )}
      </div>

      <ul aria-label={t("map.legend")} className="flex flex-wrap gap-x-[18px] gap-y-1.5">
        {KIND_ORDER.filter((kind) => counts.has(kind)).map((kind) => (
          <li key={kind} className="flex items-center gap-1.5 text-[13px] text-secondary">
            <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: rgb(kind) }} />
            {t(`kinds.${kind}`)}
            <span className="tabular-nums text-muted">{counts.get(kind)}</span>
          </li>
        ))}
      </ul>

      {filling ? createPortal(frame, document.body) : frame}

      <p className="text-[13px] leading-relaxed text-secondary">{t("map.hint")}</p>

      {/* Every page as a link, for a keyboard or a screen reader. */}
      <ul className="sr-only" aria-label={t("map.pagesList")}>
        {nodes.map((node) => (
          <li key={node.pageId}>
            <Link href={`${basePath}/${node.pageId}`}>{`${node.title}, ${t(`kinds.${node.kind}`)}`}</Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
