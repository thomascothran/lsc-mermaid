// The tutorial pages. Every chart is drawn live from the text under it. Readers can edit that
// text, and the drawing and the "Open in playground" link follow their changes.

import type { Mermaid } from 'mermaid';
import lsc from 'mermaid-lsc';
import { errorMessage, renderSvg, serially } from './render.js';
import { CUES, defaultSettings, encodeHash, type Cue, type Settings } from './share.js';

declare const mermaid: Mermaid;

interface Example {
  element: HTMLElement;
  figure: HTMLElement;
  error: HTMLElement;
  errorText: HTMLElement;
  source: HTMLTextAreaElement;
  reset: HTMLButtonElement;
  open: HTMLAnchorElement;
  original: string;
  settings: Settings;
  token: number;
}

function part<T extends Element>(root: Element, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Missing ${selector}`);
  return element;
}

function readExample(element: HTMLElement): Example {
  const source = part<HTMLTextAreaElement>(element, 'textarea');
  const cue = element.dataset.cue as Cue;
  return {
    element,
    figure: part(element, '.figure'),
    error: part(element, '.example-error'),
    errorText: part(element, '.example-error pre'),
    source,
    reset: part(element, '.reset'),
    open: part(element, '.open'),
    original: source.value,
    settings: { ...defaultSettings, cue: CUES.includes(cue) ? cue : 'line' },
    token: 0,
  };
}

async function draw(example: Example): Promise<void> {
  const token = ++example.token;
  const text = example.source.value;
  await serially(async () => {
    if (token !== example.token) return; // A newer edit is already queued.
    try {
      const svg = await renderSvg(mermaid, text, example.settings);
      if (token !== example.token) return;
      example.figure.innerHTML = svg;
      example.figure.classList.remove('stale');
      example.error.hidden = true;
    } catch (error) {
      if (token !== example.token) return;
      // Keep the last drawing, dimmed, so the reader can see what changed.
      const drawn = example.figure.querySelector('svg') !== null;
      if (!drawn) example.figure.replaceChildren();
      example.figure.classList.toggle('stale', drawn);
      example.errorText.textContent = errorMessage(error);
      example.error.hidden = false;
    }
  });
}

function fitRows(source: HTMLTextAreaElement): void {
  source.rows = Math.max(
    2,
    source.value.split('\n').length - (source.value.endsWith('\n') ? 1 : 0),
  );
}

function wire(example: Example): void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let linkTimer: ReturnType<typeof setTimeout> | undefined;
  example.source.addEventListener('input', () => {
    fitRows(example.source);
    example.reset.hidden = example.source.value === example.original;
    clearTimeout(timer);
    timer = setTimeout(() => void draw(example), 220);
    clearTimeout(linkTimer);
    linkTimer = setTimeout(async () => {
      const hash = await encodeHash({ ...example.settings, text: example.source.value });
      example.open.href = `../index.html#${hash}`;
    }, 300);
  });
  example.reset.addEventListener('click', () => {
    example.source.value = example.original;
    example.source.dispatchEvent(new Event('input'));
    example.source.focus();
  });
}

async function start(): Promise<void> {
  // On narrow screens the list of lessons starts folded, above the lesson.
  if (window.matchMedia?.('(max-width: 960px)').matches) {
    document.querySelector<HTMLDetailsElement>('.lessons details')?.removeAttribute('open');
  }
  await mermaid.registerExternalDiagrams([lsc]);
  const examples = [...document.querySelectorAll<HTMLElement>('figure.lsc-example')].map(
    readExample,
  );
  for (const example of examples) {
    fitRows(example.source);
    wire(example);
  }
  await Promise.all(examples.map(draw));
  document.body.dataset.ready = 'true';
}

start().catch((error: unknown) => {
  const message = document.createElement('p');
  message.className = 'noscript';
  message.textContent = `The page failed to start: ${errorMessage(error)}`;
  document.querySelector('main')?.prepend(message);
});
