import { PERFORMANCE, QUALITY_ORDER, type QualityTier } from '../config';

export type QualityChangeListener = (tier: QualityTier, reason: 'downgrade' | 'upgrade') => void;

/**
 * Tracks frame timing and adapts the quality tier.
 *
 * Hysteresis rules:
 *  - a downgrade needs the rolling average to sit below `downgradeBelowFps`
 *  - an upgrade needs a sustained period above `upgradeAboveFps`
 *  - after any change, a cooldown blocks further changes
 * Together these prevent the visual quality from oscillating.
 */
export class PerformanceManager {
  private readonly samples: number[] = [];
  private sampleIndex = 0;
  private cooldown = 0;
  private goodStreak = 0;
  private listeners: QualityChangeListener[] = [];
  private frameCount = 0;
  private fpsAccumulator = 0;
  private displayFps = 0;
  private inferenceTimestamps: number[] = [];

  constructor(
    private tier: QualityTier,
    private readonly adaptive = true,
  ) {}

  get quality(): QualityTier {
    return this.tier;
  }

  get fps(): number {
    return this.displayFps;
  }

  get frameTimeMs(): number {
    return this.displayFps > 0 ? 1000 / this.displayFps : 0;
  }

  get inferenceFps(): number {
    return this.inferenceTimestamps.length;
  }

  onQualityChange(listener: QualityChangeListener): void {
    this.listeners.push(listener);
  }

  /** Call once per completed vision inference to track the vision loop rate. */
  markInference(now: number): void {
    this.inferenceTimestamps.push(now);
    const cutoff = now - 1000;
    while (this.inferenceTimestamps.length > 0 && this.inferenceTimestamps[0] < cutoff) {
      this.inferenceTimestamps.shift();
    }
  }

  update(dt: number): void {
    if (dt <= 0) return;

    const instantaneous = 1 / dt;
    if (this.samples.length < PERFORMANCE.sampleWindow) {
      this.samples.push(instantaneous);
    } else {
      this.samples[this.sampleIndex] = instantaneous;
      this.sampleIndex = (this.sampleIndex + 1) % PERFORMANCE.sampleWindow;
    }

    // Smoothed display value, updated a few times a second so the HUD is readable.
    this.frameCount++;
    this.fpsAccumulator += dt;
    if (this.fpsAccumulator >= 0.25) {
      this.displayFps = this.frameCount / this.fpsAccumulator;
      this.frameCount = 0;
      this.fpsAccumulator = 0;
    }

    if (!this.adaptive) return;

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.samples.length < PERFORMANCE.sampleWindow || this.cooldown > 0) return;

    const average = this.average();

    if (average < PERFORMANCE.downgradeBelowFps) {
      this.goodStreak = 0;
      this.shift(-1, 'downgrade');
      return;
    }

    if (average > PERFORMANCE.upgradeAboveFps) {
      this.goodStreak += dt;
      if (this.goodStreak >= PERFORMANCE.upgradeDwellSeconds) {
        this.goodStreak = 0;
        this.shift(1, 'upgrade');
      }
    } else {
      this.goodStreak = 0;
    }
  }

  private average(): number {
    let total = 0;
    for (let i = 0; i < this.samples.length; i++) total += this.samples[i];
    return total / this.samples.length;
  }

  private shift(direction: number, reason: 'downgrade' | 'upgrade'): void {
    const index = QUALITY_ORDER.indexOf(this.tier);
    const next = QUALITY_ORDER[index + direction];
    if (!next) return;
    this.tier = next;
    this.cooldown = PERFORMANCE.cooldownSeconds;
    this.samples.length = 0;
    this.sampleIndex = 0;
    for (const listener of this.listeners) listener(next, reason);
  }

  /** Manual override, e.g. from a debug shortcut. */
  setTier(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;
    this.cooldown = PERFORMANCE.cooldownSeconds;
    this.samples.length = 0;
    for (const listener of this.listeners) listener(tier, 'downgrade');
  }
}
