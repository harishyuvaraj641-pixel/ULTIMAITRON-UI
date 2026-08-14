import * as THREE from 'three';
import { PALETTE, SCENE } from '../config';
import { Background } from './Background';
import { CameraRig } from './CameraRig';

/**
 * Owns the scene graph and its lighting. Almost all of the brightness in the
 * frame comes from emissive shaders; the lights exist so the core can spill a
 * little illumination onto nearby geometry.
 */
export class SceneManager {
  readonly scene = new THREE.Scene();
  readonly rig: CameraRig;
  readonly background: Background;

  private readonly ambient: THREE.AmbientLight;
  private readonly rimLight: THREE.PointLight;
  private readonly fillLight: THREE.PointLight;

  constructor(aspect: number, pixelRatio: number) {
    this.scene.background = new THREE.Color(PALETTE.background);
    this.scene.fog = new THREE.FogExp2(PALETTE.background, 0.012);

    this.rig = new CameraRig(aspect);
    this.scene.add(this.rig.camera);

    this.background = new Background(pixelRatio);
    this.scene.add(this.background.stars);
    // The haze rides with the camera so it always sits directly behind the orb.
    this.rig.camera.add(this.background.haze);

    this.ambient = new THREE.AmbientLight(PALETTE.iceBlue, SCENE.ambientIntensity);
    this.scene.add(this.ambient);

    this.rimLight = new THREE.PointLight(PALETTE.cyan, SCENE.rimLightIntensity, 22, 1.4);
    this.rimLight.position.set(-4.5, 2.8, -3.4);
    this.scene.add(this.rimLight);

    this.fillLight = new THREE.PointLight(PALETTE.iceBlue, SCENE.rimLightIntensity * 0.6, 20, 1.6);
    this.fillLight.position.set(4.2, -2.4, 3.0);
    this.scene.add(this.fillLight);
  }

  add(object: THREE.Object3D): void {
    this.scene.add(object);
  }

  update(dt: number, time: number, energy: number, warm: number): void {
    this.rig.update(dt);
    this.background.update(time, energy, warm);
    this.rimLight.intensity = SCENE.rimLightIntensity * (0.6 + energy * 0.7);
  }

  resize(width: number, height: number): void {
    this.rig.resize(width, height);
  }

  setPixelRatio(pixelRatio: number): void {
    this.background.setPixelRatio(pixelRatio);
  }

  dispose(): void {
    this.background.dispose();
  }
}
