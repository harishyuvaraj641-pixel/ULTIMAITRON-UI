import { HUD as HUD_CONFIG } from '../config';
import { el } from './dom';

const LEGEND: Array<[string, string]> = [
  ['PINCH', 'ROTATE'],
  ['OPEN PALM', 'ACTIVATE'],
  ['FIST', 'POWER'],
  ['TWO HANDS', 'SCALE'],
  ['POINT', 'SELECT'],
  ['SWIPE', 'MODE'],
];

/**
 * Transient gesture feedback: centre-screen confirmations, the current orb mode
 * and the control legend, which fades once the user has had time to read it.
 */
export class GestureDisplay {
  private readonly toasts: HTMLDivElement;
  private readonly modeRoot: HTMLDivElement;
  private readonly modeName: HTMLDivElement;
  private readonly modeSub: HTMLDivElement;
  private readonly legend: HTMLDivElement;

  private legendTimer = 0;
  private legendFaded = false;
  private lastMessage = '';
  private lastMessageAt = -Infinity;
  private elapsed = 0;

  constructor(parent: HTMLElement) {
    this.toasts = el('div', 'toasts');

    this.modeRoot = el('div', 'hud-mode');
    this.modeName = el('div', 'mode-name', 'NEURAL NETWORK');
    this.modeSub = el('div', 'mode-sub', 'CONFIGURATION 01 / 05');
    this.modeRoot.append(this.modeName, this.modeSub);

    this.legend = el('div', 'hud-legend');
    for (const [gesture, action] of LEGEND) {
      const item = el('div', 'legend-item');
      const strong = el('b', undefined, gesture);
      item.append(strong, document.createTextNode(` — ${action}`));
      this.legend.append(item);
    }

    parent.append(this.toasts, this.modeRoot, this.legend);
  }

  /**
   * Shows a short confirmation. Repeats of the same message inside one second
   * are ignored so held gestures do not spam the screen.
   */
  toast(message: string, level: 'normal' | 'warn' = 'normal'): void {
    if (message === this.lastMessage && this.elapsed - this.lastMessageAt < 1.0) return;
    this.lastMessage = message;
    this.lastMessageAt = this.elapsed;

    const node = el('div', level === 'warn' ? 'toast warn' : 'toast', message);
    this.toasts.append(node);

    window.setTimeout(() => {
      node.classList.add('leaving');
      window.setTimeout(() => node.remove(), 340);
    }, HUD_CONFIG.toastSeconds * 1000);

    // Never let a burst of events pile up more than a few lines deep.
    while (this.toasts.childElementCount > 3) this.toasts.firstElementChild?.remove();
  }

  setMode(name: string, index: number, total: number, animate = true): void {
    this.modeName.textContent = name;
    this.modeSub.textContent = `CONFIGURATION ${String(index + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    if (!animate) return;
    this.modeRoot.classList.remove('switching');
    // Force a reflow so the animation can be restarted immediately.
    void this.modeRoot.offsetWidth;
    this.modeRoot.classList.add('switching');
  }

  /**
   * Interaction resets the countdown, so the legend stays up while someone is
   * still finding their feet. Once it has faded it stays out of the way.
   */
  notifyActivity(): void {
    if (this.legendFaded) return;
    this.legendTimer = 0;
  }

  update(dt: number): void {
    this.elapsed += dt;
    if (this.legendFaded) return;
    this.legendTimer += dt;
    if (this.legendTimer >= HUD_CONFIG.legendVisibleSeconds) {
      this.legendFaded = true;
      this.legend.classList.add('faded');
    }
  }
}
