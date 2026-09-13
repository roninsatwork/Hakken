import type { NightHeistSimulation } from "../../ronins-run/engine/NightHeistSimulation";
import { clearPath } from "../../ronins-run/engine/MapData";
import { GUARD_CYCLE_DISTANCE } from "./CharacterAnimation";
import { WORLD_SCALE } from "./WorldLayout";

/** Camera-relative stereo and distance make nearby patrols audible around the player. */
export function patrolPan(dx: number, dy: number, yaw: number) {
  const length = Math.hypot(dx, dy);
  return length
    ? Math.max(
        -1,
        Math.min(1, (dx * Math.cos(yaw) - dy * Math.sin(yaw)) / length),
      )
    : 0;
}

export class SpatialFoley {
  private context: AudioContext | null = null;
  private output: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private rain: AudioBufferSourceNode | null = null;
  private strides = new Map<number, number>();
  private voices = new Set<AudioBufferSourceNode>();
  private volume = 0.65;
  private muted = false;
  private disposed = false;
  start() {
    if (this.disposed) return;
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.output = this.context.createGain();
        this.output.connect(this.context.destination);
        this.noise = this.context.createBuffer(
          1,
          this.context.sampleRate * 2,
          this.context.sampleRate,
        );
        const samples = this.noise.getChannelData(0);
        let seed = 191,
          low = 0;
        for (let i = 0; i < samples.length; i++) {
          seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
          low = low * 0.5 + ((seed >>> 0) / 4294967296 - 0.5) * 0.5;
          samples[i] = low;
        }
        this.rain = this.context.createBufferSource();
        this.rain.buffer = this.noise;
        this.rain.loop = true;
        const rainGain = this.context.createGain();
        rainGain.gain.value = 0.045;
        this.rain.connect(rainGain).connect(this.output);
        this.rain.start();
      }
      this.gain();
      this.strides.clear();
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio unavailability must never block movement or a retry. */
    }
  }
  private gain() {
    if (this.output && this.context)
      this.output.gain.setTargetAtTime(
        this.muted ? 0 : this.volume,
        this.context.currentTime,
        0.025,
      );
  }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    this.gain();
  }
  setMuted(value: boolean) {
    this.muted = value;
    this.gain();
  }
  update(game: NightHeistSimulation, yaw: number) {
    const context = this.context,
      output = this.output;
    if (
      !context ||
      !output ||
      context.state !== "running" ||
      !this.noise ||
      this.muted
    )
      return;
    game.enemies.forEach((enemy, i) => {
      const stride = Math.floor(
        enemy.stride / (enemy.kind === "hound" ? 22 : GUARD_CYCLE_DISTANCE / WORLD_SCALE / 2),
      );
      const previous = this.strides.get(i);
      this.strides.set(i, stride);
      if (
        previous === undefined ||
        stride === previous ||
        !enemy.moving ||
        enemy.mode === "disabled"
      )
        return;
      const dx = enemy.pos.x - game.player.pos.x,
        dy = enemy.pos.y - game.player.pos.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 330 || this.voices.size >= 8) return;
      const open = clearPath(game.player.pos, enemy.pos, 0, game.level);
      const source = context.createBufferSource(),
        filter = context.createBiquadFilter(),
        envelope = context.createGain(),
        pan = context.createStereoPanner();
      source.buffer = this.noise;
      source.playbackRate.value = enemy.kind === "hound" ? 1.9 : 0.72;
      filter.type = "lowpass";
      filter.frequency.value = open
        ? enemy.kind === "hound"
          ? 3200
          : 1200
        : 420;
      pan.pan.value = patrolPan(dx, dy, yaw) * 0.88;
      const t = context.currentTime;
      const level = Math.pow(1 - distance / 330, 2) * (open ? 0.85 : 0.3);
      envelope.gain.setValueAtTime(0, t);
      envelope.gain.linearRampToValueAtTime(level, t + 0.006);
      envelope.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
      source.connect(filter).connect(envelope).connect(pan).connect(output);
      this.voices.add(source);
      source.onended = () => {
        this.voices.delete(source);
        source.disconnect();
        filter.disconnect();
        envelope.disconnect();
        pan.disconnect();
      };
      source.start(t, (i * 0.23) % 1);
      source.stop(t + 0.15);
    });
  }
  pause() {
    this.voices.forEach((source) => source.stop());
    this.voices.clear();
    if (this.context?.state === "running")
      void this.context.suspend().catch(() => {});
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.pause();
    this.rain?.stop();
    if (this.context) void this.context.close().catch(() => {});
    this.context = null;
    this.output = null;
    this.noise = null;
    this.rain = null;
  }
}
