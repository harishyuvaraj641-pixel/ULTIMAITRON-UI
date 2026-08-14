import * as THREE from 'three';
import { ORB, PULSES, QUALITY, type QualityTier } from '../config';
import { clamp, clamp01, damp, lerp } from '../utils/MathUtils';
import { ParticleSystem } from './ParticleSystem';
import { NeuralNetwork } from './NeuralNetwork';
import { EnergyCore } from './EnergyCore';
import { OrbitalRings } from './OrbitalRings';
import { DataMotes } from './DataMotes';
import { createSharedOrbUniforms, type UniformMap } from './OrbUniforms';
import {
  buildOrbGeometry,
  modeWeights,
  ORB_MODES,
  ORB_MODE_PROFILE,
  type OrbMode,
  type OrbGeometryData,
} from './OrbModes';

const RIGHT_AXIS = new THREE.Vector3(1, 0, 0);

export interface OrbStats {
  particles: number;
  connections: number;
  motes: number;
}

/**
 * The complete neural core: particle cloud, synapse network, layered energy
 * core, orbital rings and data motes, plus the state machine that blends
 * between the five configurations and reacts to the hands.
 */
export class NeuralOrb {
  readonly group = new THREE.Group();
  readonly core: EnergyCore;
  readonly rings: OrbitalRings;

  private particles!: ParticleSystem;
  private network!: NeuralNetwork;
  private motes!: DataMotes;
  private geometryData!: OrbGeometryData;
  private shared: UniformMap = createSharedOrbUniforms();

  private tier: QualityTier;
  private pixelRatio: number;

  /** Blend weights in ORB_MODES order. */
  private weights = [1, 0, 0, 0, 0];
  private targetWeights = [1, 0, 0, 0, 0];
  private currentMode: OrbMode = 'NEURAL';

  private energy = 0.22;
  private energyTarget = 0.22;
  private warm = 0;
  private warmTarget = 0;
  private scale = 1;
  private scaleTarget = 1;
  private contract = 0;
  private contractTarget = 0;
  private formation = 0;
  private formationTarget = 0;
  private burstTimer = -1;
  private pulseSlot = 0;
  private idlePulseTimer = PULSES.idleInterval * 0.5;
  private corePulse = 0;

  private angularVelocity = new THREE.Vector2();
  private spinPhase = 0;
  private reducedMotion = false;

  private readonly handWorld: Array<THREE.Vector3 | null> = [null, null];
  private readonly handStrength = [0, 0];
  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();
  private readonly tmpQuat2 = new THREE.Quaternion();

  constructor(tier: QualityTier, pixelRatio: number) {
    this.tier = tier;
    this.pixelRatio = pixelRatio;
    this.group.name = 'neural-orb';
    this.group.scale.setScalar(ORB.radius);

    this.core = new EnergyCore();
    this.rings = new OrbitalRings();
    this.group.add(this.core.group);
    this.group.add(this.rings.group);

    this.buildSystems();
  }

  /* ------------------------------------------------------------------ */
  /* construction                                                        */
  /* ------------------------------------------------------------------ */

  private buildSystems(): void {
    const settings = QUALITY[this.tier];
    this.geometryData = buildOrbGeometry(settings.particles);

    this.particles = new ParticleSystem(this.geometryData, this.shared, this.pixelRatio);
    this.network = new NeuralNetwork(this.geometryData, this.shared, settings.connections);
    this.motes = new DataMotes(settings.motes, this.pixelRatio);

    this.group.add(this.particles.points);
    this.group.add(this.network.lines);
    this.group.add(this.motes.points);
  }

  /** Rebuilds the particle systems at a new quality tier, preserving state. */
  setQuality(tier: QualityTier): void {
    if (tier === this.tier) return;
    this.tier = tier;

    this.group.remove(this.particles.points);
    this.group.remove(this.network.lines);
    this.group.remove(this.motes.points);
    this.particles.dispose();
    this.network.dispose();
    this.motes.dispose();

    this.buildSystems();
  }

  setPixelRatio(pixelRatio: number): void {
    this.pixelRatio = pixelRatio;
    this.particles.setPixelRatio(pixelRatio);
    this.motes.setPixelRatio(pixelRatio);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
  }

  get stats(): OrbStats {
    return {
      particles: this.geometryData.count,
      connections: this.network.connectionCount,
      motes: QUALITY[this.tier].motes,
    };
  }

  get mode(): OrbMode {
    return this.currentMode;
  }

  get activation(): number {
    return this.energy;
  }

  /** 0 = cyan, 1 = golden energy mode. */
  get warmth(): number {
    return this.warm;
  }

  get currentScale(): number {
    return this.scale;
  }

  /* ------------------------------------------------------------------ */
  /* drive API                                                           */
  /* ------------------------------------------------------------------ */

  /** @param world world-space attractor position, or null to release the hand */
  setHand(index: 0 | 1, world: THREE.Vector3 | null, strength = 1): void {
    this.handWorld[index] = world;
    this.handStrength[index] = world ? clamp01(strength) : 0;
  }

  setEnergyTarget(value: number): void {
    this.energyTarget = clamp01(value);
  }

  setWarmTarget(value: number): void {
    this.warmTarget = clamp01(value);
  }

  setScaleTarget(value: number): void {
    this.scaleTarget = clamp(value, ORB.minScale, ORB.maxScale);
  }

  nudgeScale(delta: number): void {
    this.setScaleTarget(this.scaleTarget + delta);
  }

  get scaleTargetValue(): number {
    return this.scaleTarget;
  }

  /** Adds angular velocity, in radians/second, from a drag-like gesture. */
  applyRotation(deltaYaw: number, deltaPitch: number): void {
    this.angularVelocity.x += deltaPitch;
    this.angularVelocity.y += deltaYaw;
  }

  setContract(value: number): void {
    this.contractTarget = clamp01(value);
  }

  triggerBurst(): void {
    if (this.burstTimer >= 0 && this.burstTimer < ORB.burstDuration * 0.35) return;
    this.burstTimer = 0;
    this.firePulse();
    this.corePulse = 1;
  }

  setMode(mode: OrbMode): void {
    if (mode === this.currentMode) return;
    this.currentMode = mode;
    this.targetWeights = modeWeights(mode);
  }

  cycleMode(direction: number): OrbMode {
    const index = ORB_MODES.indexOf(this.currentMode);
    const next = ORB_MODES[(index + direction + ORB_MODES.length) % ORB_MODES.length];
    this.setMode(next);
    return next;
  }

  /** Fires an energy wavefront through the network from `origin` (base space). */
  firePulse(origin?: THREE.Vector3): void {
    const pulses = this.shared.uPulses.value as THREE.Vector4[];
    const slot = pulses[this.pulseSlot % pulses.length];
    this.pulseSlot++;
    if (origin) slot.set(origin.x, origin.y, origin.z, this.shared.uTime.value as number);
    else slot.set(0, 0, 0, this.shared.uTime.value as number);
    this.corePulse = Math.max(this.corePulse, 0.75);
  }

  /** Begins the boot formation: particles stream in from the surrounding void. */
  startFormation(): void {
    this.formation = 0;
    this.formationTarget = 1;
  }

  /** Skips the formation animation (used by the reduced-motion path). */
  completeFormation(): void {
    this.formation = 1;
    this.formationTarget = 1;
  }

  get formationProgress(): number {
    return this.formation;
  }

  resetOrientation(): void {
    this.group.quaternion.identity();
    this.angularVelocity.set(0, 0);
    this.scaleTarget = 1;
    this.setMode('NEURAL');
    this.contractTarget = 0;
  }

  /* ------------------------------------------------------------------ */
  /* frame update                                                        */
  /* ------------------------------------------------------------------ */

  update(dt: number, elapsed: number, camera: THREE.Camera): void {
    const shared = this.shared;
    shared.uTime.value = elapsed;

    /* --- mode blending ---------------------------------------------- */
    const blendRate = 1 / Math.max(0.05, ORB.modeBlendSeconds);
    let weightSum = 0;
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = damp(this.weights[i], this.targetWeights[i], blendRate * 4, dt);
      weightSum += this.weights[i];
    }
    if (weightSum > 0) {
      for (let i = 0; i < this.weights.length; i++) this.weights[i] /= weightSum;
    }

    let lineOpacity = 0;
    let noiseScale = 0;
    let profileWarm = 0;
    let spin = 0;
    let particleBoost = 0;
    for (let i = 0; i < ORB_MODES.length; i++) {
      const profile = ORB_MODE_PROFILE[ORB_MODES[i]];
      const w = this.weights[i];
      lineOpacity += profile.lineOpacity * w;
      noiseScale += profile.noiseAmp * w;
      profileWarm += profile.warm * w;
      spin += profile.spin * w;
      particleBoost += profile.particleBoost * w;
    }

    (shared.uModeWeights.value as THREE.Vector4).set(
      this.weights[0], this.weights[1], this.weights[2], this.weights[3],
    );
    shared.uModeScanner.value = this.weights[4];

    /* --- envelopes ---------------------------------------------------- */
    this.energy = damp(this.energy, this.energyTarget, 3.4, dt);
    this.warm = damp(this.warm, Math.max(this.warmTarget, profileWarm), 2.6, dt);
    this.scale = damp(this.scale, this.scaleTarget, ORB.scaleDamping, dt);
    this.contract = damp(this.contract, this.contractTarget, ORB.contractDamping, dt);
    // Linear so the boot sequence takes exactly ORB.formationSeconds.
    const formationStep = dt / Math.max(0.05, ORB.formationSeconds);
    this.formation = clamp01(
      this.formation + Math.sign(this.formationTarget - this.formation) * formationStep,
    );
    this.corePulse = Math.max(0, this.corePulse - dt * 1.8);

    let burst = 0;
    if (this.burstTimer >= 0) {
      this.burstTimer += dt;
      const p = this.burstTimer / ORB.burstDuration;
      if (p >= 1) {
        this.burstTimer = -1;
      } else {
        const attack = clamp01(p / 0.09);
        const decay = Math.exp(-p * 3.4);
        burst = attack * decay * ORB.burstDistance;
      }
    }

    /* --- rotation ------------------------------------------------------ */
    this.spinPhase += dt;
    const idleSpin = this.reducedMotion ? 0 : ORB.idleSpin * spin;
    this.angularVelocity.multiplyScalar(Math.pow(ORB.rotationFriction, dt * 60));
    if (this.angularVelocity.lengthSq() < 1e-8) this.angularVelocity.set(0, 0);

    const yaw = this.angularVelocity.y * dt + idleSpin * dt;
    const pitch = this.angularVelocity.x * dt + Math.sin(this.spinPhase * 0.21) * dt * 0.012;

    this.tmpQuat.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, yaw);
    this.group.quaternion.premultiply(this.tmpQuat);
    this.tmpQuat.setFromAxisAngle(RIGHT_AXIS, pitch);
    this.group.quaternion.premultiply(this.tmpQuat);

    this.group.updateMatrixWorld(true);

    /* --- hand attractors ---------------------------------------------- */
    // Attractors are authored in world space but consumed in the orb's base
    // space, so they are transformed here once per frame per hand.
    for (let i = 0; i < 2; i++) {
      const target = shared[i === 0 ? 'uHandA' : 'uHandB'].value as THREE.Vector4;
      const world = this.handWorld[i];
      if (!world) {
        target.set(0, 0, 0, 0);
        continue;
      }
      this.tmpVec.copy(world);
      this.group.worldToLocal(this.tmpVec);
      const orbScale = Math.max(0.001, this.scale);
      target.set(
        this.tmpVec.x / orbScale,
        this.tmpVec.y / orbScale,
        this.tmpVec.z / orbScale,
        this.handStrength[i],
      );
    }

    /* --- shared uniforms ---------------------------------------------- */
    shared.uFormation.value = this.formation;
    shared.uContract.value = this.contract;
    shared.uBurst.value = burst;
    shared.uOrbScale.value = this.scale;
    shared.uEnergy.value = this.energy;
    shared.uNoiseAmp.value = ORB.noiseAmplitude * noiseScale * (this.reducedMotion ? 0.35 : 1);
    shared.uBreath.value = this.reducedMotion ? 0.2 : 1;

    /* --- per-system uniforms ------------------------------------------ */
    this.particles.uniforms.uWarm.value = this.warm;
    this.particles.uniforms.uPointBoost.value = particleBoost;
    this.particles.uniforms.uOpacity.value = lerp(0.35, 1, this.formation);

    this.network.uniforms.uWarm.value = this.warm;
    this.network.uniforms.uOpacity.value = lineOpacity * lerp(0.1, 0.55, this.formation) * 1.6;
    this.network.uniforms.uTravelSpeed.value = this.reducedMotion ? 0.12 : 0.42 + this.energy * 0.5;

    /* --- idle pulses ---------------------------------------------------- */
    this.idlePulseTimer -= dt;
    if (this.idlePulseTimer <= 0 && this.formation > 0.75) {
      this.idlePulseTimer = PULSES.idleInterval * (0.5 + Math.random());
      // Originate from a random node so the wavefront is never centred twice.
      const index = (Math.random() * this.geometryData.count) | 0;
      this.tmpVec.set(
        this.geometryData.neural[index * 3],
        this.geometryData.neural[index * 3 + 1],
        this.geometryData.neural[index * 3 + 2],
      );
      this.firePulse(this.tmpVec);
    }

    /* --- sub-systems ---------------------------------------------------- */
    const handActivity = Math.max(this.handStrength[0], this.handStrength[1]);
    this.core.update(dt, elapsed, this.energy, this.warm, this.corePulse);
    this.tmpQuat2.copy(this.group.quaternion).invert().multiply(camera.quaternion);
    this.core.faceCamera(this.tmpQuat2);
    this.rings.update(dt, elapsed, this.energy, this.warm, handActivity);
    this.motes.update(elapsed, this.energy, this.warm, this.scale);

    // The core scales a little with the cloud but stays legible when expanded.
    const coreScale = lerp(1, this.scale, 0.55) * (1 - this.contract * 0.25);
    this.core.group.scale.setScalar(coreScale);
    this.rings.group.scale.setScalar(lerp(1, this.scale, 0.8));
  }

  dispose(): void {
    this.particles.dispose();
    this.network.dispose();
    this.motes.dispose();
    this.core.dispose();
    this.rings.dispose();
  }
}
