import { useEffect, useSyncExternalStore } from "react";
import type { HakkenSeesStep, SeesAsk, SeesPage } from "./HakkenSees";

/**
 * What the screen's What Hakken sees box holds, and whether it is open
 * (docs/plans/active/sees-header-and-rolling-dates-plan.md, part one): the
 * box publishes its sentences and steps here as it mounts, with the screen's
 * address, and the header's eye (`HakkenSeesEye`) reads them — so the eye is
 * drawn by the header without any screen wiring it up. One screen is on show
 * at a time, so one box is held.
 *
 * The box is closed on every screen until the eye opens it. Opening it
 * marks its advice read in this browser (`hakken.sees.read.<screen>`), as the
 * fold was remembered (search-console-volatility-plan.md §8, HS3): the eye
 * counts the box's steps as new only while the advice is not the one last
 * read, so the same advice on today's numbers is not new again. A browser
 * that refuses storage keeps the reads for this visit only.
 */

/**
 * `ask`: the page's figures and links, handed to the Insights team when the
 * eye is pressed (sees-conversion-specialist-plan-2026-10-30.md S4); a page
 * without one shows the rule's words alone.
 */
export type SeesBox = { screen: string; says: string[]; steps: HakkenSeesStep[]; advice: string; ask?: SeesAsk; name?: (eventName: string) => string; page?: SeesPage };

const PREFIX = "hakken.sees.read.";
let current: SeesBox | null = null;
let open = false;
/** The headers that have asked to draw the eye, in the order they mounted: the first draws it. */
let claims: string[] = [];
const readKept = new Map<string, string>();
const listeners = new Set<() => void>();

function changed() {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

const useStore = <T>(read: () => T, onServer: () => T) => useSyncExternalStore(subscribe, read, onServer);

/** The box the screen has published, or null as it leaves: called by `HakkenSees`. A screen leaving clears only its own. */
export function publishSees(box: SeesBox | null, leaving?: string) {
  if (box) {
    // The stand-in open on this screen stays open as the page's own box replaces it.
    if ((current ?? standIn)?.screen !== box.screen) open = false;
    current = box;
  } else if (!leaving || current?.screen === leaving) {
    current = null;
    open = false;
  }
  changed();
}

/**
 * A section's stand-in (`SeesStandIn`): the eye on a page of the section that put none up itself — nothing collected
 * yet, no days of the period yet, nothing to list (sees-every-page-plan-2026-10-31.md: "No vanishing eyes"). It says
 * nothing and has no figures, so pressing writes nothing; the chat is there. A page's own box always wins.
 */
let standIn: SeesBox | null = null;

export function publishSeesStandIn(box: SeesBox | null, leaving?: string) {
  if (box) {
    if (!current && standIn?.screen !== box.screen) open = false;
    standIn = box;
  } else if (!leaving || standIn?.screen === leaving) {
    if (!current) open = false;
    standIn = null;
  }
  changed();
}

export function useSeesBox(): SeesBox | null {
  return useStore(() => current ?? standIn, () => null);
}

export function useSeesOpen(): boolean {
  return useStore(() => open, () => false);
}

/** The advice last read on a screen, or null. */
export function readAdvice(screen: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(PREFIX + screen);
  } catch {
    // Storage refused: what was read this visit stands in.
    return readKept.get(screen) ?? null;
  }
}

function markRead(screen: string, advice: string) {
  try {
    window.localStorage.setItem(PREFIX + screen, advice);
  } catch {
    readKept.set(screen, advice);
  }
}

/**
 * Open the bubble, marking its advice read, or close it. Each press opens it on a new conversation (Anthony,
 * 2026-10-31: "every time we press the eye it should open a new chat thread"): the last one stays in Ask Hakken's list.
 */
export function toggleSees() {
  open = !open;
  if (open && current) markRead(current.screen, current.advice);
  if (open) forgetSeesThreads();
  changed();
}

/** Close the bubble: a click outside it, or Escape (the speech bubble of 2026-10-30). */
export function closeSees() {
  if (!open) return;
  open = false;
  changed();
}

/**
 * What the Insights team said when the eye asked for a page (its key):
 * "RESEARCHING" while it writes, then what it saved, "FAILED" when there
 * was no team to ask, or "NO_CREDITS" when the company has none left. Kept here, outside React, so the eye's effect updates
 * it as an external system and the bubble reads it.
 */
export type SeesAsked = { key: string; status: "RESEARCHING" | "WRITTEN" | "FAILED" | "NO_CREDITS" };
let asked: SeesAsked | null = null;

export function noteAsked(key: string, status: SeesAsked["status"]) {
  // A later ask (another page, other filters) is never overwritten by an earlier one's answer.
  if (asked && asked.key !== key && status !== "RESEARCHING") return;
  asked = { key, status };
  changed();
}

export function useSeesAsked(): SeesAsked | null {
  return useStore(() => asked, () => null);
}

/** Whether the box holds advice not yet read in this browser. */
export function useSeesNew(): boolean {
  return useStore(() => (current ? readAdvice(current.screen) !== current.advice : false), () => false);
}

/**
 * A header asks to draw the eye. Where a page's own header sits under its
 * section's (Google Analytics' "Overview" under the website's), the
 * outermost mounts first and draws it; the rest draw nothing.
 */
export function claimEye(id: string) {
  if (!claims.includes(id)) claims = [...claims, id];
  changed();
  return () => {
    claims = claims.filter((other) => other !== id);
    changed();
  };
}

export function useDrawsEye(id: string): boolean {
  return useStore(() => claims[0] === id, () => false);
}

/**
 * Figures a panel reads for itself, inside a page that hands the eye its own (sees-every-page-plan-2026-10-31.md,
 * phase 4's gaps): Channels' table, Campaigns' chart, Conversions' events table each run their own query, so the
 * page's answer never held them. A panel names its figures here while it is on screen, and the eye reads them as part
 * of the page's figures, under that name. Held apart from the box, so a panel's figures arriving never republish it.
 */
let parts: Readonly<Record<string, unknown>> = {};

/** A panel's figures for the eye, under `name`, while it is on screen; nothing while they load or without a name. */
export function useSeesPart(name: string | undefined, data: unknown) {
  useEffect(() => {
    if (!name || data === undefined || data === null) return;
    parts = { ...parts, [name]: data };
    changed();
    return () => {
      // A panel's later figures under the same name have already replaced these: leave them.
      if (parts[name] !== data) return;
      const { [name]: _gone, ...rest } = parts;
      parts = rest;
      changed();
    };
  }, [name, data]);
}

/** The figures panels have named, the same object until one changes. */
export function useSeesParts(): Readonly<Record<string, unknown>> {
  return useStore(() => parts, () => NO_PARTS);
}
const NO_PARTS: Readonly<Record<string, unknown>> = {};

/**
 * A page's figures with its panels' own: beside the page's answer's parts, or — where the answer is a list or a number
 * — beside it as `page`. A page that handed over nothing keeps nothing: a panel speaks only through its page.
 */
export function withSeesParts(data: unknown, held: Readonly<Record<string, unknown>>): unknown {
  if (data === undefined || data === null || Object.keys(held).length === 0) return data;
  if (typeof data === "object" && !Array.isArray(data)) return { ...(data as Record<string, unknown>), ...held };
  return { page: data, ...held };
}

/**
 * The section's own pages, as its menu lists them (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 6): the
 * places a press's "Do first" steps may send the reader, on every page of every section, not only the three pages that
 * handed links of their own. The menu (`SectionMenu`) publishes them; the eye adds them after the page's own.
 */
export type SeesLink = { label: string; href: string };
let sectionLinks: readonly SeesLink[] = [];
const NO_LINKS: readonly SeesLink[] = [];

/** Publish a section's pages while its menu is drawn; the same list again changes nothing. */
export function useSeesSectionLinks(links: readonly SeesLink[] | null) {
  const key = links ? JSON.stringify(links) : "";
  useEffect(() => {
    if (!links || links.length === 0) return;
    const held: readonly SeesLink[] = JSON.parse(key);
    sectionLinks = held;
    changed();
    return () => {
      if (sectionLinks !== held) return;
      sectionLinks = NO_LINKS;
      changed();
    };
    // The list by its words and addresses, never by the array it came in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
}

/** The section's pages its menu published, the same array until they change. */
export function useSectionLinks(): readonly SeesLink[] {
  return useStore(() => sectionLinks, () => NO_LINKS);
}

/**
 * The charts on the page, each its title and a way to read its figures — the download it already offers (`ChartCard`'s
 * `csv`) — for Ask Hakken to redraw from (ask-hakken-every-chart-page-plan-2026-11-03.md, shared work 9). Read only when
 * a conversation starts, so a chart costs nothing while nobody asks.
 */
export type SeesChart = { title: string; csv: () => string };
/** Each chart by its card, holding its latest title and figures: a card keeps its place while its figures change. */
const charts = new Map<string, { current: SeesChart | null }>();

/** Register a chart while it is drawn; its latest figures are read when a conversation starts. */
export function useSeesChart(id: string, chart: SeesChart | null) {
  useEffect(() => {
    const held = charts.get(id) ?? { current: null };
    held.current = chart;
    charts.set(id, held);
  }, [id, chart]);
  useEffect(() => () => {
    charts.delete(id);
  }, [id]);
}

/** The charts drawn on the page now, in the order they were first drawn. */
export function seesCharts(): SeesChart[] {
  return [...charts.values()].flatMap((held) => (held.current ? [held.current] : []));
}

/** Everything forgotten: for tests. */
export function resetSees() {
  current = null;
  standIn = null;
  open = false;
  claims = [];
  asked = null;
  parts = {};
  sectionLinks = NO_LINKS;
  charts.clear();
  readKept.clear();
  changed();
}

/**
 * The Ask Hakken conversation started from the eye's panel on each page, by the page's key (`seesKey`), while the
 * panel stays open (sees-side-panel-plan-2026-10-31.md, phase 3); each press of the eye starts a new one
 * (ask-hakken-every-chart-plan-2026-10-31.md, §2b), as does a refresh (Anthony, 2026-11-04). The conversations
 * themselves stay in Ask Hakken's list.
 */
const seesThreads = new Map<string, string>();
let threadsVersion = 0;
const threadListeners = new Set<() => void>();
export function noteSeesThread(key: string, threadId: string) {
  seesThreads.set(key, threadId);
  threadsVersion += 1;
  for (const listener of threadListeners) listener();
}
/** The panel's chats let go of: each press of the eye, and a super admin's refresh, starts a new one. */
export function forgetSeesThreads() {
  if (seesThreads.size === 0) return;
  seesThreads.clear();
  threadsVersion += 1;
  for (const listener of threadListeners) listener();
}
export function useSeesThread(key: string | null): string | null {
  useSyncExternalStore((listener) => { threadListeners.add(listener); return () => threadListeners.delete(listener); }, () => threadsVersion, () => 0);
  return key ? seesThreads.get(key) ?? null : null;
}
