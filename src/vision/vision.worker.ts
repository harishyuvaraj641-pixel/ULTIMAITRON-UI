/// <reference lib="webworker" />

/**
 * Vision worker.
 *
 * MediaPipe's `detectForVideo` is synchronous and, on the main thread, competes
 * directly with the render loop — Google's own documentation warns that video
 * hand detection can block the UI thread. Running it here keeps the Three.js
 * loop free; the main thread only pays for `createImageBitmap`.
 */

import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';
import type { Handedness, RawHand, WorkerRequest, WorkerResponse } from './types';

let landmarker: HandLandmarker | null = null;
let busy = false;

function post(message: WorkerResponse, transfer?: Transferable[]): void {
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(message, transfer ?? []);
}

function toHandedness(name: string | undefined): Handedness {
  if (name === 'Left' || name === 'Right') return name;
  return 'Unknown';
}

async function init(request: Extract<WorkerRequest, { type: 'init' }>): Promise<void> {
  const fileset = await FilesetResolver.forVisionTasks(request.wasmBasePath);

  const options = {
    baseOptions: {
      modelAssetPath: request.modelAssetPath,
      delegate: 'GPU' as const,
    },
    runningMode: 'VIDEO' as const,
    numHands: request.numHands,
    minHandDetectionConfidence: request.minHandDetectionConfidence,
    minHandPresenceConfidence: request.minHandPresenceConfidence,
    minTrackingConfidence: request.minTrackingConfidence,
  };

  try {
    landmarker = await HandLandmarker.createFromOptions(fileset, options);
    post({ type: 'ready', delegate: 'GPU' });
  } catch {
    // Not every worker context exposes WebGL; fall back to the CPU delegate.
    landmarker = await HandLandmarker.createFromOptions(fileset, {
      ...options,
      baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
    });
    post({ type: 'ready', delegate: 'CPU' });
  }
}

self.onmessage = async (event: MessageEvent<WorkerRequest>): Promise<void> => {
  const request = event.data;

  if (request.type === 'init') {
    try {
      await init(request);
    } catch (error) {
      post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        fatal: true,
      });
    }
    return;
  }

  if (request.type === 'frame') {
    if (!landmarker || busy) {
      request.bitmap.close();
      return;
    }
    busy = true;
    const started = performance.now();
    try {
      const result = landmarker.detectForVideo(request.bitmap, request.timestamp);
      const hands: RawHand[] = result.landmarks.map((landmarks, index) => ({
        landmarks: landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })),
        worldLandmarks:
          result.worldLandmarks[index]?.map((l) => ({ x: l.x, y: l.y, z: l.z })) ?? [],
        handedness: toHandedness(result.handedness[index]?.[0]?.categoryName),
        score: result.handedness[index]?.[0]?.score ?? 0,
      }));
      post({
        type: 'result',
        hands,
        timestamp: request.timestamp,
        inferenceMs: performance.now() - started,
      });
    } catch (error) {
      post({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
        fatal: false,
      });
    } finally {
      request.bitmap.close();
      busy = false;
    }
    return;
  }

  if (request.type === 'close') {
    landmarker?.close();
    landmarker = null;
    (self as unknown as DedicatedWorkerGlobalScope).close();
  }
};
