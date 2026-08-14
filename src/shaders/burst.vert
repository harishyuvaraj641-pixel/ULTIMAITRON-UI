uniform float uTime;
uniform float uPixelRatio;
uniform float uSizeScale;

attribute vec3  aVelocity;
attribute float aBirth;
attribute float aLife;
attribute float aSize;

varying float vAge;
varying float vSeed;

void main() {
  float age = (uTime - aBirth) / max(aLife, 0.001);
  vAge = clamp(age, 0.0, 1.0);
  vSeed = aSize;

  // Ballistic spark with drag, so the shell decelerates as it expands.
  float drag = 1.0 - exp(-vAge * 2.6);
  vec3 pos = position + aVelocity * drag * aLife;

  vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
  float fade = 1.0 - vAge;
  gl_PointSize = aSize * uPixelRatio * fade * (uSizeScale / max(-mvPosition.z, 0.1));
  gl_Position = projectionMatrix * mvPosition;
}
