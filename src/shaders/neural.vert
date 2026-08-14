#include "common.glsl"

attribute float aEnd;       // 0 at the first endpoint, 1 at the second
attribute float aStrength;  // per-connection base weight
attribute float aLineSeed;  // identical at both endpoints of a connection

varying float vEnergy;
varying float vProgress;
varying float vLineSeed;
varying float vStrength;
varying float vDepth;

void main() {
  float influence;
  float pulse;
  // Identical displacement to the particle shader, so every line endpoint sits
  // exactly on the node it belongs to.
  vec3 displaced = orbDisplace(position, aSeed, influence, pulse);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  float viewDepth = max(-mvPosition.z, 0.05);

  vEnergy = pulse * 1.35 + influence * 1.9 + uEnergy * 0.45;
  vProgress = aEnd;
  vLineSeed = aLineSeed;
  vStrength = aStrength;
  vDepth = clamp(1.3 - (viewDepth - 3.0) / 10.0, 0.2, 1.3);

  gl_Position = projectionMatrix * mvPosition;
}
