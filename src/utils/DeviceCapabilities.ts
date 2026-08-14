import type { QualityTier } from '../config';

export interface DeviceCapabilities {
  webgl2: boolean;
  webgl: boolean;
  mobile: boolean;
  coarsePointer: boolean;
  hardwareConcurrency: number;
  deviceMemoryGb: number | null;
  maxTextureSize: number;
  prefersReducedMotion: boolean;
  suggestedTier: QualityTier;
  renderer: string | null;
}

function probeWebGL(): { gl2: boolean; gl1: boolean; maxTextureSize: number; renderer: string | null } {
  const canvas = document.createElement('canvas');
  let renderer: string | null = null;
  let maxTextureSize = 0;

  const gl2 = canvas.getContext('webgl2');
  const gl = (gl2 ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;

  if (gl) {
    maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE) as number;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    if (ext) {
      const value = gl.getParameter(ext.UNMASKED_RENDERER_WEBGL);
      renderer = typeof value === 'string' ? value : null;
    }
    const lose = gl.getExtension('WEBGL_lose_context');
    lose?.loseContext();
  }

  return { gl2: gl2 !== null, gl1: gl !== null, maxTextureSize, renderer };
}

export function detectCapabilities(): DeviceCapabilities {
  const probe = probeWebGL();

  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const narrow = window.matchMedia?.('(max-width: 900px)').matches ?? false;
  const mobileUserAgent = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const mobile = coarsePointer && (narrow || mobileUserAgent);

  const cores = navigator.hardwareConcurrency ?? 4;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? null;
  const prefersReducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  let suggestedTier: QualityTier = 'HIGH';
  if (mobile) {
    suggestedTier = 'LOW';
  } else if (!probe.gl2 || cores <= 4 || (memory !== null && memory <= 4)) {
    suggestedTier = 'MEDIUM';
  }
  // Software rasterisers (SwiftShader / llvmpipe) cannot sustain the high tier.
  if (probe.renderer && /SwiftShader|llvmpipe|Software|Basic Render/i.test(probe.renderer)) {
    suggestedTier = 'LOW';
  }

  return {
    webgl2: probe.gl2,
    webgl: probe.gl1,
    mobile,
    coarsePointer,
    hardwareConcurrency: cores,
    deviceMemoryGb: memory,
    maxTextureSize: probe.maxTextureSize,
    prefersReducedMotion,
    suggestedTier,
    renderer: probe.renderer,
  };
}
