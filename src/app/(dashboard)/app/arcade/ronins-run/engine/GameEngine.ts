import { AudioEngine } from './AudioEngine';
import { GamePerformanceMonitor } from './GamePerformanceMonitor';
import { WORLD } from './MapData';
import { COURTYARD, type LevelDefinition } from './Levels';
import { loadGameAssets, NightHeistRenderer, type RenderLabels } from './NightHeistRenderer';
import { NightHeistSimulation, type Snapshot, type RunResult } from './NightHeistSimulation';

interface Callbacks {
  onSnapshot: (snapshot: Snapshot) => void;
  onResult: (result: RunResult) => void;
}
/** The React boundary owns mounting only; this instance owns a whole session. */
export class GameEngine {
  readonly simulation: NightHeistSimulation;
  private renderer: NightHeistRenderer | null = null;
  private audio = new AudioEngine();
  private keys = new Set<string>();
  private dash = false;
  private frame = 0;
  private lastTime = 0;
  private accumulator = 0;
  private uiTime = 0;
  private disposed = false;
  private publishedResult = false;
  private performanceMonitor =
    process.env.NODE_ENV === 'development' &&
    new URLSearchParams(window.location.search).get('gamePerformance') === '1'
      ? new GamePerformanceMonitor((sample) =>
          console.info('[Night Heist performance]', JSON.stringify(sample)),
        )
      : null;
  private reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  private abort = new AbortController();
  private observer: MutationObserver;
  constructor(
    private canvas: HTMLCanvasElement,
    private callbacks: Callbacks,
    private level: LevelDefinition = COURTYARD,
  ) {
    this.simulation = new NightHeistSimulation(level);
    this.observer = new MutationObserver(() => this.renderer?.refreshColors());
    this.observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });
  }
  async load(labels: RenderLabels) {
    const assets = await loadGameAssets(this.level);
    if (this.disposed) return;
    this.renderer = new NightHeistRenderer(this.canvas, assets, labels, this.level);
    const options = { signal: this.abort.signal };
    this.canvas.addEventListener('keydown', this.keyDown, options);
    this.canvas.addEventListener('keyup', this.keyUp, options);
    this.canvas.addEventListener('pointerdown', this.point, options);
    this.canvas.addEventListener('blur', this.clearInput, options);
    window.addEventListener('keyup', this.keyUp, options);
    window.addEventListener('blur', this.blur, options);
    document.addEventListener('visibilitychange', this.visibility, options);
    this.lastTime = performance.now();
    this.frame = requestAnimationFrame(this.loop);
    this.publish();
  }
  start() {
    if (this.disposed) return;
    this.simulation.start();
    this.publishedResult = false;
    this.clearInput();
    this.resetClock();
    this.audio.start();
    this.canvas.focus({ preventScroll: true });
    this.publish();
  }
  pause() {
    if (this.simulation.status !== 'playing') return;
    this.simulation.pause();
    this.clearInput();
    this.performanceMonitor?.reset();
    this.audio.pause();
    this.publish();
  }
  resume() {
    if (this.disposed || this.simulation.status !== 'paused') return;
    this.simulation.resume();
    this.clearInput();
    this.audio.start();
    this.resetClock();
    this.canvas.focus({ preventScroll: true });
    this.publish();
  }
  reset() {
    this.simulation.reset();
    this.clearInput();
    this.resetClock();
    this.audio.pause();
    this.publish();
  }
  setMuted(value: boolean) {
    this.audio.setMuted(value);
  }
  setVolume(value: number) {
    this.audio.setVolume(value);
  }
  setLabels(labels: RenderLabels) {
    this.renderer?.setLabels(labels);
  }
  private publish() {
    this.callbacks.onSnapshot(this.simulation.snapshot());
  }
  private clearInput = () => {
    this.keys.clear();
    this.dash = false;
  };
  private resetClock() {
    this.lastTime = performance.now();
    this.accumulator = 0;
    this.uiTime = 0;
    this.performanceMonitor?.reset();
  }
  private keyDown = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    if (
      ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd', ' ', 'escape'].includes(
        key,
      )
    )
      event.preventDefault();
    if (key === 'escape') {
      if (this.simulation.status === 'playing') this.pause();
      return;
    }
    if (this.simulation.status !== 'playing') return;
    if (key === ' ' && !event.repeat) this.dash = true;
    this.keys.add(key);
  };
  private keyUp = (event: KeyboardEvent) => {
    this.keys.delete(event.key.toLowerCase());
  };
  private blur = () => {
    if (this.simulation.status === 'playing') this.pause();
  };
  private visibility = () => {
    if (document.hidden) this.blur();
  };
  private point = (event: PointerEvent) => {
    if (event.button !== 0 || this.simulation.status !== 'playing') return;
    this.canvas.focus({ preventScroll: true });
    const rect = this.canvas.getBoundingClientRect();
    this.simulation.moveTo({
      x: ((event.clientX - rect.left) * WORLD.width) / rect.width,
      y: ((event.clientY - rect.top) * WORLD.height) / rect.height,
    });
  };
  private loop = (now: number) => {
    if (this.disposed) return;
    const measuring = this.performanceMonitor && this.simulation.status === 'playing';
    const workStarted = measuring ? performance.now() : 0;
    const frameMs = Math.max(0, now - this.lastTime);
    const dt = Math.min(frameMs / 1000, 0.1);
    this.lastTime = now;
    this.accumulator += dt;
    this.uiTime += dt;
    while (this.accumulator >= 1 / 60) {
      const x =
        Number(this.keys.has('d') || this.keys.has('arrowright')) -
        Number(this.keys.has('a') || this.keys.has('arrowleft'));
      const y =
        Number(this.keys.has('s') || this.keys.has('arrowdown')) -
        Number(this.keys.has('w') || this.keys.has('arrowup'));
      this.simulation.update(1 / 60, { x, y, dash: this.dash });
      this.dash = false;
      this.accumulator -= 1 / 60;
    }
    for (const sound of this.simulation.sounds.splice(0)) this.audio.play(sound);
    if (this.simulation.result && !this.publishedResult) {
      this.publishedResult = true;
      this.audio.stopMusic();
      this.publish();
      this.callbacks.onResult(this.simulation.result);
    }
    if (this.uiTime > 0.1) {
      this.uiTime = 0;
      this.publish();
      this.audio.setThreat(this.simulation.snapshot().threat);
    }
    this.renderer?.render(this.simulation, now / 1000, this.reducedMotion);
    if (measuring) this.performanceMonitor?.record(frameMs, performance.now() - workStarted);
    this.frame = requestAnimationFrame(this.loop);
  };
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.clearInput();
    this.abort.abort();
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.audio.dispose();
  }
}
