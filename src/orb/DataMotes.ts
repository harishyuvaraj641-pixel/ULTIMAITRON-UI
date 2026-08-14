import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { createRandom, TAU } from '../utils/MathUtils';

/**
 * Small data particles drifting around the core — some orbit, some fall
 * inwards, some escape. Entirely GPU-driven; see shaders/motes.vert.
 */
export class DataMotes {
  readonly points: THREE.Points;
  readonly uniforms: Record<string, THREE.IUniform>;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(count: number, pixelRatio: number, seed = 8821) {
    const random = createRandom(seed);

    const positions = new Float32Array(count * 3); // unused, kept for draw count
    const types = new Float32Array(count);
    const radii = new Float32Array(count);
    const speeds = new Float32Array(count);
    const phases = new Float32Array(count);
    const lives = new Float32Array(count);
    const sizes = new Float32Array(count);
    const tilts = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      const roll = random();
      types[i] = roll < 0.5 ? 0 : roll < 0.72 ? 1 : roll < 0.88 ? 2 : 3;
      radii[i] = 1.15 + random() * 1.5;
      speeds[i] = (0.12 + random() * 0.5) * (random() < 0.35 ? -1 : 1);
      phases[i] = random();
      lives[i] = 4 + random() * 9;
      sizes[i] = 1.0 + random() * 2.2;
      tilts[i] = (random() - 0.5) * Math.PI * 0.85;
      seeds[i] = random() * TAU;
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.geometry.setAttribute('aType', new THREE.BufferAttribute(types, 1));
    this.geometry.setAttribute('aRadius', new THREE.BufferAttribute(radii, 1));
    this.geometry.setAttribute('aSpeed', new THREE.BufferAttribute(speeds, 1));
    this.geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(lives, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aTilt', new THREE.BufferAttribute(tilts, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    this.uniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSizeScale: { value: 2.2 },
      uOrbScale: { value: 1 },
      uEnergy: { value: 0.3 },
      uColor: { value: new THREE.Color(PALETTE.cyanDim) },
      uHotColor: { value: new THREE.Color(PALETTE.iceBlue) },
      uWarmColor: { value: new THREE.Color(PALETTE.gold) },
      uWarm: { value: 0 },
      uOpacity: { value: 0.85 },
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader: shaders.motes.vert,
      fragmentShader: shaders.motes.frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.points.name = 'data-motes';
  }

  update(time: number, energy: number, warm: number, orbScale: number): void {
    this.uniforms.uTime.value = time;
    this.uniforms.uEnergy.value = energy;
    this.uniforms.uWarm.value = warm;
    this.uniforms.uOrbScale.value = orbScale;
  }

  setPixelRatio(pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
