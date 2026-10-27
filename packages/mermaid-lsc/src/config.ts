import { mermaidConfig } from './mermaid-adapter.js';

export type TemperatureCue = 'line' | 'line+color' | 'line+badge';

/**
 * The diagram's `lsc` config block. While the diagram is an external plugin, Mermaid passes it
 * only from `mermaid.initialize` (see "Using the plugin in a page" in the proposal).
 */
export interface LscConfig {
  /** Show the "visible:" line in the header tab. */
  showVisibleEvents: boolean;
  /** A second temperature cue besides the dash pattern, for readers who can't rely on dashes. */
  temperatureCue: TemperatureCue;
  /** Mark rows that have warnings or non-blocking errors, and list the diagnostics below the chart. */
  showDiagnostics: boolean;
  /** Minimum height of a row, in pixels. */
  rowHeight: number;
  /** Minimum horizontal gap between neighbouring head boxes, in pixels. */
  instanceSpacing: number;
  /** Repeat the head boxes at the bottom of the chart. */
  mirrorInstances: boolean;
  useMaxWidth: boolean;
}

export const defaultLscConfig: LscConfig = {
  showVisibleEvents: true,
  temperatureCue: 'line',
  showDiagnostics: true,
  rowHeight: 36,
  instanceSpacing: 40,
  mirrorInstances: false,
  useMaxWidth: true,
};

const CUES: readonly TemperatureCue[] = ['line', 'line+color', 'line+badge'];

/** Merges user settings over the defaults, ignoring values of the wrong type. */
export function resolveLscConfig(user: unknown): LscConfig {
  const config = { ...defaultLscConfig };
  if (typeof user !== 'object' || user === null) return config;
  const u = user as Record<string, unknown>;
  for (const key of [
    'showVisibleEvents',
    'showDiagnostics',
    'mirrorInstances',
    'useMaxWidth',
  ] as const) {
    if (typeof u[key] === 'boolean') config[key] = u[key];
  }
  for (const key of ['rowHeight', 'instanceSpacing'] as const) {
    const value = u[key];
    if (typeof value === 'number' && Number.isFinite(value) && value >= 0) config[key] = value;
  }
  if (CUES.includes(u.temperatureCue as TemperatureCue)) {
    config.temperatureCue = u.temperatureCue as TemperatureCue;
  }
  return config;
}

export function lscConfig(): LscConfig {
  return resolveLscConfig((mermaidConfig() as { lsc?: unknown }).lsc);
}
