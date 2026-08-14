precision highp float;

uniform vec3  uColor;
uniform vec3  uHotColor;
uniform vec3  uWarmColor;
uniform float uWarm;
uniform float uOpacity;
uniform float uEnergy;

varying float vFade;
varying float vSeed;
varying float vType;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  float glow = exp(-r * r * 20.0);
  // Inbound motes read hotter than the ambient drift.
  float hot = step(0.5, vType) * step(vType, 1.5);
  vec3 cool = mix(uColor, uHotColor, hot * 0.7 + fract(vSeed * 5.1) * 0.25);
  vec3 tint = mix(cool, uWarmColor, uWarm);

  float alpha = glow * vFade * uOpacity * (0.55 + uEnergy * 0.6);
  gl_FragColor = vec4(tint * (0.9 + uEnergy * 0.7), alpha);
}
