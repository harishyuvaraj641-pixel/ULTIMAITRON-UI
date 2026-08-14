import * as THREE from 'three';
import { ORB, PALETTE } from '../config';
import { shaders } from '../shaders';
import { SpatialHash } from '../utils/SpatialHash';
import { hash1 } from '../utils/MathUtils';
import { ORB_SHADER_DEFINES, type UniformMap } from './OrbUniforms';
import type { OrbGeometryData } from './OrbModes';

/**
 * Synapses between nearby nodes.
 *
 * Topology is computed once with a spatial hash — an all-pairs search over 20k
 * nodes is not survivable. Each line vertex carries the *same* per-mode base
 * positions as the particle it belongs to and runs the identical displacement
 * function, so the lines stay welded to their nodes for free.
 */
export class NeuralNetwork {
  readonly lines: THREE.LineSegments;
  readonly uniforms: UniformMap;
  readonly connectionCount: number;

  private readonly geometry: THREE.BufferGeometry;
  private readonly material: THREE.ShaderMaterial;

  constructor(data: OrbGeometryData, shared: UniformMap, maxConnections: number) {
    const hash = new SpatialHash(data.neural, ORB.connectionRadius);
    const pairs = hash.buildPairs(ORB.connectionRadius, ORB.maxNeighboursPerNode, maxConnections);
    const links = pairs.length / 2;
    this.connectionCount = links;

    const vertexCount = links * 2;
    const neural = new Float32Array(vertexCount * 3);
    const reactor = new Float32Array(vertexCount * 3);
    const dataPos = new Float32Array(vertexCount * 3);
    const energy = new Float32Array(vertexCount * 3);
    const scanner = new Float32Array(vertexCount * 3);
    const seeds = new Float32Array(vertexCount);
    const ends = new Float32Array(vertexCount);
    const strengths = new Float32Array(vertexCount);
    const lineSeeds = new Float32Array(vertexCount);

    const copy = (src: Float32Array, dst: Float32Array, from: number, to: number): void => {
      dst[to * 3] = src[from * 3];
      dst[to * 3 + 1] = src[from * 3 + 1];
      dst[to * 3 + 2] = src[from * 3 + 2];
    };

    for (let link = 0; link < links; link++) {
      const a = pairs[link * 2];
      const b = pairs[link * 2 + 1];

      // Shorter connections are stronger, mirroring synaptic proximity.
      const dx = data.neural[a * 3] - data.neural[b * 3];
      const dy = data.neural[a * 3 + 1] - data.neural[b * 3 + 1];
      const dz = data.neural[a * 3 + 2] - data.neural[b * 3 + 2];
      const length = Math.hypot(dx, dy, dz);
      const strength = 1 - Math.min(1, length / ORB.connectionRadius) * 0.75;
      const lineSeed = hash1(link + 1);

      for (let k = 0; k < 2; k++) {
        const source = k === 0 ? a : b;
        const target = link * 2 + k;
        copy(data.neural, neural, source, target);
        copy(data.reactor, reactor, source, target);
        copy(data.data, dataPos, source, target);
        copy(data.energy, energy, source, target);
        copy(data.scanner, scanner, source, target);
        seeds[target] = data.seeds[source];
        ends[target] = k;
        strengths[target] = strength;
        lineSeeds[target] = lineSeed;
      }
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(neural, 3));
    this.geometry.setAttribute('aReactor', new THREE.BufferAttribute(reactor, 3));
    this.geometry.setAttribute('aData', new THREE.BufferAttribute(dataPos, 3));
    this.geometry.setAttribute('aEnergy', new THREE.BufferAttribute(energy, 3));
    this.geometry.setAttribute('aScanner', new THREE.BufferAttribute(scanner, 3));
    this.geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    this.geometry.setAttribute('aEnd', new THREE.BufferAttribute(ends, 1));
    this.geometry.setAttribute('aStrength', new THREE.BufferAttribute(strengths, 1));
    this.geometry.setAttribute('aLineSeed', new THREE.BufferAttribute(lineSeeds, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 12);

    this.uniforms = {
      ...shared,
      uColorLine: { value: new THREE.Color(PALETTE.cyanDim) },
      uColorHot: { value: new THREE.Color(PALETTE.iceBlue) },
      uWarmLine: { value: new THREE.Color(PALETTE.goldDeep) },
      uWarmHot: { value: new THREE.Color(PALETTE.gold) },
      uWarm: { value: 0 },
      uOpacity: { value: 0.5 },
      uTravelSpeed: { value: 0.42 },
    };

    this.material = new THREE.ShaderMaterial({
      defines: { ...ORB_SHADER_DEFINES },
      uniforms: this.uniforms,
      vertexShader: shaders.neural.vert,
      fragmentShader: shaders.neural.frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
    this.lines.renderOrder = 5;
    this.lines.name = 'neural-connections';
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
