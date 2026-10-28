import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { JSDOM } from 'jsdom';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { fixtureNames, fixturesDir } from '../../fixtures/index.js';
import { buildSite, collectExamples, type BuildResult } from '../build.js';
import { readLessons } from '../tutorial/pages.ts';

/** Every local file a page refers to, relative to the output folder; fails on any other reference. */
function localRefs(html: string, page: string, outdir: string): string[] {
  const document = new JSDOM(html).window.document;
  const refs = [...document.querySelectorAll('[src], link[href], a[href]')].map(
    (el) => el.getAttribute('src') ?? el.getAttribute('href') ?? '',
  );
  return refs
    .filter((ref) => !/^https:\/\/github\.com\//.test(ref))
    .map((ref) => {
      expect(ref, `${page}: ${ref}`).toMatch(/^(\.\.\/)?[\w.-]+(\/[\w.-]+)?(#.*)?$/);
      const file = relative(outdir, join(outdir, dirname(page), ref.replace(/#.*$/, '')));
      expect(file.startsWith('..'), `${page}: ${ref}`).toBe(false);
      return file;
    });
}

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
    const pages = [
      'index.html',
      'tutorial/index.html',
      ...readLessons().map((l) => `tutorial/${l.slug}.html`),
    ];
    for (const page of pages) {
      const html = readFileSync(join(outdir, page), 'utf8');
      const files = localRefs(html, page, outdir);
      expect(files.length).toBeGreaterThan(3);
      for (const file of files)
        expect(existsSync(join(outdir, file)), `${page}: ${file}`).toBe(true);
      for (const script of new JSDOM(html).window.document.querySelectorAll('script')) {
        expect(script.getAttribute('type')).toBeNull();
      }
    }
  });

  it('links the playground and the tutorial to each other', () => {
    const playground = new JSDOM(readFileSync(join(outdir, 'index.html'), 'utf8')).window.document;
    expect(playground.querySelector('.views a')?.getAttribute('href')).toBe('tutorial/index.html');
    const lesson = new JSDOM(
      readFileSync(join(outdir, 'tutorial', `${readLessons()[0]?.slug}.html`), 'utf8'),
    ).window.document;
    const views = [...lesson.querySelectorAll('.views a')].map((a) => a.getAttribute('href'));
    expect(views).toEqual(['../index.html', '../index.html#view=gallery', 'index.html']);
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

  /** Loads a built page in jsdom with a stand-in for Mermaid that records what it draws. */
  function loadPage(page: string, script: string, hash = '') {
    const html = readFileSync(join(outdir, page), 'utf8');
    const dom = new JSDOM(html, {
      url: `https://example.test/${page}${hash}`,
      runScripts: 'outside-only',
    });
    const { window } = dom;
    const rendered: string[] = [];
    Object.assign(window, {
      mermaid: {
        registerExternalDiagrams: async () => undefined,
        initialize: () => undefined,
        render: async (_id: string, text: string) => {
          rendered.push(text);
          if (text.includes('-->>')) throw new Error('line 4: bad arrow');
          return { svg: `<svg data-text="${encodeURIComponent(text)}"></svg>` };
        },
      },
    });
    window.eval(readFileSync(join(outdir, script), 'utf8'));
    return { window, rendered };
  }

  it('opens the gallery from a #view=gallery link', async () => {
    const { window } = loadPage('index.html', 'app.js', '#view=gallery');
    await expect.poll(() => window.document.body.dataset.ready, { timeout: 10_000 }).toBe('true');
    expect(window.document.getElementById('gallery-view')?.hidden).toBe(false);
    expect(window.document.getElementById('editor-view')?.hidden).toBe(true);
    window.close();
  });

  it('draws every chart in every lesson, and redraws a chart as it is edited', async () => {
    for (const lesson of readLessons()) {
      const { window, rendered } = loadPage(`tutorial/${lesson.slug}.html`, 'tutorial/tutorial.js');
      const body = window.document.body;
      await expect.poll(() => body.dataset.ready, { timeout: 10_000 }).toBe('true');
      const examples = [...window.document.querySelectorAll('figure.lsc-example')];
      expect(examples.length).toBeGreaterThan(0);
      for (const example of examples) {
        const text = example.querySelector('textarea')?.value ?? '';
        expect(rendered).toContain(text);
        const drawn = example.querySelector('.figure svg') !== null;
        const failed = example.querySelector<HTMLElement>('.example-error')?.hidden === false;
        expect(drawn !== failed, `${lesson.slug}: ${text}`).toBe(true);
        expect(failed).toBe(
          example.getAttribute('data-expect') === 'error' && text.includes('-->>'),
        );
      }
      window.close();
    }

    const first = readLessons()[0]?.slug ?? '';
    const { window, rendered } = loadPage(`tutorial/${first}.html`, 'tutorial/tutorial.js');
    await expect.poll(() => window.document.body.dataset.ready, { timeout: 10_000 }).toBe('true');
    const example = window.document.querySelector('figure.lsc-example');
    const source = example?.querySelector('textarea');
    const reset = example?.querySelector<HTMLButtonElement>('.reset');
    const open = example?.querySelector<HTMLAnchorElement>('.open');
    if (!source || !reset || !open) throw new Error('missing parts');
    const original = source.value;
    expect(open.getAttribute('href')).toMatch(/^\.\.\/index\.html#(z|t)=/);
    expect(reset.hidden).toBe(true);
    source.value = `${original}  customer ->> barista: thanks\n`;
    source.dispatchEvent(new window.Event('input'));
    expect(reset.hidden).toBe(false);
    await expect.poll(() => rendered.at(-1)).toBe(source.value);
    await expect.poll(() => open.getAttribute('href')).toMatch(/^\.\.\/index\.html#t=/);
    reset.click();
    expect(source.value).toBe(original);
    expect(reset.hidden).toBe(true);
    await expect.poll(() => rendered.at(-1)).toBe(original);
    window.close();
  }, 60_000);
});
