precision highp float;

#include "noise.glsl"

// Holographic filament drawn between a fingertip and the core.
// v runs 0 -> 1 along the length of the beam.

uniform float uTime;
uniform vec3  uColor;
uniform vec3  uWarmColor;
uniform float uWarm;
uniform float uOpacity;
uniform float uFlowSpeed;
uniform float uSeed;

varying vec2 vUv;
varying vec3 vNormalView;
varying vec3 vViewDir;

void main() {
  float along = vUv.y;

  // Edge-on parts of the tube glow brighter, so it reads as a volume.
  float rim = 1.0 - abs(dot(normalize(vNormalView), normalize(vViewDir)));
  rim = pow(clamp(rim, 0.0, 1.0), 1.6);

  // Turbulent filament rather than a clean cylinder.
  float wobble = snoise(vec3(vUv.x * 3.0, along * 6.0 - uTime * uFlowSpeed, uSeed)) * 0.5 + 0.5;

  // Charge packets running from the hand to the core.
  float packets = 0.0;
  for (int i = 0; i < 3; i++) {
    float phase = fract(uTime * uFlowSpeed * (0.5 + float(i) * 0.17) + uSeed + float(i) * 0.37);
    float d = along - phase;
    packets += exp(-(d * d) / 0.0035);
  }

  // Both ends fade out so the beam attaches softly.
  float ends = smoothstep(0.0, 0.12, along) * (1.0 - smoothstep(0.86, 1.0, along));

  float intensity = (0.35 + wobble * 0.5) * rim + packets * 0.9;
  vec3 tint = mix(uColor, uWarmColor, uWarm);

  float alpha = clamp(intensity * ends * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(tint * (0.6 + intensity * 1.6), alpha);
}
