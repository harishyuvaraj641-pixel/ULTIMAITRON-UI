import * as THREE from 'three';
import { PALETTE, SCENE } from '../config';
import { shaders } from '../shaders';
import { damp, lerp } from '../utils/MathUtils';

/** Builds a soft radial gradient sprite texture used for the core's bloom. */
function createGlowTexture(size = 128): THREE.Texture {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const gradient = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.22, 'rgba(200,250,255,0.72)');
    gradient.addColorStop(0.55, 'rgba(60,200,230,0.18)');
    gradient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, size, size);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

/**
 * The layered energy core at the centre of the orb.
 *
 *   1. opaque dark centre (also writes depth, giving the cloud real occlusion)
 *   2. cyan plasma sphere
 *   3. rotating containment ring
 *   4. radial energy rays
 *   5. transparent outer shell
 *   6. additive bloom sprite
 */
export class EnergyCore {
  readonly group = new THREE.Group();
  readonly light: THREE.PointLight;

  private readonly plasma: THREE.Mesh;
  private readonly shell: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly rays: THREE.Mesh;
  private readonly glow: THREE.Sprite;
  private readonly disposables: Array<{ dispose(): void }> = [];

  private readonly plasmaUniforms: Record<string, THREE.IUniform>;
  private readonly shellUniforms: Record<string, THREE.IUniform>;
  private readonly rayUniforms: Record<string, THREE.IUniform>;

  private pulse = 0;
  private raySpin = 0;

  // Pre-allocated so the animation loop never creates objects.
  private readonly cyanColor = new THREE.Color(PALETTE.cyan);
  private readonly goldColor = new THREE.Color(PALETTE.gold);

  constructor() {
    this.group.name = 'energy-core';

    /* 1 — dark centre */
    const centreGeometry = new THREE.SphereGeometry(0.185, 32, 24);
    const centreMaterial = new THREE.MeshBasicMaterial({ color: 0x00060b });
    const centre = new THREE.Mesh(centreGeometry, centreMaterial);
    centre.renderOrder = 1;
    this.group.add(centre);
    this.disposables.push(centreGeometry, centreMaterial);

    /* 2 — plasma sphere */
    this.plasmaUniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(PALETTE.cyanDim) },
      uColorB: { value: new THREE.Color(PALETTE.white) },
      uWarmA: { value: new THREE.Color(PALETTE.goldDeep) },
      uWarmB: { value: new THREE.Color(PALETTE.gold) },
      uWarm: { value: 0 },
      uIntensity: { value: 0.85 },
      uOpacity: { value: 0.7 },
      uFresnelPower: { value: 2.1 },
      uFresnelBoost: { value: 0.85 },
      uNoiseScale: { value: 5.5 },
      uFlow: { value: 0.35 },
      uPulse: { value: 0 },
    };
    const plasmaGeometry = new THREE.SphereGeometry(0.225, 48, 36);
    const plasmaMaterial = new THREE.ShaderMaterial({
      uniforms: this.plasmaUniforms,
      vertexShader: shaders.core.vert,
      fragmentShader: shaders.core.frag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.plasma = new THREE.Mesh(plasmaGeometry, plasmaMaterial);
    this.plasma.renderOrder = 2;
    this.group.add(this.plasma);
    this.disposables.push(plasmaGeometry, plasmaMaterial);

    /* 3 — containment ring */
    const ringGeometry = new THREE.TorusGeometry(0.33, 0.006, 8, 96);
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: PALETTE.iceBlue,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.ring = new THREE.Mesh(ringGeometry, ringMaterial);
    this.ring.rotation.x = Math.PI * 0.32;
    this.ring.renderOrder = 3;
    this.group.add(this.ring);
    this.disposables.push(ringGeometry, ringMaterial);

    /* 4 — radial energy rays */
    this.rayUniforms = {
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(PALETTE.cyan) },
      uWarmColor: { value: new THREE.Color(PALETTE.gold) },
      uWarm: { value: 0 },
      uOpacity: { value: 0.4 },
      uEnergy: { value: 0.4 },
      uInner: { value: 0.24 },
      uOuter: { value: 0.52 },
      uFeather: { value: 0.12 },
      uSegments: { value: 64 },
      uDashRatio: { value: 0.16 },
      uSegmentSpin: { value: 0.18 },
      uSweep: { value: 0 },
      uSweepSpeed: { value: 0 },
      uSweepWidth: { value: 0.2 },
      uGapStart: { value: 0 },
      uGapSize: { value: 0 },
    };
    const rayGeometry = new THREE.RingGeometry(0.2, 0.56, 96, 1);
    const rayMaterial = new THREE.ShaderMaterial({
      uniforms: this.rayUniforms,
      vertexShader: shaders.hologram.vert,
      fragmentShader: shaders.hologram.frag,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.rays = new THREE.Mesh(rayGeometry, rayMaterial);
    this.rays.renderOrder = 3;
    this.group.add(this.rays);
    this.disposables.push(rayGeometry, rayMaterial);

    /* 5 — transparent outer shell */
    this.shellUniforms = {
      uTime: { value: 0 },
      uColorA: { value: new THREE.Color(PALETTE.cyanDim) },
      uColorB: { value: new THREE.Color(PALETTE.iceBlue) },
      uWarmA: { value: new THREE.Color(PALETTE.goldDeep) },
      uWarmB: { value: new THREE.Color(PALETTE.amber) },
      uWarm: { value: 0 },
      uIntensity: { value: 0.42 },
      uOpacity: { value: 0.3 },
      uFresnelPower: { value: 3.4 },
      uFresnelBoost: { value: 1.0 },
      uNoiseScale: { value: 2.4 },
      uFlow: { value: 0.16 },
      uPulse: { value: 0 },
    };
    const shellGeometry = new THREE.SphereGeometry(0.44, 48, 36);
    const shellMaterial = new THREE.ShaderMaterial({
      uniforms: this.shellUniforms,
      vertexShader: shaders.core.vert,
      fragmentShader: shaders.core.frag,
      transparent: true,
      depthWrite: false,
      side: THREE.FrontSide,
      blending: THREE.AdditiveBlending,
    });
    this.shell = new THREE.Mesh(shellGeometry, shellMaterial);
    this.shell.renderOrder = 4;
    this.group.add(this.shell);
    this.disposables.push(shellGeometry, shellMaterial);

    /* 6 — bloom sprite */
    const glowTexture = createGlowTexture();
    const glowMaterial = new THREE.SpriteMaterial({
      map: glowTexture,
      color: PALETTE.cyan,
      transparent: true,
      opacity: 0.55,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
    });
    this.glow = new THREE.Sprite(glowMaterial);
    this.glow.scale.setScalar(0.9);
    this.glow.renderOrder = 0;
    this.group.add(this.glow);
    this.disposables.push(glowTexture, glowMaterial);

    /* core illumination */
    this.light = new THREE.PointLight(PALETTE.cyan, SCENE.coreLightIntensity, 9, 1.7);
    this.group.add(this.light);
  }

  /** @param energy 0..1 activation  @param warm 0..1 golden mode blend */
  update(dt: number, time: number, energy: number, warm: number, pulseTrigger: number): void {
    // Multi-frequency pulsing avoids an obvious sine loop.
    const breath =
      0.5 +
      0.28 * Math.sin(time * 1.15) +
      0.14 * Math.sin(time * 2.37 + 1.1) +
      0.08 * Math.sin(time * 0.61 + 2.4);

    this.pulse = damp(this.pulse, pulseTrigger, 6, dt);
    const intensity = breath * (0.55 + energy * 0.9) + this.pulse * 0.9;

    this.plasmaUniforms.uTime.value = time;
    this.plasmaUniforms.uPulse.value = intensity;
    this.plasmaUniforms.uWarm.value = warm;
    this.plasmaUniforms.uIntensity.value = 0.7 + energy * 0.75 + this.pulse * 0.7;

    this.shellUniforms.uTime.value = time;
    this.shellUniforms.uPulse.value = intensity * 0.6;
    this.shellUniforms.uWarm.value = warm;
    this.shellUniforms.uOpacity.value = 0.28 + energy * 0.3;

    this.rayUniforms.uTime.value = time;
    this.rayUniforms.uWarm.value = warm;
    this.rayUniforms.uEnergy.value = 0.25 + energy * 0.9 + this.pulse;
    this.rayUniforms.uOpacity.value = 0.22 + energy * 0.35;

    const plasmaScale = 1 + intensity * 0.06;
    this.plasma.scale.setScalar(plasmaScale);
    this.shell.scale.setScalar(1 + intensity * 0.025);

    this.ring.rotation.z += dt * (0.6 + energy * 1.8);
    this.ring.rotation.y += dt * 0.21;
    this.raySpin -= dt * (0.12 + energy * 0.4);

    const glowScale = lerp(0.85, 1.5, energy) * (1 + this.pulse * 0.3);
    this.glow.scale.setScalar(glowScale);
    const glowMaterial = this.glow.material as THREE.SpriteMaterial;
    glowMaterial.opacity = 0.32 + energy * 0.3;
    glowMaterial.color.copy(this.cyanColor).lerp(this.goldColor, warm);

    this.light.intensity = SCENE.coreLightIntensity * (0.55 + energy * 0.9 + this.pulse * 0.8);
    this.light.color.copy(this.cyanColor).lerp(this.goldColor, warm);
  }

  /**
   * Billboards the ray fan towards the viewer.
   * @param orientation camera orientation expressed in this group's parent space
   */
  faceCamera(orientation: THREE.Quaternion): void {
    this.rays.quaternion.copy(orientation);
    this.rays.rotateZ(this.raySpin);
  }

  dispose(): void {
    for (const item of this.disposables) item.dispose();
  }
}
