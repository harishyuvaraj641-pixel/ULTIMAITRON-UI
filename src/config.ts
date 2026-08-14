/**
 * Central configuration for the Ultimaitron AI neural core.
 * Every tunable number in the application lives here so that behaviour can be
 * adjusted without hunting through implementation files.
 */

export const IDENTITY = {
  name: 'Ultimaitron AI',
  subtitle: 'NEURAL INTELLIGENCE CORE',
  build: 'v1.0.0 / NX-7',
} as const;

/** Palette. Kept as hex numbers for three.js and as CSS strings for the HUD. */
export const PALETTE = {
  cyan: 0x2ff3ff,
  cyanDim: 0x0d7f92,
  iceBlue: 0x8fd8ff,
  white: 0xeaffff,
  amber: 0xffb340,
  gold: 0xffd070,
  goldDeep: 0xff8a1e,
  red: 0xff4d4d,
  background: 0x000205,
} as const;

export const CSS_PALETTE = {
  cyan: '#2ff3ff',
  cyanDim: 'rgba(47, 243, 255, 0.35)',
  amber: '#ffb340',
  red: '#ff4d4d',
} as const;

/* ------------------------------------------------------------------ */
/* Quality tiers                                                       */
/* ------------------------------------------------------------------ */

export type QualityTier = 'HIGH' | 'MEDIUM' | 'LOW';

export interface QualitySettings {
  particles: number;
  connections: number;
  motes: number;
  bloomStrength: number;
  bloomRadius: number;
  pixelRatioCap: number;
  grain: boolean;
  chromaticAberration: boolean;
}

export const QUALITY: Record<QualityTier, QualitySettings> = {
  HIGH: {
    particles: 20000,
    connections: 8000,
    motes: 1400,
    bloomStrength: 0.62,
    bloomRadius: 0.42,
    pixelRatioCap: 2,
    grain: true,
    chromaticAberration: true,
  },
  MEDIUM: {
    particles: 10000,
    connections: 4000,
    motes: 800,
    bloomStrength: 0.58,
    bloomRadius: 0.4,
    pixelRatioCap: 1.5,
    grain: true,
    chromaticAberration: true,
  },
  LOW: {
    particles: 5000,
    connections: 2000,
    motes: 400,
    bloomStrength: 0.5,
    bloomRadius: 0.38,
    pixelRatioCap: 1,
    grain: false,
    chromaticAberration: false,
  },
};

export const QUALITY_ORDER: QualityTier[] = ['LOW', 'MEDIUM', 'HIGH'];

/** Adaptive quality thresholds (with hysteresis so quality never oscillates). */
export const PERFORMANCE = {
  sampleWindow: 90,
  downgradeBelowFps: 45,
  upgradeAboveFps: 58,
  /** Seconds a tier must be stable before another change is allowed. */
  cooldownSeconds: 6,
  /** Seconds of good FPS required before an upgrade is considered. */
  upgradeDwellSeconds: 10,
} as const;

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

export const SCENE = {
  fov: 42,
  near: 0.1,
  far: 200,
  cameraDistance: 6.6,
  /** How far the camera may drift in response to hand / pointer movement. */
  parallax: 0.55,
  parallaxDamping: 1.6,
  ambientIntensity: 0.14,
  coreLightIntensity: 3.0,
  rimLightIntensity: 1.1,
} as const;

/* ------------------------------------------------------------------ */
/* Orb                                                                 */
/* ------------------------------------------------------------------ */

export const ORB = {
  /** Nominal radius of the neural cloud in world units. */
  radius: 1.55,
  innerRadius: 0.55,
  /** Radius used when searching for neural neighbours (normalised space). */
  connectionRadius: 0.115,
  maxNeighboursPerNode: 3,
  /** Number of dense "nuclei" the neural distribution clusters around. */
  clusterCount: 26,
  noiseAmplitude: 0.055,
  breathSpeed: 0.55,
  idleSpin: 0.055,
  /** Interaction field radii, in normalised orb space. */
  handInfluenceRadius: 0.85,
  handAttraction: 0.22,
  handRepulsionRadius: 0.16,
  handRepulsion: 0.1,
  /** Scale limits driven by the two-hand gesture. */
  minScale: 0.62,
  maxScale: 1.85,
  scaleDamping: 3.2,
  /** Rotation response to pinch-drag. */
  pinchRotationGain: 3.1,
  rotationDamping: 4.5,
  rotationFriction: 0.94,
  /** Contract / burst envelope (fist gesture). */
  contractDamping: 5.0,
  burstDuration: 1.6,
  burstDistance: 2.4,
  /** How long a mode cross-fade takes, in seconds. */
  modeBlendSeconds: 1.1,
  formationSeconds: 3.2,
} as const;

export const PULSES = {
  /** Number of simultaneous energy wavefronts supported by the shaders. */
  slots: 4,
  speed: 1.15,
  width: 0.13,
  decay: 0.75,
  /** Seconds between spontaneous idle pulses (randomised +/- 50%). */
  idleInterval: 3.4,
} as const;

export const RINGS = {
  scanSpeedIdle: 0.35,
  scanSpeedActive: 1.35,
} as const;

/* ------------------------------------------------------------------ */
/* Vision                                                              */
/* ------------------------------------------------------------------ */

export const VISION = {
  /** MediaPipe assets. Both are fetched once and cached by the browser. */
  wasmBasePath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  modelAssetPath:
    'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task',
  numHands: 2,
  minHandDetectionConfidence: 0.55,
  minHandPresenceConfidence: 0.55,
  minTrackingConfidence: 0.55,
  /** Target inference rate. Rendering always runs at display refresh rate. */
  targetInferenceFps: 30,
  video: {
    width: 640,
    height: 480,
    frameRate: 30,
  },
  /** Frames of no detection before the tracker reports the hand as lost. */
  lostFrames: 8,
} as const;

/** One Euro filter parameters for landmark smoothing. */
export const SMOOTHING = {
  minCutoff: 1.1,
  beta: 0.012,
  derivativeCutoff: 1.0,
  /** Extra exponential smoothing applied to derived world positions. */
  positionSmoothing: 14.0,
  velocitySmoothing: 8.0,
} as const;

/* ------------------------------------------------------------------ */
/* Hand -> world mapping                                               */
/* ------------------------------------------------------------------ */

export const MAPPING = {
  WORLD_WIDTH: 7.6,
  WORLD_HEIGHT: 4.6,
  DEPTH_SCALE: 6.5,
  DEPTH_OFFSET: 0.35,
  SMOOTHING_FACTOR: 12.0,
  /** Mirror the X axis so the interface behaves like a mirror. */
  mirrorX: true,
} as const;

/* ------------------------------------------------------------------ */
/* Gestures                                                            */
/* ------------------------------------------------------------------ */

export const GESTURE = {
  /**
   * Pinch distance is |thumbTip - indexTip| divided by the hand's own scale, so
   * the threshold holds whether the hand is near the lens or far from it.
   * Hysteresis: latch below `pinchEnter`, release above `pinchExit`.
   */
  pinchEnter: 0.34,
  pinchExit: 0.46,
  /** A finger counts as extended above this normalised extension value. */
  fingerExtendEnter: 0.62,
  fingerExtendExit: 0.48,
  /** A fist requires every finger folded and the palm this closed. */
  fistMaxOpenness: 0.42,
  /** An open palm needs either the thumb out or this much overall openness. */
  openPalmMinOpenness: 0.72,
  /** Seconds a candidate gesture must persist before it is accepted. */
  debounceSeconds: 0.12,
  /** Minimum detection confidence for a hand to drive interaction. */
  confidenceThreshold: 0.4,
  /** Swipe detection. */
  swipeMinVelocity: 1.45,
  swipeMinDistance: 0.22,
  swipeMaxDuration: 0.45,
  swipeCooldown: 0.8,
  /** Two-hand scaling. */
  twoHandMinSeparation: 0.18,
  twoHandMaxSeparation: 1.25,
  /** Dead zone applied to hand motion before it drives the orb. */
  motionDeadZone: 0.0035,
} as const;

/* ------------------------------------------------------------------ */
/* HUD                                                                 */
/* ------------------------------------------------------------------ */

export const HUD = {
  /** Seconds the gesture legend stays visible before fading out. */
  legendVisibleSeconds: 22,
  toastSeconds: 1.6,
  /** Smoothing applied to the animated HUD readouts. */
  readoutDamping: 3.0,
} as const;

export const AUDIO = {
  masterGain: 0.16,
  enabledByDefault: true,
} as const;

export const STORAGE_KEYS = {
  reducedMotion: 'ultimaitron.reducedMotion',
  highContrast: 'ultimaitron.highContrast',
  audio: 'ultimaitron.audio',
} as const;
