// Renders charts to SVG outside a browser, by running Mermaid with the plugin inside jsdom. The
// output is the same SVG Mermaid produces in a page, so themes, front matter and `%%{init}%%`
// directives behave as they do there.

import type { Diagnostic } from 'lsc-model';
import type { Mermaid as MermaidApi, MermaidConfig } from 'mermaid';
import type { LscDb } from './db.js';

export interface RenderOptions {
  /** Passed to `mermaid.initialize`, for example `{ theme: 'dark', lsc: { … } }`. */
  config?: MermaidConfig & { lsc?: unknown };
  /** The id of the `<svg>` element; CSS rules are scoped to it. */
  id?: string;
}

export interface RenderResult {
  svg: string;
  /** Warnings and non-blocking errors; lines count front matter. */
  diagnostics: Diagnostic[];
}

/** Thrown when a chart can't be rendered. `diagnostics` holds the errors that stopped it. */
export class LscRenderError extends Error {
  constructor(
    message: string,
    readonly diagnostics: Diagnostic[],
  ) {
    super(message);
    this.name = 'LscRenderError';
  }
}

let mermaidPromise: Promise<MermaidApi> | undefined;

async function installDom(): Promise<void> {
  if (typeof globalThis.document !== 'undefined') return;
  const { JSDOM } = await import('jsdom');
  const { window } = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });
  const target = globalThis as Record<string, unknown>;
  for (const key of Object.getOwnPropertyNames(window)) {
    if (key in target) continue;
    Object.defineProperty(target, key, {
      configurable: true,
      get: () => (window as unknown as Record<string, unknown>)[key],
    });
  }
  for (const key of ['window', 'document', 'navigator', 'self'] as const) {
    Object.defineProperty(target, key, { configurable: true, value: window[key] });
  }
}

async function loadMermaid(): Promise<MermaidApi> {
  mermaidPromise ??= (async () => {
    await installDom();
    const mermaid = (await import('mermaid')).default;
    const lsc = (await import('./index.js')).default;
    await mermaid.registerExternalDiagrams([lsc]);
    return mermaid;
  })();
  return mermaidPromise;
}

/** Renders one chart to an SVG string. */
export async function renderSvg(text: string, options: RenderOptions = {}): Promise<RenderResult> {
  const mermaid = await loadMermaid();
  mermaid.initialize({ startOnLoad: false, ...options.config } as MermaidConfig);
  let diagnostics: Diagnostic[];
  try {
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(text);
    if (diagram.type !== 'liveSequenceChart') {
      throw new LscRenderError(
        `Not a Live Sequence Chart: the text starts a "${diagram.type}" diagram.`,
        [],
      );
    }
    diagnostics = (diagram.db as LscDb).diagnostics;
  } catch (error) {
    if (error instanceof LscRenderError) throw error;
    const found = (error as { diagnostics?: Diagnostic[] }).diagnostics ?? [];
    throw new LscRenderError(error instanceof Error ? error.message : String(error), found);
  }
  const { svg } = await mermaid.render(options.id ?? 'lsc', text);
  return { svg, diagnostics };
}
