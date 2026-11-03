#!/usr/bin/env node
// Prints a link that opens a Live Sequence Chart in the playground, where the reader sees it
// drawn and can edit it. Needs only Node 20 or later: no packages, no network.
//
//   node link.mjs chart.lsc
//   node link.mjs --theme dark --cue line+badge chart.lsc
//   cat chart.lsc | node link.mjs
//   node link.mjs --base file:///path/to/site/dist/index.html chart.lsc
//
// The chart text is deflated into the link, as the playground's own "Copy link" does, so
// nothing is uploaded. `mermaid-lsc --link` writes the same links.

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { deflateRawSync } from 'node:zlib';

const PLAYGROUND_URL = 'https://thomascothran.github.io/lsc-mermaid/';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    theme: { type: 'string' },
    cue: { type: 'string' },
    base: { type: 'string' },
    help: { type: 'boolean', short: 'h' },
  },
});

if (values.help || positionals.length > 1) {
  console.log(
    'Usage: node link.mjs [--theme name] [--cue line|line+color|line+badge] [--base url] [file]',
  );
  process.exit(values.help ? 0 : 2);
}

const file = positionals[0];
const text = readFileSync(file === undefined || file === '-' ? 0 : file, 'utf8');

const params = new URLSearchParams();
if (values.theme && values.theme !== 'default') params.set('theme', values.theme);
if (values.cue && values.cue !== 'line') params.set('cue', values.cue);
params.set('z', deflateRawSync(Buffer.from(text, 'utf8')).toString('base64url'));
const base = (values.base ?? PLAYGROUND_URL).replace(/#.*$/, '');
console.log(`${base}#${params.toString()}`);
