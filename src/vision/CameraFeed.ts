import { VISION } from '../config';

export type CameraFailure = 'denied' | 'not-found' | 'in-use' | 'insecure' | 'unsupported' | 'unknown';

export interface CameraError {
  kind: CameraFailure;
  message: string;
}

/**
 * Webcam plumbing. The preview element is deliberately kept out of the layout —
 * it exists to feed the vision pipeline, not to be looked at. Frames never
 * leave the browser.
 */
export class CameraFeed {
  readonly video: HTMLVideoElement;
  private stream: MediaStream | null = null;
  private starting: Promise<void> | null = null;

  constructor() {
    this.video = document.createElement('video');
    this.video.autoplay = true;
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute('playsinline', '');
    this.video.width = VISION.video.width;
    this.video.height = VISION.video.height;
  }

  get active(): boolean {
    return this.stream !== null;
  }

  get ready(): boolean {
    return this.video.readyState >= 2 && this.video.videoWidth > 0;
  }

  get resolution(): { width: number; height: number } {
    return { width: this.video.videoWidth, height: this.video.videoHeight };
  }

  async start(): Promise<void> {
    if (this.stream) return;
    if (this.starting) return this.starting;

    this.starting = this.startInternal().finally(() => {
      this.starting = null;
    });
    return this.starting;
  }

  private async startInternal(): Promise<void> {
    if (!navigator.mediaDevices?.getUserMedia) {
      // getUserMedia is unavailable on insecure origins other than localhost.
      const insecure = !window.isSecureContext;
      throw {
        kind: insecure ? 'insecure' : 'unsupported',
        message: insecure
          ? 'Camera access requires a secure context (https:// or localhost).'
          : 'This browser does not expose a camera API.',
      } satisfies CameraError;
    }

    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: VISION.video.width },
          height: { ideal: VISION.video.height },
          frameRate: { ideal: VISION.video.frameRate },
          facingMode: 'user',
        },
        audio: false,
      });
    } catch (error) {
      throw CameraFeed.describe(error);
    }

    this.video.srcObject = this.stream;

    await new Promise<void>((resolve, reject) => {
      const timeout = window.setTimeout(() => {
        reject({ kind: 'unknown', message: 'Camera stream timed out.' } satisfies CameraError);
      }, 10000);

      const onReady = (): void => {
        window.clearTimeout(timeout);
        this.video.removeEventListener('loadeddata', onReady);
        resolve();
      };
      this.video.addEventListener('loadeddata', onReady);
    });

    try {
      await this.video.play();
    } catch {
      // Autoplay can be refused; the stream is still usable once visible.
    }
  }

  stop(): void {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.srcObject = null;
  }

  private static describe(error: unknown): CameraError {
    const name = (error as { name?: string })?.name ?? '';
    switch (name) {
      case 'NotAllowedError':
      case 'SecurityError':
        return { kind: 'denied', message: 'Camera permission was denied.' };
      case 'NotFoundError':
      case 'OverconstrainedError':
        return { kind: 'not-found', message: 'No compatible camera was found.' };
      case 'NotReadableError':
      case 'AbortError':
        return { kind: 'in-use', message: 'The camera is in use by another application.' };
      default:
        return {
          kind: 'unknown',
          message: error instanceof Error ? error.message : 'Camera initialisation failed.',
        };
    }
  }
}
