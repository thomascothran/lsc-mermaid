// The Live Sequence Charts skill: SKILL.md and the notation reference that the site also
// publishes as llms.txt. Its charts must show only the problems they mean to show, and it must
// keep up with the validator's codes, the notation's words and the tutorial's lessons.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseLsc, validateLsc, type Diagnostic } from 'lsc-model';
import { renderSvg } from 'mermaid-lsc/node';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const skillDir = join(root, 'skills', 'live-sequence-charts');
const skill = readFileSync(join(skillDir, 'SKILL.md'), 'utf8');
const reference = readFileSync(join(skillDir, 'reference.md'), 'utf8');
const proposal = readFileSync(
  join(root, 'docs', 'Live Sequence Charts for Mermaid — Proposal.md'),
  'utf8',
);

interface Chart {
  file: string;
  line: number;
  text: string;
  expect?: 'warning' | 'error';
}

/** The ```lsc blocks of a Markdown file; `expect=warning` or `expect=error` marks a problem shown on purpose. */
function charts(file: string, markdown: string): Chart[] {
  const found: Chart[] = [];
  for (const m of markdown.matchAll(/^```lsc([^\n]*)\n([\s\S]*?)^```$/gm)) {
    const expect = /\bexpect=(warning|error)\b/.exec(m[1]!)?.[1] as Chart['expect'];
    const line = markdown.slice(0, m.index).split('\n').length + 1;
    found.push({ file, line, text: m[2]!, ...(expect ? { expect } : {}) });
  }
  return found;
}

function diagnose(text: string): Diagnostic[] {
  const { model, diagnostics } = parseLsc(text);
  if (model) diagnostics.push(...validateLsc(model));
  return diagnostics.filter((d) => d.severity !== 'info');
}

/** Every diagnostic code that lsc-model can report. */
function validatorCodes(): string[] {
  const dir = join(root, 'packages', 'lsc-model', 'src');
  const codes = new Set<string>();
  for (const file of readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const source = readFileSync(join(dir, file), 'utf8');
    for (const m of source.matchAll(/'(V\d+)'|code: '([a-z]+)'/g)) codes.add(m[1] ?? m[2]!);
  }
  return [...codes].sort();
}

/** A section of a Markdown file, from its heading to the next heading of that level. */
function section(markdown: string, heading: string): string {
  const start = markdown.indexOf(`\n${heading}\n`);
  expect(start, `no section ${heading}`).toBeGreaterThan(-1);
  const level = /^#+/.exec(heading)![0];
  const rest = markdown.slice(start + heading.length + 2);
  const end = rest.search(new RegExp(`^${level} `, 'm'));
  return end === -1 ? rest : rest.slice(0, end);
}

/** The words after `label` in a paragraph, up to the closing full stop. */
function wordList(text: string, label: string): string[] {
  const at = text.indexOf(label);
  expect(at, `no "${label}"`).toBeGreaterThan(-1);
  const list = /`([^`]+)`/.exec(text.slice(at))![1]!;
  return list.split(/\s+/).filter(Boolean);
}

const all = [...charts('SKILL.md', skill), ...charts('reference.md', reference)];

describe('the skill', () => {
  it('has the front matter Agent Skills expect', () => {
    const front = /^---\nname: (.+)\ndescription: (.+)\n---\n/.exec(skill);
    expect(front).not.toBeNull();
    expect(front![1]).toBe('live-sequence-charts');
    expect(front![2]!.length).toBeLessThanOrEqual(1024);
  });

  it('links the reference', () => {
    expect(skill).toContain('[reference.md](reference.md)');
  });
});

describe('the reference', () => {
  it('describes every diagnostic code, and no others', () => {
    const table = section(reference, '## 8. Diagnostics');
    const listed = [...table.matchAll(/^\| `([A-Za-z0-9]+)` /gm)].map((m) => m[1]!).sort();
    expect(listed).toEqual(validatorCodes());
  });

  it("lists the notation's words as the proposal does", () => {
    const spec = section(proposal, '### Reserved words');
    const ours = section(reference, '## 6. Placement, names and comments');
    expect(wordList(ours, 'Words in use')).toEqual(wordList(spec, 'In use'));
    expect(wordList(ours, 'Reserved for later')).toEqual(wordList(spec, 'Reserved for later'));
  });

  it('uses every word of the notation outside the word list', () => {
    const spec = section(proposal, '### Reserved words');
    const body = reference.replace(/- Words in use:[\s\S]*?\n\n/, '');
    const spans = [...body.matchAll(/`([^`\n]+)`/g)].map((m) => m[1]!);
    const tokens = new Set(spans.flatMap((s) => s.split(/[^A-Za-z-]+/)));
    const missing = wordList(spec, 'In use').filter((w) => !tokens.has(w));
    expect(missing).toEqual([]);
  });

  it('links only lessons that exist', () => {
    const lessons = new Set(
      readdirSync(join(root, 'site', 'tutorial', 'lessons')).map((f) => f.replace(/\.md$/, '')),
    );
    const linked = [...`${skill}\n${reference}`.matchAll(/`(\d\d-[a-z-]+)\.html`/g)].map(
      (m) => m[1]!,
    );
    expect(linked.length).toBeGreaterThan(10);
    expect(linked.filter((slug) => !lessons.has(slug))).toEqual([]);
  });

  it('has an example for most constructs', () => {
    expect(all.length).toBeGreaterThanOrEqual(6);
    const examples = all.map((c) => c.text).join('\n');
    for (const word of [
      'universal',
      'existential',
      'activation on',
      'prechart',
      'progress',
      'condition',
      'subchart',
      'repeat',
      '  if ',
      '  else\n',
      'visible',
      '-)',
      'env',
    ])
      expect(examples, word).toContain(word);
  });
});

describe('the charts in the skill', () => {
  const named = all.map((chart) => [`${chart.file}:${chart.line}`, chart] as const);

  it.each(named)('%s shows only the problems it means to show', (_name, chart) => {
    const found = diagnose(chart.text);
    const worst = found.some((d) => d.severity === 'error')
      ? 'error'
      : found.length
        ? 'warning'
        : undefined;
    expect(
      worst,
      found
        .map((d) => `${d.severity} ${d.code} line ${d.span?.start.line}: ${d.message}`)
        .join('\n'),
    ).toBe(chart.expect);
  });

  it.each(named.filter(([, chart]) => chart.expect !== 'error'))(
    '%s is drawn',
    async (_n, chart) => {
      const { svg } = await renderSvg(chart.text);
      expect(svg).toMatch(/^<svg/);
    },
  );
});
