import * as THREE from 'three';
import { GESTURE, MAPPING, ORB } from '../config';
import { clamp, clamp01, damp, deadZone, mapRange } from '../utils/MathUtils';
import type { NeuralOrb } from '../orb/NeuralOrb';
import type { CameraRig } from '../scene/CameraRig';
import type { HandTrail } from '../effects/HandTrail';
import type { HolographicBeam } from '../effects/HolographicBeam';
import type { Reticle } from '../effects/Reticle';
import type { ScanArc } from '../effects/ScanArc';
import type { OrbitalNodes } from '../effects/OrbitalNodes';
import type { HandSkeleton } from '../effects/HandSkeleton';
import type { InputHand } from './InputTypes';
import type { SystemGesture } from './GestureStateMachine';
import { LANDMARK_COUNT } from '../vision/types';

export interface InteractionEffects {
  beams: HolographicBeam[];
  trails: HandTrail[];
  reticle: Reticle;
  scanArc: ScanArc;
  nodes: OrbitalNodes;
  skeleton: HandSkeleton;
}

export interface InteractionReadout {
  handCount: number;
  /** Distance from the primary hand to the orb surface, world units. */
  handToOrb: number;
  /** Separation between the two hands, normalised image units. */
  separation: number;
  energy: number;
  scale: number;
  cursorActive: boolean;
  locked: boolean;
}

const HAND_REFERENCE_SCALE = 0.13;

/**
 * Bridges gesture features to the 3D world.
 *
 * Everything here is smoothed and rate-limited: the orb should feel physically
 * connected to the hand, never snap to it. Raw landmark values are deliberately
 * never used directly.
 */
export class HandInteraction {
  private readonly worldPositions = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly tipPositions = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly pinchPositions = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly previousPinch = [new THREE.Vector3(), new THREE.Vector3()];
  private readonly initialised = [false, false];
  private readonly pinchWasActive = [false, false];
  private readonly skeletonPoints: THREE.Vector3[][] = [[], []];
  private readonly skeletonView: Array<THREE.Vector3[] | null> = [null, null];
  private readonly origin = new THREE.Vector3(0, 0, 0);
  private readonly tmp = new THREE.Vector3();

  private energyTarget = 0.22;
  private readout: InteractionReadout = {
    handCount: 0,
    handToOrb: 0,
    separation: 0,
    energy: 0.22,
    scale: 1,
    cursorActive: false,
    locked: false,
  };

  constructor(
    private readonly orb: NeuralOrb,
    private readonly rig: CameraRig,
    private readonly effects: InteractionEffects,
  ) {
    for (let slot = 0; slot < 2; slot++) {
      for (let i = 0; i < LANDMARK_COUNT; i++) this.skeletonPoints[slot].push(new THREE.Vector3());
    }
  }

  /**
   * Maps normalised camera coordinates into the holographic interaction volume.
   * @param nx 0..1 across the frame, @param ny 0..1 down the frame
   * @param handScale wrist-to-knuckle distance; the only usable depth cue
   */
  mapHandToWorld(nx: number, ny: number, handScale: number, out: THREE.Vector3): THREE.Vector3 {
    const x = (MAPPING.mirrorX ? 1 - nx : nx) - 0.5;
    const y = 0.5 - ny;
    // A hand that fills more of the frame is closer to the lens.
    const depth = MAPPING.DEPTH_OFFSET + (handScale - HAND_REFERENCE_SCALE) * MAPPING.DEPTH_SCALE;
    out.set(x * MAPPING.WORLD_WIDTH, y * MAPPING.WORLD_HEIGHT, clamp(depth, -1.2, 2.6));
    return out;
  }

  update(
    dt: number,
    time: number,
    hands: readonly InputHand[],
    systemGesture: SystemGesture,
    cameraQuaternion: THREE.Quaternion,
  ): InteractionReadout {
    let activeCount = 0;
    let primary: InputHand | null = null;
    let pinchTarget: THREE.Vector3 | null = null;
    let cursor: THREE.Vector3 | null = null;
    let cursorPinching = false;

    for (let slot = 0; slot < 2; slot++) {
      const hand = hands[slot];
      const beam = this.effects.beams[slot];
      const trail = this.effects.trails[slot];

      if (!hand || !hand.active || hand.confidence < GESTURE.confidenceThreshold) {
        this.orb.setHand(slot as 0 | 1, null);
        beam.setActive(false);
        this.initialised[slot] = false;
        this.pinchWasActive[slot] = false;
        this.skeletonView[slot] = null;
        continue;
      }

      activeCount++;
      if (!primary || hand.confidence > primary.confidence) primary = hand;

      /* --- world mapping ------------------------------------------------ */
      const world = this.worldPositions[slot];
      this.mapHandToWorld(hand.palm.x, hand.palm.y, hand.handScale, this.tmp);
      if (!this.initialised[slot]) {
        world.copy(this.tmp);
        this.initialised[slot] = true;
      } else {
        world.x = damp(world.x, this.tmp.x, MAPPING.SMOOTHING_FACTOR, dt);
        world.y = damp(world.y, this.tmp.y, MAPPING.SMOOTHING_FACTOR, dt);
        world.z = damp(world.z, this.tmp.z, MAPPING.SMOOTHING_FACTOR, dt);
      }

      const tip = this.tipPositions[slot];
      this.mapHandToWorld(hand.indexTip.x, hand.indexTip.y, hand.handScale, this.tmp);
      tip.x = damp(tip.x, this.tmp.x, MAPPING.SMOOTHING_FACTOR * 1.3, dt);
      tip.y = damp(tip.y, this.tmp.y, MAPPING.SMOOTHING_FACTOR * 1.3, dt);
      tip.z = damp(tip.z, this.tmp.z, MAPPING.SMOOTHING_FACTOR * 1.3, dt);

      const pinchPoint = this.pinchPositions[slot];
      this.mapHandToWorld(hand.pinchPoint.x, hand.pinchPoint.y, hand.handScale, this.tmp);
      pinchPoint.x = damp(pinchPoint.x, this.tmp.x, MAPPING.SMOOTHING_FACTOR * 1.2, dt);
      pinchPoint.y = damp(pinchPoint.y, this.tmp.y, MAPPING.SMOOTHING_FACTOR * 1.2, dt);
      pinchPoint.z = damp(pinchPoint.z, this.tmp.z, MAPPING.SMOOTHING_FACTOR * 1.2, dt);

      /* --- attractor ----------------------------------------------------- */
      // Strength falls off with distance so a hand at the edge of frame does
      // not yank the whole cloud towards it.
      const distance = world.length();
      const proximity = clamp01(mapRange(distance, ORB.radius * 2.6, ORB.radius * 0.6, 0, 1));
      const strength = hand.confidence * (0.35 + proximity * 0.65);
      this.orb.setHand(slot as 0 | 1, world, strength);

      /* --- pinch: rotate the orb ------------------------------------------ */
      if (hand.pinching) {
        if (this.pinchWasActive[slot]) {
          const dx = deadZone(pinchPoint.x - this.previousPinch[slot].x, GESTURE.motionDeadZone);
          const dy = deadZone(pinchPoint.y - this.previousPinch[slot].y, GESTURE.motionDeadZone);
          // Hand right -> orb yaws right; hand up -> orb tilts up.
          this.orb.applyRotation(dx * ORB.pinchRotationGain, -dy * ORB.pinchRotationGain);
        }
        this.previousPinch[slot].copy(pinchPoint);
        this.pinchWasActive[slot] = true;

        beam.setEndpoints(pinchPoint, this.origin);
        beam.setActive(true);
        pinchTarget = pinchPoint;
      } else {
        this.pinchWasActive[slot] = false;
        beam.setActive(false);
      }

      /* --- trail ---------------------------------------------------------- */
      const worldSpeed = hand.speed * MAPPING.WORLD_WIDTH * 0.5;
      trail.emit(world, worldSpeed, hand.pinching ? 1 : 0, time);

      /* --- pointing cursor -------------------------------------------------- */
      if (hand.gesture === 'POINT' || hand.gesture === 'PINCH') {
        if (!cursor || hand === primary) {
          cursor = tip;
          cursorPinching = hand.pinching;
        }
      }

      /* --- debug skeleton ---------------------------------------------------- */
      if (this.effects.skeleton.visible && hand.landmarks && hand.landmarks.length >= LANDMARK_COUNT) {
        const points = this.skeletonPoints[slot];
        for (let i = 0; i < LANDMARK_COUNT; i++) {
          const landmark = hand.landmarks[i];
          this.mapHandToWorld(landmark.x, landmark.y, hand.handScale, points[i]);
          // Spread the joints apart in depth using the model's relative z.
          points[i].z += -landmark.z * 2.4;
        }
        this.skeletonView[slot] = points;
      } else {
        this.skeletonView[slot] = null;
      }
    }

    /* --- two-hand control ---------------------------------------------- */
    const handA = hands[0];
    const handB = hands[1];
    let separation = 0;

    if (
      activeCount >= 2 && handA && handB &&
      handA.confidence >= GESTURE.confidenceThreshold &&
      handB.confidence >= GESTURE.confidenceThreshold
    ) {
      separation = Math.hypot(handA.palm.x - handB.palm.x, handA.palm.y - handB.palm.y);
      const targetScale = mapRange(
        separation,
        GESTURE.twoHandMinSeparation,
        GESTURE.twoHandMaxSeparation,
        ORB.minScale,
        ORB.maxScale,
      );
      this.orb.setScaleTarget(targetScale);

      // Asymmetric roles: the left hand steers, the right hand modulates power.
      const left = handA.label === 'Left' ? handA : handB;
      const right = left === handA ? handB : handA;
      this.orb.applyRotation(deadZone(left.velocity.x, 0.05) * -0.55, 0);
      this.energyTarget = clamp01(0.45 + (1 - right.palm.y) * 0.55);
    } else {
      this.energyTarget = this.energyForGesture(systemGesture, activeCount);
    }

    this.orb.setEnergyTarget(this.energyTarget);

    /* --- camera parallax -------------------------------------------------- */
    if (primary) {
      const px = (MAPPING.mirrorX ? 1 - primary.palm.x : primary.palm.x) * 2 - 1;
      const py = 1 - primary.palm.y * 2;
      this.rig.setParallax(px * 0.5, py * 0.4);
    } else {
      this.rig.setParallax(0, 0);
    }

    /* --- effects ----------------------------------------------------------- */
    const handPresence = clamp01(activeCount > 0 ? 1 : 0);
    this.effects.reticle.setActive(cursor !== null);
    this.effects.reticle.setLocked(this.effects.nodes.hoveredNode !== null || cursorPinching);
    this.effects.reticle.update(dt, time, cursor ?? this.origin, cameraQuaternion);
    this.effects.scanArc.update(
      dt, time, this.orb.activation, handPresence, pinchTarget, cameraQuaternion,
    );
    this.effects.nodes.update(dt, time, cursor, cursorPinching, cameraQuaternion);
    this.effects.skeleton.update(this.skeletonView);

    for (let slot = 0; slot < 2; slot++) {
      this.effects.beams[slot].update(dt, time);
      this.effects.trails[slot].update(time);
    }

    /* --- readout ------------------------------------------------------------ */
    this.readout.handCount = activeCount;
    this.readout.handToOrb = primary
      ? Math.max(0, this.worldPositions[primary.slot].length() - ORB.radius * this.orb.currentScale)
      : 0;
    this.readout.separation = separation;
    this.readout.energy = this.orb.activation;
    this.readout.scale = this.orb.currentScale;
    this.readout.cursorActive = cursor !== null;
    this.readout.locked = this.effects.scanArc.locked;
    return this.readout;
  }

  private energyForGesture(gesture: SystemGesture, activeCount: number): number {
    if (activeCount === 0) return 0.22;
    switch (gesture) {
      case 'OPEN_PALM':
        return 0.98;
      case 'FIST':
        return 0.88;
      case 'PINCHING':
        return 0.72;
      case 'POINTING':
        return 0.6;
      case 'TWO_HAND':
        return 0.8;
      default:
        return 0.5;
    }
  }

  /** World position of a tracked hand, for effects that need it. */
  worldPosition(slot: 0 | 1): THREE.Vector3 {
    return this.worldPositions[slot];
  }

  reset(): void {
    for (let slot = 0; slot < 2; slot++) {
      this.initialised[slot] = false;
      this.pinchWasActive[slot] = false;
      this.effects.beams[slot].setActive(false);
      this.effects.trails[slot].clear();
      this.orb.setHand(slot as 0 | 1, null);
    }
  }
}
