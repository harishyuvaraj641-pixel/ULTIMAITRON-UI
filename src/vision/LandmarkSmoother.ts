import { SMOOTHING } from '../config';
import { OneEuroFilter } from '../utils/MathUtils';
import { LANDMARK_COUNT, type Landmark } from './types';

/**
 * Raw MediaPipe landmarks jitter by several pixels even on a perfectly still
 * hand. A One Euro filter per axis removes that shimmer without adding the lag
 * a plain low-pass filter would.
 *
 * Output arrays are reused, so a smoothing pass allocates nothing.
 */
export class LandmarkSmoother {
  private readonly filters: OneEuroFilter[] = [];
  private readonly output: Landmark[] = [];

  constructor(
    minCutoff = SMOOTHING.minCutoff,
    beta = SMOOTHING.beta,
    dCutoff = SMOOTHING.derivativeCutoff,
  ) {
    for (let i = 0; i < LANDMARK_COUNT * 3; i++) {
      this.filters.push(new OneEuroFilter(minCutoff, beta, dCutoff));
    }
    for (let i = 0; i < LANDMARK_COUNT; i++) {
      this.output.push({ x: 0, y: 0, z: 0 });
    }
  }

  filter(landmarks: Landmark[], dt: number): Landmark[] {
    const count = Math.min(landmarks.length, LANDMARK_COUNT);
    for (let i = 0; i < count; i++) {
      const source = landmarks[i];
      const target = this.output[i];
      target.x = this.filters[i * 3].filter(source.x, dt);
      target.y = this.filters[i * 3 + 1].filter(source.y, dt);
      target.z = this.filters[i * 3 + 2].filter(source.z, dt);
    }
    return this.output;
  }

  reset(): void {
    for (const filter of this.filters) filter.reset();
  }
}
