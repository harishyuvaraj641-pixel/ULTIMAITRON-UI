#include "noise.glsl"

// Tiny data particles orbiting the core. Their entire trajectory is evaluated
// on the GPU from a handful of per-particle attributes, so the CPU does no work
// for them at all.

#define TAU 6.283185307179586

uniform float uTime;
uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uOrbScale;
uniform float uEnergy;

attribute float aType;    // 0 orbit, 1 inward, 2 outward, 3 drifting
attribute float aRadius;
attribute float aSpeed;
attribute float aPhase;
attribute float aLife;
attribute float aSize;
attribute float aTilt;
attribute float aSeed;

varying float vFade;
varying float vSeed;
varying float vType;

void main() {
  float local = fract((uTime + aPhase * aLife) / aLife);

  float radius = aRadius;
  float fade = 1.0;

  if (aType < 0.5) {
    // Orbit at a steady radius.
    fade = 1.0;
  } else if (aType < 1.5) {
    // Falls inwards, then respawns at the rim.
    radius = mix(aRadius, 0.28, local);
    fade = smoothstep(0.0, 0.12, local) * (1.0 - smoothstep(0.82, 1.0, local));
  } else if (aType < 2.5) {
    // Escapes outwards and dims as it goes.
    radius = mix(0.55, aRadius * 2.1, local);
    fade = smoothstep(0.0, 0.08, local) * (1.0 - smoothstep(0.55, 1.0, local));
  } else {
    // Slow radial breathing.
    radius = aRadius * (1.0 + 0.16 * sin(uTime * aSpeed + aPhase * TAU));
    fade = 0.75;
  }

  float angle = aPhase * TAU + uTime * aSpeed * (0.4 + uEnergy * 0.6);
  float height = sin(aTilt) * radius;
  float planar = cos(aTilt) * radius;

  vec3 pos = vec3(cos(angle) * planar, height, sin(angle) * planar);

  // A little noise so the motes never trace perfect circles.
  float wobble = snoise(vec3(pos * 0.9 + aSeed * 13.0));
  pos += normalize(pos + vec3(1e-5)) * wobble * 0.05;
  pos *= uOrbScale;

  vFade = fade;
  vSeed = aSeed;
  vType = aType;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  gl_PointSize = aSize * uPixelRatio * (uSizeScale / max(-mvPosition.z, 0.1));
  gl_Position = projectionMatrix * mvPosition;
}
