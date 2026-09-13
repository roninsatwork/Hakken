import type { SoundCue } from './NightHeistSimulation';

export const DEFAULT_GAME_VOLUME = 0.65;

/** Original procedural score and Foley. No remote audio or autoplay. */
export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private nodes = new Set<OscillatorNode>();
  private beat = 0;
  private threat = 0;
  private muted = false;
  private volume = DEFAULT_GAME_VOLUME;

  start() {
    if (typeof AudioContext === 'undefined') return;
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
    }
    this.master!.gain.value = this.muted ? 0 : this.volume;
    void this.ctx.resume().catch(() => {});
    if (this.timer) return;
    this.timer = setInterval(() => this.music(), 290);
  }
  pause() {
    this.stopMusic();
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {});
  }
  stopMusic() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.threat = 0;
  }
  setMuted(value: boolean) {
    this.muted = value;
    if (this.ctx && this.master)
      this.master.gain.setTargetAtTime(value ? 0 : this.volume, this.ctx.currentTime, 0.03);
  }
  setVolume(value: number) {
    this.volume = Math.max(0, Math.min(1, value));
    this.setMuted(this.muted);
  }
  setThreat(value: number) {
    this.threat = value;
  }
  private tone(
    frequency: number,
    duration: number,
    volume: number,
    type: OscillatorType = 'sine',
    slide?: number,
    delay = 0,
  ) {
    if (!this.ctx || !this.master || this.ctx.state !== 'running') return;
    const start = this.ctx.currentTime + delay,
      osc = this.ctx.createOscillator(),
      gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, start);
    if (slide) osc.frequency.exponentialRampToValueAtTime(slide, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, volume), start + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    osc.connect(gain);
    gain.connect(this.master);
    this.nodes.add(osc);
    osc.onended = () => {
      osc.disconnect();
      gain.disconnect();
      this.nodes.delete(osc);
    };
    osc.start(start);
    osc.stop(start + duration + 0.02);
  }
  private music() {
    // A sparse plucked motif. Pursuit adds a quicker low percussion layer.
    const motif = [220, 0, 329.63, 0, 293.66, 0, 0, 261.63, 220, 0, 392, 329.63, 0, 293.66, 0, 0];
    const note = motif[this.beat % motif.length];
    if (note) this.tone(note, 0.8, 0.08, 'triangle');
    if (this.beat % 4 === 0) this.tone(73.42, 0.8, 0.06, 'sine', 55);
    if (this.threat > 0.5 && this.beat % 2 === 0) this.tone(120, 0.12, 0.12, 'sine', 45);
    this.beat++;
  }
  play(cue: SoundCue) {
    switch (cue) {
      case 'spirit':
        [293.66, 440, 587.33, 880].forEach((note, i) =>
          this.tone(note, 0.65, 0.11, 'sine', note * 1.5, i * 0.09),
        );
        break;
      case 'spiritWarning':
        [0, 0.25, 0.5].forEach((delay) =>
          this.tone(587.33, 0.12, 0.08, 'triangle', undefined, delay),
        );
        break;
      case 'spiritEnd':
        this.tone(587.33, 0.65, 0.12, 'sine', 146.83);
        break;
      case 'knockout':
        this.tone(180, 0.14, 0.16, 'triangle', 50);
        this.tone(1174.66, 0.3, 0.08, 'sine', 587.33, 0.04);
        break;
      case 'step':
        this.tone(105, 0.055, 0.04, 'triangle', 60);
        break;
      case 'dash':
        this.tone(240, 0.2, 0.12, 'triangle', 70);
        break;
      case 'seal':
        [659.25, 880, 1318.51].forEach((note, i) =>
          this.tone(note, 0.35, 0.1, 'sine', undefined, i * 0.085),
        );
        break;
      case 'treasure':
        [440, 554.37, 659.25].forEach((note, i) =>
          this.tone(note, 0.4, 0.1, 'triangle', undefined, i * 0.06),
        );
        break;
      case 'alert':
        this.tone(880, 0.6, 0.1, 'sine', 440);
        break;
      case 'caught':
        this.tone(110, 1, 0.16, 'sine', 48);
        break;
      case 'escaped':
        [220, 329.63, 440, 659.25].forEach((note, i) =>
          this.tone(note, 1, 0.09, 'triangle', undefined, i * 0.14),
        );
        break;
    }
  }
  dispose() {
    this.stopMusic();
    for (const node of this.nodes) {
      try {
        node.stop();
      } catch {
        /* Already ended. */
      }
      node.disconnect();
    }
    this.nodes.clear();
    this.master?.disconnect();
    if (this.ctx) void this.ctx.close().catch(() => {});
    this.ctx = null;
    this.master = null;
  }
}
