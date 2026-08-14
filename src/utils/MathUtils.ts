/** Small, allocation-free maths helpers used across the application. */

export const TAU = Math.PI * 2;

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

export function clamp01(value: number): number {
  return clamp(value, 0, 1);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function inverseLerp(a: number, b: number, v: number): number {
  return a === b ? 0 : (v - a) / (b - a);
}

export function mapRange(
  value: number,
  inMin: number,
  inMax: number,
  outMin: number,
  outMax: number,
): number {
  return lerp(outMin, outMax, clamp01(inverseLerp(inMin, inMax, value)));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01(inverseLerp(edge0, edge1, x));
  return t * t * (3 - 2 * t);
}

/**
 * Frame-rate independent exponential smoothing.
 * `lambda` is the rate of approach: higher converges faster.
 */
export function damp(current: number, target: number, lambda: number, dt: number): number {
  return lerp(current, target, 1 - Math.exp(-lambda * dt));
}

/** Deterministic hash -> [0, 1). Used so particle layouts are reproducible. */
export function hash1(n: number): number {
  const s = Math.sin(n * 127.1) * 43758.5453123;
  return s - Math.floor(s);
}

/** Small deterministic PRNG (mulberry32) for reproducible orb generation. */
export function createRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Applies a symmetric dead zone around zero. */
export function deadZone(value: number, threshold: number): number {
  if (Math.abs(value) < threshold) return 0;
  return value - Math.sign(value) * threshold;
}

/**
 * A one-dimensional value that only flips state once it crosses the far
 * threshold, preventing chatter around a single boundary.
 */
export class Hysteresis {
  private state = false;

  constructor(
    private readonly enterBelow: number,
    private readonly exitAbove: number,
  ) {}

  update(value: number): boolean {
    if (this.state) {
      if (value > this.exitAbove) this.state = false;
    } else if (value < this.enterBelow) {
      this.state = true;
    }
    return this.state;
  }

  get value(): boolean {
    return this.state;
  }

  reset(): void {
    this.state = false;
  }
}

/** Exponential moving average with frame-rate independent smoothing. */
export class Ema {
  private initialised = false;
  private current = 0;

  constructor(private readonly lambda: number) {}

  update(value: number, dt: number): number {
    if (!this.initialised) {
      this.current = value;
      this.initialised = true;
      return this.current;
    }
    this.current = damp(this.current, value, this.lambda, dt);
    return this.current;
  }

  get value(): number {
    return this.current;
  }

  reset(value = 0): void {
    this.current = value;
    this.initialised = false;
  }
}

/**
 * One Euro filter — low latency, low jitter smoothing for noisy signals.
 * See Casiez et al., "1€ Filter" (CHI 2012).
 */
export class OneEuroFilter {
  private firstTime = true;
  private xPrev = 0;
  private dxPrev = 0;

  constructor(
    private readonly minCutoff = 1.0,
    private readonly beta = 0.0,
    private readonly dCutoff = 1.0,
  ) {}

  private static alpha(cutoff: number, dt: number): number {
    const tau = 1 / (TAU * cutoff);
    return 1 / (1 + tau / dt);
  }

  filter(x: number, dt: number): number {
    if (dt <= 0) return this.firstTime ? x : this.xPrev;

    if (this.firstTime) {
      this.firstTime = false;
      this.xPrev = x;
      this.dxPrev = 0;
      return x;
    }

    const dx = (x - this.xPrev) / dt;
    const aD = OneEuroFilter.alpha(this.dCutoff, dt);
    const dxHat = aD * dx + (1 - aD) * this.dxPrev;

    const cutoff = this.minCutoff + this.beta * Math.abs(dxHat);
    const a = OneEuroFilter.alpha(cutoff, dt);
    const xHat = a * x + (1 - a) * this.xPrev;

    this.xPrev = xHat;
    this.dxPrev = dxHat;
    return xHat;
  }

  reset(): void {
    this.firstTime = true;
    this.xPrev = 0;
    this.dxPrev = 0;
  }
}

/** Requires a boolean condition to hold for a duration before it is accepted. */
export class Debouncer<T> {
  private candidate: T;
  private accepted: T;
  private elapsed = 0;

  constructor(
    initial: T,
    private readonly holdSeconds: number,
  ) {
    this.candidate = initial;
    this.accepted = initial;
  }

  update(value: T, dt: number): T {
    if (value === this.candidate) {
      this.elapsed += dt;
      if (this.elapsed >= this.holdSeconds) this.accepted = this.candidate;
    } else {
      this.candidate = value;
      this.elapsed = 0;
    }
    return this.accepted;
  }

  get value(): T {
    return this.accepted;
  }

  force(value: T): void {
    this.candidate = value;
    this.accepted = value;
    this.elapsed = this.holdSeconds;
  }
}
