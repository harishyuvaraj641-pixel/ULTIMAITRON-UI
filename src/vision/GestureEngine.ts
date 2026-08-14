import { GESTURE } from '../config';
import { clamp01, Ema, Hysteresis, mapRange } from '../utils/MathUtils';
import { FINGERS, HAND_LANDMARK, type Handedness, type Landmark } from './types';

/** Single-hand gesture vocabulary produced by the engine. */
export type HandGesture =
  | 'NONE'
  | 'NEUTRAL'
  | 'POINT'
  | 'PINCH'
  | 'FIST'
  | 'OPEN_PALM'
  | 'TWO_FINGER'
  | 'THREE_FINGER'
  | 'FOUR_FINGER';

export const GESTURE_LABEL: Record<HandGesture, string> = {
  NONE: '—',
  NEUTRAL: 'TRACKING',
  POINT: 'POINT',
  PINCH: 'PINCH',
  FIST: 'FIST',
  OPEN_PALM: 'OPEN PALM',
  TWO_FINGER: 'NAVIGATION',
  THREE_FINGER: 'SYSTEM ANALYSIS',
  FOUR_FINGER: 'DATA VISUALISATION',
};

/** Everything the interaction layer needs to know about one hand. */
export interface HandFeatures {
  handedness: Handedness;
  score: number;
  confidence: number;
  /** Per-finger extension, 0 = folded, 1 = straight. Thumb first. */
  extension: number[];
  extended: boolean[];
  extendedCount: number;
  palmOpenness: number;
  /** |thumbTip - indexTip| normalised by hand scale. */
  pinchDistance: number;
  pinching: boolean;
  /** Normalised image-space position of the palm centre. */
  position: { x: number; y: number; z: number };
  /** Index fingertip, used as the cursor. */
  indexTip: { x: number; y: number; z: number };
  /** Midpoint of thumb and index tips — the natural grab point. */
  pinchPoint: { x: number; y: number; z: number };
  velocity: { x: number; y: number };
  speed: number;
  /** Palm normal in image space; the z component tells you which way it faces. */
  palmNormal: { x: number; y: number; z: number };
  /** Roll of the palm around the view axis, radians. */
  palmRoll: number;
  handScale: number;
  gesture: HandGesture;
  /** Reference to the smoothed landmark array, for overlays and debugging. */
  landmarks: Landmark[];
}

const PINCH_MIN_INDEX_EXTENSION = 0.4;
const THUMB_SPREAD_MIN = 0.62;
const THUMB_SPREAD_MAX = 1.45;

function subtract(a: Landmark, b: Landmark, out: number[]): void {
  out[0] = a.x - b.x;
  out[1] = a.y - b.y;
  out[2] = a.z - b.z;
}

function normalise(v: number[]): number {
  const length = Math.hypot(v[0], v[1], v[2]);
  if (length < 1e-6) return 0;
  v[0] /= length;
  v[1] /= length;
  v[2] /= length;
  return length;
}

function distance(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

/**
 * Turns smoothed landmarks into stable, human-meaningful gesture features.
 *
 * Nothing downstream ever touches a raw landmark: every value here is filtered,
 * normalised by hand size, and latched with hysteresis so a gesture cannot
 * flicker on and off between frames.
 */
export class GestureEngine {
  private readonly pinchLatch = new Hysteresis(GESTURE.pinchEnter, GESTURE.pinchExit);
  private readonly extensionLatches = FINGERS.map(
    () => new Hysteresis(1 - GESTURE.fingerExtendEnter, 1 - GESTURE.fingerExtendExit),
  );
  private readonly confidenceFilter = new Ema(6);
  private readonly velocityX = new Ema(10);
  private readonly velocityY = new Ema(10);

  private previous: { x: number; y: number; time: number } | null = null;
  private readonly vecA: number[] = [0, 0, 0];
  private readonly vecB: number[] = [0, 0, 0];
  private readonly vecC: number[] = [0, 0, 0];

  private readonly features: HandFeatures = {
    handedness: 'Unknown',
    score: 0,
    confidence: 0,
    extension: [0, 0, 0, 0, 0],
    extended: [false, false, false, false, false],
    extendedCount: 0,
    palmOpenness: 0,
    pinchDistance: 1,
    pinching: false,
    position: { x: 0, y: 0, z: 0 },
    indexTip: { x: 0, y: 0, z: 0 },
    pinchPoint: { x: 0, y: 0, z: 0 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    palmNormal: { x: 0, y: 0, z: 0 },
    palmRoll: 0,
    handScale: 0.2,
    gesture: 'NONE',
    landmarks: [],
  };

  /**
   * @param landmarks smoothed image-space landmarks
   * @param world     metric landmarks; used for joint angles when available
   */
  update(
    landmarks: Landmark[],
    world: Landmark[],
    handedness: Handedness,
    score: number,
    dt: number,
    now: number,
  ): HandFeatures {
    const f = this.features;
    f.handedness = handedness;
    f.score = score;
    f.landmarks = landmarks;

    const wrist = landmarks[HAND_LANDMARK.WRIST];
    const middleMcp = landmarks[HAND_LANDMARK.MIDDLE_MCP];
    const indexMcp = landmarks[HAND_LANDMARK.INDEX_MCP];
    const pinkyMcp = landmarks[HAND_LANDMARK.PINKY_MCP];
    const thumbTip = landmarks[HAND_LANDMARK.THUMB_TIP];
    const indexTip = landmarks[HAND_LANDMARK.INDEX_TIP];

    // Wrist-to-middle-knuckle is the most stable scale reference on a hand.
    const handScale = Math.max(1e-3, distance(wrist, middleMcp));
    f.handScale = handScale;

    /* --- finger extension --------------------------------------------- */
    // Joint angles come from the metric world landmarks where possible: they
    // are insensitive to how the hand is oriented towards the lens.
    const source = world.length >= 21 ? world : landmarks;
    let openness = 0;
    let extendedCount = 0;

    for (let i = 0; i < FINGERS.length; i++) {
      const finger = FINGERS[i];
      subtract(source[finger.pip], source[finger.mcp], this.vecA);
      subtract(source[finger.tip], source[finger.pip], this.vecB);
      normalise(this.vecA);
      normalise(this.vecB);
      const dot =
        this.vecA[0] * this.vecB[0] + this.vecA[1] * this.vecB[1] + this.vecA[2] * this.vecB[2];
      let extension = clamp01((dot + 1) * 0.5);

      if (i === 0) {
        // The thumb barely bends at the IP joint even when tucked, so combine
        // the joint angle with how far it is splayed from the palm.
        const spread = distance(thumbTip, middleMcp) / handScale;
        const splay = clamp01(mapRange(spread, THUMB_SPREAD_MIN, THUMB_SPREAD_MAX, 0, 1));
        extension = extension * 0.35 + splay * 0.65;
      }

      f.extension[i] = extension;
      // Hysteresis latches when a value drops below a threshold, so the signal
      // is inverted: (1 - extension) < 0.38 means extension > 0.62, i.e. straight.
      const isExtended = this.extensionLatches[i].update(1 - extension);
      f.extended[i] = isExtended;
      if (isExtended) extendedCount++;
      openness += extension;
    }

    f.extendedCount = extendedCount;
    f.palmOpenness = openness / FINGERS.length;

    /* --- pinch ---------------------------------------------------------- */
    f.pinchDistance = distance(thumbTip, indexTip) / handScale;
    // In a closed fist the thumb tip also sits near the index tip, so a pinch
    // only counts when the index finger is actually out of the palm.
    const pinchEligible = f.extension[1] > PINCH_MIN_INDEX_EXTENSION;
    f.pinching = this.pinchLatch.update(pinchEligible ? f.pinchDistance : 1);

    /* --- positions ------------------------------------------------------ */
    // Palm centre: average of wrist and the three stable knuckles.
    f.position.x = (wrist.x + indexMcp.x + middleMcp.x + pinkyMcp.x) * 0.25;
    f.position.y = (wrist.y + indexMcp.y + middleMcp.y + pinkyMcp.y) * 0.25;
    f.position.z = (wrist.z + indexMcp.z + middleMcp.z + pinkyMcp.z) * 0.25;

    f.indexTip.x = indexTip.x;
    f.indexTip.y = indexTip.y;
    f.indexTip.z = indexTip.z;

    f.pinchPoint.x = (thumbTip.x + indexTip.x) * 0.5;
    f.pinchPoint.y = (thumbTip.y + indexTip.y) * 0.5;
    f.pinchPoint.z = (thumbTip.z + indexTip.z) * 0.5;

    /* --- velocity -------------------------------------------------------- */
    if (this.previous && dt > 0) {
      const rawVx = (f.position.x - this.previous.x) / dt;
      const rawVy = (f.position.y - this.previous.y) / dt;
      f.velocity.x = this.velocityX.update(rawVx, dt);
      f.velocity.y = this.velocityY.update(rawVy, dt);
    } else {
      f.velocity.x = 0;
      f.velocity.y = 0;
    }
    f.speed = Math.hypot(f.velocity.x, f.velocity.y);
    this.previous = { x: f.position.x, y: f.position.y, time: now };

    /* --- palm orientation ------------------------------------------------ */
    subtract(indexMcp, wrist, this.vecA);
    subtract(pinkyMcp, wrist, this.vecB);
    normalise(this.vecA);
    normalise(this.vecB);
    this.vecC[0] = this.vecA[1] * this.vecB[2] - this.vecA[2] * this.vecB[1];
    this.vecC[1] = this.vecA[2] * this.vecB[0] - this.vecA[0] * this.vecB[2];
    this.vecC[2] = this.vecA[0] * this.vecB[1] - this.vecA[1] * this.vecB[0];
    normalise(this.vecC);
    f.palmNormal.x = this.vecC[0];
    f.palmNormal.y = this.vecC[1];
    f.palmNormal.z = this.vecC[2];
    f.palmRoll = Math.atan2(middleMcp.y - wrist.y, middleMcp.x - wrist.x);

    /* --- confidence ------------------------------------------------------ */
    // Penalise hands that are partly out of frame or very small in view.
    const inFrame =
      clamp01(mapRange(Math.min(f.position.x, 1 - f.position.x), 0.0, 0.08, 0, 1)) *
      clamp01(mapRange(Math.min(f.position.y, 1 - f.position.y), 0.0, 0.08, 0, 1));
    const sizeConfidence = clamp01(mapRange(handScale, 0.045, 0.11, 0, 1));
    f.confidence = this.confidenceFilter.update(score * inFrame * sizeConfidence, dt);

    /* --- classification --------------------------------------------------- */
    f.gesture = this.classify(f);
    return f;
  }

  private classify(f: HandFeatures): HandGesture {
    const indexOut = f.extended[1];
    const middleOut = f.extended[2];
    const ringOut = f.extended[3];
    const pinkyOut = f.extended[4];

    // The thumb is excluded from the count: its extension is the least reliable
    // signal on a hand, and every gesture below is separable without it.
    const fingersOut =
      (indexOut ? 1 : 0) + (middleOut ? 1 : 0) + (ringOut ? 1 : 0) + (pinkyOut ? 1 : 0);

    // A closed hand is checked first and requires *every* finger folded, so a
    // pointing or pinching hand can never be mistaken for a fist — and the
    // thumb-near-index geometry of a fist can never be mistaken for a pinch.
    if (fingersOut === 0 && f.palmOpenness < GESTURE.fistMaxOpenness) return 'FIST';

    // Pinch then wins outright: it is the primary manipulation gesture.
    if (f.pinching) return 'PINCH';

    if (fingersOut === 1 && indexOut) return 'POINT';

    if (fingersOut === 4 && (f.extended[0] || f.palmOpenness > GESTURE.openPalmMinOpenness)) {
      return 'OPEN_PALM';
    }

    // Finger-count command modes.
    if (fingersOut === 2 && indexOut && middleOut) return 'TWO_FINGER';
    if (fingersOut === 3 && indexOut && middleOut && ringOut) return 'THREE_FINGER';
    if (fingersOut === 4) return 'FOUR_FINGER';

    return 'NEUTRAL';
  }

  reset(): void {
    this.pinchLatch.reset();
    for (const latch of this.extensionLatches) latch.reset();
    this.confidenceFilter.reset();
    this.velocityX.reset();
    this.velocityY.reset();
    this.previous = null;
    this.features.gesture = 'NONE';
  }

  get current(): HandFeatures {
    return this.features;
  }
}
