#include "common.glsl"

uniform float uPixelRatio;
uniform float uSizeScale;
uniform float uPointBoost;

attribute float aSize;
attribute float aLayer;

varying float vEnergy;
varying float vLayer;
varying float vSeed;
varying float vDepth;

void main() {
  float influence;
  float pulse;
  vec3 displaced = orbDisplace(position, aSeed, influence, pulse);

  vec4 mvPosition = modelViewMatrix * vec4(displaced, 1.0);
  float viewDepth = max(-mvPosition.z, 0.05);

  // Nodes further from the camera dim slightly, giving the cloud real volume.
  float depthFade = clamp(1.35 - (viewDepth - 3.0) / 9.0, 0.25, 1.35);

  float flicker = 0.84 + 0.16 * sin(uTime * (2.0 + hash11(aSeed) * 6.0) + aSeed * 41.7);
  float energy = (0.22 + uEnergy * 0.55) * flicker + pulse * 1.5 + influence * 1.7;

  vEnergy = energy;
  vLayer = aLayer;
  vSeed = aSeed;
  vDepth = depthFade;

  gl_PointSize =
      aSize * uPixelRatio * uPointBoost *
      (1.0 + influence * 1.4 + pulse * 0.9 + uEnergy * 0.25) *
      (uSizeScale / viewDepth) * depthFade;

  gl_Position = projectionMatrix * mvPosition;
}
