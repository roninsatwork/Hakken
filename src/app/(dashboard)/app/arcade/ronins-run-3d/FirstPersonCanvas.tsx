"use client";

import styles from "./FirstPersonCanvas.module.css";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import {
  ArrowRight,
  Check,
  Flame,
  Gem,
  Map,
  Maximize2,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  Zap,
} from "lucide-react";
import { Button } from "@/src/ui/components/screens/Button";
import { Checkbox } from "@/src/ui/components/screens/Checkbox";
import { LEVELS, type LevelDefinition } from "../ronins-run/engine/Levels";
import { DEFAULT_GAME_VOLUME } from "../ronins-run/engine/AudioEngine";
import { FirstPersonGame, type ViewState } from "./engine/FirstPersonGame";
import { TouchControls } from "./TouchControls";
import type { GraphicsQuality } from "./engine/RenderBudget";
import { RouteMap } from "./RouteMap";
import {
  focusedPickup,
  pickupNotice,
  type PickupNotice,
} from "./PickupFeedback";

interface Preferences {
  muted: boolean;
  volume: number;
  reduced: boolean;
  map: boolean;
  quality: GraphicsQuality;
}

function DistrictGame({
  level,
  onNext,
  onBusy,
  onComplete,
  preferences,
  onPreferences,
}: {
  level: LevelDefinition;
  onNext?: () => void;
  onBusy: (busy: boolean) => void;
  onComplete: (result: ViewState) => void;
  preferences: Preferences;
  onPreferences: (patch: Partial<Preferences>) => void;
}) {
  const t = useTranslations("arcade.firstPerson"),
    heist = useTranslations("arcade.nightHeist");
  const canvas = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null),
    game = useRef<FirstPersonGame | null>(null);
  const [state, setState] = useState<ViewState>({
    status: "ready",
    seconds: 0,
    seals: 0,
    treasure: false,
    alarms: 0,
    score: 0,
    dashCooldown: 0,
    threat: 0,
    spiritSeconds: 0,
    spiritCollected: false,
    knockouts: 0,
    x: level.start.x,
    y: level.start.y,
    yaw: 0,
    collected: [],
  });
  const [notice, setNotice] = useState<{
    kind: PickupNotice;
    until: number;
  } | null>(null);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const { muted, volume, reduced, map, quality } = preferences;
  const [fallback, setFallback] = useState(false);
  const [fullscreenError, setFullscreenError] = useState(false);
  const callbacks = useRef({ onBusy, onComplete, onPreferences });
  useEffect(() => {
    callbacks.current = { onBusy, onComplete, onPreferences };
  }, [onBusy, onComplete, onPreferences]);
  const mapRef = useRef(map);
  useEffect(() => {
    mapRef.current = map;
  }, [map]);
  useEffect(() => {
    let alive = true,
      lastStatus = "ready";
    let previous: ViewState | undefined;
    try {
      const instance = new FirstPersonGame(canvas.current!, level, {
        onUpdate: (next) => {
          if (!alive) return;
          const event = pickupNotice(previous, next);
          if (event) setNotice({ kind: event, until: next.seconds + 3 });
          else if (
            next.status === "ready" ||
            (previous &&
              (next.seals < previous.seals ||
                (previous.spiritCollected && !next.spiritCollected)))
          )
            setNotice(null);
          previous = next;
          setState(next);
          if (next.status !== lastStatus) {
            callbacks.current.onBusy(next.status === "playing");
            if (next.status === "escaped") callbacks.current.onComplete(next);
            lastStatus = next.status;
          }
        },
        onMapToggle: () => {
          if (alive) callbacks.current.onPreferences({ map: !mapRef.current });
        },
        onPointerFallback: () => {
          if (alive) setFallback(true);
        },
        onGraphicsError: () => {
          if (alive) setError(true);
        },
        onReady: () => {
          if (alive) setReady(true);
        },
      });
      game.current = instance;
    } catch {
      queueMicrotask(() => {
        if (alive) setError(true);
      });
    }
    return () => {
      alive = false;
      game.current?.dispose();
      game.current = null;
      callbacks.current.onBusy(false);
    };
  }, [level, attempt]);
  useEffect(() => {
    game.current?.setMuted(muted);
    game.current?.setVolume(volume / 100);
    game.current?.setReducedMotion(reduced);
    game.current?.setQuality(quality);
  }, [muted, volume, reduced, quality, ready]);
  const playing = state.status === "playing";
  const pickup = playing ? focusedPickup(level, state) : null;
  const title =
    state.status === "ready"
      ? t("introTitle")
      : heist(playing ? "paused" : state.status);
  const description =
    state.status === "ready"
      ? t("intro")
      : state.status === "caught" && state.spiritSeconds <= 0
        ? t(state.spiritCollected ? "caughtAfterPower" : "caughtWithoutPower")
        : heist(`${playing ? "paused" : state.status}Description`);
  const statusMessage =
    state.spiritSeconds > 0
      ? heist(state.spiritSeconds <= 3 ? "spiritEnding" : "spiritActive")
      : state.threat >= 1
        ? heist("chased")
        : state.threat > 0.1
          ? heist("spotted")
          : t("stayQuiet");
  return (
    <div
      ref={frame}
      className={`${styles.frame} overflow-hidden rounded-2xl border border-border-dim bg-background`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-dim bg-card px-4 py-3">
        <div>
          <p className="text-xs uppercase tracking-widest text-secondary">
            {t("firstPerson")}
          </p>
          <p className="font-medium text-foreground">
            {heist(`maps.${level.id}.name`)}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="icon"
            aria-label={heist("pause")}
            disabled={!playing}
            onClick={() => game.current?.pause()}
          >
            <Pause className="h-4 w-4" />
          </Button>
          <Button
            variant="icon"
            aria-label={t("toggleMap")}
            aria-pressed={map}
            onClick={() => onPreferences({ map: !map })}
          >
            <Map className="h-4 w-4" />
          </Button>
          <Button
            variant="icon"
            aria-label={muted ? heist("unmute") : heist("mute")}
            aria-pressed={muted}
            onClick={() => onPreferences({ muted: !muted })}
          >
            {muted ? (
              <VolumeX className="h-4 w-4" />
            ) : (
              <Volume2 className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="icon"
            aria-label={heist("fullscreen")}
            onClick={() => {
              setFullscreenError(false);
              const action = document.fullscreenElement
                ? document.exitFullscreen()
                : frame.current?.requestFullscreen();
              if (action) void action.catch(() => setFullscreenError(true));
              else setFullscreenError(true);
            }}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <div
        className={`${styles.viewport} relative h-[min(68vh,760px)] min-h-96 w-full overflow-hidden bg-background`}
      >
        <canvas
          key={attempt}
          ref={canvas}
          tabIndex={0}
          data-testid="first-person-canvas"
          data-level={level.id}
          aria-label={t("canvasLabel")}
          className="h-full w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        />
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-2 sm:gap-4 sm:p-4">
          <div className="rounded-xl border border-border-dim bg-background/85 px-3 py-2 text-foreground sm:px-4 sm:py-3 backdrop-blur-sm">
            <p className="text-[10px] uppercase tracking-widest text-secondary">
              {state.seals === 3 ? heist("escapeObjective") : t("objective")}
            </p>
            <p className="mt-1 flex items-center gap-2 text-2xl font-semibold">
              <Gem className="h-5 w-5 text-success" />
              {state.seals} / 3
            </p>
            <p className="mt-1 text-xs tabular-nums text-secondary">
              {Math.floor(state.seconds / 60)}:
              {String(state.seconds % 60).padStart(2, "0")} ·{" "}
              {state.score.toLocaleString()} {t("points")}
            </p>
          </div>
          {map && <RouteMap level={level} state={state} />}
        </div>
        {playing && (
          <>
            {notice && state.seconds <= notice.until && (
              <div
                role="status"
                data-testid="pickup-confirmation"
                className="pointer-events-none absolute left-1/2 top-28 max-w-sm sm:top-6 -translate-x-1/2 rounded-xl border border-border-dim bg-background/95 px-5 py-3 text-center text-sm font-semibold text-foreground shadow-lg"
              >
                {t(notice.kind, { count: state.seals })}
              </div>
            )}
            {pickup && (
              <div
                data-testid="pickup-label"
                className={`pointer-events-none absolute left-1/2 top-[60%] max-w-xs -translate-x-1/2 rounded-xl border bg-background/90 px-4 py-2 text-center text-sm ${pickup === "spirit" ? "border-info text-info" : "border-success text-success"}`}
              >
                <p className="font-semibold">
                  {t(
                    pickup === "spirit"
                      ? "spiritPickupTitle"
                      : "sealPickupTitle",
                  )}
                </p>
                <p className="mt-1 text-xs">
                  {t(
                    pickup === "spirit" ? "spiritPickupHelp" : "sealPickupHelp",
                  )}
                </p>
              </div>
            )}
            <span className="pointer-events-none absolute left-1/2 top-1/2 h-1 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/80" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 flex flex-wrap items-end justify-between gap-3 p-4">
              <div className="rounded-xl bg-background/85 px-4 py-3 text-sm text-foreground backdrop-blur-sm">
                <p className="flex items-center gap-2">
                  <Zap className="h-4 w-4 text-warning" />
                  {state.dashCooldown > 0
                    ? heist("cooldown", {
                        seconds: Math.ceil(state.dashCooldown),
                      })
                    : heist("dashReady")}
                </p>
                <p className="mt-1 text-xs text-secondary">{statusMessage}</p>
              </div>
              <div
                data-testid="spirit-power-status"
                role="status"
                className={`max-w-xs rounded-xl border bg-background/90 px-4 py-3 ${state.spiritSeconds > 0 ? "border-info text-info" : "border-border-dim text-secondary"}`}
              >
                <p className="flex items-center gap-2">
                  <Flame className="h-5 w-5 shrink-0" />
                  {state.spiritSeconds > 0
                    ? `${heist("spiritName")} · ${Math.ceil(state.spiritSeconds)}s`
                    : t(
                        state.spiritCollected
                          ? "powerExpired"
                          : "powerInactive",
                      )}
                </p>
                {state.spiritSeconds > 0 && (
                  <p className="mt-1 text-xs">{heist("spiritActive")}</p>
                )}
                {state.knockouts > 0 && (
                  <p className="mt-1 text-xs">
                    {heist("knockoutCount", { count: state.knockouts })}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
        {playing && !error && <TouchControls game={game} />}
        {(!playing || error) && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/35 p-4 backdrop-blur-[2px]">
            <div
              role="region"
              aria-label={t("gameMenu")}
              className="max-w-md rounded-2xl border border-border-dim bg-background/95 p-6 text-center shadow-2xl sm:p-8"
            >
              <p className="mb-2 text-xs uppercase tracking-[0.25em] text-secondary">
                {t("title")}
              </p>
              <h2 className="text-2xl font-semibold text-foreground">
                {error ? t("graphicsError") : !ready ? heist("loading") : title}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                {error ? t("graphicsHelp") : description}
              </p>
              {!error && (
                <p className="mt-4 text-xs leading-relaxed text-secondary">
                  {t("controls")}
                </p>
              )}
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                {error ? (
                  <Button
                    variant="primary"
                    onClick={() => {
                      setReady(false);
                      setError(false);
                      setAttempt((a) => a + 1);
                    }}
                  >
                    {heist("retry")}
                  </Button>
                ) : (
                  <>
                    {state.status === "escaped" && onNext ? (
                      <Button
                        variant="primary"
                        onClick={onNext}
                        className="flex items-center gap-2"
                      >
                        {t("nextMap")}
                        <ArrowRight className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        disabled={!ready}
                        onClick={() =>
                          state.status === "paused"
                            ? game.current?.resume()
                            : game.current?.start()
                        }
                        className="flex items-center gap-2"
                      >
                        {state.status === "caught" ? (
                          <RotateCcw className="h-4 w-4" />
                        ) : (
                          <Play className="h-4 w-4" />
                        )}
                        {state.status === "ready"
                          ? t("enter")
                          : state.status === "paused"
                            ? t("resume")
                            : t("playAgain")}
                      </Button>
                    )}
                    {state.status === "paused" ||
                    (state.status === "escaped" && onNext) ? (
                      <Button
                        variant="quiet"
                        onClick={() => game.current?.start()}
                      >
                        {t("restart")}
                      </Button>
                    ) : null}
                  </>
                )}
              </div>
              {state.status === "escaped" && (
                <p className="mt-4 text-sm text-success">
                  {state.score.toLocaleString()} {t("points")} ·{" "}
                  {t("sessionResult")}
                </p>
              )}
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border-dim px-4 py-3">
        <p className="text-xs text-secondary">{t("controls")}</p>
        <div className="flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-xs text-secondary">
            {t("graphics")}
            <select
              aria-label={t("graphics")}
              value={quality}
              onChange={(e) =>
                onPreferences({ quality: e.target.value as GraphicsQuality })
              }
              className="rounded-lg border border-border-dim bg-card px-2 py-1 text-foreground"
            >
              <option value="quiet">{t("graphicsQuiet")}</option>
              <option value="balanced">{t("graphicsBalanced")}</option>
              <option value="detailed">{t("graphicsDetailed")}</option>
            </select>
          </label>
          <Checkbox
            label={t("steadyCamera")}
            checked={reduced}
            onChange={(reduced) => onPreferences({ reduced })}
          />
          <label className="flex items-center gap-2 text-xs text-secondary">
            {heist("volume")}
            <input
              aria-label={heist("volume")}
              type="range"
              min="0"
              max="100"
              step="1"
              value={volume}
              onChange={(e) =>
                onPreferences({ volume: Number(e.target.value) })
              }
              className="w-24 accent-brand"
            />
            <span className="w-8 tabular-nums">{volume}%</span>
          </label>
        </div>
      </div>
      {fallback && (
        <p role="status" className="px-4 pb-3 text-xs text-secondary">
          {t("mouseFallback")}
        </p>
      )}
      {fullscreenError && (
        <p role="status" className="px-4 pb-3 text-xs text-secondary">
          {heist("fullscreenFailed")}
        </p>
      )}
    </div>
  );
}

export default function FirstPersonCanvas() {
  const t = useTranslations("arcade.firstPerson"),
    heist = useTranslations("arcade.nightHeist");
  const [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [results, setResults] = useState<Record<string, ViewState>>({});
  const [preferences, setPreferences] = useState<Preferences>(() => ({
    muted: false,
    volume: DEFAULT_GAME_VOLUME * 100,
    map: true,
    reduced:
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    quality: "quiet",
  }));
  const completed = Object.keys(results);
  const allEscaped = LEVELS.every((level) => completed.includes(level.id));
  return (
    <section className="flex flex-col gap-4" aria-label={t("title")}>
      {allEscaped && (
        <div
          role="status"
          className="rounded-xl border border-success/40 bg-success/10 px-5 py-4 text-success"
        >
          <p className="font-semibold">{t("campaignComplete")}</p>
          <p className="mt-1 text-sm">
            {t("campaignResult", {
              score: Object.values(results)
                .reduce((sum, result) => sum + result.score, 0)
                .toLocaleString(),
            })}
          </p>
        </div>
      )}
      <div
        className="grid grid-cols-2 gap-3 lg:grid-cols-4"
        aria-label={t("chooseMap")}
      >
        {LEVELS.map((level, i) => (
          <Button
            key={level.id}
            variant="quiet"
            disabled={busy}
            aria-pressed={selected === i}
            onClick={() => setSelected(i)}
            className={`relative overflow-hidden p-0 text-left ${selected === i ? "ring-2 ring-brand" : ""}`}
          >
            <div className="relative h-24 w-full">
              <Image
                src={level.image}
                alt=""
                fill
                sizes="(max-width:1024px) 40vw, 20vw"
                className="object-cover"
              />
            </div>
            <span className="flex items-center justify-between gap-2 px-3 py-3">
              <span>
                <span className="block text-[10px] uppercase tracking-widest text-muted">
                  {t("district", { number: i + 1 })}
                </span>
                <span className="mt-1 block text-xs text-foreground">
                  {heist(`maps.${level.id}.name`)}
                </span>
              </span>
              {completed.includes(level.id) && (
                <Check
                  className="h-4 w-4 text-success"
                  aria-label={t("completed")}
                />
              )}
            </span>
          </Button>
        ))}
      </div>
      <DistrictGame
        key={selected}
        level={LEVELS[selected]}
        onBusy={setBusy}
        preferences={preferences}
        onPreferences={(patch) =>
          setPreferences((previous) => ({ ...previous, ...patch }))
        }
        onComplete={(result) =>
          setResults((previous) => {
            const best = previous[LEVELS[selected].id];
            return best && best.score >= result.score
              ? previous
              : { ...previous, [LEVELS[selected].id]: result };
          })
        }
        onNext={
          selected < LEVELS.length - 1
            ? () => setSelected(selected + 1)
            : undefined
        }
      />
      <p className="text-xs leading-relaxed text-secondary">{t("buildNote")}</p>
    </section>
  );
}
