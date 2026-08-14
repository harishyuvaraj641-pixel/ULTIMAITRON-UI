import { Ema } from '../utils/MathUtils';
import { createEmptyInputHand, type InputHand } from './InputTypes';

/**
 * Pointer-driven stand-in for a tracked hand.
 *
 * Used whenever the camera is unavailable or switched off, and during
 * development so the whole interaction stack can be exercised without granting
 * camera permission. Move = hand, press = pinch, drag = rotate, wheel = zoom.
 */
export class MouseFallback {
  private readonly hand: InputHand = createEmptyInputHand(0);
  private readonly velocityX = new Ema(9);
  private readonly velocityY = new Ema(9);
  private previous: { x: number; y: number } | null = null;
  private zoomDelta = 0;
  private enabled = false;
  private pointerInside = false;
  private detach: Array<() => void> = [];

  constructor(private readonly element: HTMLElement) {}

  attach(): void {
    const onPointerMove = (event: PointerEvent): void => {
      this.pointerInside = true;
      const rect = this.element.getBoundingClientRect();
      this.hand.palm.x = (event.clientX - rect.left) / Math.max(1, rect.width);
      this.hand.palm.y = (event.clientY - rect.top) / Math.max(1, rect.height);
      this.hand.palm.z = 0;
    };

    const onPointerDown = (event: PointerEvent): void => {
      if (event.button !== 0) return;
      this.hand.pinching = true;
    };

    const onPointerUp = (): void => {
      this.hand.pinching = false;
    };

    const onPointerLeave = (): void => {
      this.pointerInside = false;
      this.hand.pinching = false;
    };

    const onWheel = (event: WheelEvent): void => {
      event.preventDefault();
      this.zoomDelta += -event.deltaY * 0.0012;
    };

    const onTouchMove = (event: TouchEvent): void => {
      const touch = event.touches[0];
      if (!touch) return;
      const rect = this.element.getBoundingClientRect();
      this.pointerInside = true;
      this.hand.pinching = event.touches.length >= 1;
      this.hand.palm.x = (touch.clientX - rect.left) / Math.max(1, rect.width);
      this.hand.palm.y = (touch.clientY - rect.top) / Math.max(1, rect.height);
    };

    const onTouchEnd = (): void => {
      this.hand.pinching = false;
    };

    this.element.addEventListener('pointermove', onPointerMove);
    this.element.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    this.element.addEventListener('pointerleave', onPointerLeave);
    this.element.addEventListener('wheel', onWheel, { passive: false });
    this.element.addEventListener('touchmove', onTouchMove, { passive: true });
    this.element.addEventListener('touchend', onTouchEnd);

    this.detach = [
      () => this.element.removeEventListener('pointermove', onPointerMove),
      () => this.element.removeEventListener('pointerdown', onPointerDown),
      () => window.removeEventListener('pointerup', onPointerUp),
      () => this.element.removeEventListener('pointerleave', onPointerLeave),
      () => this.element.removeEventListener('wheel', onWheel),
      () => this.element.removeEventListener('touchmove', onTouchMove),
      () => this.element.removeEventListener('touchend', onTouchEnd),
    ];
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.hand.active = false;
      this.hand.pinching = false;
      this.previous = null;
    }
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  /** Zoom accumulated since the last call. */
  consumeZoom(): number {
    const delta = this.zoomDelta;
    this.zoomDelta = 0;
    return delta;
  }

  update(dt: number): InputHand {
    const hand = this.hand;
    hand.active = this.enabled && this.pointerInside;
    hand.confidence = hand.active ? 1 : 0;
    hand.label = 'Right';
    hand.handScale = 0.16;

    if (this.previous && dt > 0) {
      hand.velocity.x = this.velocityX.update((hand.palm.x - this.previous.x) / dt, dt);
      hand.velocity.y = this.velocityY.update((hand.palm.y - this.previous.y) / dt, dt);
    } else {
      hand.velocity.x = 0;
      hand.velocity.y = 0;
    }
    hand.speed = Math.hypot(hand.velocity.x, hand.velocity.y);
    this.previous = { x: hand.palm.x, y: hand.palm.y };

    hand.indexTip.x = hand.palm.x;
    hand.indexTip.y = hand.palm.y;
    hand.indexTip.z = hand.palm.z;
    hand.pinchPoint.x = hand.palm.x;
    hand.pinchPoint.y = hand.palm.y;
    hand.pinchPoint.z = hand.palm.z;

    hand.pinchDistance = hand.pinching ? 0.15 : 0.8;
    hand.extendedCount = hand.pinching ? 2 : 5;
    hand.gesture = !hand.active ? 'NONE' : hand.pinching ? 'PINCH' : 'POINT';

    return hand;
  }

  dispose(): void {
    for (const off of this.detach) off();
    this.detach = [];
  }
}
