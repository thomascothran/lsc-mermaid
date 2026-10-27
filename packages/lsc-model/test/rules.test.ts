// Every validation rule V1–V27 with a chart that breaks it and one that keeps it.

import { describe, expect, it } from 'vitest';
import { parseLsc, unfoldings, validateLsc, type Diagnostic } from 'lsc-model';

/** All diagnostics for a chart: parseLsc, plus validateLsc when there is a model. */
function diagnose(lines: string[]): Diagnostic[] {
  const { model, diagnostics } = parseLsc(lines.join('\n'));
  return [...diagnostics, ...(model ? validateLsc(model) : [])];
}

/** A universal chart with an activation, so that V11 stays quiet. */
function chart(...body: string[]): string[] {
  return ['lsc-alpha universal', '  activation when true', ...body.map((l) => `  ${l}`)];
}

function found(lines: string[], code: string): Diagnostic[] {
  return diagnose(lines).filter((d) => d.code === code);
}

interface Case {
  breaks: string[];
  keeps: string[];
  severity: Diagnostic['severity'];
  /** Line of a diagnostic for `breaks`. */
  line: number;
  message?: RegExp;
}

const cases: Record<string, Case[]> = {
  V1: [
    {
      // Each instance's single location waits for the other's.
      breaks: chart('instance a, b', 'simultaneous a, b', '  a -) b: m', '  b -) a: n', 'end'),
      keeps: chart(
        'instance a, b',
        'simultaneous a',
        '  a -) b: m',
        '  send a -) b: n',
        'end',
        'receive b from a: n',
      ),
      severity: 'error',
      line: 5,
      message: /cycle/,
    },
  ],
  V2: [
    {
      breaks: chart('a ->> b: m', 'hot progress b'),
      keeps: chart('a ->> b: m', 'b ->> a: n'),
      severity: 'error',
      line: 4,
    },
    {
      // In the run that takes the else branch, c stops at the guard, which is hot.
      breaks: chart('a ->> c: m', 'if a, c: ready', '  destroy c', 'else', '  a ->> b: n', 'end'),
      keeps: chart(
        'a ->> c: m',
        'if a, c: ready',
        '  destroy c',
        'else',
        '  cold progress c',
        '  a ->> b: n',
        'end',
      ),
      severity: 'error',
      line: 4,
      message: /must be cold/,
    },
  ],
  V3: [
    {
      breaks: chart(
        'instance a, b',
        'simultaneous a',
        '  a -) b: m',
        '  condition a: x',
        '  condition a: y',
        'end',
      ),
      keeps: chart('instance a, b', 'simultaneous a', '  a -) b: m', '  condition a: x', 'end'),
      severity: 'error',
      line: 7,
    },
  ],
  V4: [
    {
      breaks: chart('activation when false', 'a ->> b: m'),
      keeps: chart('activation on env ->> a: go', 'a ->> b: m'),
      severity: 'error',
      line: 3,
    },
  ],
  V5: [
    {
      // A synchronous sender acts between its send and the matching receive.
      breaks: chart('instance a, b, c', 'send a ->> b: m', 'a ->> c: x', 'receive b from a: m'),
      keeps: chart('instance a, b, c', 'send a ->> b: m', 'receive b from a: m', 'a ->> c: x'),
      severity: 'error',
      line: 5,
    },
  ],
  V6: [
    {
      breaks: chart('a ->> b: m', 'condition ghost: x'),
      keeps: chart('a ->> b: m', 'condition a: x'),
      severity: 'error',
      line: 4,
    },
  ],
  V7: [
    {
      breaks: chart('instance a, b', 'subchart "S" over a', '  a ->> b: m', 'end'),
      keeps: chart('instance a, b', 'subchart "S" over a, b', '  a ->> b: m', 'end'),
      severity: 'error',
      line: 4,
    },
  ],
  V8: [
    {
      breaks: chart('a ->> b: m', 'destroy b', 'a ->> b: n'),
      keeps: chart('a ->> b: m', 'destroy b', 'create b by a', 'a ->> b: n'),
      severity: 'error',
      line: 5,
      message: /destroyed on line 4/,
    },
    {
      breaks: chart('a ->> b: m', 'create b by a'),
      keeps: chart('a ->> b: m', 'destroy b', 'create b by a'),
      severity: 'error',
      line: 4,
      message: /still alive/,
    },
  ],
  V9: [
    {
      breaks: chart('instance a, b', 'coregion a', '  a ->> b: m', 'end'),
      keeps: chart('instance a, b', 'coregion a', '  a ->> b: m', '  a ->> b: n', 'end'),
      severity: 'error',
      line: 4,
    },
    {
      breaks: chart(
        'instance a, b, c',
        'coregion a',
        '  a ->> b: m',
        '  c ->> a: x',
        '  b ->> c: n',
        'end',
      ),
      keeps: chart('instance a, b, c', 'coregion a', '  a ->> b: m', '  c ->> a: n', 'end'),
      severity: 'error',
      line: 7,
    },
  ],
  V10: [
    {
      breaks: chart('subchart "Loop" repeat *', '  a -) b: m', 'end'),
      keeps: chart(
        'instance a, b',
        'subchart "Loop" repeat *',
        '  cold condition a: more',
        '  a -) b: m',
        'end',
      ),
      severity: 'warning',
      line: 3,
    },
  ],
  V11: [
    {
      breaks: ['lsc-alpha universal', '  a ->> b: m'],
      keeps: ['lsc-alpha existential', '  a ->> b: m'],
      severity: 'warning',
      line: 1,
    },
  ],
  V12: [
    {
      breaks: chart('prechart', '  cold a ->> b: m', 'end', 'b ->> a: n'),
      keeps: chart('prechart', '  a ->> b: m', 'end', 'cold b ->> a: n'),
      severity: 'error',
      line: 4,
    },
    {
      breaks: chart('prechart', '  a ->> b: m', '  cold progress a', 'end', 'b ->> a: n'),
      keeps: chart('prechart', '  a ->> b: m', 'end', 'cold progress a', 'b ->> a: n'),
      severity: 'error',
      line: 5,
    },
  ],
  V13: [
    {
      breaks: chart('var a.mode: {on, off}', 'a ->> b: m', 'condition a: mode = 3'),
      keeps: chart('var a.mode: {on, off}', 'a ->> b: m', 'condition a: mode = off'),
      severity: 'error',
      line: 5,
    },
    {
      breaks: chart(
        'var a.ready: bool',
        'var b.ready: bool',
        'a ->> b: m',
        'condition a, b: ready',
      ),
      keeps: chart(
        'var a.ready: bool',
        'var b.ready: bool',
        'a ->> b: m',
        'condition a, b: a.ready',
      ),
      severity: 'error',
      line: 6,
      message: /ambiguous/,
    },
    {
      breaks: chart('var a.mode: {on, off}', 'a ->> b: m', 'condition a: mode = stop'),
      keeps: chart('var a.mode: {on, off}', 'a ->> b: m', 'condition a: on'),
      severity: 'error',
      line: 5,
      message: /not a value of a\.mode/,
    },
  ],
  V14: [
    {
      breaks: chart('env ->> a: go'),
      keeps: chart('env -) a: go'),
      severity: 'info',
      line: 3,
    },
  ],
  V15: [
    {
      breaks: chart('instance a, b, c', 'coregion a', '  a ->> b: m', '  a ->> c: n', 'end'),
      keeps: chart('instance a, b, c', 'coregion a', '  a -) b: m', '  a -) c: n', 'end'),
      severity: 'info',
      line: 4,
    },
  ],
  V16: [
    {
      breaks: chart('a -) b: ping', 'a -) b: ping'),
      keeps: chart(
        'send #one a -) b: ping',
        'receive #one b from a: ping',
        'send #two a -) b: ping',
        'receive #two b from a: ping',
      ),
      severity: 'info',
      line: 4,
    },
  ],
  V17: [
    {
      breaks: chart('subchart "R" repeat n', '  a -) b: m', 'end'),
      keeps: [
        'lsc-alpha universal',
        '  var n: int',
        '  activation when true',
        '  subchart "R" repeat n',
        '    a -) b: m',
        '  end',
      ],
      severity: 'error',
      line: 3,
    },
    {
      breaks: chart('var n: bool', 'subchart "R" repeat n', '  a -) b: m', 'end'),
      keeps: chart('var n: int[1..3]', 'subchart "R" repeat n', '  a -) b: m', 'end'),
      severity: 'error',
      line: 4,
    },
  ],
  V18: [
    {
      breaks: chart('instance a, b', 'send a -) b: m'),
      keeps: chart('instance a, b', 'send a -) b: m', 'receive b from a: m'),
      severity: 'error',
      line: 4,
    },
    {
      breaks: chart('instance a, b', 'receive b from a: m'),
      keeps: chart('instance a, b', 'a -) b: m'),
      severity: 'error',
      line: 4,
    },
    {
      breaks: chart(
        'instance a, b',
        'send #x a -) b: m',
        'send #x a -) b: m',
        'receive #x b from a: m',
      ),
      keeps: chart(
        'instance a, b',
        'send #x a -) b: m',
        'send #y a -) b: m',
        'receive #x b from a: m',
        'receive #y b from a: m',
      ),
      severity: 'error',
      line: 5,
    },
    {
      breaks: chart('instance a, b', 'send #x a -) b: m', 'receive #x b from a: n'),
      keeps: chart('instance a, b', 'send #x a -) b: m', 'receive #x b from a: m'),
      severity: 'error',
      line: 5,
    },
  ],
  V19: [
    {
      breaks: chart('instance a', 'send env -) a: m', 'receive a from env: m'),
      keeps: chart('instance a', 'env -) a: m'),
      severity: 'error',
      line: 4,
    },
  ],
  V20: [
    {
      breaks: chart('var a.ready: bool', 'a ->> b: m', 'condition a: redy'),
      keeps: chart('var a.ready: bool', 'a ->> b: m', 'condition a: ready'),
      severity: 'warning',
      line: 5,
    },
    {
      breaks: chart('a ->> b: m', 'condition a: armed'),
      keeps: chart('a ->> b: m', 'condition a: "armed and ready"'),
      severity: 'info',
      line: 4,
    },
  ],
  V21: [
    {
      breaks: chart(
        'instance a, b',
        'subchart "S"',
        '  send a -) b: m',
        'end',
        'receive b from a: m',
      ),
      keeps: chart(
        'instance a, b',
        'subchart "S"',
        '  send a -) b: m',
        '  receive b from a: m',
        'end',
      ),
      severity: 'warning',
      line: 7,
    },
  ],
  V22: [
    {
      breaks: ['lsc-alpha', '  a ->> b: m'],
      keeps: ['lsc-alpha existential', '  a ->> b: m'],
      severity: 'error',
      line: 1,
    },
  ],
  V23: [
    {
      breaks: chart('a -->> b: m'),
      keeps: chart('cold a ->> b: m'),
      severity: 'error',
      line: 3,
      message: /Write `cold a ->> b: m`/,
    },
  ],
  V24: [
    {
      breaks: chart('a ->> b: m', 'create participant c'),
      keeps: chart('a ->> b: m', 'create c by a'),
      severity: 'error',
      line: 4,
      message: /create c by y/,
    },
  ],
  V25: [
    {
      breaks: ['lsc-alpha universal', '  activation on send env ->> a: go', '  a ->> b: m'],
      keeps: ['lsc-alpha universal', '  activation on send c ->> a: go', '  a ->> b: m'],
      severity: 'error',
      line: 2,
    },
  ],
  V26: [
    {
      breaks: chart('instance a, b, c', 'simultaneous a, c', '  a -) b: m', 'end'),
      keeps: chart('instance a, b, c', 'simultaneous a, b', '  a -) b: m', 'end'),
      severity: 'error',
      line: 4,
    },
  ],
  V27: [
    {
      breaks: ['lsc-alpha subchart', '  activation when true', '  a ->> b: m'],
      keeps: ['lsc-alpha subchart', '  a ->> b: m'],
      severity: 'error',
      line: 2,
    },
    {
      breaks: ['lsc-alpha subchart', '  prechart', '    a ->> b: m', '  end', '  b ->> a: n'],
      keeps: ['lsc-alpha universal', '  prechart', '    a ->> b: m', '  end', '  b ->> a: n'],
      severity: 'error',
      line: 2,
    },
  ],
};

describe('validation rules', () => {
  it('covers every rule V1–V27', () => {
    expect(Object.keys(cases).sort()).toEqual(
      Array.from({ length: 27 }, (_, i) => `V${i + 1}`).sort(),
    );
  });

  for (const [code, list] of Object.entries(cases)) {
    describe(code, () => {
      list.forEach((c, i) => {
        it(`reports a chart that breaks it (${i + 1})`, () => {
          const hit = found(c.breaks, code).find((d) => d.span?.start.line === c.line);
          expect(hit, JSON.stringify(diagnose(c.breaks), null, 1)).toBeDefined();
          expect(hit!.severity).toBe(c.severity);
          if (c.message) expect(hit!.message).toMatch(c.message);
        });
        it(`accepts a chart that keeps it (${i + 1})`, () => {
          expect(
            diagnose(c.keeps).filter((d) => d.code === code || d.severity === 'error'),
          ).toEqual([]);
        });
      });
    });
  }
});

describe('severity on cold-exit unfoldings', () => {
  it('suggests if … else when a violation needs two sibling guarded subcharts to run', () => {
    const lines = chart(
      'instance a',
      'subchart "Left"',
      '  cold condition a: x',
      '  create c by a',
      'end',
      'subchart "Right"',
      '  cold condition a: y',
      '  create c by a',
      'end',
    );
    const [v8] = found(lines, 'V8');
    expect(v8).toMatchObject({ severity: 'error', span: { start: { line: 10 } } });
    expect(v8!.message).toMatch(/both "Left" and "Right" run.*if … else/);
  });

  it('downgrades a violation found only on cold-exit unfoldings to a warning', () => {
    const lines = chart(
      'instance a, b',
      'subchart "Done"',
      '  cold condition a: finished',
      '  destroy b',
      'end',
      'create b by a',
    );
    const [v8] = found(lines, 'V8');
    expect(v8).toMatchObject({ severity: 'warning', span: { start: { line: 8 } } });
    expect(v8!.unfolding).toBeDefined();
  });
});

describe('unfolding cap', () => {
  const guarded = Array.from({ length: 9 }, (_, i) => [
    `subchart "S${i}"`,
    `  cold condition a: g${i}`,
    '  a -) b: m',
    'end',
  ]).flat();

  it('stops at the limit and warns', () => {
    const { model } = parseLsc(chart('instance a, b', ...guarded).join('\n'));
    expect(unfoldings(model!)).toHaveLength(256);
    expect(unfoldings(model!, { limit: 10 })).toHaveLength(10);
    const diagnostics = validateLsc(model!, { limit: 300 });
    expect(diagnostics.filter((d) => d.code === 'unfoldings')).toHaveLength(1);
    expect(validateLsc(model!, { limit: 600 }).filter((d) => d.code === 'unfoldings')).toEqual([]);
  });
});
