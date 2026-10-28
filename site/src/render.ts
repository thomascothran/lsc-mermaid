// Drawing charts with Mermaid's classic build, shared by the playground and the tutorial pages.

import type { Mermaid, MermaidConfig } from 'mermaid';
import type { Settings } from './share.js';

// Mermaid renders one diagram at a time, so every render waits for the one before it.
let queue: Promise<unknown> = Promise.resolve();
export function serially<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

let renderCount = 0;

/** Draws `text` with the given settings. Call it inside `serially`. */
export async function renderSvg(
  mermaid: Mermaid,
  text: string,
  settings: Settings,
): Promise<string> {
  const id = `lsc-${++renderCount}`;
  try {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: settings.theme,
      // The plugin's own config block; Mermaid passes it through untyped.
      lsc: { temperatureCue: settings.cue, showDiagnostics: settings.diagnostics },
    } as MermaidConfig);
    return (await mermaid.render(id, text)).svg;
  } finally {
    // Mermaid can leave its scratch element behind when a render fails.
    document.getElementById(`d${id}`)?.remove();
  }
}

export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.trim() || 'Unknown error';
}
