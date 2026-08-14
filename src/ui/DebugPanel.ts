import { CSS_PALETTE } from '../config';
import { el } from './dom';
import { HAND_CONNECTIONS, LANDMARK_COUNT, type Landmark } from '../vision/types';

export interface DebugReadouts {
  fps: number;
  inferenceFps: number;
  inferenceMs: number;
  visionMode: string;
  delegate: string;
  cameraState: string;
  gestureState: string;
  confidence: number;
  handWorld: string;
  pinchDistance: number;
  particles: number;
  connections: number;
  motes: number;
  quality: string;
  drawCalls: number;
  triangles: number;
  programs: number;
  pixelRatio: number;
}

type ReadoutValue = string | number;
type ReadoutRow = [keyof DebugReadouts, string, (value: ReadoutValue) => string];

const fixed = (digits: number) => (value: ReadoutValue): string => Number(value).toFixed(digits);
const integer = (value: ReadoutValue): string => Number(value).toLocaleString();
const text = (value: ReadoutValue): string => String(value);

const ORDER: ReadoutRow[] = [
  ['fps', 'RENDER FPS', fixed(1)],
  ['inferenceFps', 'INFERENCE FPS', fixed(0)],
  ['inferenceMs', 'INFERENCE MS', fixed(1)],
  ['visionMode', 'VISION THREAD', text],
  ['delegate', 'DELEGATE', text],
  ['cameraState', 'CAMERA', text],
  ['gestureState', 'GESTURE STATE', text],
  ['confidence', 'CONFIDENCE', fixed(2)],
  ['handWorld', 'HAND WORLD', text],
  ['pinchDistance', 'PINCH DIST', fixed(3)],
  ['particles', 'PARTICLES', integer],
  ['connections', 'CONNECTIONS', integer],
  ['motes', 'DATA MOTES', integer],
  ['quality', 'QUALITY', text],
  ['drawCalls', 'DRAW CALLS', integer],
  ['triangles', 'TRIANGLES', integer],
  ['programs', 'PROGRAMS', integer],
  ['pixelRatio', 'PIXEL RATIO', fixed(2)],
];

/**
 * Development overlay: mirrored camera feed with the 21 landmarks drawn over
 * it, plus every number worth watching while tuning the pipeline.
 */
export class DebugPanel {
  readonly root: HTMLDivElement;

  private readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D | null;
  private readonly previewHost: HTMLDivElement;
  private readonly values = new Map<keyof DebugReadouts, HTMLElement>();
  private open = false;
  private video: HTMLVideoElement | null = null;
  private showIndices = true;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'debug');

    this.previewHost = el('div', 'preview');
    this.canvas = el('canvas');
    this.canvas.width = 320;
    this.canvas.height = 240;
    this.ctx = this.canvas.getContext('2d');
    this.previewHost.append(this.canvas);

    const readouts = el('div', 'readouts');
    for (const [key, label] of ORDER) {
      const line = el('div');
      line.append(el('span', undefined, label));
      const value = el('b', undefined, '—');
      line.append(value);
      readouts.append(line);
      this.values.set(key, value);
    }

    this.root.append(this.previewHost, readouts);
    parent.append(this.root);
  }

  get isOpen(): boolean {
    return this.open;
  }

  toggle(): boolean {
    this.setOpen(!this.open);
    return this.open;
  }

  setOpen(open: boolean): void {
    this.open = open;
    this.root.classList.toggle('open', open);
  }

  toggleIndices(): void {
    this.showIndices = !this.showIndices;
  }

  /** Attaches the live camera element behind the landmark canvas. */
  attachVideo(video: HTMLVideoElement): void {
    if (this.video === video) return;
    this.video?.remove();
    this.video = video;
    video.style.display = 'block';
    this.previewHost.prepend(video);
  }

  detachVideo(): void {
    this.video?.remove();
    this.video = null;
  }

  update(readouts: Partial<DebugReadouts>): void {
    if (!this.open) return;
    for (const [key, , format] of ORDER) {
      const value = readouts[key];
      if (value === undefined) continue;
      const node = this.values.get(key);
      if (node) node.textContent = format(value);
    }
  }

  /** Draws the landmark skeleton over the preview. */
  drawLandmarks(hands: Array<Landmark[] | null>): void {
    if (!this.open || !this.ctx) return;
    const ctx = this.ctx;
    const { width, height } = this.canvas;
    ctx.clearRect(0, 0, width, height);

    for (const landmarks of hands) {
      if (!landmarks || landmarks.length < LANDMARK_COUNT) continue;

      ctx.strokeStyle = CSS_PALETTE.cyanDim;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (const [a, b] of HAND_CONNECTIONS) {
        ctx.moveTo(landmarks[a].x * width, landmarks[a].y * height);
        ctx.lineTo(landmarks[b].x * width, landmarks[b].y * height);
      }
      ctx.stroke();

      ctx.fillStyle = CSS_PALETTE.cyan;
      for (let i = 0; i < LANDMARK_COUNT; i++) {
        const x = landmarks[i].x * width;
        const y = landmarks[i].y * height;
        ctx.beginPath();
        ctx.arc(x, y, i % 4 === 0 ? 3.1 : 2.1, 0, Math.PI * 2);
        ctx.fill();
      }

      if (this.showIndices) {
        // The canvas is mirrored by CSS, so un-mirror the labels to stay legible.
        ctx.save();
        ctx.scale(-1, 1);
        ctx.font = '9px monospace';
        ctx.fillStyle = 'rgba(234, 255, 255, 0.75)';
        for (let i = 0; i < LANDMARK_COUNT; i++) {
          const x = landmarks[i].x * width;
          const y = landmarks[i].y * height;
          ctx.fillText(String(i), -x + 4, y - 4);
        }
        ctx.restore();
      }
    }
  }
}
