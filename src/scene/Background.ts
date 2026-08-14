import * as THREE from 'three';
import { PALETTE } from '../config';
import { shaders } from '../shaders';
import { createRandom, TAU } from '../utils/MathUtils';

/**
 * The environment: a sparse, deliberately understated star field plus a soft
 * cyan haze sitting directly behind the core. No galaxy textures — the orb has
 * to dominate the composition.
 */
export class Background {
  readonly stars: THREE.Points;
  readonly haze: THREE.Mesh;

  private readonly starUniforms: Record<string, THREE.IUniform>;
  private readonly hazeUniforms: Record<string, THREE.IUniform>;
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor(pixelRatio: number, count = 1100, seed = 4242) {
    const random = createRandom(seed);

    const positions = new Float32Array(count * 3);
    const sizes = new Float32Array(count);
    const seeds = new Float32Array(count);

    for (let i = 0; i < count; i++) {
      // Distributed on a far shell so parallax reads correctly.
      const u = random() * 2 - 1;
      const theta = random() * TAU;
      const s = Math.sqrt(Math.max(0, 1 - u * u));
      const radius = 28 + random() * 44;
      positions[i * 3] = s * Math.cos(theta) * radius;
      positions[i * 3 + 1] = s * Math.sin(theta) * radius;
      positions[i * 3 + 2] = u * radius;
      sizes[i] = 0.5 + Math.pow(random(), 3) * 2.6;
      seeds[i] = random();
    }

    const starGeometry = new THREE.BufferGeometry();
    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    starGeometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    starGeometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));

    this.starUniforms = {
      uTime: { value: 0 },
      uPixelRatio: { value: pixelRatio },
      uColorA: { value: new THREE.Color(PALETTE.cyanDim) },
      uColorB: { value: new THREE.Color(PALETTE.iceBlue) },
      uOpacity: { value: 0.55 },
    };

    const starMaterial = new THREE.ShaderMaterial({
      uniforms: this.starUniforms,
      vertexShader: shaders.background.vert,
      fragmentShader: shaders.background.frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });

    this.stars = new THREE.Points(starGeometry, starMaterial);
    this.stars.name = 'starfield';
    this.stars.renderOrder = -10;
    this.disposables.push(starGeometry, starMaterial);

    /* --- atmospheric haze ------------------------------------------------ */
    this.hazeUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.cyanDim) },
      uWarmColor: { value: new THREE.Color(PALETTE.goldDeep) },
      uWarm: { value: 0 },
      uOpacity: { value: 0.42 },
      uEnergy: { value: 0.3 },
    };

    const hazeGeometry = new THREE.PlaneGeometry(1, 1);
    const hazeMaterial = new THREE.ShaderMaterial({
      uniforms: this.hazeUniforms,
      vertexShader: shaders.haze.vert,
      fragmentShader: shaders.haze.frag,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      blending: THREE.AdditiveBlending,
    });

    this.haze = new THREE.Mesh(hazeGeometry, hazeMaterial);
    this.haze.name = 'core-haze';
    this.haze.renderOrder = -9;
    // Parented to the camera so it is always squarely behind the core.
    this.haze.position.set(0, 0, -13);
    this.haze.scale.set(24, 24, 1);
    this.disposables.push(hazeGeometry, hazeMaterial);
  }

  update(time: number, energy: number, warm: number): void {
    this.starUniforms.uTime.value = time;
    this.hazeUniforms.uTime.value = time;
    this.hazeUniforms.uEnergy.value = energy;
    this.hazeUniforms.uWarm.value = warm;
    this.hazeUniforms.uOpacity.value = 0.3 + energy * 0.3;
    // A slow counter-rotation of the sky adds depth without drawing attention.
    this.stars.rotation.y = time * 0.004;
    this.stars.rotation.x = Math.sin(time * 0.011) * 0.05;
  }

  setPixelRatio(pixelRatio: number): void {
    this.starUniforms.uPixelRatio.value = pixelRatio;
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
