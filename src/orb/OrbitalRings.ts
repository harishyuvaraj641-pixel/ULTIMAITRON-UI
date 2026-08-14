import * as THREE from 'three';
import { PALETTE, RINGS } from '../config';
import { shaders } from '../shaders';
import { TAU } from '../utils/MathUtils';

interface RingConfig {
  name: string;
  inner: number;
  outer: number;
  feather: number;
  opacity: number;
  segments: number;
  dashRatio: number;
  segmentSpin: number;
  sweep: boolean;
  sweepSpeed: number;
  sweepWidth: number;
  gapStart: number;
  gapSize: number;
  /** Base orientation, radians. */
  tiltX: number;
  tiltY: number;
  /** Rotation about the ring's own normal, radians/second. */
  spin: number;
  wobbleAmplitude: number;
  wobbleSpeed: number;
  color: number;
  /** Multiplier applied to the global scan-speed response. */
  scanResponse: number;
}

/**
 * Nine concentric rings. Radii, speeds, axes and segment counts are all
 * deliberately non-uniform: perfect symmetry reads as decoration, staggered
 * machinery reads as engineering.
 */
const RING_CONFIGS: RingConfig[] = [
  {
    name: 'inner', inner: 0.45, outer: 0.4688, feather: 0.0045, opacity: 0.85,
    segments: 0, dashRatio: 1, segmentSpin: 0, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0, gapSize: 0, tiltX: 0.34, tiltY: 0.12, spin: 0.55,
    wobbleAmplitude: 0.02, wobbleSpeed: 0.7, color: PALETTE.iceBlue, scanResponse: 0.6,
  },
  {
    name: 'energy', inner: 0.57, outer: 0.6112, feather: 0.015, opacity: 0.6,
    segments: 0, dashRatio: 1, segmentSpin: 0, sweep: true, sweepSpeed: 1.15, sweepWidth: 0.34,
    gapStart: 0, gapSize: 0, tiltX: -0.52, tiltY: 0.4, spin: -0.32,
    wobbleAmplitude: 0.05, wobbleSpeed: 0.43, color: PALETTE.cyan, scanResponse: 1.0,
  },
  {
    name: 'segmented', inner: 0.705, outer: 0.75, feather: 0.006, opacity: 0.75,
    segments: 48, dashRatio: 0.56, segmentSpin: 0.05, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0, gapSize: 0, tiltX: 1.32, tiltY: -0.18, spin: 0.28,
    wobbleAmplitude: 0.03, wobbleSpeed: 0.31, color: PALETTE.cyan, scanResponse: 0.8,
  },
  {
    name: 'technical', inner: 0.825, outer: 0.9, feather: 0.009, opacity: 0.42,
    segments: 12, dashRatio: 0.74, segmentSpin: -0.09, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0, gapSize: 0, tiltX: -0.22, tiltY: 0.86, spin: -0.19,
    wobbleAmplitude: 0.07, wobbleSpeed: 0.24, color: PALETTE.cyanDim, scanResponse: 0.5,
  },
  {
    name: 'radial-thin', inner: 0.7837, outer: 0.7913, feather: 0.003, opacity: 0.9,
    segments: 0, dashRatio: 1, segmentSpin: 0, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0, gapSize: 0, tiltX: 0.06, tiltY: -0.05, spin: 0.09,
    wobbleAmplitude: 0.012, wobbleSpeed: 0.9, color: PALETTE.iceBlue, scanResponse: 0.3,
  },
  {
    name: 'dotted', inner: 0.93, outer: 0.9465, feather: 0.0045, opacity: 0.7,
    segments: 140, dashRatio: 0.28, segmentSpin: 0.11, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0, gapSize: 0, tiltX: 0.98, tiltY: 0.34, spin: -0.42,
    wobbleAmplitude: 0.02, wobbleSpeed: 0.52, color: PALETTE.cyan, scanResponse: 0.9,
  },
  {
    name: 'broken', inner: 1.065, outer: 1.1025, feather: 0.0075, opacity: 0.5,
    segments: 0, dashRatio: 1, segmentSpin: 0, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0.6, gapSize: 1.55, tiltX: -1.18, tiltY: 0.2, spin: 0.23,
    wobbleAmplitude: 0.045, wobbleSpeed: 0.19, color: PALETTE.cyanDim, scanResponse: 0.7,
  },
  {
    name: 'scanning', inner: 1.14, outer: 1.2, feather: 0.015, opacity: 0.55,
    segments: 0, dashRatio: 1, segmentSpin: 0, sweep: true, sweepSpeed: 0.62, sweepWidth: 0.28,
    gapStart: 0, gapSize: 0, tiltX: 0.42, tiltY: -0.62, spin: -0.14,
    wobbleAmplitude: 0.03, wobbleSpeed: 0.36, color: PALETTE.iceBlue, scanResponse: 1.4,
  },
  {
    name: 'data', inner: 1.29, outer: 1.35, feather: 0.0075, opacity: 0.34,
    segments: 220, dashRatio: 0.42, segmentSpin: -0.22, sweep: false, sweepSpeed: 0, sweepWidth: 0.2,
    gapStart: 0, gapSize: 0, tiltX: 1.5, tiltY: 0.1, spin: 0.16,
    wobbleAmplitude: 0.025, wobbleSpeed: 0.28, color: PALETTE.cyan, scanResponse: 1.1,
  },
];

interface RingInstance {
  config: RingConfig;
  holder: THREE.Group;
  mesh: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
  phase: number;
}

export class OrbitalRings {
  readonly group = new THREE.Group();
  private readonly rings: RingInstance[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly baseColor = new THREE.Color();
  private readonly warmColor = new THREE.Color(PALETTE.gold);

  constructor() {
    this.group.name = 'orbital-rings';

    RING_CONFIGS.forEach((config, index) => {
      const geometry = new THREE.RingGeometry(
        config.inner * 0.92,
        config.outer * 1.08,
        Math.max(96, Math.min(256, Math.round(config.segments * 1.5) || 128)),
        1,
      );

      const uniforms: Record<string, THREE.IUniform> = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(config.color) },
        uWarmColor: { value: new THREE.Color(PALETTE.gold) },
        uWarm: { value: 0 },
        uOpacity: { value: config.opacity },
        uEnergy: { value: 0.3 },
        uInner: { value: config.inner },
        uOuter: { value: config.outer },
        uFeather: { value: config.feather },
        uSegments: { value: config.segments },
        uDashRatio: { value: config.dashRatio },
        uSegmentSpin: { value: config.segmentSpin },
        uSweep: { value: config.sweep ? 1 : 0 },
        uSweepSpeed: { value: config.sweepSpeed },
        uSweepWidth: { value: config.sweepWidth },
        uGapStart: { value: config.gapStart },
        uGapSize: { value: config.gapSize },
      };

      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: shaders.hologram.vert,
        fragmentShader: shaders.hologram.frag,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      mesh.renderOrder = 7;

      const holder = new THREE.Group();
      holder.rotation.set(config.tiltX, config.tiltY, 0);
      holder.add(mesh);
      this.group.add(holder);

      this.rings.push({ config, holder, mesh, uniforms, phase: (index / RING_CONFIGS.length) * TAU });
      this.disposables.push(geometry, material);
    });
  }

  update(dt: number, time: number, energy: number, warm: number, scanBoost: number): void {
    const scanSpeed =
      RINGS.scanSpeedIdle + (RINGS.scanSpeedActive - RINGS.scanSpeedIdle) * scanBoost;

    for (const ring of this.rings) {
      const { config, uniforms } = ring;
      uniforms.uTime.value = time;
      uniforms.uWarm.value = warm;
      uniforms.uEnergy.value = 0.22 + energy * 0.95;
      uniforms.uOpacity.value = config.opacity * (0.65 + energy * 0.5);
      if (config.sweep) {
        uniforms.uSweepSpeed.value = config.sweepSpeed * scanSpeed * config.scanResponse;
      }
      (uniforms.uColor.value as THREE.Color)
        .copy(this.baseColor.set(config.color))
        .lerp(this.warmColor, warm * 0.85);

      ring.mesh.rotation.z += dt * config.spin * (0.6 + energy * 1.6);
      // Slow wobble around the base tilt keeps the assembly from feeling static.
      const wobble = Math.sin(time * config.wobbleSpeed + ring.phase) * config.wobbleAmplitude;
      const wobble2 = Math.cos(time * config.wobbleSpeed * 0.73 + ring.phase) * config.wobbleAmplitude;
      ring.holder.rotation.x = config.tiltX + wobble;
      ring.holder.rotation.y = config.tiltY + wobble2;
    }
  }

  setVisible(visible: boolean): void {
    this.group.visible = visible;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
