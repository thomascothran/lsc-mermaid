// The one module that knows about Mermaid internals.
//
// An external diagram cannot import Mermaid's internal modules. Mermaid hands
// some of them to the diagram through `injectUtils`; for the rest this module
// keeps local equivalents. At upstream-port time these are swapped for the
// in-tree versions (`commonDb`, `configureSvgSize`, theme registration, ...).

import type { ExternalDiagramDefinition, MermaidConfig } from 'mermaid';

export type DiagramDefinition = Awaited<ReturnType<ExternalDiagramDefinition['loader']>>['diagram'];
export type DiagramDb = DiagramDefinition['db'];
export type DrawDefinition = DiagramDefinition['renderer']['draw'];

type Logger = Record<
  'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal',
  (...args: unknown[]) => void
>;
type SanitizeText = (text: string, config: MermaidConfig) => string;

const noop = (): void => {};
const silentLogger: Logger = {
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
};

let log: Logger = silentLogger;
let getMermaidConfig: () => MermaidConfig = () => ({});
let sanitizeText: SanitizeText = (text) => text;

/** Receives Mermaid's internals when the diagram is registered. */
export const injectUtils: NonNullable<DiagramDefinition['injectUtils']> = (
  _log,
  _setLogLevel,
  _getConfig,
  _sanitizeText,
) => {
  log = _log as Logger;
  getMermaidConfig = _getConfig as () => MermaidConfig;
  sanitizeText = _sanitizeText as SanitizeText;
};

export function logger(): Logger {
  return log;
}

export function mermaidConfig(): MermaidConfig {
  return getMermaidConfig();
}

/** Sanitises user text the way Mermaid's `commonDb` setters do. */
export function sanitize(text: string): string {
  return sanitizeText(text, getMermaidConfig());
}

/**
 * Sizes the SVG from the layout's own dimensions, honouring `useMaxWidth`.
 * Local equivalent of Mermaid's `configureSvgSize`; it never measures the DOM.
 */
export function configureSvgSize(
  svg: SVGSVGElement,
  width: number,
  height: number,
  useMaxWidth: boolean,
): void {
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  if (useMaxWidth) {
    svg.setAttribute('width', '100%');
    svg.removeAttribute('height');
    svg.style.maxWidth = `${width}px`;
  } else {
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));
    svg.style.removeProperty('max-width');
  }
}
