precision highp float;

uniform vec3  uColor;
uniform vec3  uHotColor;
uniform float uOpacity;

varying float vAge;
varying float vSeed;

void main() {
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  float glow = exp(-r * r * 18.0);
  float fade = pow(1.0 - vAge, 2.2);
  // Sparks cool from white-hot to the accent colour as they travel.
  vec3 tint = mix(uHotColor, uColor, clamp(vAge * 1.6, 0.0, 1.0));

  gl_FragColor = vec4(tint * (1.4 - vAge), glow * fade * uOpacity);
}
