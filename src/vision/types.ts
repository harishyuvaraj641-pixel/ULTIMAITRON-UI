/** Landmark indices, as documented for the MediaPipe Hand Landmarker. */
export const HAND_LANDMARK = {
  WRIST: 0,
  THUMB_CMC: 1,
  THUMB_MCP: 2,
  THUMB_IP: 3,
  THUMB_TIP: 4,
  INDEX_MCP: 5,
  INDEX_PIP: 6,
  INDEX_DIP: 7,
  INDEX_TIP: 8,
  MIDDLE_MCP: 9,
  MIDDLE_PIP: 10,
  MIDDLE_DIP: 11,
  MIDDLE_TIP: 12,
  RING_MCP: 13,
  RING_PIP: 14,
  RING_DIP: 15,
  RING_TIP: 16,
  PINKY_MCP: 17,
  PINKY_PIP: 18,
  PINKY_DIP: 19,
  PINKY_TIP: 20,
} as const;

export const LANDMARK_COUNT = 21;

export const LANDMARK_NAMES: readonly string[] = [
  'WRIST',
  'THUMB_CMC', 'THUMB_MCP', 'THUMB_IP', 'THUMB_TIP',
  'INDEX_MCP', 'INDEX_PIP', 'INDEX_DIP', 'INDEX_TIP',
  'MIDDLE_MCP', 'MIDDLE_PIP', 'MIDDLE_DIP', 'MIDDLE_TIP',
  'RING_MCP', 'RING_PIP', 'RING_DIP', 'RING_TIP',
  'PINKY_MCP', 'PINKY_PIP', 'PINKY_DIP', 'PINKY_TIP',
];

/** Bone pairs used to draw the debug skeleton. */
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [0, 9], [9, 10], [10, 11], [11, 12],
  [0, 13], [13, 14], [14, 15], [15, 16],
  [0, 17], [17, 18], [18, 19], [19, 20],
  [5, 9], [9, 13], [13, 17],
];

/** The four fingers plus the thumb, described by the joints used for tests. */
export const FINGERS = [
  { name: 'thumb', mcp: 2, pip: 3, tip: 4 },
  { name: 'index', mcp: 5, pip: 6, tip: 8 },
  { name: 'middle', mcp: 9, pip: 10, tip: 12 },
  { name: 'ring', mcp: 13, pip: 14, tip: 16 },
  { name: 'pinky', mcp: 17, pip: 18, tip: 20 },
] as const;

export interface Landmark {
  x: number;
  y: number;
  z: number;
  visibility?: number;
}

export type Handedness = 'Left' | 'Right' | 'Unknown';

export interface RawHand {
  /** Image-normalised landmarks, x/y in 0..1 and z relative to the wrist. */
  landmarks: Landmark[];
  /** Metric landmarks in metres, origin at the hand's geometric centre. */
  worldLandmarks: Landmark[];
  handedness: Handedness;
  score: number;
}

export interface DetectionResult {
  hands: RawHand[];
  timestamp: number;
  inferenceMs: number;
}

export type CameraState =
  | 'OFF'
  | 'INITIALIZING'
  | 'READY'
  | 'TRACKING'
  | 'NO_HAND'
  | 'TRACKING_LOST'
  | 'DENIED'
  | 'ERROR';

export const CAMERA_STATE_LABEL: Record<CameraState, string> = {
  OFF: 'CAMERA OFF',
  INITIALIZING: 'CAMERA INITIALIZING',
  READY: 'CAMERA READY',
  TRACKING: 'TRACKING',
  NO_HAND: 'NO HAND DETECTED',
  TRACKING_LOST: 'TRACKING LOST',
  DENIED: 'CAMERA ACCESS REQUIRED',
  ERROR: 'VISION SUBSYSTEM ERROR',
};

/** Messages exchanged with the vision worker. */
export type WorkerRequest =
  | { type: 'init'; wasmBasePath: string; modelAssetPath: string; numHands: number;
      minHandDetectionConfidence: number; minHandPresenceConfidence: number;
      minTrackingConfidence: number }
  | { type: 'frame'; bitmap: ImageBitmap; timestamp: number }
  | { type: 'close' };

export type WorkerResponse =
  | { type: 'ready'; delegate: 'GPU' | 'CPU' }
  | { type: 'result'; hands: RawHand[]; timestamp: number; inferenceMs: number }
  | { type: 'error'; message: string; fatal: boolean };
