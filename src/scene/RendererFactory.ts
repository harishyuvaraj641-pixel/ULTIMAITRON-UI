import * as THREE from 'three';
import { PALETTE, QUALITY, type QualityTier } from '../config';

export class WebGLUnavailableError extends Error {
  constructor(message = 'WebGL is not available in this browser.') {
    super(message);
    this.name = 'WebGLUnavailableError';
  }
}

export interface RendererHandle {
  renderer: THREE.WebGLRenderer;
  /** Resolved pixel ratio, capped by the active quality tier. */
  pixelRatio: number;
}

export function createRenderer(canvas: HTMLCanvasElement, tier: QualityTier): RendererHandle {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false, // bloom + additive blending hides aliasing; MSAA is not worth the cost
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
      failIfMajorPerformanceCaveat: false,
    });
  } catch (error) {
    throw new WebGLUnavailableError(
      error instanceof Error ? error.message : 'WebGL context creation failed.',
    );
  }

  const pixelRatio = Math.min(window.devicePixelRatio || 1, QUALITY[tier].pixelRatioCap);
  renderer.setPixelRatio(pixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  renderer.setClearColor(PALETTE.background, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.92;
  renderer.autoClear = true;
  // Stats are reset once per frame by the application, not per render call.
  renderer.info.autoReset = false;

  return { renderer, pixelRatio };
}

/**
 * Wires up WebGL context loss/restore.
 * Losing the context is normal on laptops that switch GPUs; without this the
 * canvas simply goes black and never comes back.
 */
export function attachContextHandlers(
  canvas: HTMLCanvasElement,
  onLost: () => void,
  onRestored: () => void,
): () => void {
  const handleLost = (event: Event): void => {
    event.preventDefault(); // required for `webglcontextrestored` to ever fire
    onLost();
  };
  canvas.addEventListener('webglcontextlost', handleLost as EventListener, false);
  canvas.addEventListener('webglcontextrestored', onRestored, false);
  return () => {
    canvas.removeEventListener('webglcontextlost', handleLost as EventListener);
    canvas.removeEventListener('webglcontextrestored', onRestored);
  };
}
