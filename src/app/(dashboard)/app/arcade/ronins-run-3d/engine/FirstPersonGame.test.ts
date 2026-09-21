import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { COURTYARD, LEVELS } from "../../ronins-run/engine/Levels";
import { NightHeistSimulation } from "../../ronins-run/engine/NightHeistSimulation";
import { distance } from "../../ronins-run/engine/MapData";
import { FirstPersonGame, type ViewState } from "./FirstPersonGame";

// These integration checks play a whole map. Coverage on the two-core CI
// runner can exceed Vitest's 5s unit-test default without a gameplay failure.
const FULL_MAP_TIMEOUT_MS = 30_000;

const mock = vi.hoisted(() => ({
  dispose: vi.fn(),
  render: vi.fn(),
  pause: vi.fn(),
  audioDispose: vi.fn(),
}));
vi.mock("./HeistScene", () => ({
  HeistScene: class {
    materialsReady = Promise.resolve();
    render = mock.render;
    resize = vi.fn();
    setQuality = vi.fn();
    dispose = mock.dispose;
  },
}));
vi.mock("../../ronins-run/engine/AudioEngine", () => ({
  DEFAULT_GAME_VOLUME: 0.65,
  AudioEngine: class {
    start = vi.fn();
    pause = mock.pause;
    stopMusic = vi.fn();
    dispose = mock.audioDispose;
    setVolume = vi.fn();
    setMuted = vi.fn();
    setThreat = vi.fn();
    play = vi.fn();
  },
}));

describe("first-person runtime", () => {
  let canvas: HTMLCanvasElement,
    game: FirstPersonGame,
    nextFrame: FrameRequestCallback | undefined,
    timestamp: number;
  let state: ViewState;
  const fallback = vi.fn(),
    map = vi.fn(),
    graphics = vi.fn();
  let frameId = 0;
  let resize: ResizeObserverCallback;
  const advance = (frames: number, step = 1000 / 60) => {
    for (let i = 0; i < frames; i++) {
      timestamp += step;
      const callback = nextFrame;
      nextFrame = undefined;
      callback?.(timestamp);
    }
  };
  const key = (code: string, type = "keydown") =>
    document.dispatchEvent(
      new KeyboardEvent(type, { code, bubbles: true, cancelable: true }),
    );
  beforeEach(async () => {
    vi.clearAllMocks();
    timestamp = 1000;
    frameId = 0;
    nextFrame = undefined;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        nextFrame = callback;
        return ++frameId;
      }),
    );
    vi.stubGlobal(
      "cancelAnimationFrame",
      vi.fn((id: number) => {
        if (id === frameId) nextFrame = undefined;
      }),
    );
    vi.stubGlobal(
      "ResizeObserver",
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback;
        }
        observe = vi.fn();
        disconnect = vi.fn();
      },
    );
    canvas = document.createElement("canvas");
    canvas.tabIndex = 0;
    document.body.append(canvas);
    canvas.requestPointerLock = vi.fn().mockRejectedValue(new Error("Denied"));
    game = new FirstPersonGame(canvas, COURTYARD, {
      onUpdate: (next) => {
        state = next;
      },
      onMapToggle: map,
      onPointerFallback: fallback,
      onGraphicsError: graphics,
    });
    await Promise.resolve();
  });
  afterEach(() => {
    game.dispose();
    canvas.remove();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("renders the menu once then stops scheduling work until it is needed", () => {
    advance(120);
    expect(mock.render).toHaveBeenCalledOnce();
    expect(nextFrame).toBeUndefined();
    resize([], {} as ResizeObserver);
    advance(120);
    expect(mock.render).toHaveBeenCalledTimes(2);
    expect(nextFrame).toBeUndefined();
  });
  it("stops drawing paused and hidden games and resumes without a time jump", () => {
    game.start();
    advance(12);
    game.pause();
    advance(1);
    const renders = mock.render.mock.calls.length,
      elapsed = game.simulation.elapsed;
    advance(600);
    expect(mock.render).toHaveBeenCalledTimes(renders);
    expect(nextFrame).toBeUndefined();
    const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    document.dispatchEvent(new Event("visibilitychange"));
    advance(60);
    expect(mock.render).toHaveBeenCalledTimes(renders);
    expect(nextFrame).toBeUndefined();
    hidden.mockReturnValue(false);
    document.dispatchEvent(new Event("visibilitychange"));
    advance(1);
    expect(mock.render).toHaveBeenCalledTimes(renders + 1);
    expect(nextFrame).toBeUndefined();
    game.resume();
    advance(2);
    expect(game.simulation.elapsed - elapsed).toBeLessThan(0.04);
    expect(nextFrame).toBeDefined();
  });
  it("caps drawing at 60 fps on a 120 Hz screen while preserving simulation time", () => {
    game.start();
    game.simulation.enemies = [];
    mock.render.mockClear();
    advance(120, 1000 / 120);
    expect(mock.render.mock.calls.length).toBeGreaterThanOrEqual(59);
    expect(mock.render.mock.calls.length).toBeLessThanOrEqual(61);
    expect(game.simulation.elapsed).toBeGreaterThan(0.95);
    expect(game.simulation.elapsed).toBeLessThanOrEqual(1);
  });

  it("halves drawing in Quiet mode without slowing power timers or movement", () => {
    game.start();
    game.setQuality("quiet");
    game.simulation.enemies = [];
    game.simulation.spiritTime = 10;
    mock.render.mockClear();
    advance(120, 1000 / 120);
    expect(mock.render.mock.calls.length).toBeGreaterThanOrEqual(29);
    expect(mock.render.mock.calls.length).toBeLessThanOrEqual(31);
    expect(game.simulation.spiritTime).toBeCloseTo(9, 1);
  });
  it("touch movement, looking and dash use the shared rules and release on pause", () => {
    game.start();
    const origin = { ...game.simulation.player.pos };
    game.moveTouch(1, 0);
    advance(20);
    expect(distance(origin, game.simulation.player.pos)).toBeGreaterThan(20);
    game.pause();
    const stopped = { ...game.simulation.player.pos };
    game.resume();
    advance(10);
    expect(game.simulation.player.pos).toEqual(stopped);
    const yaw = state.yaw;
    game.lookTouch(100, 0);
    advance(10);
    expect(state.yaw).toBeCloseTo(yaw - 0.4);
    game.dashTouch();
    advance(3);
    expect(game.simulation.cooldown).toBeGreaterThan(5);
  });

  it("turns with client-coordinate drags when unlocked movementX/Y are zero", () => {
    game.start();
    advance(10);
    const yaw = state.yaw;
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 300, clientY: 200 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 400, clientY: 210 }));
    advance(10);
    expect(state.yaw).toBeCloseTo(yaw - 0.22);
    document.dispatchEvent(new MouseEvent("mouseup"));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 900, clientY: 210 }));
    advance(10);
    expect(state.yaw).toBeCloseTo(yaw - 0.22);
    // A new gesture starts at its own position, without a jump from the last drag.
    canvas.dispatchEvent(new MouseEvent("mousedown", { button: 0, clientX: 700, clientY: 200 }));
    document.dispatchEvent(new MouseEvent("mousemove", { clientX: 600, clientY: 200 }));
    advance(10);
    expect(state.yaw).toBeCloseTo(yaw);
  });

  it("starts despite rejected mouse capture and supports keyboard movement and turning", async () => {
    game.start();
    await Promise.resolve();
    expect(fallback).toHaveBeenCalled();
    const start = { ...game.simulation.player.pos };
    key("KeyW");
    advance(30);
    key("KeyW", "keyup");
    expect(distance(start, game.simulation.player.pos)).toBeGreaterThan(40);
    const yaw = state.yaw;
    key("KeyQ");
    advance(30);
    key("KeyQ", "keyup");
    expect(state.yaw).toBeGreaterThan(yaw + 0.5);
    key("KeyM");
    expect(map).toHaveBeenCalledOnce();
  });
  it("pauses on blur and clears held movement before resuming", () => {
    game.start();
    key("KeyW");
    advance(12);
    window.dispatchEvent(new Event("blur"));
    const position = { ...game.simulation.player.pos },
      elapsed = game.simulation.elapsed;
    advance(60);
    expect(game.simulation.status).toBe("paused");
    expect(game.simulation.elapsed).toBe(elapsed);
    game.resume();
    advance(12);
    expect(game.simulation.player.pos).toEqual(position);
    expect(mock.pause).toHaveBeenCalled();
  });
  it("freezes Spirit Power and dash cooldown in pause and resets both on retry", () => {
    game.start();
    game.simulation.spiritTime = 8;
    game.simulation.cooldown = 4;
    key("Escape");
    advance(60);
    expect(game.simulation.spiritTime).toBe(8);
    expect(game.simulation.cooldown).toBe(4);
    game.start();
    expect(game.simulation.spiritTime).toBe(0);
    expect(game.simulation.cooldown).toBe(0);
    expect(game.simulation.player.pos).toEqual(COURTYARD.start);
  });
  it.each(LEVELS)(
    "matches original powered guard and hound contact on $id",
    async (level) => {
      game.dispose();
      game = new FirstPersonGame(canvas, level, {
        onUpdate: (next) => {
          state = next;
        },
        onMapToggle: map,
        onPointerFallback: fallback,
        onGraphicsError: graphics,
      });
      await Promise.resolve();
      game.start();
      const original = new NightHeistSimulation(level);
      original.start();
      // Start at the authored flame with one guard and one hound in contact.
      for (const simulation of [original, game.simulation]) {
        simulation.player.pos = { ...level.spirit };
        simulation.enemies = ["guard", "hound"].map(
          (kind) => simulation.enemies.find((e) => e.kind === kind)!,
        );
        simulation.enemies.forEach((enemy) => {
          enemy.pos = { ...level.spirit };
        });
      }
      original.update(1 / 60, { x: 0, y: 0, dash: false });
      advance(3);
      expect(game.simulation.knockouts).toBe(original.knockouts);
      expect(state).toMatchObject({
        status: "playing",
        spiritCollected: true,
        knockouts: 2,
        seals: 0,
      });
      expect(state.spiritSeconds).toBeGreaterThan(9.8);
      expect(
        game.simulation.enemies.every((enemy) => enemy.mode === "disabled"),
      ).toBe(true);
      // The same two patrols stay down after the ten-second power window.
      advance(630);
      expect(state.spiritSeconds).toBe(0);
      expect(state.knockouts).toBe(2);
      expect(game.simulation.status).toBe("playing");
      game.start();
      expect(
        game.simulation.enemies.every((enemy) => enemy.mode === "patrol"),
      ).toBe(true);
    },
    FULL_MAP_TIMEOUT_MS,
  );
  it("does not steal keys from settings and reports lost graphics", () => {
    game.start();
    const input = document.createElement("input");
    document.body.append(input);
    input.focus();
    key("Space");
    advance(10);
    expect(game.simulation.cooldown).toBe(0);
    const event = new Event("webglcontextlost", { cancelable: true });
    canvas.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(game.simulation.status).toBe("paused");
    expect(graphics).toHaveBeenCalledOnce();
    input.remove();
  });
  it("disposes graphics/audio and removes the input handlers", () => {
    game.start();
    game.dispose();
    key("KeyM");
    expect(map).not.toHaveBeenCalled();
    expect(mock.dispose).toHaveBeenCalledOnce();
    expect(mock.audioDispose).toHaveBeenCalledOnce();
  });
});
