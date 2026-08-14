precision highp float;

uniform vec3 uColorCore;   // hot centre
uniform vec3 uColorMid;    // body of the cloud
uniform vec3 uColorEdge;   // outermost, coolest nodes
uniform float uWarm;       // 0 = cyan mode, 1 = golden energy mode
uniform vec3 uWarmCore;
uniform vec3 uWarmMid;
uniform float uOpacity;

varying float vEnergy;
varying float vLayer;
varying float vSeed;
varying float vDepth;

void main() {
  // Soft circular falloff: bright centre, transparent rim. No hard squares.
  vec2 uv = gl_PointCoord - vec2(0.5);
  float r = length(uv);
  if (r > 0.5) discard;

  float glow = exp(-r * r * 13.0);
  float core = exp(-r * r * 64.0);
  float alpha = (glow * 0.75 + core * 0.85) * uOpacity;

  vec3 cool = mix(uColorEdge, uColorMid, vLayer);
  cool = mix(cool, uColorCore, clamp(vEnergy - 0.55, 0.0, 1.0));

  vec3 warm = mix(uWarmMid, uWarmCore, clamp(vEnergy - 0.35, 0.0, 1.0));
  vec3 tint = mix(cool, warm, uWarm);

  // The hottest nodes bleach towards white so bloom picks them up.
  tint = mix(tint, vec3(1.0), clamp(vEnergy - 1.25, 0.0, 0.65));

  float intensity = clamp(vEnergy, 0.0, 3.2) * vDepth;
  gl_FragColor = vec4(tint * intensity, alpha * clamp(intensity, 0.0, 1.6));
}
