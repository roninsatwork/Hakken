'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  ArrowRight,
  Check,
  Clock3,
  Coins,
  Flag,
  Flame,
  Gem,
  Loader2,
  LockKeyhole,
  Maximize2,
  Minimize2,
  Moon,
  Pause,
  Play,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { Button } from '@/src/ui/components/screens/Button';
import { NIGHT_HEIST_LEVELS, type NightHeistLevelId } from '@/convex/utils/nightHeistRules';
import { getLevel } from './engine/Levels';
import { GameEngine } from './engine/GameEngine';
import { DEFAULT_GAME_VOLUME } from './engine/AudioEngine';
import { RULES, type RunResult, type Snapshot } from './engine/NightHeistSimulation';

interface Props {
  levelId?: NightHeistLevelId;
  progress?: { unlocked: number; bests: (number | null)[] };
  progressReady?: boolean;
  onLevelChange?: (id: NightHeistLevelId) => void;
  onStart: () => Promise<void>;
  onEscape: (result: RunResult) => Promise<void>;
}
const INITIAL: Snapshot = {
  status: 'ready',
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
};
function timeLabel(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}

export default function RoninCanvas({
  onStart,
  onEscape,
  levelId = 'courtyard',
  progress,
  progressReady = true,
  onLevelChange,
}: Props) {
  const level = getLevel(levelId);
  const levelIndex = NIGHT_HEIST_LEVELS.indexOf(levelId);
  const nextLevel = NIGHT_HEIST_LEVELS[levelIndex + 1];
  const t = useTranslations('arcade.nightHeist');
  const arcade = useTranslations('arcade');
  const canvas = useRef<HTMLCanvasElement>(null),
    frame = useRef<HTMLDivElement>(null),
    engine = useRef<GameEngine | null>(null);
  const callbacks = useRef({ onStart, onEscape });
  const [snapshot, setSnapshot] = useState<Snapshot>(INITIAL);
  const [ready, setReady] = useState(false),
    [error, setError] = useState(false),
    [attempt, setAttempt] = useState(0);
  const [starting, setStarting] = useState(false),
    [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [muted, setMuted] = useState(false),
    [volume, setVolume] = useState(DEFAULT_GAME_VOLUME * 100),
    [fullscreen, setFullscreen] = useState(false);
  const [soundSettings, setSoundSettings] = useState(false),
    [fullscreenError, setFullscreenError] = useState(false);
  const resultRef = useRef<RunResult | null>(null),
    alive = useRef(true);
  const labels = useMemo(
    () => ({
      exit: t('exitMarker'),
      locked: t('exitLocked'),
      seal: t('seal'),
      treasure: t('treasure'),
      spirit: t('spiritName'),
    }),
    [t],
  );
  useEffect(() => {
    callbacks.current = { onStart, onEscape };
  }, [onStart, onEscape]);
  const save = useCallback(async (result: RunResult) => {
    setSaveState('saving');
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      // Convex can keep a mutation pending while reconnecting. Keep the result
      // recoverable even if no rejection arrives; the receipt makes retry safe.
      await Promise.race([
        callbacks.current.onEscape(result),
        new Promise<never>((_, reject) => {
          timeout = setTimeout(() => reject(new Error('Escape save timed out')), 15_000);
        }),
      ]);
      if (alive.current) setSaveState('saved');
    } catch {
      if (alive.current) setSaveState('error');
    } finally {
      clearTimeout(timeout);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    if (!canvas.current) return;
    let cancelled = false;
    const instance = new GameEngine(
      canvas.current,
      {
        onSnapshot: (next) => {
          if (!cancelled) setSnapshot(next);
        },
        onResult: (result) => {
          if (cancelled) return;
          resultRef.current = result;
          if (result.outcome === 'escaped') void save(result);
        },
      },
      level,
    );
    engine.current = instance;
    setSnapshot(INITIAL);
    setSaveState('idle');
    setStarting(false);
    resultRef.current = null;
    setReady(false);
    setError(false);
    void instance
      .load(labels)
      .then(() => {
        if (!cancelled) setReady(true);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
      alive.current = false;
      instance.dispose();
      if (engine.current === instance) engine.current = null;
    };
    // Locale and callback changes update the existing instance; they do not reset a run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, save, level]);
  useEffect(() => {
    engine.current?.setLabels(labels);
  }, [labels]);
  useEffect(() => {
    const update = () => setFullscreen(document.fullscreenElement === frame.current);
    document.addEventListener('fullscreenchange', update);
    return () => document.removeEventListener('fullscreenchange', update);
  }, []);
  useEffect(() => {
    engine.current?.setMuted(muted);
  }, [muted, ready]);
  useEffect(() => {
    engine.current?.setVolume(volume / 100);
  }, [volume, ready]);
  const begin = async () => {
    if (starting || !ready || !progressReady) return;
    const instance = engine.current;
    setStarting(true);
    setError(false);
    setSaveState('idle');
    resultRef.current = null;
    try {
      await callbacks.current.onStart();
      if (alive.current && engine.current === instance) instance?.start();
    } catch {
      if (alive.current) setError(true);
    } finally {
      if (alive.current) setStarting(false);
    }
  };
  const toggleFullscreen = async () => {
    try {
      setFullscreenError(false);
      if (document.fullscreenElement) await document.exitFullscreen();
      else await frame.current?.requestFullscreen();
    } catch {
      setFullscreenError(true);
    }
  };
  const playing = snapshot.status === 'playing',
    paused = snapshot.status === 'paused',
    terminal = snapshot.status === 'caught' || snapshot.status === 'escaped';
  const escaped = snapshot.status === 'escaped';
  return (
    <div
      ref={frame}
      className={`relative isolate overflow-hidden border border-border-dim bg-sidebar ${fullscreen ? 'h-screen w-screen flex flex-col justify-center' : 'rounded-2xl'}`}
    >
      <div
        className="relative mx-auto w-full"
        style={
          fullscreen
            ? {
                maxWidth: `calc((100vh - ${snapshot.status === 'ready' ? 228 : 128}px) * 1.5988)`,
              }
            : undefined
        }
      >
        <div className="relative flex items-center justify-between gap-3 border-b border-border-dim bg-sidebar/90 px-4 py-3 backdrop-blur-md sm:px-6">
          <div className="min-w-0">
            <p className="font-serif text-lg font-semibold italic tracking-wide text-foreground sm:text-2xl">
              {arcade('title')}
            </p>
            <p className="text-[9px] uppercase tracking-[.28em] text-brand sm:text-[10px]">
              {t('subtitle')}
            </p>
          </div>
          {(playing || paused || terminal) && (
            <div className="flex items-center gap-4 text-sm text-foreground sm:gap-7">
              <span
                className="flex items-center gap-2"
                aria-label={t('sealCount', { count: snapshot.seals })}
              >
                <Gem className="h-4 w-4 text-success" />
                <span className="tabular-nums">
                  {snapshot.seals}
                  <span className="text-secondary"> / 3</span>
                </span>
              </span>
              <span className="hidden items-center gap-2 sm:flex">
                <Coins className="h-4 w-4 text-warning" />
                <span className="tabular-nums">{snapshot.score.toLocaleString()}</span>
              </span>
              <span className="hidden items-center gap-2 text-secondary md:flex">
                <Clock3 className="h-4 w-4" />
                <span className="tabular-nums">{timeLabel(snapshot.seconds)}</span>
              </span>
            </div>
          )}
          <div className="flex items-center gap-1">
            {playing && (
              <Button
                variant="icon"
                aria-label={t('pause')}
                onClick={() => engine.current?.pause()}
              >
                <Pause className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="icon"
              aria-label={muted ? t('unmute') : t('mute')}
              onClick={() => setMuted((v) => !v)}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </Button>
            <Button
              variant="icon"
              aria-label={t('soundSettings')}
              aria-expanded={soundSettings}
              onClick={() => setSoundSettings((v) => !v)}
              className="hidden text-[11px] sm:block"
            >
              {volume}%
            </Button>
            <Button
              variant="icon"
              aria-label={fullscreen ? t('exitFullscreen') : t('fullscreen')}
              onClick={() => void toggleFullscreen()}
            >
              {fullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </Button>
          </div>
        </div>
        {snapshot.status === 'ready' && (
          <nav
            aria-label={t('chooseMap')}
            className="grid grid-cols-2 gap-2 border-b border-border-dim bg-sidebar p-3 sm:grid-cols-4"
          >
            {NIGHT_HEIST_LEVELS.map((id, index) => {
              const locked = index >= (progress?.unlocked ?? 1);
              const best = progress?.bests[index];
              return (
                <Button
                  key={id}
                  variant="quiet"
                  disabled={locked || starting || !progressReady}
                  aria-pressed={levelId === id}
                  aria-label={`${t(`maps.${id}.name`)} · ${locked ? t('mapLocked') : best != null ? t('mapComplete') : t('mapAvailable')}`}
                  onClick={() => onLevelChange?.(id)}
                  className={`flex h-auto min-w-0 flex-col items-start gap-1 px-3 py-2 text-left ${levelId === id ? 'ring-1 ring-info bg-info/10' : ''}`}
                >
                  <span className="flex w-full items-center justify-between gap-2 text-[10px] uppercase tracking-widest text-secondary">
                    {t('mapNumber', { number: index + 1 })}
                    {locked ? (
                      <LockKeyhole className="h-3 w-3" />
                    ) : best != null ? (
                      <Check className="h-3 w-3 text-success" />
                    ) : (
                      <Flag className="h-3 w-3" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-foreground sm:text-sm">
                    {t(`maps.${id}.name`)}
                  </span>
                  <span className="text-[10px] text-secondary">
                    {locked
                      ? t('unlockHint', { number: index })
                      : best != null
                        ? t('personalBest', { score: best.toLocaleString() })
                        : t('mapAvailable')}
                  </span>
                </Button>
              );
            })}
          </nav>
        )}
        <canvas
          ref={canvas}
          tabIndex={0}
          role="application"
          aria-label={t('canvasLabel')}
          aria-describedby="night-heist-controls"
          data-testid="night-heist-canvas"
          data-status={snapshot.status}
          style={{ visibility: ready ? 'visible' : 'hidden' }}
          className="block aspect-[1586/992] w-full outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-brand"
        />
        {soundSettings && (
          <div className="absolute right-4 top-20 rounded-xl border border-border-dim bg-card p-4 text-sm text-foreground shadow-lg">
            <label className="flex flex-col gap-3">
              {t('volume')}
              <input
                type="range"
                min={0}
                max={100}
                value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                className="accent-brand"
              />
            </label>
          </div>
        )}
        {fullscreenError && (
          <p
            role="status"
            className="pointer-events-none absolute right-4 top-20 rounded-lg bg-card p-3 text-sm text-foreground"
          >
            {t('fullscreenFailed')}
          </p>
        )}
        {snapshot.status === 'ready' && (
          <div className="absolute inset-x-0 bottom-0 top-[260px] flex items-end sm:top-[190px] bg-gradient-to-r from-sidebar/90 via-sidebar/30 to-transparent p-5 sm:p-9 lg:p-12">
            <div className="max-w-sm pb-2 text-foreground sm:pb-6">
              <p className="mb-4 flex items-center gap-2 text-[11px] uppercase tracking-[.2em] text-warning">
                <Moon className="h-3.5 w-3.5" />
                {t('chapterNumber', {
                  number: levelIndex + 1,
                  total: NIGHT_HEIST_LEVELS.length,
                })}
              </p>
              <h2
                style={{ fontFamily: 'Georgia, serif' }}
                className="font-serif text-3xl leading-tight sm:text-5xl"
              >
                {t(`maps.${levelId}.name`)}
              </h2>
              <p className="mt-4 max-w-xs text-sm leading-relaxed text-secondary sm:text-base">
                {t(`maps.${levelId}.description`)}
              </p>
              <div className="mt-4 space-y-2 text-xs leading-relaxed">
                <p className="flex items-start gap-2 text-success">
                  <Gem className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('sealHelp')}
                </p>
                <p className="flex items-start gap-2 text-info">
                  <Flame className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  {t('spiritHelp')}
                </p>
              </div>
              <Button
                variant="brand"
                disabled={!ready || starting || !progressReady}
                onClick={() => void begin()}
                className="mt-7 inline-flex items-center gap-3 px-6 py-3.5"
              >
                {!ready || starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Play className="h-4 w-4" />
                )}
                {!ready || !progressReady
                  ? t('loading')
                  : starting
                    ? t('preparing')
                    : levelId === 'courtyard'
                      ? t('enter')
                      : t('enterMap')}
                <ArrowRight className="h-4 w-4" />
              </Button>
              <p className="mt-4 hidden text-xs text-secondary sm:block">{t('runLength')}</p>
              {error && (
                <div role="alert" className="mt-4 text-sm text-destructive">
                  {ready ? t('startFailed') : t('loadFailed')}
                  {!ready && (
                    <Button
                      variant="quiet"
                      onClick={() => setAttempt((v) => v + 1)}
                      className="ml-2"
                    >
                      {t('retry')}
                    </Button>
                  )}
                </div>
              )}
            </div>
          </div>
        )}
        {playing && (
          <>
            <div
              className="absolute bottom-4 left-4 flex items-center gap-2 rounded-full border border-border-dim bg-sidebar/85 px-4 py-2 text-xs text-foreground backdrop-blur-sm"
              role="status"
            >
              <Flag className="h-3.5 w-3.5 text-success" />
              {snapshot.seals === 3
                ? t('escapeObjective')
                : t('collectObjective', { count: 3 - snapshot.seals })}
            </div>
            <div className="absolute bottom-4 right-4 flex items-center gap-2 rounded-full border border-border-dim bg-sidebar/85 px-4 py-2 text-xs text-foreground backdrop-blur-sm">
              <Zap
                className={`h-3.5 w-3.5 ${snapshot.dashCooldown > 0 ? 'text-secondary' : 'text-warning'}`}
              />
              {snapshot.dashCooldown > 0
                ? t('cooldown', { seconds: Math.ceil(snapshot.dashCooldown) })
                : t('dashReady')}
            </div>
            <div
              data-testid="spirit-status"
              className={`absolute left-1/2 top-24 w-max max-w-[90%] -translate-x-1/2 rounded-xl border bg-sidebar/90 px-4 py-2 text-center text-xs backdrop-blur-sm ${snapshot.spiritSeconds > 0 && snapshot.spiritSeconds <= RULES.spiritWarning ? 'border-warning/40 text-warning' : 'border-info/30 text-info'}`}
            >
              <p className="flex items-center justify-center gap-2 font-medium" role="status">
                <Flame className="h-4 w-4 shrink-0" />
                {snapshot.spiritSeconds > 0
                  ? snapshot.spiritSeconds <= RULES.spiritWarning
                    ? t('spiritEnding')
                    : t('spiritActive')
                  : snapshot.spiritCollected
                    ? t('spiritSpent')
                    : t('spiritFind')}
                {snapshot.spiritSeconds > 0 && (
                  <span aria-live="off" className="font-mono text-base tabular-nums">
                    {Math.ceil(snapshot.spiritSeconds)}s
                  </span>
                )}
              </p>
              {snapshot.spiritSeconds > 0 && (
                <div
                  role="progressbar"
                  aria-label={t('spiritName')}
                  aria-valuemin={0}
                  aria-valuemax={RULES.spiritDuration}
                  aria-valuenow={Math.ceil(snapshot.spiritSeconds)}
                  className="mt-2 h-1 overflow-hidden rounded-full bg-foreground/10"
                >
                  <div
                    className="h-full bg-current"
                    style={{ width: `${(snapshot.spiritSeconds / RULES.spiritDuration) * 100}%` }}
                  />
                </div>
              )}
              {snapshot.knockouts > 0 && (
                <p className="mt-1 text-foreground" role="status">
                  {t('knockoutCount', { count: snapshot.knockouts })}
                </p>
              )}
            </div>
            {snapshot.threat > 0.3 && snapshot.spiritSeconds === 0 && (
              <div
                className="absolute left-1/2 top-44 -translate-x-1/2 rounded-full border border-warning/30 bg-sidebar/90 px-4 py-2 text-xs font-medium text-warning"
                role="status"
              >
                {snapshot.threat >= 1 ? t('chased') : t('spotted')}
              </div>
            )}
          </>
        )}
        {(paused || terminal) && (
          <div className="absolute inset-0 flex items-center justify-center bg-sidebar/65 p-6 backdrop-blur-sm">
            <div className="w-full max-w-sm rounded-2xl border border-border-dim bg-card/95 p-7 text-center text-foreground shadow-xl sm:p-9">
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-foreground/5">
                {paused ? (
                  <Pause className="h-5 w-5 text-secondary" />
                ) : escaped ? (
                  <Check className="h-5 w-5 text-success" />
                ) : (
                  <Moon className="h-5 w-5 text-warning" />
                )}
              </div>
              <p className="text-[10px] uppercase tracking-[.24em] text-brand">{t('subtitle')}</p>
              <h2 style={{ fontFamily: 'Georgia, serif' }} className="mt-2 font-serif text-3xl">
                {paused
                  ? t('paused')
                  : escaped
                    ? !nextLevel && saveState === 'saved'
                      ? t('campaignComplete')
                      : t('escaped')
                    : t('caught')}
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-secondary">
                {paused
                  ? t('pausedDescription')
                  : escaped
                    ? !nextLevel && saveState === 'saved'
                      ? t('campaignDescription')
                      : t('escapedDescription')
                    : t('caughtDescription')}
              </p>
              {terminal && (
                <div className="mt-5 flex justify-center gap-6 border-y border-border-dim py-4">
                  <div>
                    <p className="text-xs text-secondary">{t('time')}</p>
                    <p className="mt-1 font-mono text-xl">{timeLabel(snapshot.seconds)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-secondary">{escaped ? t('score') : t('seals')}</p>
                    <p className="mt-1 font-mono text-xl">
                      {escaped ? snapshot.score.toLocaleString() : `${snapshot.seals} / 3`}
                    </p>
                  </div>
                </div>
              )}
              {terminal && snapshot.knockouts > 0 && (
                <p className="mt-3 text-sm text-info">
                  {t('knockoutCount', { count: snapshot.knockouts })}
                </p>
              )}
              {escaped && (
                <p
                  className={`mt-4 text-xs ${saveState === 'error' ? 'text-destructive' : 'text-secondary'}`}
                  role="status"
                >
                  {saveState === 'saved'
                    ? t('scoreSaved')
                    : saveState === 'error'
                      ? t('scoreFailed')
                      : t('scoreSaving')}
                </p>
              )}
              {saveState === 'error' && resultRef.current && (
                <Button
                  variant="quiet"
                  className="mt-3"
                  onClick={() => resultRef.current && void save(resultRef.current)}
                >
                  {t('retrySave')}
                </Button>
              )}
              {error && (
                <p role="alert" className="mt-3 text-sm text-destructive">
                  {t('startFailed')}
                </p>
              )}
              <Button
                variant="brand"
                className="mt-6 inline-flex items-center gap-2"
                disabled={starting || (escaped && saveState !== 'saved')}
                onClick={() =>
                  paused
                    ? engine.current?.resume()
                    : escaped && nextLevel && onLevelChange
                      ? onLevelChange(nextLevel)
                      : void begin()
                }
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : paused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <RotateCcw className="h-4 w-4" />
                )}
                {paused
                  ? t('resume')
                  : escaped && nextLevel && onLevelChange
                    ? t('nextMap', { name: t(`maps.${nextLevel}.name`) })
                    : t('again')}
              </Button>
              <Button
                variant="ghost"
                className="mt-2 inline-flex w-full items-center justify-center gap-2"
                disabled={escaped && saveState !== 'saved'}
                onClick={() => {
                  engine.current?.reset();
                  setError(false);
                  setSaveState('idle');
                }}
              >
                <X className="h-3 w-3" />
                {t('leave')}
              </Button>
            </div>
          </div>
        )}
      </div>
      <div
        id="night-heist-controls"
        className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border-dim bg-sidebar px-5 py-3 text-[11px] text-secondary"
      >
        <span>
          {t('moveControls')}{' '}
          <kbd className="ml-1 rounded border border-border-dim px-1.5 py-0.5 text-foreground">
            {t('moveKeys')}
          </kbd>
        </span>
        <span>
          {t('dashControl')}{' '}
          <kbd className="ml-1 rounded border border-border-dim px-1.5 py-0.5 text-foreground">
            {t('dashKey')}
          </kbd>
        </span>
        <span className="hidden md:inline">{t('clickControl')}</span>
        <span className="hidden uppercase tracking-widest text-muted lg:inline">
          {t('chapterNumber', {
            number: levelIndex + 1,
            total: NIGHT_HEIST_LEVELS.length,
          })}
        </span>
      </div>
    </div>
  );
}
