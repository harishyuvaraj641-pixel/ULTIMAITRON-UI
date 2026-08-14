uniform float uTime;
uniform float uPixelRatio;

attribute float aSize;
attribute float aSeed;

varying float vTwinkle;
varying float vSeed;

void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  // Slow, uncorrelated twinkle so the field never pulses in unison.
  vTwinkle = 0.55 + 0.45 * sin(uTime * (0.25 + aSeed * 0.8) + aSeed * 53.1);
  vSeed = aSeed;
  gl_PointSize = aSize * uPixelRatio * (140.0 / max(-mvPosition.z, 1.0));
  gl_Position = projectionMatrix * mvPosition;
}
