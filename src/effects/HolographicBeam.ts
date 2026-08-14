import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { damp } from '../utils/MathUtils';

const UP = new THREE.Vector3(0, 1, 0);

/**
 * Energy filament stretched between a fingertip and the core. The geometry is a
 * unit cylinder along +Y that is re-oriented and re-scaled each frame, so no
 * geometry is rebuilt while the beam is alive.
 */
export class HolographicBeam {
  readonly mesh: THREE.Mesh;

  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly geometry: THREE.CylinderGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly midpoint = new THREE.Vector3();
  private readonly direction = new THREE.Vector3();
  private readonly quaternion = new THREE.Quaternion();
  private opacity = 0;
  private targetOpacity = 0;
  private radius = 0.03;

  constructor(seed = 0) {
    this.geometry = new THREE.CylinderGeometry(1, 1, 1, 10, 1, true);

    this.uniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.iceBlue) },
      uWarmColor: { value: new THREE.Color(PALETTE.gold) },
      uWarm: { value: 0 },
      uOpacity: { value: 0 },
      uFlowSpeed: { value: 1.15 },
      uSeed: { value: seed * 3.77 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaders.beam.vert,
      fragmentShader: shaders.beam.frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });

    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = 9;
    this.mesh.name = 'holographic-beam';
  }

  /** Positions the beam. Call every frame while the beam should be visible. */
  setEndpoints(from: THREE.Vector3, to: THREE.Vector3): void {
    this.direction.subVectors(to, from);
    const length = this.direction.length();
    if (length < 1e-4) return;

    this.midpoint.addVectors(from, to).multiplyScalar(0.5);
    this.direction.divideScalar(length);
    this.quaternion.setFromUnitVectors(UP, this.direction);

    this.mesh.position.copy(this.midpoint);
    this.mesh.quaternion.copy(this.quaternion);
    this.mesh.scale.set(this.radius, length, this.radius);
  }

  setActive(active: boolean): void {
    this.targetOpacity = active ? 1 : 0;
  }

  setWarm(warm: number): void {
    this.uniforms.uWarm.value = warm;
  }

  update(dt: number, time: number): void {
    this.uniforms.uTime.value = time;
    this.opacity = damp(this.opacity, this.targetOpacity, 9, dt);
    this.uniforms.uOpacity.value = this.opacity;
    // Beams thicken slightly as they charge up.
    this.radius = 0.018 + this.opacity * 0.026;
    this.mesh.visible = this.opacity > 0.01;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
