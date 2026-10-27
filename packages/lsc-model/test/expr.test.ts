import { describe, expect, it } from 'vitest';
import { parseLsc, printExpr } from 'lsc-model';

const DECLS = [
  'lsc-alpha existential',
  '  instance car, sensor',
  '  var car.state: {idle, departure, cruising}',
  '  var car.mode: {pass, stop}',
  '  var car.speed: int[0..120]',
  '  var sensor.ready: bool',
  '  var sensor.level: int',
  '  var limit: int',
  '  car ->> sensor: m',
];
const LINE = DECLS.length + 1;

function condition(on: string, text: string) {
  const { model, diagnostics } = parseLsc([...DECLS, `  condition ${on}: ${text}`].join('\n'));
  return {
    expr: model && printExpr(model.conditions[0]!.expr),
    raw: model?.conditions[0]?.expr,
    diagnostics,
  };
}

describe('expressions', () => {
  it.each([
    ['car', 'speed + 1 * 2 > limit', 'car.speed + 1 * 2 > limit'],
    ['car', '(speed + 1) * 2 > limit', '(car.speed + 1) * 2 > limit'],
    ['car', 'speed - (1 - 2) = 0', 'car.speed - (1 - 2) = 0'],
    ['car', 'speed - 1 - 2 = 0', 'car.speed - 1 - 2 = 0'],
    ['sensor', 'not level = 3 and ready', 'not sensor.level = 3 and sensor.ready'],
    ['sensor', 'not (ready and level > 1)', 'not (sensor.ready and sensor.level > 1)'],
    ['sensor', 'ready or ready and not ready', 'sensor.ready or sensor.ready and not sensor.ready'],
    ['sensor', '(ready or ready) and ready', '(sensor.ready or sensor.ready) and sensor.ready'],
    ['car', 'TRUE', 'true'],
  ])('on %s, %s prints as %s', (on, text, printed) => {
    const result = condition(on, text);
    expect(result.diagnostics.filter((d) => d.severity !== 'info')).toEqual([]);
    expect(result.expr).toBe(printed);
  });

  it('expands the value shorthand, qualified or not', () => {
    expect(condition('car', 'idle').expr).toBe('car.state = idle');
    expect(condition('sensor', 'car.cruising').expr).toBe('car.state = cruising');
    expect(condition('car', 'mode = stop').raw).toEqual({
      kind: 'bin',
      op: '=',
      left: { kind: 'ref', instance: 'car', name: 'mode' },
      right: { kind: 'const', name: 'stop' },
    });
  });

  it('keeps longer dotted paths and quoted conditions opaque', () => {
    expect(condition('car', 'car.stopsAt.isEmpty').raw).toEqual({
      kind: 'path',
      parts: ['car', 'stopsAt', 'isEmpty'],
    });
    const quoted = condition('car', '"stops_at->isEmpty=TRUE"');
    expect(quoted.raw).toEqual({ kind: 'text', text: 'stops_at->isEmpty=TRUE' });
    expect(quoted.diagnostics).toEqual([]);
  });

  it('reads an unresolved name as a proposition and warns when variables are declared', () => {
    const { raw, diagnostics } = condition('car', 'idel');
    expect(raw).toEqual({ kind: 'prop', name: 'idel' });
    expect(diagnostics).toMatchObject([
      { code: 'V20', severity: 'warning', span: { start: { line: LINE, column: 18 } } },
    ]);
  });

  it.each([
    ['car', 'speed = 1 = 2', /do not chain/, 28],
    ['car', 'speed +', /ends too early/, 25],
    ['car', 'speed ->isEmpty', /`->` is not an operator/, 24],
    ['car', '(speed > 1', /Expected '\)'/, 28],
    ['car', 'speed > 1)', /Unexpected '\)'/, 27],
  ])('reports syntax errors at their column: %s', (on, text, message, column) => {
    const { diagnostics } = condition(on, text);
    expect(diagnostics).toMatchObject([
      {
        code: 'syntax',
        message: expect.stringMatching(message),
        span: { start: { line: LINE, column } },
      },
    ]);
  });

  it.each([
    ['car', 'speed', /not a truth value/],
    ['car', 'speed and idle', /`and` needs truth values/],
    ['car', 'mode < 3', /compares integers/],
    ['car', 'mode = 3', /Cannot compare/],
    ['car', 'mode = idle', /not a value of car\.mode/],
    ['sensor', 'ready + 1 > 2', /needs integers/],
  ])('type-checks %s: %s', (on, text, message) => {
    const { diagnostics } = condition(on, text);
    expect(diagnostics).toMatchObject([
      { code: 'V13', severity: 'error', message: expect.stringMatching(message) },
    ]);
  });
});
