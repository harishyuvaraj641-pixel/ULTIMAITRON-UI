import * as THREE from 'three';
import { ORB, PULSES } from '../config';

export type UniformMap = Record<string, THREE.IUniform>;

/**
 * Uniforms shared by the particle cloud and the neural connection lines.
 * The two materials reference the *same* uniform objects, so one write per
 * frame updates both — and the two systems can never drift out of sync.
 */
export function createSharedOrbUniforms(): UniformMap {
  const pulses: THREE.Vector4[] = [];
  for (let i = 0; i < PULSES.slots; i++) {
    // w = -1000 keeps the slot inert until it is fired.
    pulses.push(new THREE.Vector4(0, 0, 0, -1000));
  }

  return {
    uTime: { value: 0 },
    uFormation: { value: 0 },
    uModeWeights: { value: new THREE.Vector4(1, 0, 0, 0) },
    uModeScanner: { value: 0 },
    uHandA: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHandB: { value: new THREE.Vector4(0, 0, 0, 0) },
    uHandRadius: { value: ORB.handInfluenceRadius },
    uHandAttract: { value: ORB.handAttraction },
    uHandRepelRadius: { value: ORB.handRepulsionRadius },
    uHandRepel: { value: ORB.handRepulsion },
    uContract: { value: 0 },
    uBurst: { value: 0 },
    uOrbScale: { value: 1 },
    uNoiseAmp: { value: ORB.noiseAmplitude },
    uEnergy: { value: 0.25 },
    uBreath: { value: 1 },
    uPulseSpeed: { value: PULSES.speed },
    uPulseWidth: { value: PULSES.width },
    uPulseDecay: { value: PULSES.decay },
    uPulses: { value: pulses },
  };
}

/** Common `defines` block required by shaders that include common.glsl. */
export const ORB_SHADER_DEFINES = {
  PULSE_SLOTS: PULSES.slots,
} as const;
