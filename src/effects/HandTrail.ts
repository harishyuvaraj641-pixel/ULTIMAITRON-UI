import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';

const TRAIL_LENGTH = 140;
const MIN_SPAWN_DISTANCE = 0.035;

/**
 * A short-lived comet tail behind a moving hand. Points are recycled from a
 * fixed ring buffer; only the newest point is written each frame.
 */
export class HandTrail {
  readonly points: THREE.Points;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;
  private readonly uniforms: Record<string, THREE.IUniform>;
  private readonly positions = new Float32Array(TRAIL_LENGTH * 3);
  private readonly births = new Float32Array(TRAIL_LENGTH).fill(-1000);
  private readonly lives = new Float32Array(TRAIL_LENGTH);
  private readonly sizes = new Float32Array(TRAIL_LENGTH);
  private readonly charges = new Float32Array(TRAIL_LENGTH);
  private readonly last = new THREE.Vector3(Infinity, Infinity, Infinity);
  private cursor = 0;

  constructor(pixelRatio: number) {
    for (let i = 0; i < TRAIL_LENGTH; i++) {
      this.lives[i] = 0.55;
      this.sizes[i] = 3.4;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aBirth', new THREE.BufferAttribute(this.births, 1));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(this.sizes, 1));
    this.geometry.setAttribute('aCharge', new THREE.BufferAttribute(this.charges, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSizeScale: { value: 2.6 },
      uColor: { value: new THREE.Color(PALETTE.cyan) },
      uHotColor: { value: new THREE.Color(PALETTE.white) },
      uOpacity: { value: 0.9 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaders.trail.vert,
      fragmentShader: shaders.trail.frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 9;
    this.points.name = 'hand-trail';
  }

  /**
   * @param position world-space hand position
   * @param speed    world units/second; slow hands leave no trail
   * @param charge   0..1, brightens the trail (used while pinching)
   */
  emit(position: THREE.Vector3, speed: number, charge: number, time: number): void {
    if (speed < 0.35) {
      this.last.copy(position);
      return;
    }
    if (this.last.distanceTo(position) < MIN_SPAWN_DISTANCE) return;

    const index = this.cursor % TRAIL_LENGTH;
    this.cursor++;

    this.positions[index * 3] = position.x;
    this.positions[index * 3 + 1] = position.y;
    this.positions[index * 3 + 2] = position.z;
    this.births[index] = time;
    this.lives[index] = 0.4 + Math.min(0.45, speed * 0.06);
    this.sizes[index] = 2.6 + Math.min(4.5, speed * 0.9) + charge * 2.5;
    this.charges[index] = charge;

    this.geometry.attributes.position.needsUpdate = true;
    this.geometry.attributes.aBirth.needsUpdate = true;
    this.geometry.attributes.aLife.needsUpdate = true;
    this.geometry.attributes.aSize.needsUpdate = true;
    this.geometry.attributes.aCharge.needsUpdate = true;

    this.last.copy(position);
  }

  update(time: number): void {
    this.uniforms.uTime.value = time;
  }

  setPixelRatio(pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  clear(): void {
    this.births.fill(-1000);
    this.geometry.attributes.aBirth.needsUpdate = true;
    this.last.set(Infinity, Infinity, Infinity);
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
