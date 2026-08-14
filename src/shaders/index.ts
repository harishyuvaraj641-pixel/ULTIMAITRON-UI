/**
 * Shader registry.
 *
 * GLSL lives in real .glsl/.vert/.frag files and is pulled in with Vite's
 * built-in `?raw` suffix, so no extra build plugin is needed. A tiny resolver
 * expands `#include "file.glsl"` directives, which keeps the noise routines and
 * the shared orb field in one place.
 */

import noiseGlsl from './noise.glsl?raw';
import commonGlsl from './common.glsl?raw';

import particleVertSrc from './particle.vert?raw';
import particleFragSrc from './particle.frag?raw';
import neuralVertSrc from './neural.vert?raw';
import neuralFragSrc from './neural.frag?raw';
import coreVertSrc from './core.vert?raw';
import coreFragSrc from './core.frag?raw';
import hologramVertSrc from './hologram.vert?raw';
import hologramFragSrc from './hologram.frag?raw';
import beamVertSrc from './beam.vert?raw';
import beamFragSrc from './beam.frag?raw';
import backgroundVertSrc from './background.vert?raw';
import backgroundFragSrc from './background.frag?raw';
import hazeVertSrc from './haze.vert?raw';
import hazeFragSrc from './haze.frag?raw';
import burstVertSrc from './burst.vert?raw';
import burstFragSrc from './burst.frag?raw';
import motesVertSrc from './motes.vert?raw';
import motesFragSrc from './motes.frag?raw';
import trailVertSrc from './trail.vert?raw';
import trailFragSrc from './trail.frag?raw';
import compositeVertSrc from './composite.vert?raw';
import compositeFragSrc from './composite.frag?raw';

const CHUNKS: Record<string, string> = {
  'noise.glsl': noiseGlsl,
  'common.glsl': commonGlsl,
};

const INCLUDE_PATTERN = /^[ \t]*#include[ \t]+"([^"]+)"[ \t]*$/gm;

function resolveIncludes(source: string, seen: Set<string> = new Set()): string {
  return source.replace(INCLUDE_PATTERN, (_match, name: string) => {
    if (seen.has(name)) return '';
    const chunk = CHUNKS[name];
    if (chunk === undefined) {
      throw new Error(`[shaders] unknown include "${name}"`);
    }
    const nested = new Set(seen);
    nested.add(name);
    return resolveIncludes(chunk, nested);
  });
}

export const shaders = {
  particle: { vert: resolveIncludes(particleVertSrc), frag: resolveIncludes(particleFragSrc) },
  neural: { vert: resolveIncludes(neuralVertSrc), frag: resolveIncludes(neuralFragSrc) },
  core: { vert: resolveIncludes(coreVertSrc), frag: resolveIncludes(coreFragSrc) },
  hologram: { vert: resolveIncludes(hologramVertSrc), frag: resolveIncludes(hologramFragSrc) },
  beam: { vert: resolveIncludes(beamVertSrc), frag: resolveIncludes(beamFragSrc) },
  background: { vert: resolveIncludes(backgroundVertSrc), frag: resolveIncludes(backgroundFragSrc) },
  haze: { vert: resolveIncludes(hazeVertSrc), frag: resolveIncludes(hazeFragSrc) },
  burst: { vert: resolveIncludes(burstVertSrc), frag: resolveIncludes(burstFragSrc) },
  motes: { vert: resolveIncludes(motesVertSrc), frag: resolveIncludes(motesFragSrc) },
  trail: { vert: resolveIncludes(trailVertSrc), frag: resolveIncludes(trailFragSrc) },
  composite: { vert: resolveIncludes(compositeVertSrc), frag: resolveIncludes(compositeFragSrc) },
} as const;
