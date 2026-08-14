import { MAPPING, VISION } from '../config';
import { EventBus } from '../utils/EventBus';
import { CameraFeed, type CameraError } from './CameraFeed';
import { GestureEngine, type HandFeatures } from './GestureEngine';
import { LandmarkSmoother } from './LandmarkSmoother';
import { MediaPipeManager, type VisionMode } from './MediaPipeManager';
import type { CameraState, Handedness, RawHand } from './types';

export interface TrackedHand {
  slot: 0 | 1;
  active: boolean;
  /** Handedness as the user experiences it, corrected for the mirrored view. */
  label: Handedness;
  features: HandFeatures;
  lastSeen: number;
}

interface TrackerEvents extends Record<string, unknown> {
  state: CameraState;
  error: CameraError;
  ready: { mode: VisionMode; delegate: string };
  inference: { ms: number; timestamp: number };
}

const SLOT_MATCH_MAX_AGE = 0.6;

/**
 * Drives the whole vision pipeline and hands the rest of the application a
 * pair of stable, smoothed, classified hands.
 *
 * Inference runs on its own schedule (VISION.targetInferenceFps) rather than
 * once per rendered frame, so the render loop never waits on the model.
 */
export class HandTracker {
  readonly events = new EventBus<TrackerEvents>();
  readonly feed = new CameraFeed();

  private readonly pipeline = new MediaPipeManager();
  private readonly smoothers = [new LandmarkSmoother(), new LandmarkSmoother()];
  private readonly engines = [new GestureEngine(), new GestureEngine()];
  private readonly tracked: TrackedHand[];

  private stateInternal: CameraState = 'OFF';
  private enabled = false;
  private initialising = false;
  private lastInferenceAt = 0;
  private lastResultAt = 0;
  private missedFrames = 0;
  private inferenceMs = 0;
  private modelReady = false;

  constructor() {
    this.tracked = [0, 1].map((slot) => ({
      slot: slot as 0 | 1,
      active: false,
      label: 'Unknown' as Handedness,
      features: this.engines[slot].current,
      lastSeen: -Infinity,
    }));
  }

  get state(): CameraState {
    return this.stateInternal;
  }

  get hands(): readonly TrackedHand[] {
    return this.tracked;
  }

  get activeHandCount(): number {
    return this.tracked.reduce((total, hand) => total + (hand.active ? 1 : 0), 0);
  }

  get lastInferenceMs(): number {
    return this.inferenceMs;
  }

  get visionMode(): VisionMode {
    return this.pipeline.mode;
  }

  get delegate(): string {
    return this.pipeline.delegate;
  }

  get isReady(): boolean {
    return this.modelReady && this.feed.active;
  }

  private setState(state: CameraState): void {
    if (this.stateInternal === state) return;
    this.stateInternal = state;
    this.events.emit('state', state);
  }

  /* ------------------------------------------------------------------ */
  /* lifecycle                                                           */
  /* ------------------------------------------------------------------ */

  async enable(): Promise<boolean> {
    if (this.enabled || this.initialising) return this.enabled;
    this.initialising = true;
    this.setState('INITIALIZING');

    try {
      await this.feed.start();
    } catch (error) {
      this.initialising = false;
      const cameraError = error as CameraError;
      this.setState(cameraError?.kind === 'denied' ? 'DENIED' : 'ERROR');
      this.events.emit('error', cameraError);
      return false;
    }

    try {
      if (!this.modelReady) {
        await this.pipeline.init();
        this.modelReady = true;
        this.events.emit('ready', { mode: this.pipeline.mode, delegate: this.pipeline.delegate });
      }
    } catch (error) {
      this.initialising = false;
      this.feed.stop();
      this.setState('ERROR');
      this.events.emit('error', {
        kind: 'unknown',
        message:
          error instanceof Error
            ? `Hand tracking model failed to load: ${error.message}`
            : 'Hand tracking model failed to load.',
      });
      return false;
    }

    this.enabled = true;
    this.initialising = false;
    this.setState('READY');
    return true;
  }

  disable(): void {
    this.enabled = false;
    this.feed.stop();
    for (const hand of this.tracked) hand.active = false;
    for (const smoother of this.smoothers) smoother.reset();
    for (const engine of this.engines) engine.reset();
    this.setState('OFF');
  }

  async toggle(): Promise<boolean> {
    if (this.enabled) {
      this.disable();
      return false;
    }
    return this.enable();
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /* ------------------------------------------------------------------ */
  /* per-frame                                                           */
  /* ------------------------------------------------------------------ */

  /** Called every rendered frame; only actually infers on its own schedule. */
  update(now: number): void {
    if (!this.enabled || !this.feed.ready) return;

    const interval = 1000 / VISION.targetInferenceFps;
    if (now - this.lastInferenceAt < interval || this.pipeline.isBusy) return;
    this.lastInferenceAt = now;

    void this.pipeline.detect(this.feed.video, now).then((result) => {
      if (!result || !this.enabled) return;
      this.inferenceMs = result.inferenceMs;
      this.events.emit('inference', { ms: result.inferenceMs, timestamp: result.timestamp });
      this.ingest(result.hands, now);
    });
  }

  /* ------------------------------------------------------------------ */
  /* result processing                                                   */
  /* ------------------------------------------------------------------ */

  private ingest(hands: RawHand[], now: number): void {
    const nowSeconds = now / 1000;
    const dt = this.lastResultAt > 0 ? Math.min(0.2, nowSeconds - this.lastResultAt) : 1 / 30;
    this.lastResultAt = nowSeconds;

    if (hands.length === 0) {
      this.missedFrames++;
      if (this.missedFrames >= VISION.lostFrames) {
        for (const hand of this.tracked) hand.active = false;
        this.setState(this.stateInternal === 'TRACKING' ? 'TRACKING_LOST' : 'NO_HAND');
      }
      return;
    }

    this.missedFrames = 0;
    const assignment = this.assignSlots(hands, nowSeconds);

    for (let slot = 0; slot < 2; slot++) {
      const hand = assignment[slot];
      const tracked = this.tracked[slot];

      if (!hand) {
        if (tracked.active && nowSeconds - tracked.lastSeen > SLOT_MATCH_MAX_AGE) {
          tracked.active = false;
          this.smoothers[slot].reset();
          this.engines[slot].reset();
        }
        continue;
      }

      const smoothed = this.smoothers[slot].filter(hand.landmarks, dt);
      const features = this.engines[slot].update(
        smoothed,
        hand.worldLandmarks,
        hand.handedness,
        hand.score,
        dt,
        nowSeconds,
      );

      tracked.features = features;
      tracked.active = true;
      tracked.lastSeen = nowSeconds;
      // MediaPipe labels handedness as if the frame were mirrored; the raw feed
      // is not, so the label is swapped to match what the user sees.
      tracked.label = MAPPING.mirrorX ? flipHandedness(hand.handedness) : hand.handedness;
    }

    this.setState('TRACKING');
  }

  /**
   * Keeps a physical hand on the same slot between frames — otherwise the two
   * hands would swap identities whenever MediaPipe reordered its output, and
   * every smoothing filter would jump.
   */
  private assignSlots(hands: RawHand[], now: number): Array<RawHand | null> {
    const result: Array<RawHand | null> = [null, null];
    const candidates = hands.slice(0, 2);

    const cost = (hand: RawHand, slot: number): number => {
      const tracked = this.tracked[slot];
      if (!tracked.active || now - tracked.lastSeen > SLOT_MATCH_MAX_AGE) return 1.5;
      const previous = tracked.features.position;
      const wrist = hand.landmarks[0];
      const spatial = Math.hypot(wrist.x - previous.x, wrist.y - previous.y);
      const handednessBonus = tracked.features.handedness === hand.handedness ? -0.35 : 0.15;
      return spatial + handednessBonus;
    };

    if (candidates.length === 1) {
      const slot = cost(candidates[0], 0) <= cost(candidates[0], 1) ? 0 : 1;
      result[slot] = candidates[0];
      return result;
    }

    // Two hands: pick whichever of the two pairings is globally cheaper.
    const straight = cost(candidates[0], 0) + cost(candidates[1], 1);
    const swapped = cost(candidates[0], 1) + cost(candidates[1], 0);
    if (straight <= swapped) {
      result[0] = candidates[0];
      result[1] = candidates[1];
    } else {
      result[0] = candidates[1];
      result[1] = candidates[0];
    }
    return result;
  }

  dispose(): void {
    this.disable();
    this.pipeline.dispose();
    this.events.clear();
  }
}

function flipHandedness(handedness: Handedness): Handedness {
  if (handedness === 'Left') return 'Right';
  if (handedness === 'Right') return 'Left';
  return 'Unknown';
}
