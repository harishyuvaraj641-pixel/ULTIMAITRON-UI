import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { createRandom } from '../utils/MathUtils';

const SPARK_COUNT = 900;

/**
 * The shockwave that accompanies a power release: an expanding ring plus a
 * shell of sparks. Sparks are recycled from a fixed pool and animated entirely
 * in the vertex shader.
 */
export class ParticleBurst {
  readonly group = new THREE.Group();

  private readonly sparks: THREE.Points;
  private readonly ring: THREE.Mesh;
  private readonly geometry: THREE.BufferGeometry;
  private readonly sparkUniforms: Record<string, THREE.IUniform>;
  private readonly ringUniforms: Record<string, THREE.IUniform>;
  private readonly disposables: Array<{ dispose(): void }> = [];

  private readonly births: Float32Array;
  private readonly lives: Float32Array;
  private readonly velocities: Float32Array;
  private readonly positions: Float32Array;
  private cursor = 0;
  private ringAge = -1;
  private time = 0;

  constructor(pixelRatio: number, seed = 991) {
    this.group.name = 'particle-burst';
    const random = createRandom(seed);

    this.positions = new Float32Array(SPARK_COUNT * 3);
    this.velocities = new Float32Array(SPARK_COUNT * 3);
    this.births = new Float32Array(SPARK_COUNT).fill(-1000);
    this.lives = new Float32Array(SPARK_COUNT).fill(1);
    const sizes = new Float32Array(SPARK_COUNT);
    for (let i = 0; i < SPARK_COUNT; i++) sizes[i] = 1.4 + random() * 3.4;

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aVelocity', new THREE.BufferAttribute(this.velocities, 3));
    this.geometry.setAttribute('aBirth', new THREE.BufferAttribute(this.births, 1));
    this.geometry.setAttribute('aLife', new THREE.BufferAttribute(this.lives, 1));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 20);

    this.sparkUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uSizeScale: { value: 3.0 },
      uColor: { value: new THREE.Color(PALETTE.cyan) },
      uHotColor: { value: new THREE.Color(PALETTE.white) },
      uOpacity: { value: 1 },
    };

    const sparkMaterial = new THREE.ShaderMaterial({
      uniforms: this.sparkUniforms,
      vertexShader: shaders.burst.vert,
      fragmentShader: shaders.burst.frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.sparks = new THREE.Points(this.geometry, sparkMaterial);
    this.sparks.frustumCulled = false;
    this.sparks.renderOrder = 8;
    this.group.add(this.sparks);
    this.disposables.push(this.geometry, sparkMaterial);

    /* --- shockwave ring --------------------------------------------------- */
    this.ringUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.iceBlue) },
      uWarmColor: { value: new THREE.Color(PALETTE.gold) },
      uWarm: { value: 0 },
      uOpacity: { value: 0 },
      uEnergy: { value: 1 },
      uInner: { value: 0.86 },
      uOuter: { value: 1.0 },
      uFeather: { value: 0.05 },
      uSegments: { value: 0 },
      uDashRatio: { value: 1 },
      uSegmentSpin: { value: 0 },
      uSweep: { value: 0 },
      uSweepSpeed: { value: 0 },
      uSweepWidth: { value: 0.2 },
      uGapStart: { value: 0 },
      uGapSize: { value: 0 },
    };

    const ringGeometry = new THREE.RingGeometry(0.8, 1.05, 128, 1);
    const ringMaterial = new THREE.ShaderMaterial({
      uniforms: this.ringUniforms,
      vertexShader: shaders.hologram.vert,
      fragmentShader: shaders.hologram.frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
    this.ring.visible = false;
    this.ring.renderOrder = 8;
    this.group.add(this.ring);
    this.disposables.push(ringGeometry, ringMaterial);
  }

  /** @param origin world-space centre  @param radius initial shell radius */
  fire(origin: THREE.Vector3, radius: number, count = 420, speed = 4.2, warm = 0): void {
    const attributes = this.geometry.attributes;
    const random = Math.random;

    for (let i = 0; i < count; i++) {
      const index = this.cursor % SPARK_COUNT;
      this.cursor++;

      const u = random() * 2 - 1;
      const theta = random() * Math.PI * 2;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const dx = s * Math.cos(theta);
      const dy = s * Math.sin(theta);
      const dz = u;

      this.positions[index * 3] = origin.x + dx * radius;
      this.positions[index * 3 + 1] = origin.y + dy * radius;
      this.positions[index * 3 + 2] = origin.z + dz * radius;

      const velocity = speed * (0.45 + random() * 0.85);
      this.velocities[index * 3] = dx * velocity;
      this.velocities[index * 3 + 1] = dy * velocity;
      this.velocities[index * 3 + 2] = dz * velocity;

      this.births[index] = this.time;
      this.lives[index] = 0.85 + random() * 0.9;
    }

    attributes.position.needsUpdate = true;
    attributes.aVelocity.needsUpdate = true;
    attributes.aBirth.needsUpdate = true;
    attributes.aLife.needsUpdate = true;

    (this.sparkUniforms.uColor.value as THREE.Color).set(warm > 0.5 ? PALETTE.gold : PALETTE.cyan);
    this.ringUniforms.uWarm.value = warm;

    this.ring.position.copy(origin);
    this.ring.visible = true;
    this.ringAge = 0;
  }

  update(dt: number, time: number, cameraQuaternion: THREE.Quaternion): void {
    this.time = time;
    this.sparkUniforms.uTime.value = time;
    this.ringUniforms.uTime.value = time;

    if (this.ringAge >= 0) {
      this.ringAge += dt;
      const duration = 1.05;
      const t = this.ringAge / duration;
      if (t >= 1) {
        this.ringAge = -1;
        this.ring.visible = false;
      } else {
        const eased = 1 - Math.pow(1 - t, 2.4);
        this.ring.scale.setScalar(0.6 + eased * 4.2);
        this.ringUniforms.uOpacity.value = (1 - t) * 0.9;
        this.ring.quaternion.copy(cameraQuaternion);
      }
    }
  }

  setPixelRatio(pixelRatio: number): void {
    this.sparkUniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
