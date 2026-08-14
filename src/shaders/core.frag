precision highp float;

#include "noise.glsl"

uniform float uTime;
uniform vec3  uColorA;
uniform vec3  uColorB;
uniform vec3  uWarmA;
uniform vec3  uWarmB;
uniform float uWarm;
uniform float uIntensity;
uniform float uOpacity;
uniform float uFresnelPower;
uniform float uFresnelBoost;
uniform float uNoiseScale;
uniform float uFlow;
uniform float uPulse;

varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec3 vLocal;

void main() {
  vec3 n = normalize(vNormalView);
  vec3 v = normalize(vViewDir);
  float fresnel = pow(1.0 - clamp(dot(n, v), 0.0, 1.0), uFresnelPower);

  // Layered plasma. Two octaves at different speeds avoid an obvious loop.
  vec3 q = vLocal * uNoiseScale;
  float n1 = snoise(q + vec3(0.0, uTime * uFlow, uTime * uFlow * 0.6));
  float n2 = snoise(q * 2.13 - vec3(uTime * uFlow * 0.8, 0.0, uTime * uFlow * 0.35));
  float n3 = snoise(q * 4.31 + vec3(uTime * uFlow * 0.45, -uTime * uFlow * 0.2, 0.0));
  float plasma = n1 * 0.55 + n2 * 0.3 + n3 * 0.15;
  plasma = plasma * 0.5 + 0.5;

  float body = mix(plasma, 1.0, fresnel * uFresnelBoost);
  vec3 cool = mix(uColorA, uColorB, clamp(body, 0.0, 1.0));
  vec3 warm = mix(uWarmA, uWarmB, clamp(body, 0.0, 1.0));
  vec3 tint = mix(cool, warm, uWarm);

  float intensity = uIntensity * (0.72 + uPulse * 0.55) * (0.45 + body);
  float alpha = clamp((fresnel * 0.85 + plasma * 0.5) * uOpacity, 0.0, 1.0);

  gl_FragColor = vec4(tint * intensity, alpha);
}
