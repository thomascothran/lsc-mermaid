// Links that open a chart in the playground, in the form the playground's own "Copy link"
// writes: the settings that differ from the defaults, and the chart text deflated into `z`.
// skills/live-sequence-charts/scripts/link.mjs writes the same links without this package.

import { deflateRawSync } from 'node:zlib';

/** The published playground. */
export const PLAYGROUND_URL = 'https://thomascothran.github.io/lsc-mermaid/';

export interface LinkOptions {
  /** Mermaid theme; left out of the link when `default`. */
  theme?: string;
  /** Temperature cue; left out of the link when `line`. */
  cue?: string;
  /** The playground's address, for example a local `file:///…/site/dist/index.html`. */
  base?: string;
}

/** A link that opens `text` in the playground. */
export function playgroundLink(text: string, options: LinkOptions = {}): string {
  const params = new URLSearchParams();
  if (options.theme && options.theme !== 'default') params.set('theme', options.theme);
  if (options.cue && options.cue !== 'line') params.set('cue', options.cue);
  params.set('z', deflateRawSync(Buffer.from(text, 'utf8')).toString('base64url'));
  const base = (options.base ?? PLAYGROUND_URL).replace(/#.*$/, '');
  return `${base}#${params.toString()}`;
}
