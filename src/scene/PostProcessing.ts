import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { QUALITY, type QualityTier } from '../config';
import { shaders } from '../shaders';
import { damp } from '../utils/MathUtils';

/**
 * Bloom plus a restrained final grade. The temptation with a scene like this is
 * to bury it in effects; everything here is deliberately dialled back so the
 * neural structure stays readable.
 */
export class PostProcessing {
  readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly composite: ShaderPass;
  private readonly renderPass: RenderPass;
  private enabled = true;
  private alert = 0;
  private alertTarget = 0;
  private bloomBase: number;
  private grainBase: number;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    tier: QualityTier,
    width: number,
    height: number,
  ) {
    const settings = QUALITY[tier];
    this.bloomBase = settings.bloomStrength;
    this.grainBase = settings.grain ? 0.045 : 0;

    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.bloom = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      settings.bloomStrength,
      settings.bloomRadius,
      0.62, // threshold: only genuinely hot pixels bloom
    );
    this.composer.addPass(this.bloom);

    this.composite = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uResolution: { value: new THREE.Vector2(width, height) },
        uAberration: { value: settings.chromaticAberration ? 0.0016 : 0 },
        uGrain: { value: settings.grain ? 0.045 : 0 },
        uVignette: { value: 0.85 },
        uScanline: { value: 0.018 },
        uAlert: { value: 0 },
      },
      vertexShader: shaders.composite.vert,
      fragmentShader: shaders.composite.frag,
    });
    this.composite.renderToScreen = true;
    this.composer.addPass(this.composite);
  }

  update(dt: number, time: number, energy: number): void {
    this.composite.uniforms.uTime.value = time;
    this.alert = damp(this.alert, this.alertTarget, 3, dt);
    this.composite.uniforms.uAlert.value = this.alert;
    // Bloom breathes gently with activation so power states read visually.
    this.bloom.strength = this.bloomBase * (0.85 + energy * 0.45);
  }

  setQuality(tier: QualityTier): void {
    const settings = QUALITY[tier];
    this.bloomBase = settings.bloomStrength;
    this.grainBase = settings.grain ? 0.045 : 0;
    this.bloom.radius = settings.bloomRadius;
    this.composite.uniforms.uAberration.value = settings.chromaticAberration ? 0.0016 : 0;
    this.composite.uniforms.uGrain.value = this.grainBase;
  }

  /** Amber wash used for warnings such as tracking loss. */
  setAlert(active: boolean): void {
    this.alertTarget = active ? 1 : 0;
  }

  setHighContrast(enabled: boolean): void {
    this.composite.uniforms.uVignette.value = enabled ? 0.35 : 0.85;
    this.composite.uniforms.uScanline.value = enabled ? 0 : 0.018;
    this.composite.uniforms.uGrain.value = enabled ? 0 : this.grainBase;
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.bloom.enabled = enabled;
    this.composite.enabled = enabled;
  }

  get isEnabled(): boolean {
    return this.enabled;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
    this.bloom.setSize(width, height);
    (this.composite.uniforms.uResolution.value as THREE.Vector2).set(width, height);
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.camera = camera;
  }

  render(): void {
    this.composer.render();
  }

  dispose(): void {
    this.composer.dispose();
    this.bloom.dispose();
  }
}
