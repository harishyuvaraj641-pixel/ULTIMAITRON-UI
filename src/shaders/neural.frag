precision highp float;

uniform vec3  uColorLine;
uniform vec3  uColorHot;
uniform vec3  uWarmLine;
uniform vec3  uWarmHot;
uniform float uWarm;
uniform float uOpacity;
uniform float uTravelSpeed;
uniform float uTime;

varying float vEnergy;
varying float vProgress;
varying float vLineSeed;
varying float vStrength;
varying float vDepth;

void main() {
  // A bright head runs from one endpoint to the other, like an action potential
  // travelling down an axon. Each connection has its own phase and rate.
  float rate = 0.45 + fract(vLineSeed * 3.17) * 0.9;
  float head = fract(uTime * uTravelSpeed * rate + vLineSeed);
  float d = vProgress - head;
  float travel = exp(-(d * d) / 0.012);

  // Only a fraction of the network carries a visible impulse at any moment.
  float impulse = step(0.55, fract(vLineSeed * 91.7 + floor(uTime * uTravelSpeed * rate) * 0.618));
  travel *= impulse;

  float energy = vEnergy + travel * 0.9;
  float alpha = (uOpacity * vStrength * (0.35 + energy * 1.5)) * vDepth;

  vec3 cool = mix(uColorLine, uColorHot, clamp(energy, 0.0, 1.0));
  vec3 warm = mix(uWarmLine, uWarmHot, clamp(energy, 0.0, 1.0));
  vec3 tint = mix(cool, warm, uWarm);

  gl_FragColor = vec4(tint * (0.5 + energy * 1.4), clamp(alpha, 0.0, 1.0));
}
