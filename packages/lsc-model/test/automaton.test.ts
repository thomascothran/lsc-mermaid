// The skeleton automaton: one test per construct it reads, the unsupported constructs A1–A6,
// and the committed automata of the fixtures that lsc-pavlov's tests model-check.

import { describe, expect, it } from 'vitest';
import {
  parseLsc,
  skeletonAutomaton,
  type AutomatonState,
  type SkeletonAutomaton,
  type WaitState,
} from 'lsc-model';
import { loadFixtures } from '../../../fixtures/index.js';

function automaton(...lines: string[]): SkeletonAutomaton {
  const { model, diagnostics } = parseLsc(lines.join('\n'));
  if (!model) throw new Error(diagnostics.map((d) => d.message).join('\n'));
  const result = skeletonAutomaton(model);
  if (!result.automaton) throw new Error(result.diagnostics.map((d) => d.message).join('\n'));
  return result.automaton;
}

function codes(...lines: string[]): string[] {
  const { model, diagnostics } = parseLsc(lines.join('\n'));
  if (!model) throw new Error(diagnostics.map((d) => d.message).join('\n'));
  const result = skeletonAutomaton(model);
  expect(result.automaton).toBeUndefined();
  return result.diagnostics.map((d) => d.code);
}

/** Event labels as `from->to/name` plus `!` or `?` for an asynchronous event. */
function label(a: SkeletonAutomaton, index: number): string {
  const e = a.events[index]!;
  return `${e.from}->${e.to}/${e.name}${e.dir ?? ''}`;
}

function state(a: SkeletonAutomaton, id: number): AutomatonState {
  return a.states[id]!;
}

function wait(a: SkeletonAutomaton, id: number): WaitState {
  const s = state(a, id);
  if (s.kind !== 'wait') throw new Error(`state ${id} is ${s.kind}`);
  return s;
}

/** The events enabled in a wait state. */
function enabled(a: SkeletonAutomaton, id: number): string[] {
  return wait(a, id).on.map(([e]) => label(a, e));
}

/** Follow events by label from a state. */
function after(a: SkeletonAutomaton, from: number, ...events: string[]): number {
  let at = from;
  for (const e of events) {
    const edge = wait(a, at).on.find(([x]) => label(a, x) === e);
    if (!edge) throw new Error(`${e} is not enabled in state ${at}: ${enabled(a, at).join(', ')}`);
    at = edge[1];
  }
  return at;
}

function outcome(a: SkeletonAutomaton, id: number): string {
  const s = state(a, id);
  return s.kind === 'outcome' ? s.outcome : s.kind;
}

describe('skeletonAutomaton', () => {
  it('makes a synchronous message one event and an asynchronous message two', () => {
    const a = automaton('lsc-alpha existential', '  a ->> b: ping', '  b -) a: pong');
    expect(a.events.map((_, i) => label(a, i))).toEqual(['a->b/ping', 'b->a/pong!', 'b->a/pong?']);
    expect(outcome(a, after(a, a.start, 'a->b/ping', 'b->a/pong!', 'b->a/pong?'))).toBe(
      'completed',
    );
  });

  it('is hot at a hot location, including location 0, and while a hot message is in flight', () => {
    const a = automaton(
      'lsc-alpha universal',
      '  activation on env ->> a: go',
      '  a -) b: m',
      '  cold progress a, b',
      '  hot a -) b: n',
      '  cold b -) a: o',
    );
    const body = after(a, a.start, 'env->a/go');
    expect(wait(a, a.start)).toMatchObject({ phase: 'inactive', hot: false, deviation: 'ignore' });
    expect(wait(a, body)).toMatchObject({ phase: 'body', hot: true, deviation: 'abort' });
    const cold = after(a, body, 'a->b/m!', 'a->b/m?');
    expect(wait(a, cold).hot).toBe(false);
    // n is hot: once sent, its receipt is promised.
    expect(wait(a, after(a, cold, 'a->b/n!')).hot).toBe(true);
    const sent = after(a, cold, 'a->b/n!', 'a->b/n?', 'b->a/o!');
    expect(wait(a, sent).hot).toBe(false);
  });

  it('holds no promise at the start of a chart with no activation and no pre-chart', () => {
    const a = automaton('lsc-alpha universal', '  a ->> b: m', '  b ->> a: n');
    expect(wait(a, a.start)).toMatchObject({ phase: 'body', hot: false, deviation: 'abort' });
    expect(wait(a, after(a, a.start, 'a->b/m')).hot).toBe(true);
  });

  it('marks an activation event invisible unless the chart contains it', () => {
    const hidden = automaton(
      'lsc-alpha universal',
      '  activation on env ->> a: go',
      '  a ->> b: m',
    );
    expect(hidden.events[hidden.activation!]).toMatchObject({ name: 'go', visible: false });
    const drawn = automaton('lsc-alpha universal', '  activation on a ->> b: m', '  a ->> b: m');
    expect(drawn.events[drawn.activation!]).toMatchObject({ name: 'm', visible: true });
    expect(drawn.events).toHaveLength(1);
  });

  it('adds declared visible events, both events of an undirected asynchronous message', () => {
    const a = automaton(
      'lsc-alpha universal',
      '  activation on env ->> a: go',
      '  visible a -) b: x',
      '  visible receive b -) a: y',
      '  a ->> b: m',
    );
    expect(a.events.map((_, i) => label(a, i))).toEqual([
      'a->b/m',
      'a->b/x!',
      'a->b/x?',
      'b->a/y?',
      'env->a/go',
    ]);
    expect(a.events.every((e) => e.visible || e.name === 'go')).toBe(true);
  });

  it('matches the pre-chart, ignoring deviations only before matching starts', () => {
    const a = automaton(
      'lsc-alpha universal',
      '  prechart',
      '    a ->> b: p',
      '    a ->> b: q',
      '  end',
      '  b ->> a: r',
    );
    expect(wait(a, a.start)).toMatchObject({ phase: 'prechart', deviation: 'ignore', hot: false });
    const second = after(a, a.start, 'a->b/p');
    expect(wait(a, second)).toMatchObject({ phase: 'prechart', deviation: 'not-activated' });
    // The hand-over point is passed at once.
    expect(wait(a, after(a, second, 'a->b/q'))).toMatchObject({ phase: 'body', hot: true });
  });

  it('treats every pre-chart deviation as not activated when there is an activation message', () => {
    const a = automaton(
      'lsc-alpha universal',
      '  activation on env ->> a: go',
      '  prechart',
      '    a ->> b: p',
      '  end',
      '  b ->> a: r',
    );
    expect(wait(a, after(a, a.start, 'env->a/go')).deviation).toBe('not-activated');
  });

  it('evaluates conditions before events, with their outcomes', () => {
    const a = automaton(
      'lsc-alpha universal',
      '  activation on env ->> a: go',
      '  prechart',
      '    condition a: ready',
      '  end',
      '  hot condition a: 1 + 1 = 2',
      '  a ->> b: m',
      '  cold condition b: done',
    );
    const pre = state(a, after(a, a.start, 'env->a/go'));
    expect(pre).toMatchObject({ kind: 'condition', phase: 'prechart' });
    if (pre.kind !== 'condition') return;
    expect(a.conditions[pre.condition]).toEqual({
      id: 'c1',
      text: 'ready',
      temp: 'cold',
      part: 'prechart',
    });
    expect(outcome(a, pre.ifFalse)).toBe('not-activated');
    const hot = state(a, pre.ifTrue);
    if (hot.kind !== 'condition') throw new Error('expected a condition');
    expect(a.conditions[hot.condition]).toMatchObject({ temp: 'hot', part: 'body', value: true });
    expect(hot.hot).toBe(true);
    expect(outcome(a, hot.ifFalse)).toBe('abort');
    const cold = state(a, after(a, hot.ifTrue, 'a->b/m'));
    if (cold.kind !== 'condition') throw new Error('expected a condition');
    expect(outcome(a, cold.ifFalse)).toBe('exit');
    expect(outcome(a, cold.ifTrue)).toBe('completed');
  });

  it('evaluates a shared condition once every sharer has reached it', () => {
    const a = automaton(
      'lsc-alpha existential',
      '  a ->> c: x',
      '  b ->> c: y',
      '  condition a, b: ok',
    );
    expect(state(a, after(a, a.start, 'a->c/x')).kind).toBe('wait');
    expect(state(a, after(a, a.start, 'a->c/x', 'b->c/y')).kind).toBe('condition');
  });

  it('leaves coregion events unordered', () => {
    const a = automaton(
      'lsc-alpha existential',
      '  instance a, b, c, d',
      '  coregion b',
      '    a -) b: x',
      '    c -) b: y',
      '  end',
      '  b ->> d: z',
    );
    const sent = after(a, a.start, 'a->b/x!', 'c->b/y!');
    expect(enabled(a, sent).sort()).toEqual(['a->b/x?', 'c->b/y?']);
    expect(after(a, sent, 'a->b/x?', 'c->b/y?')).toBe(after(a, sent, 'c->b/y?', 'a->b/x?'));
    expect(enabled(a, after(a, sent, 'c->b/y?', 'a->b/x?'))).toEqual(['b->d/z']);
  });

  it('takes the first enabled occurrence in text order when an event is enabled twice', () => {
    const a = automaton(
      'lsc-alpha existential',
      '  instance a, b',
      '  coregion b',
      '    a -) b: m',
      '    a -) b: m',
      '  end',
    );
    expect(enabled(a, after(a, a.start, 'a->b/m!', 'a->b/m!'))).toEqual(['a->b/m?']);
  });

  it('carries cuts as the location each lifetime has reached', () => {
    const a = automaton('lsc-alpha existential', '  a ->> b: m', '  b ->> a: n');
    expect(wait(a, after(a, a.start, 'a->b/m')).cut).toEqual([
      { instance: 'a', part: 'body', index: 1 },
      { instance: 'b', part: 'body', index: 1 },
    ]);
  });

  it('round-trips through JSON', () => {
    const a = automaton('lsc-alpha universal', '  activation on env ->> a: go', '  a ->> b: m');
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
  });
});

describe('skeletonAutomaton: unsupported charts', () => {
  it('A1: subcharts, if … else, repeat and standalone subcharts', () => {
    expect(
      codes(
        'lsc-alpha existential',
        '  subchart',
        '    a ->> b: m',
        '  end',
        '  if a: ok',
        '    a ->> b: n',
        '  end',
      ),
    ).toEqual(['A1', 'A1']);
    expect(codes('lsc-alpha subchart', '  a ->> b: m')).toEqual(['A1']);
  });

  it('A2: simultaneous', () => {
    expect(
      codes(
        'lsc-alpha existential',
        '  instance a, b, c',
        '  simultaneous a',
        '    send a -) b: x',
        '    send a -) c: y',
        '  end',
        '  receive b from a: x',
        '  receive c from a: y',
      ),
    ).toEqual(['A2']);
  });

  it('A3: create, destroy and timeout', () => {
    expect(
      codes(
        'lsc-alpha existential',
        '  instance a',
        '  create b by a',
        '  a ->> b: m',
        '  destroy b',
        '  timeout a: t',
      ),
    ).toEqual(['A3', 'A3', 'A3']);
  });

  it('A4: activation when, and a first step that is a condition with nothing before it', () => {
    expect(codes('lsc-alpha universal', '  activation when ready', '  a ->> b: m')).toEqual(['A4']);
    expect(
      codes('lsc-alpha existential', '  instance a, b', '  condition a: ready', '  a ->> b: m'),
    ).toEqual(['A4']);
    expect(
      codes(
        'lsc-alpha existential',
        '  instance a, b',
        '  prechart',
        '    condition a: ready',
        '  end',
        '  a ->> b: m',
      ),
    ).toEqual(['A4']);
    expect(codes('lsc-alpha existential', '  instance a', '  note over a: nothing')).toEqual([
      'A4',
    ]);
    // An activation message comes first, so the condition is evaluated once per activation.
    expect(
      automaton(
        'lsc-alpha universal',
        '  instance a',
        '  activation on env ->> a: go',
        '  condition a: ready',
      ),
    ).toBeDefined();
  });

  it('A5: more states than the limit', () => {
    const { model } = parseLsc(
      [
        'lsc-alpha existential',
        '  a -) b: m1',
        '  a -) b: m2',
        '  a -) c: m3',
        '  a -) d: m4',
      ].join('\n'),
    );
    const result = skeletonAutomaton(model!, { limit: 4 });
    expect(result.automaton).toBeUndefined();
    expect(result.diagnostics.map((d) => d.code)).toEqual(['A5']);
    expect(skeletonAutomaton(model!).automaton).toBeDefined();
  });

  it('A6: errors from validateLsc', () => {
    expect(
      codes('lsc-alpha existential', '  send a ->> b: m', '  a ->> c: x', '  receive b from a: m'),
    ).toContain('A6');
  });
});

const fixtures = await loadFixtures();
const unsupported: Record<string, string[]> = {
  'fig10-car-behavior': ['A1', 'A3', 'A4'],
  'fig11-standalone-subchart': ['A1'],
  'iteration-local-instances': ['A1', 'A4'],
  'simultaneous-coregion': ['A2', 'A3'],
  'simultaneous-sends': ['A2'],
};

describe('skeletonAutomaton: fixtures', () => {
  for (const fixture of fixtures) {
    const expected = unsupported[fixture.name];
    if (expected) {
      it(`${fixture.name} is not supported (${expected.join(', ')})`, () => {
        const { model } = parseLsc(fixture.text);
        const result = skeletonAutomaton(model!);
        expect(result.automaton).toBeUndefined();
        expect([...new Set(result.diagnostics.map((d) => d.code))].sort()).toEqual(expected);
      });
    } else {
      // lsc-pavlov's tests model-check these files. After an intended change, run
      // `pnpm automata:update` and commit the result.
      it(`${fixture.name} matches its committed automaton`, async () => {
        const { model } = parseLsc(fixture.text);
        const result = skeletonAutomaton(model!);
        expect(result.diagnostics).toEqual([]);
        await expect(`${JSON.stringify(result.automaton, null, 2)}\n`).toMatchFileSnapshot(
          `../../lsc-pavlov/test/resources/automata/${fixture.name}.json`,
        );
      });
    }
  }
});
