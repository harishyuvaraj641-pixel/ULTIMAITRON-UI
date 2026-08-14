import { GESTURE } from '../config';
import { Debouncer } from '../utils/MathUtils';
import { EventBus } from '../utils/EventBus';
import type { InputHand } from './InputTypes';

export type SystemGesture =
  | 'IDLE'
  | 'HAND_DETECTED'
  | 'POINTING'
  | 'PINCHING'
  | 'OPEN_PALM'
  | 'FIST'
  | 'TWO_HAND'
  | 'SWIPE';

export const SYSTEM_GESTURE_LABEL: Record<SystemGesture, string> = {
  IDLE: 'STANDBY',
  HAND_DETECTED: 'HAND DETECTED',
  POINTING: 'TARGET ACQUIRED',
  PINCHING: 'PINCH DETECTED',
  OPEN_PALM: 'SYSTEM ACTIVE',
  FIST: 'POWER SURGE',
  TWO_HAND: 'DUAL CONTROL',
  SWIPE: 'MODE SHIFT',
};

interface StateEvents extends Record<string, unknown> {
  change: { from: SystemGesture; to: SystemGesture };
  pinchStart: { slot: number };
  pinchEnd: { slot: number };
  fistStart: { slot: number };
  fistRelease: { slot: number };
  swipe: { direction: -1 | 1; slot: number };
}

interface SwipeTracker {
  startX: number;
  startTime: number;
  tracking: boolean;
  cooldown: number;
  /** Palm x from the previous sample, used as the true start of a swipe. */
  lastX: number;
  hasLast: boolean;
}

/**
 * Turns per-frame hand classifications into a stable system state.
 *
 * A gesture has to hold for GESTURE.debounceSeconds before it is accepted,
 * which is what stops the interface twitching between states while a hand is
 * mid-transition. Transitions emit explicit start/release events so effects can
 * react to the *moment* rather than polling.
 */
export class GestureStateMachine {
  readonly events = new EventBus<StateEvents>();

  private readonly debouncer = new Debouncer<SystemGesture>('IDLE', GESTURE.debounceSeconds);
  private accepted: SystemGesture = 'IDLE';
  private pinchLatched = [false, false];
  private fistLatched = [false, false];
  private readonly swipes: SwipeTracker[] = [
    { startX: 0, startTime: 0, tracking: false, cooldown: 0, lastX: 0, hasLast: false },
    { startX: 0, startTime: 0, tracking: false, cooldown: 0, lastX: 0, hasLast: false },
  ];
  private elapsed = 0;
  private primarySlot = 0;

  get state(): SystemGesture {
    return this.accepted;
  }

  get primary(): number {
    return this.primarySlot;
  }

  update(hands: readonly InputHand[], dt: number): SystemGesture {
    this.elapsed += dt;

    const active = hands.filter(
      (hand) => hand.active && hand.confidence >= GESTURE.confidenceThreshold,
    );

    // The most confident hand drives single-hand gestures.
    let primary: InputHand | null = null;
    for (const hand of active) {
      if (!primary || hand.confidence > primary.confidence) primary = hand;
    }
    this.primarySlot = primary ? primary.slot : 0;

    const candidate = this.classify(active, primary);
    const previous = this.accepted;
    this.accepted = this.debouncer.update(candidate, dt);

    if (this.accepted !== previous) {
      this.events.emit('change', { from: previous, to: this.accepted });
    }

    this.trackDiscreteEvents(hands, dt);
    return this.accepted;
  }

  private classify(active: InputHand[], primary: InputHand | null): SystemGesture {
    if (active.length === 0) return 'IDLE';
    if (active.length >= 2) return 'TWO_HAND';
    if (!primary) return 'HAND_DETECTED';

    switch (primary.gesture) {
      case 'PINCH':
        return 'PINCHING';
      case 'FIST':
        return 'FIST';
      case 'POINT':
        return 'POINTING';
      case 'OPEN_PALM':
        return 'OPEN_PALM';
      default:
        return 'HAND_DETECTED';
    }
  }

  /**
   * Pinch, fist and swipe are edge-triggered and must not wait for the state
   * debounce, so they are latched directly off the per-hand features.
   */
  private trackDiscreteEvents(hands: readonly InputHand[], dt: number): void {
    for (const hand of hands) {
      const slot = hand.slot;
      const swipe = this.swipes[slot];
      swipe.cooldown = Math.max(0, swipe.cooldown - dt);

      if (!hand.active || hand.confidence < GESTURE.confidenceThreshold) {
        if (this.pinchLatched[slot]) {
          this.pinchLatched[slot] = false;
          this.events.emit('pinchEnd', { slot });
        }
        if (this.fistLatched[slot]) {
          this.fistLatched[slot] = false;
          this.events.emit('fistRelease', { slot });
        }
        swipe.tracking = false;
        swipe.hasLast = false;
        continue;
      }

      const features = hand;

      if (features.pinching && !this.pinchLatched[slot]) {
        this.pinchLatched[slot] = true;
        this.events.emit('pinchStart', { slot });
      } else if (!features.pinching && this.pinchLatched[slot]) {
        this.pinchLatched[slot] = false;
        this.events.emit('pinchEnd', { slot });
      }

      const isFist = features.gesture === 'FIST';
      if (isFist && !this.fistLatched[slot]) {
        this.fistLatched[slot] = true;
        this.events.emit('fistStart', { slot });
      } else if (!isFist && this.fistLatched[slot]) {
        this.fistLatched[slot] = false;
        this.events.emit('fistRelease', { slot });
      }

      /* --- swipe ------------------------------------------------------- */
      // Only an open-ish hand swipes; a pinching or pointing hand is busy.
      const eligible = features.extendedCount >= 3 && !features.pinching;
      const speed = Math.abs(features.velocity.x);

      if (!eligible) {
        swipe.tracking = false;
        swipe.lastX = features.palm.x;
        swipe.hasLast = true;
        continue;
      }

      if (!swipe.tracking && speed > GESTURE.swipeMinVelocity) {
        swipe.tracking = true;
        // Velocity is only measurable once the hand has already moved, so the
        // swipe is anchored to where the hand was on the previous sample.
        swipe.startX = swipe.hasLast ? swipe.lastX : features.palm.x;
        swipe.startTime = this.elapsed;
      } else if (swipe.tracking) {
        const travel = features.palm.x - swipe.startX;
        const duration = this.elapsed - swipe.startTime;

        if (duration > GESTURE.swipeMaxDuration || speed < GESTURE.swipeMinVelocity * 0.35) {
          swipe.tracking = false;
        } else if (Math.abs(travel) >= GESTURE.swipeMinDistance && swipe.cooldown <= 0) {
          // Image x grows to the right; the mirrored view flips the meaning,
          // which HandInteraction accounts for when it applies the direction.
          const direction: -1 | 1 = travel > 0 ? 1 : -1;
          swipe.tracking = false;
          swipe.cooldown = GESTURE.swipeCooldown;
          this.events.emit('swipe', { direction, slot });
        }
      }

      swipe.lastX = features.palm.x;
      swipe.hasLast = true;
    }
  }

  reset(): void {
    this.debouncer.force('IDLE');
    this.accepted = 'IDLE';
    this.pinchLatched = [false, false];
    this.fistLatched = [false, false];
    for (const swipe of this.swipes) {
      swipe.tracking = false;
      swipe.cooldown = 0;
      swipe.hasLast = false;
    }
  }
}
