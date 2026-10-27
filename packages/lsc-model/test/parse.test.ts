import { describe, expect, it } from 'vitest';
import { isBlocking, parseLsc, printExpr, validateLsc, type LscChart } from 'lsc-model';

function model(...lines: string[]): LscChart {
  const result = parseLsc(lines.join('\n'));
  expect(result.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
  return result.model!;
}

function errors(...lines: string[]) {
  return parseLsc(lines.join('\n')).diagnostics.filter((d) => d.severity === 'error');
}

describe('header', () => {
  it.each(['universal', 'existential'] as const)('reads the %s mode', (mode) => {
    const m = model(`lsc-alpha ${mode}`, '  a ->> b: m');
    expect(m).toMatchObject({ modelVersion: 1, kind: 'chart', mode, defaults: 'hot' });
  });

  it('reads a standalone subchart', () => {
    const m = model('lsc-alpha subchart', '  a ->> b: m');
    expect(m.kind).toBe('subchart');
    expect(m.mode).toBeUndefined();
    // The chart is itself a block over all its instances.
    expect(m.body.items).toMatchObject([{ kind: 'subchart', id: 's0', instances: ['a', 'b'] }]);
  });

  it('accepts the stable keyword lsc', () => {
    expect(parseLsc('lsc existential').model?.mode).toBe('existential');
  });

  it('reports a missing mode with a position instead of throwing', () => {
    const { model: m, diagnostics } = parseLsc('lsc-alpha\n');
    expect(m).toBeUndefined();
    expect(diagnostics).toMatchObject([
      { severity: 'error', code: 'V22', span: { start: { line: 1, column: 1 } } },
    ]);
    expect(isBlocking(diagnostics[0]!)).toBe(true);
  });

  it('rejects an unknown header keyword', () => {
    const { model: m, diagnostics } = parseLsc('sequenceDiagram\n');
    expect(m).toBeUndefined();
    expect(diagnostics[0]).toMatchObject({
      code: 'syntax',
      span: { start: { line: 1, column: 1 } },
    });
  });
});

describe('declarations', () => {
  it('reads title and accessibility statements, skipping comments and blank lines', () => {
    const m = model(
      '%% leading comment',
      '',
      'lsc-alpha existential',
      '  title Car departure',
      '',
      '  %% a comment between statements',
      '  accTitle: Departure',
      '  accDescr {',
      '    Car and handler',
      '    agree to depart',
      '  }',
      '',
    );
    expect(m).toMatchObject({
      title: 'Car departure',
      accTitle: 'Departure',
      accDescr: 'Car and handler\nagree to depart',
    });
  });

  it('reads one-line accDescr', () => {
    expect(model('lsc-alpha existential', '  accDescr: Short', '  a ->> b: m').accDescr).toBe(
      'Short',
    );
  });

  it('reads instances with quoted and unquoted labels and actor heads', () => {
    const m = model(
      'lsc-alpha existential',
      '  instance car as "Car", carHandler',
      '  participant monitor as Plant monitor (main)',
      '  actor "end" as "Payment endpoint"',
    );
    expect(m.instances.map((i) => [i.id, i.label, i.column, i.head])).toEqual([
      ['car', 'Car', 0, 'box'],
      ['carHandler', 'carHandler', 1, 'box'],
      ['monitor', 'Plant monitor (main)', 2, 'box'],
      ['end', 'Payment endpoint', 3, 'actor'],
    ]);
  });

  it('adds instances first seen in messages, in order of appearance', () => {
    const m = model(
      'lsc-alpha existential',
      '  instance b',
      '  activation on env ->> c: go',
      '  a ->> b: m',
    );
    expect(m.instances.map((i) => i.id)).toEqual(['b', 'c', 'a']);
  });

  it('allows keywords as names where a name is expected', () => {
    const m = model(
      'lsc-alpha existential',
      '  send ->> receive: condition',
      '  subchart -) hot: progress',
    );
    expect(m.messages.map((x) => [x.from, x.to, x.name])).toEqual([
      ['send', 'receive', 'condition'],
      ['subchart', 'hot', 'progress'],
    ]);
  });

  it('reads variables and types', () => {
    const m = model(
      'lsc-alpha existential',
      '  instance car',
      '  var car.mode: {pass, stop}',
      '  var car.speed: int[0..120]',
      '  var copies: int',
      '  var flag: bool',
      '  var untyped',
    );
    expect(m.variables).toEqual([
      { instance: 'car', name: 'mode', type: { kind: 'enum', values: ['pass', 'stop'] } },
      { instance: 'car', name: 'speed', type: { kind: 'int', lo: 0, hi: 120 } },
      { name: 'copies', type: { kind: 'int' } },
      { name: 'flag', type: { kind: 'bool' } },
      { name: 'untyped' },
    ]);
  });

  it('reports a bad type with its column', () => {
    expect(errors('lsc-alpha existential', '  var x: float')).toMatchObject([
      {
        code: 'syntax',
        span: { start: { line: 2, column: 10 } },
        message: expect.stringMatching(/bool/),
      },
    ]);
  });

  it('reads visible events and activations', () => {
    const m = model(
      'lsc-alpha universal',
      '  visible a ->> b: ping',
      '  visible send a -) b: pong(1)',
      '  activation on send a ->> b: go',
      '  activation when not done',
    );
    expect(m.visibleEvents).toEqual([
      { from: 'a', to: 'b', name: 'ping', kind: 'synch' },
      { from: 'a', to: 'b', name: 'pong', kind: 'asynch', dir: '!' },
    ]);
    expect(m.activation?.message).toEqual({
      from: 'a',
      to: 'b',
      name: 'go',
      kind: 'synch',
      dir: '!',
    });
    expect(printExpr(m.activation!.condition!)).toBe('not done');
    expect(m.activation?.conditionText).toBe('not done');
  });

  it('keeps condition text as written for display', () => {
    const m = model(
      'lsc-alpha universal',
      '  instance car',
      '  var car.state: {idle, busy}',
      '  activation when car.idle',
      '  condition car: idle',
      '  cold condition car:   "stops_at->isEmpty=TRUE"',
    );
    expect(m.activation?.conditionText).toBe('car.idle');
    expect(printExpr(m.activation!.condition!)).toBe('car.state = idle');
    expect(m.conditions.map((c) => c.text)).toEqual(['idle', 'stops_at->isEmpty=TRUE']);
    expect(printExpr(m.conditions[0]!.expr)).toBe('car.state = idle');
  });

  it('reads defaults cold', () => {
    const m = model('lsc-alpha existential', '  defaults cold', '  a ->> b: m', '  hot b ->> a: n');
    expect(m.messages.map((x) => x.temp)).toEqual(['cold', 'hot']);
    expect(m.instances.find((i) => i.id === 'a')!.locations.map((l) => l.temp)).toEqual([
      'cold',
      'cold',
      'cold',
    ]);
  });

  it('requires declarations before the body', () => {
    expect(
      errors('lsc-alpha existential', '  a ->> b: m', '  title Late', '  instance c'),
    ).toMatchObject([
      { code: 'syntax', span: { start: { line: 3 } } },
      {
        code: 'syntax',
        span: { start: { line: 4 } },
        message: expect.stringMatching(/local instance/),
      },
    ]);
  });
});

describe('messages', () => {
  it('splits labels into name and arguments and numbers repeated names', () => {
    const m = model(
      'lsc-alpha existential',
      '  a ->> b: setDest( t3 )',
      '  a ->> b: button   Pressed',
      '  b -) a: setDest',
    );
    expect(m.messages.map((x) => [x.id, x.name, x.args, x.text, x.kind])).toEqual([
      ['setDest', 'setDest', ' t3 ', 'setDest( t3 )', 'synch'],
      ['button Pressed', 'button Pressed', undefined, 'button   Pressed', 'synch'],
      ['setDest#2', 'setDest', undefined, 'setDest', 'asynch'],
    ]);
  });

  it('gives a self-message a send location and then a receive location', () => {
    const m = model('lsc-alpha existential', '  a ->> a: tick');
    expect(m.messages[0]).toMatchObject({
      send: { instance: 'a', part: 'body', index: 1 },
      receive: { instance: 'a', part: 'body', index: 2 },
    });
  });

  it('pairs unlabelled receives with the earliest unmatched send', () => {
    const m = model(
      'lsc-alpha existential',
      '  send a -) b: m',
      '  send a -) b: m',
      '  receive b from a: m',
      '  receive b from a: m',
    );
    expect(m.messages.map((x) => [x.id, x.span.start.line, x.receiveSpan?.start.line])).toEqual([
      ['m', 2, 4],
      ['m#2', 3, 5],
    ]);
  });

  it.each([
    ['-->>', 'cold a ->> b: m'],
    ['--)', 'cold a -) b: m'],
    ['->', 'a ->> b: m'],
    ['-x', 'cold a -) b: m'],
    ['<<->>', 'a ->> b: m'],
  ])('rejects the Mermaid arrow %s with the LSC form', (arrow, form) => {
    const { model: m, diagnostics } = parseLsc(`lsc-alpha existential\n  a ${arrow} b: m`);
    expect(m).toBeUndefined();
    expect(diagnostics).toMatchObject([{ code: 'V23', span: { start: { line: 2, column: 5 } } }]);
    expect(diagnostics[0]!.message).toContain(`\`${form}\``);
  });

  it('records message temperatures in the pre-chart without giving them meaning', () => {
    const m = model('lsc-alpha universal', '  prechart', '    a ->> b: m', '  end', '  b ->> a: n');
    expect(m.prechart?.items).toHaveLength(1);
    expect(m.instances[0]!.locations.map((l) => [l.ref.part, l.ref.index, l.temp])).toEqual([
      ['prechart', 0, 'cold'],
      ['prechart', 1, 'cold'],
      ['body', 0, 'hot'],
      ['body', 1, 'cold'],
    ]);
  });
});

describe('structure', () => {
  it('builds subcharts with barriers, guards and local instances', () => {
    const m = model(
      'lsc-alpha universal',
      '  activation when true',
      '  instance a',
      '  subchart "S" over a repeat 3',
      '    instance tmp',
      '    cold condition a: go',
      '    a ->> tmp: m',
      '  end',
    );
    const [sub] = m.body.items;
    expect(sub).toMatchObject({
      kind: 'subchart',
      name: 'S',
      repeat: 3,
      instances: ['a', 'tmp'],
      localInstances: ['tmp'],
      guard: 'c1',
      semantics: 'informal',
    });
    expect(m.instances.find((i) => i.id === 'tmp')!.scope).toEqual({ subchart: 's1' });
    const entry = m.barriers.find((b) => b.at === 'entry')!;
    expect(entry.locations).toEqual(m.conditions[0]!.locations);
    expect(m.conditions[0]!.sharedBy).toEqual(['a', 'tmp']);
  });

  it('builds if … else with a shared exit barrier', () => {
    const m = model(
      'lsc-alpha universal',
      '  activation when true',
      '  instance a, b',
      '  if "Check" a, b: ready',
      '    a ->> b: yes',
      '  else "Otherwise"',
      '    b ->> a: no',
      '  end',
    );
    const [alt] = m.body.items;
    expect(alt).toMatchObject({
      kind: 'alt',
      guard: 'c1',
      then: { name: 'Check' },
      else: { name: 'Otherwise' },
    });
    if (alt?.kind !== 'alt') throw new Error('expected an alternative');
    expect(alt.then.exit).toBe(alt.else!.exit);
    expect(alt.then.entry).toBe(alt.else!.entry);
    expect(m.conditions[0]!.temp).toBe('cold');
  });

  it('gives a recreated instance a new lifetime in the same column', () => {
    const m = model(
      'lsc-alpha existential',
      '  a ->> b: m',
      '  destroy b',
      '  create b as "B2" by a',
      '  a ->> b: n',
    );
    expect(m.instances.map((i) => [i.id, i.name, i.label, i.column, i.createdBy])).toEqual([
      ['a', 'a', 'a', 0, undefined],
      ['b', 'b', 'b', 1, undefined],
      ['b@2', 'b', 'B2', 1, 'a'],
    ]);
    expect(m.messages[1]!.to).toBe('b@2');
  });

  it('reads an unquoted creation label up to `by`', () => {
    const m = model('lsc-alpha existential', '  a ->> a: m', '  create c as Car Handler by a');
    expect(m.instances.find((i) => i.id === 'c')).toMatchObject({
      label: 'Car Handler',
      createdBy: 'a',
    });
  });

  it('keeps a branch independent of the other branch', () => {
    const m = model(
      'lsc-alpha universal',
      '  activation when true',
      '  a ->> b: m',
      '  if a, b: x',
      '    destroy b',
      '  else',
      '    a ->> b: n',
      '  end',
    );
    expect(m.messages[1]!.to).toBe('b');
  });

  it('merges a simultaneous region into one location per listed instance', () => {
    const m = model(
      'lsc-alpha existential',
      '  instance a, b, c',
      '  simultaneous a',
      '    send a -) b: x',
      '    send a -) c: y',
      '  end',
      '  receive b from a: x',
      '  receive c from a: y',
    );
    const a = m.instances.find((i) => i.id === 'a')!;
    expect(a.locations).toHaveLength(2);
    expect(a.locations[1]!.label.events).toEqual([
      { message: 'x', dir: '!' },
      { message: 'y', dir: '!' },
    ]);
  });

  it('reports statements in places the notation does not allow', () => {
    const lines = [
      'lsc-alpha universal',
      '  activation when true',
      '  instance a, b',
      '  coregion a',
      '    a ->> b: m',
      '    note over a: no',
      '    a ->> b: n',
      '  end',
      '  prechart',
      '    a ->> b: x',
      '  end',
    ];
    expect(errors(...lines).map((d) => [d.code, d.span?.start.line])).toEqual([
      ['syntax', 6],
      ['syntax', 9],
    ]);
  });

  it('reads notes without giving them locations', () => {
    const m = model(
      'lsc-alpha existential',
      '  a ->> b: m',
      '  Note over a, b: both',
      '  note left of a: left',
      '  note right of b: right',
    );
    expect(m.notes.map((n) => [n.text, n.placement])).toEqual([
      ['both', { over: ['a', 'b'] }],
      ['left', { leftOf: 'a' }],
      ['right', { rightOf: 'b' }],
    ]);
    expect(m.instances.map((i) => i.locations.length)).toEqual([2, 2]);
  });
});

describe('robustness', () => {
  it.each([
    '',
    'lsc-alpha universal\n  subchart',
    'lsc-alpha universal\n  if a',
    'lsc-alpha universal\n  a ->> : m',
    'lsc-alpha universal\n  condition a: (x',
    'lsc-alpha universal\n  end',
    'lsc-alpha universal\n  receive #x b from a: m',
    'lsc-alpha universal\n  "unterminated',
    'lsc-alpha universal\n  coregion a\n  end',
    'lsc-alpha universal\n  progress a',
  ])('never throws: %j', (text) => {
    expect(() => parseLsc(text)).not.toThrow();
    expect(parseLsc(text).diagnostics.length).toBeGreaterThan(0);
  });
});

describe('firstLine', () => {
  it('counts lines from firstLine in spans and in messages that cite other lines', () => {
    const text = [
      'lsc-alpha universal',
      '  instance a, b',
      '  subchart "Done"',
      '    cold condition a: finished',
      '    destroy b',
      '  end',
      '  create b by a',
    ].join('\n');
    const { model, diagnostics } = parseLsc(text, { firstLine: 4 });
    expect(diagnostics.find((d) => d.code === 'V11')?.span?.start).toMatchObject({
      line: 4,
      column: 1,
      offset: 0,
    });
    const v8 = validateLsc(model!).find((d) => d.code === 'V8')!;
    expect(v8.span?.start.line).toBe(10);
    expect(v8.message).toContain('line 8');
  });

  it('counts syntax errors from firstLine', () => {
    const { diagnostics } = parseLsc('lsc-alpha', { firstLine: 3 });
    expect(diagnostics[0]?.span?.start.line).toBe(3);
  });
});
