import { HUD as HUD_CONFIG, IDENTITY } from '../config';
import { clamp01, damp } from '../utils/MathUtils';
import { divider, el, formatPercent, meter, panelTitle, row, type MeterHandle, type RowHandle } from './dom';
import { GestureDisplay } from './GestureDisplay';
import { SystemStatus } from './SystemStatus';
import { DebugPanel } from './DebugPanel';

export interface HandReadout {
  present: boolean;
  label: string;
  confidence: number;
  gesture: string;
}

export interface HudFrame {
  cameraLabel: string;
  cameraLevel: 'ok' | 'warn' | 'bad';
  hands: [HandReadout, HandReadout];
  gestureLabel: string;
  handCount: number;
  /** 0..1 core activation. */
  power: number;
  /** 0..1 neural network activity. */
  neural: number;
  /** 0..1 estimated GPU load, derived from frame time — not a hardware probe. */
  gpuEstimate: number;
  latencyMs: number;
  fps: number;
  quality: string;
  processing: string;
  energyLabel: string;
}

/**
 * The instrument panels around the core.
 *
 * Readouts are damped rather than written raw: a number that jitters every
 * frame reads as noise, and this interface is supposed to look engineered.
 */
export class HUD {
  readonly status: SystemStatus;
  readonly gestures: GestureDisplay;
  readonly debug: DebugPanel;

  private readonly root: HTMLDivElement;
  private readonly leftPanel: HTMLDivElement;
  private readonly rightPanel: HTMLDivElement;

  private readonly trackingRows: Array<{ state: RowHandle; confidence: RowHandle }> = [];
  private readonly gestureRow: RowHandle;
  private readonly handCountRow: RowHandle;

  private readonly powerRow: RowHandle;
  private readonly powerMeter: MeterHandle;
  private readonly neuralRow: RowHandle;
  private readonly neuralMeter: MeterHandle;
  private readonly gpuRow: RowHandle;
  private readonly gpuMeter: MeterHandle;
  private readonly latencyRow: RowHandle;
  private readonly fpsRow: RowHandle;
  private readonly qualityRow: RowHandle;
  private readonly processingRow: RowHandle;
  private readonly energyRow: RowHandle;

  private smoothPower = 0;
  private smoothNeural = 0;
  private smoothGpu = 0;
  private smoothLatency = 0;
  private visible = true;

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-root');
    parent.append(this.root);

    this.status = new SystemStatus(this.root);
    this.gestures = new GestureDisplay(this.root);
    this.debug = new DebugPanel(this.root);

    /* ----------------------------------------------------------- left */
    this.leftPanel = el('div', 'panel hud-left');
    this.leftPanel.append(panelTitle('HAND TRACKING', 'LOCAL'));

    for (const side of ['LEFT HAND', 'RIGHT HAND']) {
      const header = el('div', 'row');
      header.append(el('span', 'key', side));
      this.leftPanel.append(header);
      const state = row('TRACKING', 'STANDBY', 'sub');
      const confidence = row('CONFIDENCE', '—', 'sub');
      this.leftPanel.append(state.root, confidence.root);
      this.trackingRows.push({ state, confidence });
    }

    this.leftPanel.append(divider());
    this.gestureRow = row('GESTURE', 'STANDBY');
    this.handCountRow = row('HANDS', '0');
    this.leftPanel.append(this.gestureRow.root, this.handCountRow.root);
    this.root.append(this.leftPanel);

    /* ---------------------------------------------------------- right */
    this.rightPanel = el('div', 'panel hud-right');
    this.rightPanel.append(panelTitle('CORE SYSTEM', IDENTITY.build));

    this.powerRow = row('POWER', '0%');
    this.powerMeter = meter();
    this.neuralRow = row('NEURAL', '0%');
    this.neuralMeter = meter();
    this.gpuRow = row('GPU (EST)', '0%');
    this.gpuMeter = meter();

    this.rightPanel.append(
      this.powerRow.root, this.powerMeter.root,
      this.neuralRow.root, this.neuralMeter.root,
      this.gpuRow.root, this.gpuMeter.root,
      divider(),
    );

    this.latencyRow = row('LATENCY', '—');
    this.fpsRow = row('FPS', '—');
    this.qualityRow = row('QUALITY', 'HIGH');
    this.processingRow = row('PROCESSING', 'IDLE');
    this.energyRow = row('ENERGY', 'NOMINAL');
    this.rightPanel.append(
      this.latencyRow.root, this.fpsRow.root, this.qualityRow.root,
      this.processingRow.root, this.energyRow.root,
    );

    const note = el('div', 'row sub');
    note.append(el('span', undefined, 'GPU LOAD IS ESTIMATED FROM FRAME TIME'));
    this.rightPanel.append(note);
    this.root.append(this.rightPanel);

    /* -------------------------------------------------------- privacy */
    const privacy = el('div', 'privacy');
    privacy.append(document.createTextNode('CAMERA PROCESSING: '));
    privacy.append(el('b', undefined, 'LOCAL'));
    privacy.append(document.createTextNode(' — NO FRAMES LEAVE THIS DEVICE'));
    this.root.append(privacy);
  }

  setVisible(visible: boolean): void {
    this.visible = visible;
    this.root.parentElement?.classList.toggle('hidden', !visible);
  }

  toggleVisible(): boolean {
    this.setVisible(!this.visible);
    return this.visible;
  }

  get isVisible(): boolean {
    return this.visible;
  }

  update(dt: number, frame: HudFrame): void {
    this.gestures.update(dt);
    if (!this.visible) return;

    const lambda = HUD_CONFIG.readoutDamping;
    this.smoothPower = damp(this.smoothPower, clamp01(frame.power), lambda, dt);
    this.smoothNeural = damp(this.smoothNeural, clamp01(frame.neural), lambda, dt);
    this.smoothGpu = damp(this.smoothGpu, clamp01(frame.gpuEstimate), lambda * 0.6, dt);
    this.smoothLatency = damp(this.smoothLatency, frame.latencyMs, lambda, dt);

    this.status.setStatus(frame.cameraLabel, frame.cameraLevel);

    for (let i = 0; i < 2; i++) {
      const hand = frame.hands[i];
      const rows = this.trackingRows[i];
      rows.state.setValue(hand.present ? 'ACTIVE' : 'STANDBY');
      rows.state.setLevel(hand.present ? 'normal' : 'warn');
      rows.confidence.setValue(hand.present ? formatPercent(hand.confidence) : '—');
    }

    this.gestureRow.setValue(frame.gestureLabel);
    this.handCountRow.setValue(String(frame.handCount));

    this.powerRow.setValue(formatPercent(this.smoothPower));
    this.powerMeter.set(this.smoothPower);
    this.neuralRow.setValue(formatPercent(this.smoothNeural));
    this.neuralMeter.set(this.smoothNeural);
    this.gpuRow.setValue(formatPercent(this.smoothGpu));
    this.gpuMeter.set(this.smoothGpu);
    this.gpuMeter.setWarm(this.smoothGpu > 0.85);
    this.gpuRow.setLevel(this.smoothGpu > 0.85 ? 'warn' : 'normal');

    this.latencyRow.setValue(this.smoothLatency > 0 ? `${this.smoothLatency.toFixed(0)}ms` : '—');
    this.fpsRow.setValue(frame.fps > 0 ? frame.fps.toFixed(0) : '—');
    this.fpsRow.setLevel(frame.fps > 0 && frame.fps < 40 ? 'warn' : 'normal');
    this.qualityRow.setValue(frame.quality);
    this.processingRow.setValue(frame.processing);
    this.energyRow.setValue(frame.energyLabel);
  }
}
