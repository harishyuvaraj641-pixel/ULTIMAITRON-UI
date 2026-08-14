import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { ORB_SHADER_DEFINES, type UniformMap } from './OrbUniforms';
import type { OrbGeometryData } from './OrbModes';

/**
 * The neural cloud itself: one THREE.Points draw call for every node.
 *
 * All motion happens in the vertex shader (see shaders/common.glsl), so the CPU
 * never iterates over the particles after start-up — which is what makes 20k
 * nodes viable at 60fps.
 */
export class ParticleSystem {
  readonly points: THREE.Points;
  readonly uniforms: UniformMap;
  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(data: OrbGeometryData, shared: UniformMap, pixelRatio: number) {
    this.geometry = new THREE.BufferGeometry();
    // `position` doubles as the NEURAL base configuration, saving an attribute.
    this.geometry.setAttribute('position', new THREE.BufferAttribute(data.neural, 3));
    this.geometry.setAttribute('aReactor', new THREE.BufferAttribute(data.reactor, 3));
    this.geometry.setAttribute('aData', new THREE.BufferAttribute(data.data, 3));
    this.geometry.setAttribute('aEnergy', new THREE.BufferAttribute(data.energy, 3));
    this.geometry.setAttribute('aScanner', new THREE.BufferAttribute(data.scanner, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(data.sizes, 1));
    this.geometry.setAttribute('aLayer', new THREE.BufferAttribute(data.layers, 1));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(data.seeds, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    this.uniforms = {
      ...shared,
      uPixelRatio: { value: pixelRatio },
      uSizeScale: { value: 3.2 },
      uPointBoost: { value: 1 },
      uColorCore: { value: new THREE.Color(PALETTE.white) },
      uColorMid: { value: new THREE.Color(PALETTE.cyan) },
      uColorEdge: { value: new THREE.Color(PALETTE.cyanDim) },
      uWarmCore: { value: new THREE.Color(PALETTE.gold) },
      uWarmMid: { value: new THREE.Color(PALETTE.goldDeep) },
      uWarm: { value: 0 },
      uOpacity: { value: 1 },
    };

    this.material = new THREE.ShaderMaterial({
      defines: { ...ORB_SHADER_DEFINES },
      uniforms: this.uniforms,
      vertexShader: shaders.particle.vert,
      fragmentShader: shaders.particle.frag,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false; // vertices move far beyond their bounds
    this.points.renderOrder = 6;
    this.points.name = 'neural-particles';
  }

  setPixelRatio(pixelRatio: number): void {
    this.uniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
