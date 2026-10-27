// Visual regression baselines: every fixture rendered through Mermaid, compared with the
// approved SVG in `baselines/`. After an intended change, run `pnpm baselines:update`, then
// review the result with `baselines/index.html` before committing.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureNames, loadFixture } from '../../../fixtures/index.js';
import { renderSvg } from '../src/node.js';

describe('visual baselines', () => {
  it.each(fixtureNames)('%s', async (name) => {
    const { text } = await loadFixture(name);
    const { svg } = await renderSvg(text, { id: `lsc-${name}` });
    await expect(`${svg}\n`).toMatchFileSnapshot(`./baselines/${name}.svg`);
  });
});

describe('baseline gallery', () => {
  it('shows every baseline', () => {
    const gallery = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), 'baselines', 'index.html'),
      'utf8',
    );
    for (const name of fixtureNames) expect(gallery).toContain(`<img src="${name}.svg"`);
  });
});
