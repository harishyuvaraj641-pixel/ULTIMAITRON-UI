varying vec3 vNormalView;
varying vec3 vViewDir;
varying vec3 vLocal;

void main() {
  vLocal = position;
  vNormalView = normalize(normalMatrix * normal);
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vViewDir = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
