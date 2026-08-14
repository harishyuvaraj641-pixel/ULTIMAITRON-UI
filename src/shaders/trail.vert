uniform float uTime;
uniform float uPixelRatio;
uniform float uSizeScale;

attribute float aBirth;
attribute float aLife;
attribute float aSize;
attribute float aCharge;

varying float vAge;
varying float vCharge;

void main() {
  float age = clamp((uTime - aBirth) / max(aLife, 0.001), 0.0, 1.0);
  vAge = age;
  vCharge = aCharge;

  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  float fade = 1.0 - age;
  gl_PointSize = aSize * uPixelRatio * fade * (uSizeScale / max(-mvPosition.z, 0.1));
  gl_Position = projectionMatrix * mvPosition;
}
