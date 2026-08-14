/**
 * 3D simplex noise + a cheap curl approximation.
 * Used on the CPU to sculpt the orb's base particle distributions once at
 * start-up. Per-frame noise is evaluated on the GPU (see shaders/common.glsl).
 */

import { createRandom } from './MathUtils';

const GRAD3 = new Float32Array([
  1, 1, 0, -1, 1, 0, 1, -1, 0, -1, -1, 0, 1, 0, 1, -1, 0, 1, 1, 0, -1, -1, 0, -1, 0, 1, 1, 0, -1, 1,
  0, 1, -1, 0, -1, -1,
]);

const F3 = 1 / 3;
const G3 = 1 / 6;

export class SimplexNoise {
  private readonly perm = new Uint8Array(512);
  private readonly permMod12 = new Uint8Array(512);

  constructor(seed = 1337) {
    const random = createRandom(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      const tmp = p[i];
      p[i] = p[j];
      p[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = p[i & 255];
      this.permMod12[i] = this.perm[i] % 12;
    }
  }

  private static dot(gi: number, x: number, y: number, z: number): number {
    const i = gi * 3;
    return GRAD3[i] * x + GRAD3[i + 1] * y + GRAD3[i + 2] * z;
  }

  noise3(xin: number, yin: number, zin: number): number {
    const s = (xin + yin + zin) * F3;
    const i = Math.floor(xin + s);
    const j = Math.floor(yin + s);
    const k = Math.floor(zin + s);
    const t = (i + j + k) * G3;
    const x0 = xin - (i - t);
    const y0 = yin - (j - t);
    const z0 = zin - (k - t);

    let i1: number, j1: number, k1: number;
    let i2: number, j2: number, k2: number;

    if (x0 >= y0) {
      if (y0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      } else if (x0 >= z0) {
        i1 = 1; j1 = 0; k1 = 0; i2 = 1; j2 = 0; k2 = 1;
      } else {
        i1 = 0; j1 = 0; k1 = 1; i2 = 1; j2 = 0; k2 = 1;
      }
    } else {
      if (y0 < z0) {
        i1 = 0; j1 = 0; k1 = 1; i2 = 0; j2 = 1; k2 = 1;
      } else if (x0 < z0) {
        i1 = 0; j1 = 1; k1 = 0; i2 = 0; j2 = 1; k2 = 1;
      } else {
        i1 = 0; j1 = 1; k1 = 0; i2 = 1; j2 = 1; k2 = 0;
      }
    }

    const x1 = x0 - i1 + G3;
    const y1 = y0 - j1 + G3;
    const z1 = z0 - k1 + G3;
    const x2 = x0 - i2 + 2 * G3;
    const y2 = y0 - j2 + 2 * G3;
    const z2 = z0 - k2 + 2 * G3;
    const x3 = x0 - 1 + 3 * G3;
    const y3 = y0 - 1 + 3 * G3;
    const z3 = z0 - 1 + 3 * G3;

    const ii = i & 255;
    const jj = j & 255;
    const kk = k & 255;

    let n0 = 0, n1 = 0, n2 = 0, n3 = 0;

    let t0 = 0.6 - x0 * x0 - y0 * y0 - z0 * z0;
    if (t0 > 0) {
      t0 *= t0;
      n0 = t0 * t0 * SimplexNoise.dot(this.permMod12[ii + this.perm[jj + this.perm[kk]]], x0, y0, z0);
    }
    let t1 = 0.6 - x1 * x1 - y1 * y1 - z1 * z1;
    if (t1 > 0) {
      t1 *= t1;
      n1 =
        t1 * t1 *
        SimplexNoise.dot(
          this.permMod12[ii + i1 + this.perm[jj + j1 + this.perm[kk + k1]]],
          x1, y1, z1,
        );
    }
    let t2 = 0.6 - x2 * x2 - y2 * y2 - z2 * z2;
    if (t2 > 0) {
      t2 *= t2;
      n2 =
        t2 * t2 *
        SimplexNoise.dot(
          this.permMod12[ii + i2 + this.perm[jj + j2 + this.perm[kk + k2]]],
          x2, y2, z2,
        );
    }
    let t3 = 0.6 - x3 * x3 - y3 * y3 - z3 * z3;
    if (t3 > 0) {
      t3 *= t3;
      n3 =
        t3 * t3 *
        SimplexNoise.dot(
          this.permMod12[ii + 1 + this.perm[jj + 1 + this.perm[kk + 1]]],
          x3, y3, z3,
        );
    }
    return 32 * (n0 + n1 + n2 + n3);
  }

  /** Fractal brownian motion built from `octaves` layers of simplex noise. */
  fbm(x: number, y: number, z: number, octaves = 4, lacunarity = 2.05, gain = 0.5): number {
    let amplitude = 0.5;
    let frequency = 1;
    let sum = 0;
    for (let i = 0; i < octaves; i++) {
      sum += amplitude * this.noise3(x * frequency, y * frequency, z * frequency);
      frequency *= lacunarity;
      amplitude *= gain;
    }
    return sum;
  }

  /**
   * Divergence-free curl of the noise field, written into `out`.
   * Produces the swirling, fluid-like offsets used by the energy mode.
   */
  curl(x: number, y: number, z: number, eps: number, out: Float32Array): void {
    const n1 = this.noise3(x, y + eps, z);
    const n2 = this.noise3(x, y - eps, z);
    const n3 = this.noise3(x, y, z + eps);
    const n4 = this.noise3(x, y, z - eps);
    const n5 = this.noise3(x + eps, y, z);
    const n6 = this.noise3(x - eps, y, z);

    const inv = 1 / (2 * eps);
    out[0] = (n1 - n2 - (n3 - n4)) * inv;
    out[1] = (n3 - n4 - (n5 - n6)) * inv;
    out[2] = (n5 - n6 - (n1 - n2)) * inv;
  }
}
