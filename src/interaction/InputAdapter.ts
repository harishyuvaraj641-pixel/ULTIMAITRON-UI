import type { TrackedHand } from '../vision/HandTracker';
import { createEmptyInputHand, type InputHand } from './InputTypes';

/**
 * Converts tracked hands into the interaction layer's InputHand shape,
 * reusing the same two objects every frame so the animation loop allocates
 * nothing.
 */
export class InputAdapter {
  private readonly hands: [InputHand, InputHand] = [
    createEmptyInputHand(0),
    createEmptyInputHand(1),
  ];

  fromTracked(tracked: readonly TrackedHand[]): readonly InputHand[] {
    for (let slot = 0; slot < 2; slot++) {
      const hand = this.hands[slot];
      const source = tracked[slot];

      if (!source || !source.active) {
        hand.active = false;
        hand.confidence = 0;
        hand.gesture = 'NONE';
        hand.pinching = false;
        hand.landmarks = null;
        continue;
      }

      const features = source.features;
      hand.active = true;
      hand.label = source.label;
      hand.gesture = features.gesture;
      hand.confidence = features.confidence;
      hand.pinching = features.pinching;
      hand.pinchDistance = features.pinchDistance;
      hand.palm.x = features.position.x;
      hand.palm.y = features.position.y;
      hand.palm.z = features.position.z;
      hand.indexTip.x = features.indexTip.x;
      hand.indexTip.y = features.indexTip.y;
      hand.indexTip.z = features.indexTip.z;
      hand.pinchPoint.x = features.pinchPoint.x;
      hand.pinchPoint.y = features.pinchPoint.y;
      hand.pinchPoint.z = features.pinchPoint.z;
      hand.velocity.x = features.velocity.x;
      hand.velocity.y = features.velocity.y;
      hand.speed = features.speed;
      hand.handScale = features.handScale;
      hand.extendedCount = features.extendedCount;
      hand.landmarks = features.landmarks.length > 0 ? features.landmarks : null;
    }
    return this.hands;
  }

  /** Wraps the mouse fallback's single synthetic hand. */
  fromPointer(pointer: InputHand): readonly InputHand[] {
    const hand = this.hands[0];
    hand.active = pointer.active;
    hand.label = pointer.label;
    hand.gesture = pointer.gesture;
    hand.confidence = pointer.confidence;
    hand.pinching = pointer.pinching;
    hand.pinchDistance = pointer.pinchDistance;
    hand.palm.x = pointer.palm.x;
    hand.palm.y = pointer.palm.y;
    hand.palm.z = pointer.palm.z;
    hand.indexTip.x = pointer.indexTip.x;
    hand.indexTip.y = pointer.indexTip.y;
    hand.indexTip.z = pointer.indexTip.z;
    hand.pinchPoint.x = pointer.pinchPoint.x;
    hand.pinchPoint.y = pointer.pinchPoint.y;
    hand.pinchPoint.z = pointer.pinchPoint.z;
    hand.velocity.x = pointer.velocity.x;
    hand.velocity.y = pointer.velocity.y;
    hand.speed = pointer.speed;
    hand.handScale = pointer.handScale;
    hand.extendedCount = pointer.extendedCount;
    hand.landmarks = null;
    this.hands[1].active = false;
    this.hands[1].confidence = 0;
    this.hands[1].gesture = 'NONE';
    this.hands[1].pinching = false;
    this.hands[1].landmarks = null;
    return this.hands;
  }

  get current(): readonly InputHand[] {
    return this.hands;
  }
}
