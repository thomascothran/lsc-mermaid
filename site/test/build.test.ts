import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureNames, fixturesDir } from '../../fixtures/index.js';
import { buildSite, collectExamples, type BuildResult } from '../build.js';

describe('collectExamples', () => {
  it('includes every fixture, the paper figures first', () => {
    const examples = collectExamples();
    expect(examples.map((e) => e.name).sort()).toEqual([...fixtureNames].sort());
    const groups = examples.map((e) => e.group);
    expect(groups).toEqual([...groups].sort((a, b) => (a === b ? 0 : a === 'paper' ? -1 : 1)));
    for (const example of examples) {
      expect(example.text).toBe(readFileSync(join(fixturesDir, example.name, 'chart.lsc'), 'utf8'));
    }
  });

  it('labels figures with their number and title', () => {
    const fig2 = collectExamples().find((e) => e.name === 'fig02-car-departure');
    expect(fig2).toMatchObject({ title: 'Fig. 2 — Car departure', group: 'paper' });
  });
});

describe('buildSite', () => {
  let built: BuildResult;
  const outdir = mkdtempSync(join(tmpdir(), 'lsc-site-'));

  beforeAll(async () => {
    built = await buildSite(outdir);
  }, 60_000);

  afterAll(() => {
    rmSync(outdir, { recursive: true, force: true });
  });

  it('writes a self-contained folder', () => {
    expect(built.files).toEqual(
      expect.arrayContaining([
        'index.html',
        'styles.css',
        'app.js',
        'mermaid.min.js',
        'LICENSE.txt',
        'THIRD-PARTY-NOTICES.txt',
      ]),
    );
  });

  it('links only files in the folder, by relative paths, with classic scripts', () => {
    const html = readFileSync(join(outdir, 'index.html'), 'utf8');
    const document = new JSDOM(html).window.document;
    const refs = [...document.querySelectorAll('[src], link[href], a[href]')].map(
      (el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '',
    );
    expect(refs.length).toBeGreaterThan(3);
    for (const ref of refs) {
      expect(ref).toMatch(/^[\w.-]+$/);
      expect(existsSync(join(outdir, ref))).toBe(true);
    }
    for (const script of document.querySelectorAll('script')) {
      expect(script.getAttribute('type')).toBeNull();
    }
  });

  it('lists the bundled third-party packages', () => {
    const notices = readFileSync(join(outdir, 'THIRD-PARTY-NOTICES.txt'), 'utf8');
    for (const name of ['mermaid', 'langium', 'chevrotain']) {
      expect(notices).toMatch(new RegExp(`^${name} \\d+\\.\\d+\\.\\d+ `, 'm'));
    }
  });

  it('offers every worked example, and loads each into the editor', async () => {
    const html = readFileSync(join(outdir, 'index.html'), 'utf8');
    const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' });
    const { window } = dom;
    const rendered: string[] = [];
    Object.assign(window, {
      // A stand-in for Mermaid's classic build.
      mermaid: {
        registerExternalDiagrams: async () => undefined,
        initialize: () => undefined,
        render: async (_id: string, text: string) => {
          rendered.push(text);
          return { svg: '<svg></svg>' };
        },
      },
    });
    window.eval(readFileSync(join(outdir, 'app.js'), 'utf8'));
    const body = window.document.body;
    await expect.poll(() => body.dataset.ready, { timeout: 10_000 }).toBe('true');

    const select = window.document.getElementById('example') as HTMLSelectElement;
    const source = window.document.getElementById('source') as HTMLTextAreaElement;
    const offered = [...select.querySelectorAll('optgroup option')].map(
      (o) => (o as HTMLOptionElement).value,
    );
    expect([...offered].sort()).toEqual([...fixtureNames].sort());
    expect(select.value).toBe('fig02-car-departure');

    for (const name of fixtureNames) {
      select.value = name;
      select.dispatchEvent(new window.Event('change'));
      expect(source.value).toBe(readFileSync(join(fixturesDir, name, 'chart.lsc'), 'utf8'));
      expect(select.value).toBe(name);
    }
    await expect.poll(() => rendered.at(-1)).toBe(source.value);
    window.close();
  });
});
