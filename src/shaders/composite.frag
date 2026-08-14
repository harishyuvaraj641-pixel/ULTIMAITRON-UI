precision highp float;

// Final grade: a restrained pass of chromatic aberration, film grain, vignette
// and scanlines. Deliberately subtle — the core has to stay crisp.

uniform sampler2D tDiffuse;
uniform float uTime;
uniform vec2  uResolution;
uniform float uAberration;
uniform float uGrain;
uniform float uVignette;
uniform float uScanline;
uniform float uAlert;      // 0 = normal, 1 = amber warning wash

varying vec2 vUv;

float rand(vec2 co) {
  return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453);
}

void main() {
  vec2 uv = vUv;
  vec2 centred = uv - 0.5;
  float r2 = dot(centred, centred);

  vec3 color;
  if (uAberration > 0.0001) {
    // Aberration scales with distance from the centre, as in a real lens.
    vec2 offset = centred * uAberration * (0.35 + r2 * 2.2);
    color.r = texture2D(tDiffuse, uv + offset).r;
    color.g = texture2D(tDiffuse, uv).g;
    color.b = texture2D(tDiffuse, uv - offset).b;
  } else {
    color = texture2D(tDiffuse, uv).rgb;
  }

  if (uGrain > 0.0001) {
    float noise = rand(uv * uResolution * 0.5 + fract(uTime) * 91.7);
    color += (noise - 0.5) * uGrain;
  }

  if (uScanline > 0.0001) {
    float lines = sin(uv.y * uResolution.y * 1.4 + uTime * 1.5) * 0.5 + 0.5;
    color *= 1.0 - uScanline * lines;
  }

  color *= mix(1.0, smoothstep(0.85, 0.15, r2), uVignette);

  if (uAlert > 0.001) {
    vec3 wash = vec3(1.0, 0.62, 0.22);
    float edge = smoothstep(0.05, 0.5, r2);
    color = mix(color, color * wash + wash * 0.05 * edge, uAlert * 0.55);
  }

  gl_FragColor = vec4(color, 1.0);
}
