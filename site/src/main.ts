// The playground page. Mermaid comes from its classic build as the global `mermaid`; the plugin,
// this code and the worked examples are bundled into one classic script by site/build.ts.

import type { Mermaid } from 'mermaid';
import lsc from 'mermaid-lsc';
import type { Example } from '../build.js';
import { errorMessage, renderSvg as renderChart, serially } from './render.js';
import {
  decodeHash,
  defaultSettings,
  encodeHash,
  readSavedState,
  readSettings,
  svgFileName,
  type PageState,
  type Settings,
} from './share.js';

declare const mermaid: Mermaid;
declare const __EXAMPLES__: Example[];

const examples = __EXAMPLES__;
const DEFAULT_EXAMPLE = 'fig02-car-departure';
const STORAGE_KEY = 'mermaid-lsc-playground';

function $<T extends HTMLElement = HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

const ui = {
  example: $<HTMLSelectElement>('example'),
  theme: $<HTMLSelectElement>('theme'),
  cue: $<HTMLSelectElement>('cue'),
  diagnostics: $<HTMLInputElement>('diagnostics'),
  source: $<HTMLTextAreaElement>('source'),
  gutter: $('gutter'),
  canvas: $('canvas'),
  output: $('output'),
  error: $('error'),
  errorText: $('error-text'),
  status: $('status'),
  copyLink: $<HTMLButtonElement>('copy-link'),
  copySvg: $<HTMLButtonElement>('copy-svg'),
  downloadSvg: $<HTMLButtonElement>('download-svg'),
  viewEditor: $<HTMLButtonElement>('view-editor'),
  viewGallery: $<HTMLButtonElement>('view-gallery'),
  editorView: $('editor-view'),
  galleryView: $('gallery-view'),
  cards: $('cards'),
  toast: $('toast'),
};

let settings: Settings = { ...defaultSettings };
/** The drawing of the editor's current text; empty while the text is empty or has errors. */
let lastSvg = '';
/** The last good drawing, kept dimmed under an error message. */
let shownSvg = '';

// ---- Rendering ----------------------------------------------------------------------------

async function renderSvg(text: string): Promise<string> {
  return renderChart(mermaid, text, settings);
}

function errorLines(message: string): Set<number> {
  return new Set([...message.matchAll(/\bline (\d+)/g)].map((m) => Number(m[1])));
}

let editorToken = 0;
async function renderEditor(): Promise<void> {
  const token = ++editorToken;
  const text = ui.source.value;
  await serially(async () => {
    if (token !== editorToken) return; // A newer edit is already queued.
    if (!text.trim()) {
      lastSvg = shownSvg = '';
      ui.output.innerHTML =
        '<p class="placeholder">Type a chart, or pick one from the Examples menu.</p>';
      ui.output.classList.remove('stale');
      showError(null);
      setStatus('');
      updateButtons();
      return;
    }
    const started = performance.now();
    try {
      const svg = await renderSvg(text);
      if (token !== editorToken) return;
      lastSvg = shownSvg = svg;
      ui.output.innerHTML = svg;
      ui.output.classList.remove('stale');
      showError(null);
      setStatus(`Drawn in ${Math.max(1, Math.round(performance.now() - started))} ms`);
    } catch (error) {
      if (token !== editorToken) return;
      lastSvg = '';
      ui.output.classList.toggle('stale', shownSvg !== '');
      showError(errorMessage(error));
    }
    updateButtons();
  });
}

function showError(message: string | null): void {
  ui.error.hidden = message === null;
  ui.errorText.textContent = message ?? '';
  markGutter(message ? errorLines(message) : new Set());
  if (message) {
    const count = message.split('\n').filter((line) => line.trim()).length;
    setStatus(count === 1 ? '1 problem' : `${count} problems`, true);
  }
}

function setStatus(text: string, bad = false): void {
  ui.status.textContent = text;
  ui.status.classList.toggle('bad', bad);
}

function updateButtons(): void {
  ui.copySvg.disabled = ui.downloadSvg.disabled = lastSvg === '' || !ui.galleryView.hidden;
  ui.copyLink.disabled = !ui.galleryView.hidden;
}

function applyCanvasTheme(): void {
  const dark = settings.theme === 'dark';
  ui.canvas.classList.toggle('dark', dark);
  for (const figure of ui.cards.querySelectorAll('.figure')) {
    figure.classList.toggle('dark', dark);
  }
}

// ---- Line numbers -------------------------------------------------------------------------

let gutterLines = 0;
let badLines = new Set<number>();

function updateGutter(): void {
  const lines = ui.source.value.split('\n').length;
  if (lines !== gutterLines) {
    gutterLines = lines;
    const fragment = document.createDocumentFragment();
    for (let n = 1; n <= lines; n++) {
      const row = document.createElement('div');
      row.textContent = String(n);
      fragment.append(row);
    }
    ui.gutter.replaceChildren(fragment);
  }
  ui.gutter.querySelectorAll('div').forEach((row, i) => {
    row.classList.toggle('bad', badLines.has(i + 1));
  });
  syncGutterScroll();
}

function markGutter(lines: Set<number>): void {
  badLines = lines;
  updateGutter();
}

function syncGutterScroll(): void {
  ui.gutter.scrollTop = ui.source.scrollTop;
}

// ---- State: examples, settings, saving and links ------------------------------------------

function exampleNamed(name: string): Example | undefined {
  return examples.find((e) => e.name === name);
}

/** Shows which example the editor holds, or "Your chart" once it has been edited. */
function syncExampleMenu(): void {
  ui.example.value = examples.find((e) => e.text === ui.source.value)?.name ?? '';
}

function isUnsavedWork(): boolean {
  const text = ui.source.value;
  return text.trim() !== '' && !examples.some((e) => e.text === text);
}

function currentState(): PageState {
  return { ...settings, text: ui.source.value };
}

function save(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState()));
  } catch {
    // Storage can be unavailable, for example in private windows; the page still works.
  }
}

function loadSaved(): Partial<PageState> {
  try {
    return readSavedState(localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

async function shareUrl(): Promise<string> {
  return `${location.href.split('#')[0]}#${await encodeHash(currentState())}`;
}

let hashTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleHashUpdate(): void {
  clearTimeout(hashTimer);
  hashTimer = setTimeout(async () => {
    const hash = await encodeHash(currentState());
    try {
      history.replaceState(null, '', `#${hash}`);
    } catch {
      // Some browsers refuse to rewrite file:// URLs; "Copy link" still works.
    }
  }, 400);
}

function applySettings(next: Partial<Settings>): void {
  settings = { ...settings, ...next };
  ui.theme.value = settings.theme;
  ui.cue.value = settings.cue;
  ui.diagnostics.checked = settings.diagnostics;
  applyCanvasTheme();
}

function setText(text: string): void {
  ui.source.value = text;
  ui.source.scrollTop = 0;
  syncExampleMenu();
  updateGutter();
}

/** Called after any change to the text or the settings. */
function changed(): void {
  save();
  scheduleHashUpdate();
  void renderEditor();
}

// ---- Clipboard, downloads and messages ----------------------------------------------------

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function toast(message: string): void {
  ui.toast.textContent = message;
  ui.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => ui.toast.classList.remove('show'), 2200);
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, and some file:// pages, only allow the legacy copy command.
    const scratch = document.createElement('textarea');
    scratch.value = text;
    scratch.setAttribute('readonly', '');
    scratch.style.position = 'fixed';
    scratch.style.opacity = '0';
    document.body.append(scratch);
    scratch.select();
    const copied = document.execCommand('copy');
    scratch.remove();
    return copied;
  }
}

function download(svg: string, fileName: string): void {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ---- Gallery ------------------------------------------------------------------------------

let galleryStale = true;
let galleryToken = 0;
const gallerySvgs = new Map<string, string>();

function buildCards(): void {
  const dark = settings.theme === 'dark';
  ui.cards.replaceChildren(
    ...examples.map((example) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.dataset.example = example.name;
      const header = document.createElement('header');
      const title = document.createElement('h3');
      title.textContent = example.title;
      const meta = document.createElement('div');
      meta.className = 'meta';
      meta.textContent = example.name;
      header.append(title, meta);
      const figure = document.createElement('div');
      figure.className = 'figure';
      figure.classList.toggle('dark', dark);
      figure.innerHTML = '<span class="pending">Drawing…</span>';
      const actions = document.createElement('div');
      actions.className = 'card-actions';
      const open = document.createElement('button');
      open.type = 'button';
      open.textContent = 'Open in editor';
      open.addEventListener('click', () => openExample(example.name));
      const saveSvg = document.createElement('button');
      saveSvg.type = 'button';
      saveSvg.textContent = 'Download SVG';
      saveSvg.addEventListener('click', () => {
        const svg = gallerySvgs.get(example.name);
        if (svg) download(svg, svgFileName(example.text));
      });
      actions.append(open, saveSvg);
      card.append(header, figure, actions);
      return card;
    }),
  );
}

async function renderGallery(): Promise<void> {
  if (!galleryStale) return;
  galleryStale = false;
  const token = ++galleryToken;
  if (!ui.cards.childElementCount) buildCards();
  for (const example of examples) {
    const done = await serially(async () => {
      if (token !== galleryToken) return false;
      const figure = ui.cards.querySelector(`[data-example="${example.name}"] .figure`);
      if (!figure) return true;
      try {
        const svg = await renderSvg(example.text);
        gallerySvgs.set(example.name, svg);
        figure.innerHTML = svg;
      } catch (error) {
        figure.textContent = errorMessage(error);
      }
      return true;
    });
    if (!done) return;
  }
  document.body.dataset.galleryRendered = 'true';
}

function invalidateGallery(): void {
  galleryStale = true;
  galleryToken++;
  if (!ui.galleryView.hidden) void renderGallery();
}

function showView(view: 'editor' | 'gallery'): void {
  const gallery = view === 'gallery';
  ui.editorView.hidden = gallery;
  ui.galleryView.hidden = !gallery;
  ui.viewEditor.setAttribute('aria-pressed', String(!gallery));
  ui.viewGallery.setAttribute('aria-pressed', String(gallery));
  updateButtons();
  if (gallery) void renderGallery();
  // Leaving the gallery replaces a `#view=gallery` link with the chart's own link.
  else if (linkedView() !== null) scheduleHashUpdate();
}

function openExample(name: string): void {
  const example = exampleNamed(name);
  if (!example) return;
  if (ui.source.value !== example.text && isUnsavedWork()) {
    if (!confirm('Replace your chart with this example? Your edits will be lost.')) {
      syncExampleMenu();
      return;
    }
  }
  setText(example.text);
  showView('editor');
  changed();
}

// ---- Wiring -------------------------------------------------------------------------------

/** The view a link asks for with `#view=gallery`, as the tutorial's Gallery link does. */
function linkedView(): string | null {
  return new URLSearchParams(location.hash.replace(/^#/, '')).get('view');
}

function fillExampleMenu(): void {
  const groups: Record<Example['group'], string> = {
    paper: 'Figures from the paper',
    more: 'More worked examples',
  };
  for (const [group, label] of Object.entries(groups)) {
    const optgroup = document.createElement('optgroup');
    optgroup.label = label;
    for (const example of examples.filter((e) => e.group === group)) {
      optgroup.append(new Option(example.title, example.name));
    }
    ui.example.append(optgroup);
  }
}

function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

function wire(): void {
  const editSettled = debounce(changed, 220);
  ui.source.addEventListener('input', () => {
    syncExampleMenu();
    updateGutter();
    editSettled();
  });
  ui.source.addEventListener('scroll', syncGutterScroll);

  ui.example.addEventListener('change', () => openExample(ui.example.value));

  const onSettings = () => {
    applySettings(
      readSettings({
        theme: ui.theme.value,
        cue: ui.cue.value,
        diagnostics: ui.diagnostics.checked,
      }),
    );
    invalidateGallery();
    changed();
  };
  for (const control of [ui.theme, ui.cue, ui.diagnostics]) {
    control.addEventListener('change', onSettings);
  }

  ui.viewEditor.addEventListener('click', () => showView('editor'));
  ui.viewGallery.addEventListener('click', () => showView('gallery'));

  ui.copyLink.addEventListener('click', async () => {
    toast((await copyText(await shareUrl())) ? 'Link copied' : 'Could not copy the link');
  });
  ui.copySvg.addEventListener('click', async () => {
    if (!lastSvg) return;
    toast((await copyText(lastSvg)) ? 'SVG copied' : 'Could not copy the SVG');
  });
  ui.downloadSvg.addEventListener('click', () => {
    if (lastSvg) download(lastSvg, svgFileName(ui.source.value));
  });

  // Opening a link in the same tab only changes the hash.
  window.addEventListener('hashchange', async () => {
    if (linkedView() === 'gallery') showView('gallery');
    const linked = await decodeHash(location.hash);
    if (linked.text === undefined || linked.text === ui.source.value) return;
    applySettings(readSettings(linked));
    setText(linked.text);
    invalidateGallery();
    changed();
  });
}

async function start(): Promise<void> {
  await mermaid.registerExternalDiagrams([lsc]);
  fillExampleMenu();
  wire();

  // A link wins over the saved state, which wins over the default example.
  const linked = location.hash ? await decodeHash(location.hash) : {};
  const saved = loadSaved();
  applySettings({ ...readSettings(saved), ...readSettings(linked) });
  const text = linked.text ?? saved.text ?? exampleNamed(DEFAULT_EXAMPLE)?.text ?? '';
  setText(text);
  updateButtons();
  save();
  await renderEditor();
  if (linkedView() === 'gallery') showView('gallery');
  document.body.dataset.ready = 'true';
}

start().catch((error: unknown) => {
  ui.error.hidden = false;
  ui.errorText.textContent = `The page failed to start: ${errorMessage(error)}`;
});
