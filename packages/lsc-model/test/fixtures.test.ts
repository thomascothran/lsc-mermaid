// Phase 0 checks: the fixtures match the spec and their expected results are self-consistent.
// Phase 1 adds the checks against parseLsc / validateLsc / unfoldings / partialOrder.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { fixturesDir, loadFixtures } from '../../../fixtures/index.js';

const specPath = join(fixturesDir, '..', 'docs', 'Live Sequence Charts for Mermaid — Proposal.md');

function specExamples(): string[] {
  const spec = readFileSync(specPath, 'utf8');
  const section = spec.split('\n## Worked examples\n')[1]?.split('\n## ')[0] ?? '';
  return section
    .split('\n### ')
    .slice(1)
    .map((part) => /```\n([\s\S]*?)```/.exec(part)?.[1] ?? '');
}

const fixtures = await loadFixtures();

describe('fixtures match the spec', () => {
  it('has one fixture per worked example, with identical text', () => {
    const examples = specExamples();
    expect(examples).toHaveLength(12);
    expect(fixtures.map((f) => f.text).sort()).toEqual([...examples].sort());
  });

  // The spec claims the worked examples use every statement; each pattern is one statement or
  // variant worth pinning.
  const forms: Record<string, RegExp> = {
    'universal header': /^lsc-alpha universal$/m,
    'existential header': /^lsc-alpha existential$/m,
    'subchart header': /^lsc-alpha subchart$/m,
    title: /^\s*title /m,
    accTitle: /^\s*accTitle: /m,
    'accDescr block': /^\s*accDescr \{$/m,
    'defaults cold': /^\s*defaults cold$/m,
    instance: /^\s*instance /m,
    participant: /^\s*participant /m,
    actor: /^\s*actor /m,
    'quoted label': /\bas "/,
    'unquoted label': /^\s*(instance|participant|actor) \w+ as [^"]/m,
    'quoted id': /^\s*(instance|participant|actor) "/m,
    'var bool': /^\s*var .*: bool$/m,
    'var int': /^\s*var .*: int$/m,
    'var int range': /^\s*var .*: int\[\d+\.\.\d+\]$/m,
    'var enum': /^\s*var .*: \{/m,
    'global var': /^\s*var \w+:/m,
    visible: /^\s*visible (?!send |receive )/m,
    'visible send': /^\s*visible send /m,
    'visible receive': /^\s*visible receive /m,
    'activation when': /^\s*activation when /m,
    'activation on': /^\s*activation on (?!send |receive )/m,
    'activation on send': /^\s*activation on send /m,
    prechart: /^\s*prechart$/m,
    'sync message': /^\s*(hot |cold )?\S+ ->> /m,
    'async message': /^\s*(hot |cold )?\S+ -\) /m,
    'hot message': /^\s*hot \S+ (->>|-\)) /m,
    'cold message': /^\s*cold \S+ (->>|-\)) /m,
    'self-message': /^\s*(\w+) (->>|-\)) \1:/m,
    'env message': /^\s*env (->>|-\)) /m,
    send: /^\s*send \w/m,
    'labelled send': /^\s*send #\w+ /m,
    receive: /^\s*receive \w/m,
    'labelled receive': /^\s*receive #\w+ /m,
    condition: /^\s*condition /m,
    'hot condition': /^\s*hot condition /m,
    'cold condition': /^\s*cold condition /m,
    'shared condition': /^\s*condition \w+, /m,
    'quoted condition': /: "[^"]*"$/m,
    'hot progress': /^\s*hot progress /m,
    'cold progress': /^\s*cold progress /m,
    coregion: /^\s*coregion /m,
    simultaneous: /^\s*simultaneous \w+$/m,
    'simultaneous over several': /^\s*simultaneous \w+, /m,
    subchart: /^\s*subchart "/m,
    'subchart over': /^\s*subchart .* over /m,
    'repeat *': /^\s*subchart .* repeat \*$/m,
    'repeat variable': /^\s*subchart .* repeat [a-zA-Z]\w*$/m,
    'local instance': /^\s+subchart [^\n]*\n\s+instance /m,
    if: /^\s*if /m,
    else: /^\s*else/m,
    create: /^\s*create /m,
    destroy: /^\s*destroy /m,
    timeout: /^\s*timeout /m,
    'note over': /^\s*[Nn]ote over /m,
    'note left of': /^\s*note left of /m,
    'note right of': /^\s*note right of /m,
    Note: /^\s*Note /m,
  };

  it.each(Object.entries(forms))('some example uses: %s', (_, pattern) => {
    expect(fixtures.some((f) => pattern.test(f.text))).toBe(true);
  });
});

describe.each(fixtures)('fixture $name', ({ text, expected }) => {
  const lines = text.split('\n');
  const lineAt = (n: number) => lines[n - 1] ?? '';
  const lifetimes = new Set(expected.instances.map((i) => i.id));
  const messageIds = new Set(expected.messages.map((m) => m.id));

  it('header matches kind and mode', () => {
    expect(lineAt(1)).toBe(`lsc-alpha ${expected.mode ?? expected.kind}`);
  });

  it('messages refer to known lifetimes and to lines that mention them', () => {
    expect(messageIds.size).toBe(expected.messages.length);
    for (const m of expected.messages) {
      for (const end of [m.from, m.to]) expect(end === 'env' || lifetimes.has(end), end).toBe(true);
      expect(m.id === m.name || m.id.startsWith(`${m.name}#`), m.id).toBe(true);
      expect(lineAt(m.sendLine), m.id).toContain(`: ${m.name}`);
      expect(lineAt(m.receiveLine), m.id).toContain(`: ${m.name}`);
    }
  });

  it('conditions refer to known lifetimes and condition lines', () => {
    for (const c of expected.conditions) {
      expect(lineAt(c.line), `line ${c.line}`).toMatch(/^\s*((hot|cold) )?(condition|if) /);
      for (const i of [...c.instances, ...c.sharedBy]) expect(lifetimes.has(i), i).toBe(true);
      const columns = c.sharedBy.map((i) => expected.instances.find((x) => x.id === i)!.column);
      expect(columns, `line ${c.line} sharedBy order`).toEqual([...columns].sort((a, b) => a - b));
    }
  });

  it('lifetimes point at create and destroy lines', () => {
    for (const i of expected.instances) {
      if (i.createdAtLine) expect(lineAt(i.createdAtLine)).toMatch(/^\s*create /);
      if (i.destroyedAtLine) expect(lineAt(i.destroyedAtLine)).toMatch(/^\s*destroy /);
    }
  });

  it('location temperatures obey the maximal-location and pre-chart rules', () => {
    for (const [id, parts] of Object.entries(expected.locations ?? {})) {
      expect(lifetimes.has(id), id).toBe(true);
      expect(parts.body.at(-1), `${id} body`).toBe('cold');
      if (parts.prechart)
        expect(new Set(parts.prechart), `${id} prechart`).toEqual(new Set(['cold']));
    }
  });

  it('notes and local instances point at matching lines', () => {
    for (const n of expected.notes ?? []) expect(lineAt(n.line)).toMatch(/^\s*[Nn]ote /);
    for (const i of expected.instances.filter((x) => x.scope))
      expect(text).toContain(`subchart "${i.scope}"`);
  });

  it('order facts use well-formed references', () => {
    const facts = [...expected.order.before, ...expected.order.unordered].flat();
    for (const ref of facts) {
      const event = /^(.+)[!?]$/.exec(ref);
      const located = /^(?:(.+)@)?L(\d+)$/.exec(ref);
      if (located) {
        const [, inst, line] = located;
        if (inst) expect(lifetimes.has(inst), ref).toBe(true);
        expect(lineAt(Number(line)).trim(), ref).not.toBe('');
      } else {
        expect(event && messageIds.has(event[1]!), ref).toBe(true);
      }
    }
  });

  it('diagnostics name rules and real lines', () => {
    for (const d of expected.diagnostics) {
      expect(d.code).toMatch(/^V([1-9]|1\d|2[0-7])$/);
      expect(lineAt(d.line).trim(), `${d.code} line ${d.line}`).not.toBe('');
    }
  });
});
