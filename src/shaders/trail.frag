precision highp float;

uniform vec3 uColor;
uniform vec3 uHotColor;
uniform float uOpacity;

varying float vAge;
varying float vCharge;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  float glow = exp(-r * r * 16.0);
  float fade = pow(1.0 - vAge, 1.8);
  vec3 tint = mix(uColor, uHotColor, vCharge);

  gl_FragColor = vec4(tint * (0.8 + vCharge * 1.4), glow * fade * uOpacity);
}
