import * as THREE from 'three';
import { SCENE } from '../config';
import { clamp, damp } from '../utils/MathUtils';

/**
 * Cinematic camera. Follows hand or pointer movement with heavy damping so the
 * frame drifts rather than shakes, and never loses the core from the centre.
 */
export class CameraRig {
  readonly camera: THREE.PerspectiveCamera;

  private readonly target = new THREE.Vector3(0, 0, SCENE.cameraDistance);
  private readonly current = new THREE.Vector3(0, 0, SCENE.cameraDistance);
  private readonly lookAt = new THREE.Vector3(0, 0, 0);
  private parallaxX = 0;
  private parallaxY = 0;
  private breathPhase = 0;
  private reducedMotion = false;
  private distance: number = SCENE.cameraDistance;

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(SCENE.fov, aspect, SCENE.near, SCENE.far);
    this.camera.position.copy(this.current);
    this.camera.lookAt(this.lookAt);
  }

  /** @param x normalised -1..1  @param y normalised -1..1 */
  setParallax(x: number, y: number): void {
    this.parallaxX = clamp(x, -1, 1);
    this.parallaxY = clamp(y, -1, 1);
  }

  setDistance(distance: number): void {
    this.distance = clamp(distance, 3.2, 14);
  }

  nudgeDistance(delta: number): void {
    this.setDistance(this.distance + delta);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  update(dt: number): void {
    this.breathPhase += dt;

    const amount = this.reducedMotion ? 0 : SCENE.parallax;
    // A slow figure-of-eight drift keeps the shot alive when nothing moves.
    const driftX = this.reducedMotion ? 0 : Math.sin(this.breathPhase * 0.17) * 0.06;
    const driftY = this.reducedMotion ? 0 : Math.sin(this.breathPhase * 0.23 + 1.7) * 0.04;

    this.target.set(
      this.parallaxX * amount + driftX,
      this.parallaxY * amount * 0.7 + driftY,
      this.distance,
    );

    this.current.x = damp(this.current.x, this.target.x, SCENE.parallaxDamping, dt);
    this.current.y = damp(this.current.y, this.target.y, SCENE.parallaxDamping, dt);
    this.current.z = damp(this.current.z, this.target.z, SCENE.parallaxDamping * 1.4, dt);

    this.camera.position.copy(this.current);
    this.camera.lookAt(this.lookAt);
  }

  resize(width: number, height: number): void {
    this.camera.aspect = width / height;
    // Widen the field of view on narrow screens so the orb still fits.
    const portrait = height > width;
    this.camera.fov = portrait ? SCENE.fov * 1.35 : SCENE.fov;
    this.camera.updateProjectionMatrix();
  }

  get currentDistance(): number {
    return this.distance;
  }
}
