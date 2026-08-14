// ---------------------------------------------------------------------------
// Shared orb field.
//
// Both the particle cloud and the neural connection lines run this exact same
// displacement function, which is what keeps the lines glued to the particles
// they connect while all of the animation happens on the GPU.
// ---------------------------------------------------------------------------

uniform float uTime;
uniform float uFormation;     // 0 = scattered across the void, 1 = fully formed
uniform vec4  uModeWeights;   // neural, reactor, data, energy
uniform float uModeScanner;   // fifth weight, kept separate to stay within vec4
uniform vec4  uHandA;         // xyz = position in base space, w = strength
uniform vec4  uHandB;
uniform float uHandRadius;
uniform float uHandAttract;
uniform float uHandRepelRadius;
uniform float uHandRepel;
uniform float uContract;      // fist contraction, 0..1
uniform float uBurst;         // outward burst envelope, 0..1
uniform float uOrbScale;
uniform float uNoiseAmp;
uniform float uEnergy;        // overall activation, 0..1
uniform float uBreath;
uniform float uPulseSpeed;
uniform float uPulseWidth;
uniform float uPulseDecay;
uniform vec4  uPulses[PULSE_SLOTS]; // xyz = origin, w = start time

attribute vec3  aReactor;
attribute vec3  aData;
attribute vec3  aEnergy;
attribute vec3  aScanner;
attribute float aSeed;

#include "noise.glsl"

// --- orb field --------------------------------------------------------------

/** Weighted blend of the five procedural orb configurations. */
vec3 modeBlend(vec3 neuralBase) {
  return neuralBase * uModeWeights.x
       + aReactor   * uModeWeights.y
       + aData      * uModeWeights.z
       + aEnergy    * uModeWeights.w
       + aScanner   * uModeScanner;
}

/**
 * Expanding spherical wavefronts radiating from recent pulse origins.
 * This is what makes the network read as computationally alive.
 */
float pulseEnergy(vec3 p) {
  float total = 0.0;
  for (int i = 0; i < PULSE_SLOTS; i++) {
    vec4 pulse = uPulses[i];
    float age = uTime - pulse.w;
    if (age < 0.0 || age > 8.0) continue;
    float radius = age * uPulseSpeed;
    float d = distance(p, pulse.xyz);
    float band = (d - radius) / uPulseWidth;
    total += exp(-band * band) * exp(-age * uPulseDecay);
  }
  return total;
}

/** Attraction / short-range repulsion from one hand attractor. */
vec3 handForce(vec3 p, vec4 hand, inout float influence) {
  if (hand.w <= 0.001) return vec3(0.0);
  vec3 delta = hand.xyz - p;
  float dist = max(length(delta), 1e-4);
  vec3 dir = delta / dist;

  // Inverse-square falloff, clamped so particles never collapse onto the hand.
  float falloff = uHandRadius / (dist * dist + uHandRadius);
  float pull = falloff * smoothstep(uHandRadius * 2.0, 0.0, dist) * hand.w;
  float push = smoothstep(uHandRepelRadius, 0.0, dist) * hand.w;

  influence += pull;
  return dir * (pull * uHandAttract - push * uHandRepel);
}

/**
 * Full displacement pipeline for one node of the orb.
 * `influence` receives the hand proximity term and `pulse` the wavefront term,
 * both of which drive brightness downstream.
 */
vec3 orbDisplace(vec3 neuralBase, float seed, out float influence, out float pulse) {
  vec3 base = modeBlend(neuralBase);

  // Boot formation: particles stream inwards from the surrounding void.
  vec3 scatterDir = normalize(hash31(seed) * 2.0 - 1.0 + vec3(1e-4));
  vec3 scattered = scatterDir * (3.4 + hash11(seed * 7.31) * 7.0);
  float formation = smoothstep(0.0, 1.0, uFormation);
  base = mix(scattered, base, formation);

  vec3 radial = normalize(base + vec3(1e-5));
  vec3 p = base;

  // Organic breathing and drift.
  float n1 = snoise(base * 1.35 + vec3(0.0, uTime * 0.14, uTime * 0.06));
  float n2 = snoise(base * 3.10 - vec3(uTime * 0.21, 0.0, uTime * 0.10));
  float n3 = snoise(base * 3.10 + vec3(17.3, -8.1, 4.7));
  p += radial * (n1 * uNoiseAmp + uBreath * 0.05 * sin(uTime * 0.8 + seed * 6.2831));
  p += vec3(n2, n3, snoise(base * 3.10 - vec3(31.7, 5.2, -12.4))) * uNoiseAmp * 0.5;

  pulse = pulseEnergy(base);
  p += radial * pulse * 0.055;

  // Fist: everything is dragged towards the core.
  p = mix(p, radial * 0.34, uContract * 0.85);

  // Release: a radial shockwave with per-particle variation.
  p += radial * uBurst * (1.0 + hash11(seed * 3.77) * 1.35);

  influence = 0.0;
  p += handForce(p, uHandA, influence);
  p += handForce(p, uHandB, influence);
  influence = clamp(influence, 0.0, 1.6);

  return p * uOrbScale;
}
