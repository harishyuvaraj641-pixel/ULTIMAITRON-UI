import { IDENTITY } from '../config';
import { el } from './dom';

export type StatusLevel = 'ok' | 'warn' | 'bad';

export interface ControlDefinition {
  id: string;
  label: string;
  initialState: string;
  on?: boolean;
}

export interface NoticeOptions {
  title: string;
  body: string;
  actions?: Array<{ label: string; onClick: () => void }>;
  level?: 'warn' | 'bad';
}

/**
 * Top identity block, the animated online indicator, the control rail and the
 * modal notice used for camera permission and hard failures.
 */
export class SystemStatus {
  readonly root: HTMLDivElement;

  private readonly statusText: HTMLSpanElement;
  private readonly dot: HTMLSpanElement;
  private readonly controls: HTMLDivElement;
  private readonly buttons = new Map<string, { button: HTMLButtonElement; state: HTMLSpanElement }>();
  private notice: HTMLDivElement | null = null;
  private readonly handlers = new Map<string, () => void>();

  constructor(parent: HTMLElement) {
    this.root = el('div', 'hud-top');

    const brand = el('div', 'brand', IDENTITY.name);
    const subtitle = el('div', 'subtitle', IDENTITY.subtitle);

    const status = el('div', 'status');
    this.dot = el('span', 'dot');
    this.statusText = el('span', undefined, 'ONLINE');
    status.append(this.dot, this.statusText);

    this.root.append(brand, subtitle, status);
    parent.append(this.root);

    this.controls = el('div', 'controls');
    parent.append(this.controls);
  }

  setStatus(text: string, level: StatusLevel = 'ok'): void {
    this.statusText.textContent = text;
    this.dot.classList.toggle('warn', level === 'warn');
    this.dot.classList.toggle('bad', level === 'bad');
  }

  addControl(definition: ControlDefinition, onClick: () => void): void {
    const button = el('button', 'ctl');
    button.type = 'button';
    button.dataset.on = String(definition.on ?? false);
    button.setAttribute('aria-label', definition.label);

    const label = el('span', 'label', definition.label);
    const state = el('span', 'state', definition.initialState);
    button.append(label, state);
    button.addEventListener('click', onClick);

    this.controls.append(button);
    this.buttons.set(definition.id, { button, state });
    this.handlers.set(definition.id, onClick);
  }

  setControlState(id: string, stateLabel: string, on?: boolean): void {
    const entry = this.buttons.get(id);
    if (!entry) return;
    entry.state.textContent = stateLabel;
    if (on !== undefined) entry.button.dataset.on = String(on);
  }

  /** Programmatically activates a control, e.g. from a keyboard shortcut. */
  trigger(id: string): void {
    this.handlers.get(id)?.();
  }

  showNotice(options: NoticeOptions): void {
    this.hideNotice();

    const notice = el('div', 'notice');
    notice.setAttribute('role', 'alertdialog');
    notice.append(el('h2', undefined, options.title));
    notice.append(el('p', undefined, options.body));

    if (options.actions?.length) {
      const actions = el('div', 'controls');
      actions.style.position = 'static';
      actions.style.flexDirection = 'row';
      actions.style.justifyContent = 'center';
      for (const action of options.actions) {
        const button = el('button', 'ctl');
        button.type = 'button';
        button.style.minWidth = 'auto';
        button.append(el('span', 'label', action.label));
        button.addEventListener('click', action.onClick);
        actions.append(button);
      }
      notice.append(actions);
    }

    this.notice = notice;
    this.root.parentElement?.append(notice);
  }

  hideNotice(): void {
    this.notice?.remove();
    this.notice = null;
  }

  get noticeVisible(): boolean {
    return this.notice !== null;
  }
}
