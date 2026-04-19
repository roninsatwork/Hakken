// Audio Engine using raw Web Audio API for Zero-Latency Sound Synthesis 

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private isMuted: boolean = false;
  
  private sirenOsc: OscillatorNode | null = null;
  private sirenGain: GainNode | null = null;
  private sirenActive: boolean = false;
  private sirenPitch: number = 400; // Base siren pitch

  private ambientOsc: OscillatorNode[] = [];
  private ambientGain: GainNode | null = null;
  private ambientActive: boolean = false;

  constructor() {
    try {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    } catch (e) {
      console.warn("AudioContext not supported");
    }
  }

  public init() {
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Hyoshigi Wooden Clack (Replaces chomp)
  public playChomp() {
    if (!this.ctx || this.isMuted) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.03);
    
    // very short, sharp envelope for a wood block strike
    gain.gain.setValueAtTime(0.001, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, this.ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.04);
    
    osc.connect(gain);
    gain.connect(this.ctx.destination);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.05);
  }

  // Kiai / Katana focus hum
  public playPowerPelletLoop() {
    if (!this.ctx || this.isMuted) return;
    this.stopSiren(); 

    this.sirenOsc = this.ctx.createOscillator();
    this.sirenGain = this.ctx.createGain();
    
    this.sirenOsc.type = 'triangle';
    this.sirenOsc.frequency.value = 400; // High frequency tension
    
    // Subtly ascending tension
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 6; 
    lfoGain.gain.value = 50;
    
    lfo.connect(lfoGain);
    lfoGain.connect(this.sirenOsc.frequency);

    this.sirenGain.gain.value = 0.02;

    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);

    lfo.start();
    this.sirenOsc.start();
    this.sirenActive = true;
  }

  // Taiko Heartbeat Drone
  public playSiren(levelIntensity: number) {
    if (!this.ctx || this.isMuted || this.sirenActive) return;
    
    this.sirenOsc = this.ctx.createOscillator();
    this.sirenGain = this.ctx.createGain();
    
    this.sirenOsc.type = 'sine';
    
    // Deep rhythmic pulse
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'square';
    lfo.frequency.value = 1.5 + (levelIntensity * 0.2); 
    lfoGain.gain.value = 0.03;
    
    lfo.connect(this.sirenGain.gain);
    
    this.sirenOsc.frequency.value = 60 + (levelIntensity * 2); // Very low pitch

    this.sirenGain.gain.value = 0.04;

    this.sirenOsc.connect(this.sirenGain);
    this.sirenGain.connect(this.ctx.destination);

    lfo.start();
    this.sirenOsc.start();
    this.sirenActive = true;
  }

  public stopSiren() {
    if (this.sirenOsc && this.sirenActive) {
      this.sirenOsc.stop();
      this.sirenOsc.disconnect();
      this.sirenOsc = null;
      this.sirenActive = false;
    }
  }

  public playDeath() {
    if (!this.ctx || this.isMuted) return;
    this.stopSiren();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    // Deep Gong/Bell sound
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(80, this.ctx.currentTime + 2.0);

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.ctx.currentTime + 2.0);

    gain.gain.setValueAtTime(0.5, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 2.0);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 2.0);
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stopSiren();
    return this.isMuted;
  }

  public playEatEnemy() {
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'triangle';
    // Sword slash "shing!" ring
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(this.ctx.currentTime);
    osc.stop(this.ctx.currentTime + 0.2);
  }

  public playCoinInsert() {
    if (!this.ctx || this.isMuted) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'square';
    osc1.frequency.setValueAtTime(987.77, this.ctx.currentTime); 
    osc1.frequency.setValueAtTime(1318.51, this.ctx.currentTime + 0.1); 
    
    osc2.type = 'triangle';
    osc2.frequency.setValueAtTime(990, this.ctx.currentTime);
    osc2.frequency.setValueAtTime(1320, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.6);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(this.ctx.currentTime);
    osc2.start(this.ctx.currentTime);
    osc1.stop(this.ctx.currentTime + 0.6);
    osc2.stop(this.ctx.currentTime + 0.6);
  }

  public playMenuAmbience() {
    if (!this.ctx || this.isMuted || this.ambientActive) return;
    if (this.ctx.state === 'suspended') this.ctx.resume();

    this.ambientGain = this.ctx.createGain();
    this.ambientGain.gain.setValueAtTime(0.015, this.ctx.currentTime); // Very quiet deep drone

    // 3 oscillators for a thick dark synth pad
    const freqs = [55, 110, 165]; // Low A
    this.ambientOsc = freqs.map(freq => {
      const osc = this.ctx!.createOscillator();
      osc.type = 'sawtooth';
      
      // Slow subtle LFO for pitch drifting
      const lfo = this.ctx!.createOscillator();
      const lfoGain = this.ctx!.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.2 + (Math.random() * 0.2); // Very slow
      lfoGain.gain.value = 1.5; // Slight detuning
      
      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);
      osc.frequency.value = freq;

      // Filter to dampen the harsh sawtooth
      const filter = this.ctx!.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300; 

      osc.connect(filter);
      filter.connect(this.ambientGain!);

      lfo.start();
      osc.start();
      return osc;
    });

    this.ambientGain.connect(this.ctx.destination);
    this.ambientActive = true;
  }

  public stopMenuAmbience() {
    if (this.ambientActive && this.ambientGain) {
      this.ambientGain.gain.exponentialRampToValueAtTime(0.001, this.ctx!.currentTime + 1);
      setTimeout(() => {
        this.ambientOsc.forEach(osc => {
           try { osc.stop(); osc.disconnect(); } catch(e) {}
        });
        this.ambientOsc = [];
        this.ambientGain?.disconnect();
        this.ambientGain = null;
        this.ambientActive = false;
      }, 1000);
    }
  }
}
