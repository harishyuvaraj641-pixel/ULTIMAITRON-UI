# Ultimaitron AI — Neural Intelligence Core

A browser-based holographic AI core, built from ~20,000 GPU-driven particles and a
live synapse network, controlled entirely with your hands through a webcam.

Three.js + WebGL + GLSL for the rendering; MediaPipe Hand Landmarker for the
tracking. No backend, no frameworks, no camera data ever leaving the machine.

---

## Quick start

```bash
npm install
npm run dev          # http://127.0.0.1:5173
```

Open the URL and press **CAMERA** (bottom right). `localhost` counts as a secure
origin, so the webcam prompt will appear normally.

```bash
npm run typecheck    # tsc --noEmit
npm run build        # typecheck + production bundle into dist/
npm run preview      # serve the production build
```

If you serve `dist/` from anywhere other than localhost it must be over
**https://** — browsers refuse `getUserMedia` on insecure origins. The app
detects this and says so rather than failing silently.

### First run

Two assets are fetched once and then cached by the browser:

| Asset | Source |
| --- | --- |
| MediaPipe WASM runtime | `cdn.jsdelivr.net/npm/@mediapipe/tasks-vision` |
| `hand_landmarker.task` (≈7 MB) | `storage.googleapis.com/mediapipe-models` |

To run fully offline, download both, drop them in `public/`, and repoint
`VISION.wasmBasePath` / `VISION.modelAssetPath` in `src/config.ts`.

---

## Controls

### Gestures

| Gesture | Action |
| --- | --- |
| **Open palm** (5 fingers) | System active — network brightens, rings accelerate, energy pulse fires |
| **Pinch** (thumb + index) | Grab the orb; move to rotate it. Fires an energy filament to the core |
| **Fist** | Power mode: the cloud contracts and turns gold. Release for a shockwave |
| **Two hands** | Move apart to expand, together to compress. Left hand steers, right hand modulates power |
| **Point** (index only) | Holographic reticle cursor. Pinch while pointing to select an orbital node |
| **Swipe** (fast horizontal) | Change orb configuration |
| 2 / 3 / 4 fingers | Navigation / system analysis / data visualisation modes |

### Mouse (no camera required)

Move to steer · hold left button to pinch · drag to rotate · scroll to zoom.
The pointer produces the same `InputHand` structure as a tracked hand, so every
downstream system behaves identically.

### Keyboard

| Key | Action |
| --- | --- |
| `1`–`5` | Neural / Reactor / Data / Energy / Scanner configuration |
| `Space` | Power pulse |
| `G` | Toggle camera (gesture mode) |
| `R` | Reset orientation, scale and mode |
| `D` or `C` | Debug overlay (camera preview, landmarks, indices, stats) |
| `H` | Hide/show the interface |
| `Esc` | Dismiss a notice |

---

## How it works

### Everything moves on the GPU

The orb is one `THREE.Points` draw call and one `THREE.LineSegments` draw call.
After start-up the CPU never touches a particle: all motion — breathing noise,
mode morphing, hand attraction, contraction, burst, boot formation — is a single
vertex-shader function in `src/shaders/common.glsl`.

The connection lines run that *same* function, with each line vertex carrying the
base positions of the node it belongs to. That is what keeps the synapses welded
to their neurons through every deformation without any per-frame CPU work.

### Five configurations, one buffer

Each particle stores five base positions (neural, reactor, data, energy, scanner)
as vertex attributes. Morphing is a weighted sum of those attributes with an
animated weight vector, so transitions are continuous interpolations — geometry
is never swapped out.

### Synapse topology

Connecting 20,000 nodes pairwise is 200 million tests. Instead a uniform spatial
hash (`src/utils/SpatialHash.ts`) buckets the nodes by the connection radius and
searches only the 27 neighbouring cells, capped at 3 links per node. Built once
at start-up, during the boot animation.

### Energy pulses

Up to four expanding spherical wavefronts are held in a `vec4[4]` uniform
(origin + start time). Every particle and every line computes its own distance to
each wavefront, so an impulse visibly propagates outward through the network.
Idle pulses fire from random nodes; gestures fire them from the interaction point.

### Vision pipeline

```
webcam → ImageBitmap → Web Worker → MediaPipe HandLandmarker
       → One Euro filter → GestureEngine → GestureStateMachine → HandInteraction
```

- Inference runs in a **module worker** so `detectForVideo` — which is synchronous
  and, as Google's docs note, can block the UI thread — never stalls rendering.
  If the worker cannot start, it transparently falls back to the main thread.
- Inference is scheduled at ~30 Hz independently of the render loop, with
  back-pressure so a slow frame can never queue up work.
- Raw landmarks are filtered with a **One Euro filter** (low lag, low jitter),
  then converted to size-normalised features — pinch distance is divided by the
  hand's own wrist-to-knuckle scale, so thresholds hold at any distance from the
  lens.
- Every boolean has hysteresis, every state has a debounce. Nothing downstream
  ever sees a raw landmark value.
- The two hands are matched to stable slots frame to frame by handedness and
  proximity, so filters never jump when MediaPipe reorders its output.

### Performance

- Adaptive quality with hysteresis: sustained sub-45 fps steps the tier down,
  sustained 58+ fps for 10 s steps it back up, with a cooldown between changes so
  quality cannot oscillate.
- HIGH 20k particles / 8k connections · MEDIUM 10k / 4k · LOW 5k / 2k.
- No allocation in the animation loop — vectors, colours and quaternions are
  pre-allocated; particle pools are ring buffers.

| | |
| --- | --- |
| Draw calls for the whole orb | 5 (particles, lines, motes, core layers, rings) |
| Per-frame CPU work for 20k particles | uniform writes only |
| Frame budget spent on hand tracking | 0 — it runs in a worker |

---

## Project layout

```
src/
  main.ts                  application wiring and the frame loop
  config.ts                every tunable value in the project
  scene/                   renderer, camera rig, background, post-processing
  orb/                     particle system, synapse network, core, rings, modes
  vision/                  camera, MediaPipe worker, smoothing, gesture engine
  interaction/             hand→world mapping, state machine, mouse fallback
  effects/                 beams, trails, burst, reticle, scan arc, orbital nodes
  ui/                      HUD panels, boot sequence, debug overlay
  audio/                   procedural Web Audio cues
  shaders/                 GLSL (.vert/.frag/.glsl), loaded with Vite's ?raw
  utils/                   maths, noise, spatial hash, performance, capabilities
```

---

## Privacy

Camera frames are read into an `ImageBitmap`, passed to a worker in the same
browser tab, and discarded. There is no network code in the application beyond
the two static asset fetches listed above. The HUD states this permanently:
**CAMERA PROCESSING: LOCAL**.

---

## Honest notes

- **GPU (EST)** in the right-hand panel is derived from frame time, not from a
  hardware counter — browsers do not expose real GPU load. It is labelled as an
  estimate in the UI and the panel says so in full underneath. FPS, latency,
  particle and connection counts are all measured values.
- Rendering is verified headlessly in this repo via `dev/` (see below), which
  runs on a software rasteriser at a few fps. That number says nothing about real
  hardware; the quality tiers are sized for a normal discrete or integrated GPU.

## Verification harness (`dev/`)

`dev/` contains an offline test rig, kept out of the application bundle:

- `dev/server.mjs` — static server that emulates the two Vite features used here
  (`?raw` imports, extensionless specifiers)
- `dev/mediapipe-stub.js` — synthesises anatomically plausible 21-landmark hands
  so the whole pipeline can be driven without a webcam
- `dev/run.mjs` — drives Chromium through boot, every gesture, all five modes,
  resize and teardown, then reports console errors and shader failures

```bash
npx tsc -p tsconfig.test.json && node dev/run.mjs
```

You can delete the `dev/` folder entirely; nothing in `src/` imports it.

---

## Credits and licences

- Simplex noise: Ashima Arts / Stefan Gustavson (MIT), inlined in
  `src/shaders/noise.glsl`
- One Euro filter: Casiez, Roussel & Vogel, CHI 2012
- Hand tracking: Google MediaPipe Tasks Vision (Apache 2.0)
- Rendering: three.js (MIT)

All geometry, shaders, HUD design and the Ultimaitron AI identity are original to
this project. No third-party UI assets, logos or trademarks are used.
