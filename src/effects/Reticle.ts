import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { damp } from '../utils/MathUtils';

interface RingSpec {
  inner: number;
  outer: number;
  segments: number;
  dashRatio: number;
  spin: number;
  opacity: number;
}

const RING_SPECS: RingSpec[] = [
  // outer circle
  { inner: 0.115, outer: 0.125, segments: 0, dashRatio: 1, spin: 0, opacity: 0.85 },
  // four corner brackets
  { inner: 0.15, outer: 0.185, segments: 4, dashRatio: 0.22, spin: 0.15, opacity: 0.9 },
  // rotating tick segments
  { inner: 0.135, outer: 0.145, segments: 16, dashRatio: 0.35, spin: -0.9, opacity: 0.55 },
];

/**
 * Holographic cursor drawn at the index fingertip: centre dot, outer circle,
 * four brackets and a rotating tick ring. Billboards towards the camera.
 */
export class Reticle {
  readonly group = new THREE.Group();

  private readonly rings: Array<{ mesh: THREE.Mesh; spec: RingSpec; uniforms: Record<string, THREE.IUniform> }> = [];
  private readonly dot: THREE.Mesh;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private opacity = 0;
  private targetOpacity = 0;
  private lockAmount = 0;
  private targetLock = 0;

  constructor() {
    this.group.name = 'fingertip-reticle';
    this.group.visible = false;

    const dotGeometry = new THREE.CircleGeometry(0.028, 20);
    const dotMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.white,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.dot = new THREE.Mesh(dotGeometry, dotMaterial);
    this.group.add(this.dot);
    this.disposables.push(dotGeometry, dotMaterial);

    for (const spec of RING_SPECS) {
      const uniforms: Record<string, THREE.IUniform> = {
        uTime: { value: 0 },
        uColor: { value: new THREE.Color(PALETTE.cyan) },
        uWarmColor: { value: new THREE.Color(PALETTE.amber) },
        uWarm: { value: 0 },
        uOpacity: { value: spec.opacity },
        uEnergy: { value: 0.8 },
        uInner: { value: spec.inner },
        uOuter: { value: spec.outer },
        uFeather: { value: 0.004 },
        uSegments: { value: spec.segments },
        uDashRatio: { value: spec.dashRatio },
        uSegmentSpin: { value: spec.spin },
        uSweep: { value: 0 },
        uSweepSpeed: { value: 0 },
        uSweepWidth: { value: 0.2 },
        uGapStart: { value: 0 },
        uGapSize: { value: 0 },
      };

      const geometry = new THREE.RingGeometry(spec.inner * 0.85, spec.outer * 1.15, 96, 1);
      const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader: shaders.hologram.vert,
        fragmentShader: shaders.hologram.frag,
        transparent: true,
        depthWrite: false,
        depthTest: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.frustumCulled = false;
      this.group.add(mesh);
      this.rings.push({ mesh, spec, uniforms });
      this.disposables.push(geometry, material);
    }

    this.group.renderOrder = 12;
  }

  setActive(active: boolean): void {
    this.targetOpacity = active ? 1 : 0;
  }

  /** Turns the reticle amber and tightens it when it is over a target. */
  setLocked(locked: boolean): void {
    this.targetLock = locked ? 1 : 0;
  }

  update(dt: number, time: number, position: THREE.Vector3, cameraQuaternion: THREE.Quaternion): void {
    this.opacity = damp(this.opacity, this.targetOpacity, 10, dt);
    this.lockAmount = damp(this.lockAmount, this.targetLock, 8, dt);

    this.group.visible = this.opacity > 0.01;
    if (!this.group.visible) return;

    this.group.position.copy(position);
    this.group.quaternion.copy(cameraQuaternion);
    this.group.scale.setScalar(1 - this.lockAmount * 0.18);

    const dotMaterial = this.dot.material as THREE.MeshBasicMaterial;
    dotMaterial.opacity = this.opacity * (0.7 + Math.sin(time * 8) * 0.15 + this.lockAmount * 0.2);

    for (const ring of this.rings) {
      ring.uniforms.uTime.value = time;
      ring.uniforms.uOpacity.value = ring.spec.opacity * this.opacity;
      ring.uniforms.uWarm.value = this.lockAmount;
      ring.uniforms.uEnergy.value = 0.6 + this.lockAmount * 0.9;
      ring.mesh.rotation.z += dt * ring.spec.spin * 2.2;
    }
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
