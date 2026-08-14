precision highp float;

#include "noise.glsl"

// Soft atmospheric bloom sitting behind the core, giving the composition depth
// without resorting to a generic galaxy backdrop.

uniform float uTime;
uniform vec3  uColor;
uniform vec3  uWarmColor;
uniform float uWarm;
uniform float uOpacity;
uniform float uEnergy;

varying vec2 vUv;

void main() {
  vec2 p = vUv * 2.0 - 1.0;
  float r = length(p);

  float falloff = exp(-r * r * 2.6);
  float drift = snoise(vec3(p * 1.4, uTime * 0.05)) * 0.5 + 0.5;
  float veil = falloff * (0.55 + drift * 0.65);

  vec3 tint = mix(uColor, uWarmColor, uWarm);
  float alpha = clamp(veil * uOpacity * (0.7 + uEnergy * 0.6), 0.0, 1.0);
  gl_FragColor = vec4(tint * (0.5 + uEnergy * 0.5), alpha);
}
