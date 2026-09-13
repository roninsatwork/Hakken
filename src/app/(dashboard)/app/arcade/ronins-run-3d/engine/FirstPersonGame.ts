import {
  AudioEngine,
  DEFAULT_GAME_VOLUME,
} from "../../ronins-run/engine/AudioEngine";
import type { LevelDefinition } from "../../ronins-run/engine/Levels";
import {
  NightHeistSimulation,
  type Snapshot,
} from "../../ronins-run/engine/NightHeistSimulation";
import { navigationFor } from "../../ronins-run/engine/Navigation";
import { GRAPHICS, type GraphicsQuality } from "./RenderBudget";
import { SpatialFoley } from "./SpatialFoley";
import { HeistScene } from "./HeistScene";
import { cameraInput, yawToward } from "./WorldLayout";

export interface ViewState extends Snapshot {
  x: number;
  y: number;
  yaw: number;
  collected: number[];
}
export function viewState(game: NightHeistSimulation, yaw = 0): ViewState {
  return {
    ...game.snapshot(),
    x: game.player.pos.x,
    y: game.player.pos.y,
    yaw,
    collected: [...game.seals],
  };
}
interface Callbacks {
  onUpdate: (state: ViewState) => void;
  onMapToggle: () => void;
  onPointerFallback: () => void;
  onGraphicsError: () => void;
  onReady?: () => void;
}
const MOVEMENT_KEYS = new Set([
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
  "KeyQ",
  "KeyE",
  "ArrowLeft",
  "ArrowRight",
  "ArrowUp",
  "ArrowDown",
  "Space",
  "Escape",
  "KeyM",
]);

/** Owns only the second game's instances. No persistence or original-game writes. */
export class FirstPersonGame {
  readonly simulation: NightHeistSimulation;
  private scene: HeistScene;
  private audio = new AudioEngine();
  private foley = new SpatialFoley();
  private keys = new Set<string>();
  private yaw = 0;
  private pitch = 0;
  private dash = false;
  private dragging = false;
  private dragPosition = { x: 0, y: 0 };
  private reducedMotion = false;
  private quality: GraphicsQuality = "balanced";
  private touchMove = { forward: 0, right: 0 };
  private raf = 0;
  private lastTime = 0;
  private nextRender = 0;
  private needsRender = true;
  private accumulator = 0;
  private lastUI = 0;
  private disposed = false;
  private loaded = false;
  private observer: ResizeObserver;
  private removeListeners: (() => void)[] = [];

  constructor(
    private canvas: HTMLCanvasElement,
    level: LevelDefinition,
    private callbacks: Callbacks,
  ) {
    this.simulation = new NightHeistSimulation(level);
    this.scene = new HeistScene(canvas, level);
    this.scene.materialsReady
      .then(() => {
        if (!this.disposed) {
          this.loaded = true;
          callbacks.onReady?.();
          this.publish();
          this.invalidate();
        }
      })
      .catch(() => {
        if (!this.disposed) callbacks.onGraphicsError();
      });
    this.resetView();
    this.audio.setVolume(DEFAULT_GAME_VOLUME);
    this.observer = new ResizeObserver(() => {
      const rect = canvas.getBoundingClientRect();
      this.scene.resize(Math.max(1, rect.width), Math.max(1, rect.height));
      this.invalidate();
    });
    this.observer.observe(canvas);
    const listen = <K extends keyof DocumentEventMap>(
      type: K,
      handler: (event: DocumentEventMap[K]) => void,
    ) => {
      document.addEventListener(type, handler);
      this.removeListeners.push(() =>
        document.removeEventListener(type, handler),
      );
    };
    listen("keydown", (e) => this.keyDown(e));
    listen("keyup", (e) => {
      this.keys.delete(e.code);
    });
    listen("mousemove", (e) => {
      if (this.simulation.status !== "playing") return;
      const locked = document.pointerLockElement === canvas;
      if (locked || this.dragging) {
        // WebKit can report zero movementX/Y outside pointer lock. Client
        // coordinates give drag-look the same sensitivity in every browser.
        const dx = locked ? e.movementX : e.clientX - this.dragPosition.x;
        const dy = locked ? e.movementY : e.clientY - this.dragPosition.y;
        this.dragPosition = { x: e.clientX, y: e.clientY };
        this.yaw -= dx * 0.0022;
        this.pitch = Math.max(
          -1.18,
          Math.min(1.18, this.pitch - dy * 0.0022),
        );
      }
    });
    listen("mouseup", () => {
      this.dragging = false;
    });
    listen("pointerlockchange", () => {
      if (document.pointerLockElement !== canvas) this.pause();
    });
    listen("pointerlockerror", () => this.callbacks.onPointerFallback());
    listen("visibilitychange", () => {
      if (document.hidden) this.pause();
      else this.invalidate();
    });
    const blur = () => this.pause();
    window.addEventListener("blur", blur);
    this.removeListeners.push(() => window.removeEventListener("blur", blur));
    const mouseDown = (e: MouseEvent) => {
      if (e.button === 0 && this.simulation.status === "playing") {
        this.dragging = true;
        this.dragPosition = { x: e.clientX, y: e.clientY };
        canvas.focus();
      }
    };
    canvas.addEventListener("mousedown", mouseDown);
    this.removeListeners.push(() =>
      canvas.removeEventListener("mousedown", mouseDown),
    );
    const contextLost = (e: Event) => {
      e.preventDefault();
      this.loaded = false;
      this.pause();
      this.callbacks.onGraphicsError();
    };
    canvas.addEventListener("webglcontextlost", contextLost);
    this.removeListeners.push(() =>
      canvas.removeEventListener("webglcontextlost", contextLost),
    );
    this.publish();
  }
  private resetView() {
    const level = this.simulation.level;
    const path = navigationFor(level).findPath(level.start, level.spirit);
    this.yaw = yawToward(level.start, path[0] ?? level.spirit);
    this.pitch = -0.03;
    this.clearInput();
  }
  private clearInput() {
    this.keys.clear();
    this.dash = false;
    this.dragging = false;
    this.touchMove = { forward: 0, right: 0 };
    this.accumulator = 0;
  }
  private keyDown(e: KeyboardEvent) {
    if (
      document.activeElement !== this.canvas &&
      document.pointerLockElement !== this.canvas
    )
      return;
    if (!MOVEMENT_KEYS.has(e.code)) return;
    e.preventDefault();
    if (e.code === "Escape") {
      this.pause();
      return;
    }
    if (e.code === "KeyM" && !e.repeat) {
      this.callbacks.onMapToggle();
      return;
    }
    if (this.simulation.status !== "playing") return;
    this.keys.add(e.code);
    if (e.code === "Space" && !e.repeat) this.dash = true;
  }
  private captureMouse() {
    this.canvas.focus();
    if (!this.canvas.requestPointerLock) {
      this.callbacks.onPointerFallback();
      return;
    }
    try {
      void this.canvas.requestPointerLock()?.catch(() => {
        if (!this.disposed) this.callbacks.onPointerFallback();
      });
    } catch {
      this.callbacks.onPointerFallback();
    }
  }
  start() {
    if (!this.loaded) return;
    this.simulation.start();
    this.resetView();
    this.audio.start();
    this.foley.start();
    this.publish();
    this.captureMouse();
    this.lastTime = 0;
    this.invalidate();
  }
  resume() {
    this.simulation.resume();
    this.clearInput();
    this.audio.start();
    this.foley.start();
    this.publish();
    this.captureMouse();
    this.lastTime = 0;
    this.invalidate();
  }
  pause() {
    this.simulation.pause();
    this.clearInput();
    this.audio.pause();
    this.foley.pause();
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.lastTime = 0;
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.publish();
    this.invalidate();
  }
  setQuality(value: GraphicsQuality) {
    if (this.quality === value) return;
    this.quality = value;
    this.scene.setQuality(value);
    this.invalidate();
  }
  moveTouch(forward: number, right: number) {
    if (this.simulation.status !== "playing") return;
    this.touchMove = {
      forward: Math.max(-1, Math.min(1, forward)),
      right: Math.max(-1, Math.min(1, right)),
    };
  }
  lookTouch(dx: number, dy: number) {
    if (this.simulation.status !== "playing") return;
    this.yaw -= dx * 0.004;
    this.pitch = Math.max(-1.18, Math.min(1.18, this.pitch - dy * 0.004));
  }
  dashTouch() {
    if (this.simulation.status === "playing") this.dash = true;
  }
  setReducedMotion(value: boolean) {
    if (this.reducedMotion === value) return;
    this.reducedMotion = value;
    this.invalidate();
  }
  setMuted(value: boolean) {
    this.audio.setMuted(value);
    this.foley.setMuted(value);
  }
  setVolume(value: number) {
    this.audio.setVolume(value);
    this.foley.setVolume(value);
  }
  private publish() {
    this.canvas.dataset.status = this.simulation.status;
    this.callbacks.onUpdate(viewState(this.simulation, this.yaw));
  }
  private scheduleFrame() {
    if (!this.raf && this.loaded && !this.disposed && !document.hidden)
      this.raf = requestAnimationFrame((time) => this.frame(time));
  }
  private invalidate() {
    this.needsRender = true;
    this.scheduleFrame();
  }
  private frame(time: number) {
    this.raf = 0;
    if (this.disposed || !this.loaded || document.hidden) return;
    if (this.simulation.status !== "playing" && !this.needsRender) return;
    const dt = this.lastTime ? Math.min((time - this.lastTime) / 1000, 0.1) : 0;
    this.lastTime = time;
    if (this.simulation.status === "playing") {
      this.accumulator += dt;
      while (
        this.accumulator >= 1 / 60 &&
        this.simulation.status === "playing"
      ) {
        const held = (code: string) => Number(this.keys.has(code));
        this.yaw +=
          ((held("KeyQ") +
            held("ArrowLeft") -
            held("KeyE") -
            held("ArrowRight")) *
            1.9) /
          60;
        const forward =
          held("KeyW") +
          held("ArrowUp") -
          held("KeyS") -
          held("ArrowDown") +
          this.touchMove.forward;
        const right = held("KeyD") - held("KeyA") + this.touchMove.right;
        const direction = cameraInput(this.yaw, forward, right);
        // An idle dash follows the camera, rather than the last strafing direction.
        if (this.dash && !forward && !right)
          this.simulation.player.facing = cameraInput(this.yaw, 1, 0);
        this.simulation.update(1 / 60, { ...direction, dash: this.dash });
        this.dash = false;
        this.accumulator -= 1 / 60;
      }
      this.foley.update(this.simulation, this.yaw);
      this.audio.setThreat(this.simulation.snapshot().threat);
      const cues = this.simulation.sounds.splice(0);
      for (const cue of cues) this.audio.play(cue);
      if (cues.some((cue) => cue !== "step")) this.publish();
      if (this.simulation.status !== "playing") {
        this.audio.stopMusic();
        this.foley.pause();
        this.needsRender = true;
        this.clearInput();
        if (document.pointerLockElement === this.canvas)
          document.exitPointerLock();
        this.publish();
      }
    }
    // Simulation stays at 60 Hz; high-refresh displays must not multiply GPU work.
    const frameInterval = 1000 / GRAPHICS[this.quality].fps;
    if (this.needsRender || time >= this.nextRender - 1) {
      this.scene.render(
        this.simulation,
        this.yaw,
        this.pitch,
        this.reducedMotion,
      );
      this.nextRender = this.needsRender
        ? time + frameInterval
        : Math.max(this.nextRender + frameInterval, time + frameInterval * 0.1);
      this.needsRender = false;
    }
    if (this.simulation.status === "playing") {
      if (time - this.lastUI > 100) {
        this.publish();
        this.lastUI = time;
      }
      this.scheduleFrame();
    }
  }
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.observer.disconnect();
    this.removeListeners.forEach((remove) => remove());
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.audio.dispose();
    this.foley.dispose();
    this.scene.dispose();
  }
}
