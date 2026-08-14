precision highp float;

uniform vec3 uColorA;
uniform vec3 uColorB;
uniform float uOpacity;

varying float vTwinkle;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  float glow = exp(-r * r * 22.0);
  vec3 tint = mix(uColorA, uColorB, fract(vSeed * 7.31));
  gl_FragColor = vec4(tint * vTwinkle * 1.1, glow * vTwinkle * uOpacity);
}
