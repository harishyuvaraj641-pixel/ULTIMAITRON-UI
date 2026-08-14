/** Tiny DOM helpers so the UI modules stay declarative. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

export interface RowHandle {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  setValue(text: string): void;
  setLevel(level: 'normal' | 'warn' | 'bad'): void;
}

export function row(label: string, initial = '—', modifier = ''): RowHandle {
  const root = el('div', `row ${modifier}`.trim());
  const key = el('span', 'key', label);
  const value = el('span', 'value', initial);
  root.append(key, value);

  let current = initial;
  return {
    root,
    value,
    setValue(text: string) {
      if (text === current) return;
      current = text;
      value.textContent = text;
    },
    setLevel(level) {
      root.classList.toggle('warn', level === 'warn');
      root.classList.toggle('bad', level === 'bad');
    },
  };
}

export interface MeterHandle {
  root: HTMLDivElement;
  set(value01: number): void;
  setWarm(warm: boolean): void;
}

export function meter(): MeterHandle {
  const root = el('div', 'meter');
  const fill = el('i');
  root.append(fill);
  let last = -1;
  return {
    root,
    set(value01: number) {
      const percent = Math.round(Math.max(0, Math.min(1, value01)) * 100);
      if (percent === last) return;
      last = percent;
      fill.style.width = `${percent}%`;
    },
    setWarm(warm: boolean) {
      root.classList.toggle('warm', warm);
    },
  };
}

export function divider(): HTMLDivElement {
  return el('div', 'divider');
}

export function panelTitle(title: string, tag?: string): HTMLDivElement {
  const root = el('div', 'panel-title');
  root.append(el('span', undefined, title));
  if (tag) root.append(el('span', 'tag', tag));
  return root;
}

export function formatPercent(value01: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value01)) * 100)}%`;
}
