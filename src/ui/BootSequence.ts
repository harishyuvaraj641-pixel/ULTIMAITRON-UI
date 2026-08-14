import { IDENTITY, ORB } from '../config';
import { el } from './dom';

export interface BootStep {
  text: string;
  /** Seconds this line stays on screen before the next appears. */
  hold: number;
  final?: boolean;
}

const STEPS: BootStep[] = [
  { text: 'SYSTEM INITIALIZING...', hold: 0.85 },
  { text: 'NEURAL NETWORK ONLINE', hold: 0.8 },
  { text: 'CORE SYNCHRONIZATION', hold: 0.85 },
  { text: `${IDENTITY.name} CORE ONLINE`, hold: 0.9, final: true },
  { text: 'READY FOR INTERACTION', hold: 0.7 },
];

/**
 * Cinematic cold start. The overlay hands over to the orb's own formation
 * animation part-way through, so the particles are already streaming into
 * place while the last lines are still being written.
 */
export class BootSequence {
  private readonly root: HTMLDivElement;
  private readonly bar: HTMLElement;
  private readonly lines: HTMLDivElement;
  private index = 0;
  private timer = 0;
  private elapsed = 0;
  private finished = false;
  private formationStarted = false;
  private skipRequested = false;

  onFormationStart: (() => void) | null = null;
  onComplete: (() => void) | null = null;
  onStep: ((step: BootStep, index: number) => void) | null = null;

  constructor(parent: HTMLElement, private readonly reducedMotion = false) {
    this.root = el('div', 'boot');
    this.lines = el('div', 'boot-lines');
    this.lines.style.display = 'flex';
    this.lines.style.flexDirection = 'column';
    this.lines.style.alignItems = 'center';
    this.lines.style.gap = '10px';

    const barHost = el('div', 'boot-bar');
    this.bar = el('i');
    barHost.append(this.bar);

    this.root.append(this.lines, barHost);
    parent.append(this.root);

    if (reducedMotion) {
      // Skip the theatre, keep the information.
      this.pushLine(STEPS[STEPS.length - 1]);
    }
  }

  /** Lets the user cut the sequence short with a click or key press. */
  skip(): void {
    this.skipRequested = true;
  }

  get isFinished(): boolean {
    return this.finished;
  }

  update(dt: number): void {
    if (this.finished) return;
    this.elapsed += dt;
    this.timer += dt;

    const total = this.reducedMotion ? 0.6 : STEPS.reduce((sum, step) => sum + step.hold, 0);
    this.bar.style.width = `${Math.min(100, (this.elapsed / total) * 100)}%`;

    // The background goes transparent as soon as the orb starts forming.
    if (!this.formationStarted && (this.elapsed > 0.9 || this.reducedMotion || this.skipRequested)) {
      this.formationStarted = true;
      this.root.classList.add('transparent');
      this.onFormationStart?.();
    }

    if (this.skipRequested || this.reducedMotion) {
      if (this.elapsed > (this.reducedMotion ? 0.8 : 0.2)) this.complete();
      return;
    }

    if (this.index < STEPS.length && this.timer >= (this.index === 0 ? 0.25 : STEPS[this.index - 1].hold)) {
      const step = STEPS[this.index];
      this.pushLine(step);
      this.onStep?.(step, this.index);
      this.index++;
      this.timer = 0;
      return;
    }

    if (this.index >= STEPS.length) {
      const lastHold = STEPS[STEPS.length - 1].hold;
      // Hold on the final line until the orb has essentially finished assembling.
      const formationSettled = this.elapsed >= 0.9 + ORB.formationSeconds * 0.85;
      if (this.timer >= lastHold && formationSettled) this.complete();
    }
  }

  private pushLine(step: BootStep): void {
    const line = el('div', step.final ? 'boot-line final' : 'boot-line', step.text);
    this.lines.append(line);
    while (this.lines.childElementCount > 5) this.lines.firstElementChild?.remove();
  }

  private complete(): void {
    if (this.finished) return;
    this.finished = true;
    this.root.classList.add('done');
    window.setTimeout(() => this.root.remove(), 1000);
    this.onComplete?.();
  }
}
