import * as THREE from 'three';
import { PALETTE, RINGS } from '../config';
import { shaders } from '../shaders';
import { damp } from '../utils/MathUtils';

/**
 * The targeting scanner: an arc that sweeps continuously around the core,
 * accelerates when a hand enters the field, and locks onto that hand while it
 * is pinching.
 *
 * Locking is done by freezing the shader's sweep and rotating the ring itself,
 * which keeps the arc's head exactly on the target with no extra uniforms.
 */
export class ScanArc {
  readonly mesh: THREE.Mesh;

  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly geometry: THREE.RingGeometry;
  private readonly material: THREE.ShaderMaterial;
  private freeSpeed: number = RINGS.scanSpeedIdle;
  private lock = 0;
  private targetLock = 0;
  private lockAngle = 0;
  private freeAngle = 0;
  private lockedInternal = false;

  constructor(radius = 1.78) {
    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.cyan) },
      uWarmColor: { value: new THREE.Color(PALETTE.amber) },
      uWarm: { value: 0 },
      uOpacity: { value: 0.55 },
      uEnergy: { value: 0.5 },
      uInner: { value: radius },
      uOuter: { value: radius + 0.05 },
      uFeather: { value: 0.012 },
      uSegments: { value: 0 },
      uDashRatio: { value: 1 },
      uSegmentSpin: { value: 0 },
      uSweep: { value: 1 },
      uSweepSpeed: { value: RINGS.scanSpeedIdle },
      uSweepWidth: { value: 0.22 },
      uGapStart: { value: 0 },
      uGapSize: { value: 0 },
    };

    this.geometry = new THREE.RingGeometry(radius * 0.96, (radius + 0.05) * 1.04, 160, 1);
    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaders.hologram.vert,
      fragmentShader: shaders.hologram.frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 10;
    this.mesh.name = 'scan-arc';
  }

  get locked(): boolean {
    return this.lockedInternal;
  }

  /**
   * @param target world-space point to lock onto, or null to sweep freely
   */
  update(
    dt: number,
    time: number,
    energy: number,
    handPresence: number,
    target: THREE.Vector3 | null,
    cameraQuaternion: THREE.Quaternion,
  ): void {
    this.targetLock = target ? 1 : 0;
    this.lock = damp(this.lock, this.targetLock, 7, dt);
    this.lockedInternal = this.lock > 0.6;

    const desiredSpeed =
      RINGS.scanSpeedIdle + (RINGS.scanSpeedActive - RINGS.scanSpeedIdle) * handPresence;
    this.freeSpeed = damp(this.freeSpeed, desiredSpeed, 3, dt);
    this.freeAngle += dt * this.freeSpeed;

    if (target) {
      // atan2 in the ring's own (camera-facing) plane.
      this.lockAngle = Math.atan2(target.y, target.x);
    }

    this.uniforms.uTime.value = time;
    this.uniforms.uSweepSpeed.value = this.freeSpeed * (1 - this.lock);
    this.uniforms.uWarm.value = this.lock;
    this.uniforms.uEnergy.value = 0.4 + energy * 0.8 + this.lock * 0.7;
    this.uniforms.uOpacity.value = 0.35 + handPresence * 0.3 + this.lock * 0.3;
    this.uniforms.uSweepWidth.value = 0.22 - this.lock * 0.13;

    this.mesh.quaternion.copy(cameraQuaternion);
    // When locked the shader sweep is frozen, so the ring itself carries the head.
    const angle = this.lock > 0.001 ? this.lockAngle : 0;
    this.mesh.rotateZ(angle * this.lock);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
