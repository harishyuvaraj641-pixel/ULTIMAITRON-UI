import { ORB } from '../config';
import { createRandom, clamp, lerp, TAU } from '../utils/MathUtils';
import { SimplexNoise } from '../utils/Noise';

/** The five procedural configurations the orb can morph between. */
export const ORB_MODES = ['NEURAL', 'REACTOR', 'DATA', 'ENERGY', 'SCANNER'] as const;
export type OrbMode = (typeof ORB_MODES)[number];

export const ORB_MODE_LABEL: Record<OrbMode, string> = {
  NEURAL: 'NEURAL NETWORK',
  REACTOR: 'REACTOR CORE',
  DATA: 'DATA SPHERE',
  ENERGY: 'ENERGY FIELD',
  SCANNER: 'SCANNER ARRAY',
};

/** Per-mode presentation tuning applied by NeuralOrb. */
export const ORB_MODE_PROFILE: Record<
  OrbMode,
  { lineOpacity: number; noiseAmp: number; warm: number; spin: number; particleBoost: number }
> = {
  // Away from NEURAL the connection graph stretches, so line opacity drops:
  // the structure of each configuration has to stay readable through it.
  NEURAL: { lineOpacity: 1.0, noiseAmp: 1.0, warm: 0.0, spin: 1.0, particleBoost: 1.0 },
  REACTOR: { lineOpacity: 0.2, noiseAmp: 0.3, warm: 0.0, spin: 1.45, particleBoost: 1.3 },
  DATA: { lineOpacity: 0.14, noiseAmp: 0.25, warm: 0.0, spin: 0.75, particleBoost: 1.0 },
  ENERGY: { lineOpacity: 0.24, noiseAmp: 1.25, warm: 1.0, spin: 1.2, particleBoost: 1.25 },
  SCANNER: { lineOpacity: 0.22, noiseAmp: 0.45, warm: 0.0, spin: 0.9, particleBoost: 0.95 },
};

export interface OrbGeometryData {
  count: number;
  /** Base positions per mode, each `count * 3` long, in normalised orb space. */
  neural: Float32Array;
  reactor: Float32Array;
  data: Float32Array;
  energy: Float32Array;
  scanner: Float32Array;
  sizes: Float32Array;
  layers: Float32Array;
  seeds: Float32Array;
}

interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

function unitVector(random: () => number, out: Vec3Like): void {
  // Uniform point on the unit sphere (Marsaglia).
  const u = random() * 2 - 1;
  const theta = random() * TAU;
  const s = Math.sqrt(Math.max(0, 1 - u * u));
  out.x = s * Math.cos(theta);
  out.y = s * Math.sin(theta);
  out.z = u;
}

/**
 * Builds every base configuration for the orb in one pass.
 * Deterministic: the same seed always produces the same brain.
 */
export function buildOrbGeometry(count: number, seed = 20260813): OrbGeometryData {
  const random = createRandom(seed);
  const noise = new SimplexNoise(seed);

  const neural = new Float32Array(count * 3);
  const reactor = new Float32Array(count * 3);
  const data = new Float32Array(count * 3);
  const energy = new Float32Array(count * 3);
  const scanner = new Float32Array(count * 3);
  const sizes = new Float32Array(count);
  const layers = new Float32Array(count);
  const seeds = new Float32Array(count);

  // --- neural clustering nuclei -------------------------------------------
  const clusters: number[] = [];
  const dir: Vec3Like = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < ORB.clusterCount; i++) {
    unitVector(random, dir);
    const r = 0.42 + random() * 0.5;
    clusters.push(dir.x * r, dir.y * r, dir.z * r);
  }

  // --- reactor lattice parameters -----------------------------------------
  const shellRadii = [0.42, 0.56, 0.68, 0.79, 0.9, 1.0, 1.08];
  const shellTilt = shellRadii.map((_, i) => (i % 2 === 0 ? 1 : -1) * (0.1 + i * 0.14));

  const curl = new Float32Array(3);

  for (let i = 0; i < count; i++) {
    const t = i / count;
    seeds[i] = random();

    /* ---------------- NEURAL: organic, clustered, brain-like ------------- */
    unitVector(random, dir);
    let radius = lerp(ORB.innerRadius, 1.0, Math.pow(random(), 0.55));
    let nx = dir.x * radius;
    let ny = dir.y * radius;
    let nz = dir.z * radius;

    // Pull a portion of the nodes towards a nucleus so density varies.
    const clusterIndex = (random() * ORB.clusterCount) | 0;
    const pull = Math.pow(random(), 2.2) * 0.72;
    nx = lerp(nx, clusters[clusterIndex * 3], pull);
    ny = lerp(ny, clusters[clusterIndex * 3 + 1], pull);
    nz = lerp(nz, clusters[clusterIndex * 3 + 2], pull);

    // Fold the surface with noise so it stops reading as a sphere.
    const fold = noise.fbm(nx * 1.9, ny * 1.9, nz * 1.9, 3) * 0.22;
    const len = Math.max(1e-4, Math.hypot(nx, ny, nz));
    nx += (nx / len) * fold;
    ny += (ny / len) * fold;
    nz += (nz / len) * fold;

    neural[i * 3] = nx;
    neural[i * 3 + 1] = ny;
    neural[i * 3 + 2] = nz;

    const finalRadius = Math.hypot(nx, ny, nz);
    layers[i] = clamp(finalRadius / 1.15, 0, 1);

    /* ---------------- REACTOR: engineered concentric structure ----------- */
    const shell = (random() * shellRadii.length) | 0;
    const shellR = shellRadii[shell];
    const spokes = 24 + shell * 12;
    const angle = (Math.floor(random() * spokes) / spokes) * TAU + (random() - 0.5) * 0.035;
    const armJitter = (random() - 0.5) * 0.045;
    const tilt = shellTilt[shell];
    const rx = Math.cos(angle) * (shellR + armJitter);
    const ry = Math.sin(angle) * (shellR + armJitter);
    // Thin disc, tilted per shell, with a small vertical spread.
    const rz = (random() - 0.5) * 0.05 + Math.sin(angle * 3.0) * 0.03;
    reactor[i * 3] = rx;
    reactor[i * 3 + 1] = ry * Math.cos(tilt) - rz * Math.sin(tilt);
    reactor[i * 3 + 2] = ry * Math.sin(tilt) + rz * Math.cos(tilt);

    /* ---------------- DATA: dense rotating lattice sphere ---------------- */
    const rows = 44;
    const row = Math.floor(t * rows) + (random() < 0.06 ? 1 : 0);
    const phi = ((row + 0.5) / rows) * Math.PI;
    const ringCount = Math.max(6, Math.round(Math.sin(phi) * 128));
    const col = Math.floor(random() * ringCount);
    const theta = (col / ringCount) * TAU;
    const dr = 0.94 + (random() < 0.12 ? 0.09 : 0) - (random() < 0.1 ? 0.08 : 0);
    data[i * 3] = Math.sin(phi) * Math.cos(theta) * dr;
    data[i * 3 + 1] = Math.cos(phi) * dr;
    data[i * 3 + 2] = Math.sin(phi) * Math.sin(theta) * dr;

    /* ---------------- ENERGY: unstable plasma field ---------------------- */
    unitVector(random, dir);
    const eR = lerp(0.62, 1.22, Math.pow(random(), 0.7));
    let ex = dir.x * eR;
    let ey = dir.y * eR;
    let ez = dir.z * eR;
    noise.curl(ex * 1.3, ey * 1.3, ez * 1.3, 0.16, curl);
    ex += curl[0] * 0.38;
    ey += curl[1] * 0.38;
    ez += curl[2] * 0.38;
    energy[i * 3] = ex;
    energy[i * 3 + 1] = ey;
    energy[i * 3 + 2] = ez;

    /* ---------------- SCANNER: hollow shell with sampling planes --------- */
    unitVector(random, dir);
    const slabs = 7;
    const slabIndex = (random() * slabs) | 0;
    const slabY = lerp(-0.85, 0.85, slabIndex / (slabs - 1));
    const onSlab = random() < 0.55;
    if (onSlab) {
      const rr = Math.sqrt(Math.max(0, 1.02 * 1.02 - slabY * slabY));
      const a = random() * TAU;
      scanner[i * 3] = Math.cos(a) * rr;
      scanner[i * 3 + 1] = slabY + (random() - 0.5) * 0.012;
      scanner[i * 3 + 2] = Math.sin(a) * rr;
    } else {
      const sR = 1.02 + (random() - 0.5) * 0.03;
      scanner[i * 3] = dir.x * sR;
      scanner[i * 3 + 1] = dir.y * sR;
      scanner[i * 3 + 2] = dir.z * sR;
    }

    /* ---------------- size ------------------------------------------------ */
    // Most nodes are small; a handful are large "neuron bodies".
    const roll = random();
    let size = 1.5 + random() * 1.6;
    if (roll > 0.985) size = 5.2 + random() * 2.6;
    else if (roll > 0.92) size = 3.0 + random() * 1.4;
    sizes[i] = size;
  }

  return { count, neural, reactor, data, energy, scanner, sizes, layers, seeds };
}

/** Target weights for a given mode, in the order the shader expects. */
export function modeWeights(mode: OrbMode): [number, number, number, number, number] {
  const weights: [number, number, number, number, number] = [0, 0, 0, 0, 0];
  weights[ORB_MODES.indexOf(mode)] = 1;
  return weights;
}
