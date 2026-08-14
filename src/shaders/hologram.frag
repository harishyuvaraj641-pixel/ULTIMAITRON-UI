precision highp float;

// Generic holographic ring. All of the concentric rings around the core share
// this program; each instance varies the uniforms to become a segmented ring,
// a dotted ring, a broken ring, a scanning ring, and so on.

#define TAU 6.283185307179586

uniform float uTime;
uniform vec3  uColor;
uniform vec3  uWarmColor;
uniform float uWarm;
uniform float uOpacity;
uniform float uEnergy;

uniform float uInner;       // inner radius in local units
uniform float uOuter;       // outer radius in local units
uniform float uFeather;     // edge softness

uniform float uSegments;    // 0 = solid ring
uniform float uDashRatio;   // fraction of each segment that is lit
uniform float uSegmentSpin; // radians/second the segment pattern rotates

uniform float uSweep;       // 0/1 enable the rotating scan arc
uniform float uSweepSpeed;
uniform float uSweepWidth;  // radians

uniform float uGapStart;    // broken ring: start of the missing arc, radians
uniform float uGapSize;     // broken ring: size of the missing arc, radians

varying vec3 vLocal;

float angularDelta(float a, float b) {
  float d = abs(a - b);
  return min(d, TAU - d);
}

void main() {
  float radius = length(vLocal.xy);
  float angle = atan(vLocal.y, vLocal.x);
  if (angle < 0.0) angle += TAU;

  // Crisp band with feathered edges.
  float band = smoothstep(uInner - uFeather, uInner + uFeather, radius) *
               (1.0 - smoothstep(uOuter - uFeather, uOuter + uFeather, radius));
  if (band <= 0.001) discard;

  float mask = 1.0;

  if (uSegments > 0.5) {
    float spun = angle + uTime * uSegmentSpin;
    float cell = fract(spun / TAU * uSegments);
    float edge = 0.5 / uSegments;
    mask *= smoothstep(0.0, edge, cell) * (1.0 - smoothstep(uDashRatio - edge, uDashRatio, cell));
  }

  if (uGapSize > 0.001) {
    // Broken ring: remove one arc, with softened ends.
    float rel = mod(angle - uGapStart + TAU, TAU);
    float inside = smoothstep(0.0, 0.04, rel) * (1.0 - smoothstep(uGapSize - 0.04, uGapSize, rel));
    mask *= 1.0 - inside;
  }

  float sweep = 0.0;
  if (uSweep > 0.5) {
    float head = mod(uTime * uSweepSpeed, TAU);
    float d = angularDelta(angle, head);
    sweep = exp(-(d * d) / (uSweepWidth * uSweepWidth));
    // A dim tail trails behind the head.
    float behind = mod(head - angle + TAU, TAU);
    sweep += 0.35 * exp(-behind * 1.6);
  }

  float intensity = mask * (0.55 + uEnergy * 0.8) + sweep * (1.1 + uEnergy);
  vec3 tint = mix(uColor, uWarmColor, uWarm);

  float alpha = clamp(band * (mask * 0.85 + sweep) * uOpacity, 0.0, 1.0);
  gl_FragColor = vec4(tint * intensity, alpha);
}
