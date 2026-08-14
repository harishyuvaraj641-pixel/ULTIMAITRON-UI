import type { HandGesture } from '../vision/GestureEngine';
import type { Handedness, Landmark } from '../vision/types';

/**
 * The single hand description the interaction layer consumes.
 * Both the real vision pipeline and the mouse fallback produce this shape, so
 * everything downstream is identical whether or not a camera is present.
 */
export interface InputHand {
  slot: 0 | 1;
  active: boolean;
  label: Handedness;
  gesture: HandGesture;
  confidence: number;
  pinching: boolean;
  pinchDistance: number;
  /** Normalised image coordinates: x,y in 0..1 with y increasing downwards. */
  palm: { x: number; y: number; z: number };
  indexTip: { x: number; y: number; z: number };
  pinchPoint: { x: number; y: number; z: number };
  velocity: { x: number; y: number };
  speed: number;
  handScale: number;
  extendedCount: number;
  /** Present only for real tracked hands; used by the debug overlay. */
  landmarks: Landmark[] | null;
}

export function createEmptyInputHand(slot: 0 | 1): InputHand {
  return {
    slot,
    active: false,
    label: 'Unknown',
    gesture: 'NONE',
    confidence: 0,
    pinching: false,
    pinchDistance: 1,
    palm: { x: 0.5, y: 0.5, z: 0 },
    indexTip: { x: 0.5, y: 0.5, z: 0 },
    pinchPoint: { x: 0.5, y: 0.5, z: 0 },
    velocity: { x: 0, y: 0 },
    speed: 0,
    handScale: 0.16,
    extendedCount: 0,
    landmarks: null,
  };
}
