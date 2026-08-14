import { VISION } from '../config';
import type { DetectionResult, Handedness, RawHand, WorkerResponse } from './types';

type Delegate = 'GPU' | 'CPU';
export type VisionMode = 'worker' | 'main';

/**
 * Owns the MediaPipe Hand Landmarker.
 *
 * Preference order: a module worker (keeps inference off the render thread),
 * falling back to main-thread inference if the worker cannot start — which
 * happens on a few browsers that refuse WASM inside workers.
 */
export class MediaPipeManager {
  private worker: Worker | null = null;
  private landmarker: import('@mediapipe/tasks-vision').HandLandmarker | null = null;
  private modeInternal: VisionMode = 'worker';
  private delegateInternal: Delegate = 'CPU';
  private busy = false;
  private pending: ((result: DetectionResult | null) => void) | null = null;
  private lastTimestamp = -1;
  private disposed = false;

  get mode(): VisionMode {
    return this.modeInternal;
  }

  get delegate(): Delegate {
    return this.delegateInternal;
  }

  get isBusy(): boolean {
    return this.busy;
  }

  async init(): Promise<void> {
    try {
      await this.initWorker();
    } catch (workerError) {
      console.warn('[vision] worker unavailable, falling back to main thread:', workerError);
      this.disposeWorker();
      this.modeInternal = 'main';
      await this.initMainThread();
    }
  }

  /* ------------------------------------------------------------------ */
  /* worker path                                                         */
  /* ------------------------------------------------------------------ */

  private initWorker(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      let settled = false;
      let worker: Worker;
      try {
        worker = new Worker(new URL('./vision.worker.ts', import.meta.url), { type: 'module' });
      } catch (error) {
        reject(error);
        return;
      }

      const timeout = window.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('Vision worker did not become ready in time.'));
      }, 25000);

      worker.onerror = (event) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        reject(new Error(event.message || 'Vision worker failed to load.'));
      };

      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const message = event.data;
        if (message.type === 'ready') {
          this.delegateInternal = message.delegate;
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            this.worker = worker;
            this.modeInternal = 'worker';
            resolve();
          }
          return;
        }

        if (message.type === 'result') {
          this.busy = false;
          const resolvePending = this.pending;
          this.pending = null;
          resolvePending?.({
            hands: message.hands,
            timestamp: message.timestamp,
            inferenceMs: message.inferenceMs,
          });
          return;
        }

        if (message.type === 'error') {
          if (!settled) {
            settled = true;
            window.clearTimeout(timeout);
            reject(new Error(message.message));
            return;
          }
          console.warn('[vision] worker error:', message.message);
          this.busy = false;
          const resolvePending = this.pending;
          this.pending = null;
          resolvePending?.(null);
        }
      };

      worker.postMessage({
        type: 'init',
        wasmBasePath: VISION.wasmBasePath,
        modelAssetPath: VISION.modelAssetPath,
        numHands: VISION.numHands,
        minHandDetectionConfidence: VISION.minHandDetectionConfidence,
        minHandPresenceConfidence: VISION.minHandPresenceConfidence,
        minTrackingConfidence: VISION.minTrackingConfidence,
      });
    });
  }

  /* ------------------------------------------------------------------ */
  /* main-thread path                                                    */
  /* ------------------------------------------------------------------ */

  private async initMainThread(): Promise<void> {
    const { FilesetResolver, HandLandmarker } = await import('@mediapipe/tasks-vision');
    const fileset = await FilesetResolver.forVisionTasks(VISION.wasmBasePath);

    const options = {
      baseOptions: { modelAssetPath: VISION.modelAssetPath, delegate: 'GPU' as const },
      runningMode: 'VIDEO' as const,
      numHands: VISION.numHands,
      minHandDetectionConfidence: VISION.minHandDetectionConfidence,
      minHandPresenceConfidence: VISION.minHandPresenceConfidence,
      minTrackingConfidence: VISION.minTrackingConfidence,
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
      this.delegateInternal = 'GPU';
    } catch {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...options.baseOptions, delegate: 'CPU' as const },
      });
      this.delegateInternal = 'CPU';
    }
  }

  /* ------------------------------------------------------------------ */
  /* detection                                                           */
  /* ------------------------------------------------------------------ */

  /**
   * Runs one inference. Returns null when the pipeline is still busy with the
   * previous frame, which is the normal way this back-pressures.
   */
  async detect(video: HTMLVideoElement, timestamp: number): Promise<DetectionResult | null> {
    if (this.disposed || this.busy) return null;
    // MediaPipe requires strictly increasing timestamps in VIDEO mode.
    if (timestamp <= this.lastTimestamp) timestamp = this.lastTimestamp + 1;
    this.lastTimestamp = timestamp;

    if (this.modeInternal === 'worker' && this.worker) {
      // Claim the slot before the await: createImageBitmap yields, and a second
      // caller would otherwise slip past the busy check.
      this.busy = true;
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(video);
      } catch {
        this.busy = false;
        return null;
      }
      if (this.disposed || !this.worker) {
        bitmap.close();
        this.busy = false;
        return null;
      }
      return new Promise<DetectionResult | null>((resolve) => {
        this.pending = resolve;
        this.worker!.postMessage({ type: 'frame', bitmap, timestamp }, [bitmap]);
      });
    }

    if (!this.landmarker) return null;
    this.busy = true;
    const started = performance.now();
    try {
      const result = this.landmarker.detectForVideo(video, timestamp);
      const hands: RawHand[] = result.landmarks.map((landmarks, index) => ({
        landmarks: landmarks.map((l) => ({ x: l.x, y: l.y, z: l.z })),
        worldLandmarks:
          result.worldLandmarks[index]?.map((l) => ({ x: l.x, y: l.y, z: l.z })) ?? [],
        handedness: normaliseHandedness(result.handedness[index]?.[0]?.categoryName),
        score: result.handedness[index]?.[0]?.score ?? 0,
      }));
      return { hands, timestamp, inferenceMs: performance.now() - started };
    } catch (error) {
      console.warn('[vision] inference failed:', error);
      return null;
    } finally {
      this.busy = false;
    }
  }

  private disposeWorker(): void {
    if (!this.worker) return;
    this.worker.onmessage = null;
    this.worker.onerror = null;
    this.worker.terminate();
    this.worker = null;
  }

  dispose(): void {
    this.disposed = true;
    if (this.worker) {
      try {
        this.worker.postMessage({ type: 'close' });
      } catch {
        /* the worker may already be gone */
      }
      this.disposeWorker();
    }
    this.landmarker?.close();
    this.landmarker = null;
    this.pending?.(null);
    this.pending = null;
  }
}

function normaliseHandedness(name: string | undefined): Handedness {
  if (name === 'Left' || name === 'Right') return name;
  return 'Unknown';
}
