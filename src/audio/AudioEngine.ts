import { AUDIO } from '../config';

export type SoundCue =
  | 'handDetected'
  | 'handLost'
  | 'pinch'
  | 'release'
  | 'select'
  | 'power'
  | 'mode'
  | 'boot';

/**
 * Procedural UI sound. Everything is synthesised from oscillators and noise at
 * runtime — no samples, nothing borrowed.
 */
export class AudioEngine {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private ambience: { osc: OscillatorNode[]; gain: GainNode } | null = null;
  private enabled: boolean = AUDIO.enabledByDefault;
  private unlocked = false;

  get isEnabled(): boolean {
    return this.enabled;
  }

  init(enabled: boolean): void {
    this.enabled = enabled;
  }

  /** Must be called from a user gesture, per browser autoplay policy. */
  async setEnabled(enabled: boolean): Promise<boolean> {
    this.enabled = enabled;
    if (!enabled) {
      this.stopAmbience();
      if (this.master) this.master.gain.value = 0;
      return false;
    }

    try {
      await this.ensureContext();
      if (this.master && this.context) {
        this.master.gain.setTargetAtTime(AUDIO.masterGain, this.context.currentTime, 0.2);
      }
      this.startAmbience();
      return true;
    } catch {
      this.enabled = false;
      return false;
    }
  }

  private async ensureContext(): Promise<AudioContext> {
    if (!this.context) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) throw new Error('Web Audio is unavailable.');
      this.context = new Ctor();
      this.master = this.context.createGain();
      this.master.gain.value = 0;
      this.master.connect(this.context.destination);
    }
    if (this.context.state === 'suspended') await this.context.resume();
    this.unlocked = true;
    return this.context;
  }

  /** A low, slowly beating drone that sits under the whole interface. */
  private startAmbience(): void {
    if (!this.context || !this.master || this.ambience) return;
    const gain = this.context.createGain();
    gain.gain.value = 0.14;
    gain.connect(this.master);

    const oscillators: OscillatorNode[] = [];
    for (const [frequency, detune] of [
      [55, 0],
      [82.5, 6],
      [110, -7],
    ] as const) {
      const osc = this.context.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = frequency;
      osc.detune.value = detune;
      osc.connect(gain);
      osc.start();
      oscillators.push(osc);
    }

    const lfo = this.context.createOscillator();
    const lfoGain = this.context.createGain();
    lfo.frequency.value = 0.07;
    lfoGain.gain.value = 0.06;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    lfo.start();
    oscillators.push(lfo);

    this.ambience = { osc: oscillators, gain };
  }

  private stopAmbience(): void {
    if (!this.ambience) return;
    for (const osc of this.ambience.osc) {
      try {
        osc.stop();
      } catch {
        /* already stopped */
      }
      osc.disconnect();
    }
    this.ambience.gain.disconnect();
    this.ambience = null;
  }

  play(cue: SoundCue): void {
    if (!this.enabled || !this.unlocked || !this.context || !this.master) return;

    switch (cue) {
      case 'handDetected':
        this.tone(392, 622.25, 0.28, 'sine', 0.5);
        break;
      case 'handLost':
        this.tone(392, 196, 0.3, 'sine', 0.32);
        break;
      case 'pinch':
        this.click(1650, 0.05, 0.42);
        break;
      case 'release':
        this.click(880, 0.07, 0.28);
        break;
      case 'select':
        this.tone(880, 1320, 0.16, 'triangle', 0.45);
        window.setTimeout(() => this.click(2100, 0.04, 0.3), 90);
        break;
      case 'mode':
        this.sweep(240, 1400, 0.34, 0.3);
        break;
      case 'power': {
        // Deep impact plus a rising tail.
        this.tone(120, 42, 0.7, 'sine', 0.75);
        this.noise(0.45, 0.32);
        break;
      }
      case 'boot':
        this.tone(180, 540, 0.9, 'sine', 0.35);
        break;
    }
  }

  private envelope(duration: number, peak: number): GainNode {
    const ctx = this.context!;
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    gain.connect(this.master!);
    return gain;
  }

  private tone(from: number, to: number, duration: number, type: OscillatorType, peak: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const gain = this.envelope(duration, peak);
    osc.type = type;
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), ctx.currentTime + duration);
    osc.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  private click(frequency: number, duration: number, peak: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const gain = this.envelope(duration, peak);
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = frequency;
    filter.Q.value = 6;
    osc.type = 'square';
    osc.frequency.value = frequency;
    osc.connect(filter);
    filter.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.03);
  }

  private sweep(from: number, to: number, duration: number, peak: number): void {
    const ctx = this.context!;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = this.envelope(duration, peak);
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(from * 2, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(to * 2, ctx.currentTime + duration);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(from, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(to, ctx.currentTime + duration);
    osc.connect(filter);
    filter.connect(gain);
    osc.start();
    osc.stop(ctx.currentTime + duration + 0.05);
  }

  private noise(duration: number, peak: number): void {
    const ctx = this.context!;
    const frames = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < frames; i++) {
      // Decaying noise burst.
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / frames, 2.4);
    }
    const source = ctx.createBufferSource();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    const gain = this.envelope(duration, peak);
    source.buffer = buffer;
    source.connect(filter);
    filter.connect(gain);
    source.start();
  }

  dispose(): void {
    this.stopAmbience();
    void this.context?.close();
    this.context = null;
    this.master = null;
  }
}
