// Checks a fixture's expected results against lsc-model. Called inside a `describe` per fixture.

import { expect, it } from 'vitest';
import {
  fromJSON,
  parseLsc,
  partialOrder,
  printExpr,
  toJSON,
  unfoldings,
  validateLsc,
  type Location,
  type LocRef,
  type LscChart,
  type RegionItem,
  type Type,
  type Unfolding,
} from 'lsc-model';
import type { FixtureExpectation, OrderRef } from '../../../fixtures/types.js';

function printType(t: Type | undefined): string {
  if (!t) return '';
  if (t.kind === 'enum') return `: {${t.values.join(', ')}}`;
  if (t.kind === 'int' && t.lo !== undefined) return `: int[${t.lo}..${t.hi}]`;
  return `: ${t.kind}`;
}

function locations(model: LscChart): Location[] {
  return model.instances.flatMap((i) => i.locations);
}

function find(model: LscChart, ref: LocRef): Location {
  return model.instances
    .find((i) => i.id === ref.instance)!
    .locations.find((l) => l.ref.part === ref.part && l.ref.index === ref.index)!;
}

/** Names of subcharts and alternatives, by the condition id they are guarded by. */
function guards(model: LscChart): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (items: RegionItem[]) => {
    for (const item of items) {
      if (item.kind === 'subchart') {
        if (item.guard) out.set(item.guard, item.name ?? item.id);
        visit(item.body.items);
      } else if (item.kind === 'alt') {
        out.set(item.guard, item.then.name ?? item.id);
        visit(item.then.body.items);
        if (item.else) visit(item.else.body.items);
      }
    }
  };
  visit(model.body.items);
  return out;
}

function subchartNames(model: LscChart): Map<string, string> {
  const out = new Map<string, string>();
  const visit = (items: RegionItem[]) => {
    for (const item of items) {
      if (item.kind === 'subchart') {
        out.set(item.id, item.name ?? item.id);
        visit(item.body.items);
      } else if (item.kind === 'alt') {
        visit(item.then.body.items);
        if (item.else) visit(item.else.body.items);
      }
    }
  };
  visit(model.body.items);
  return out;
}

/** Resolves an order reference to a location in an unfolding, if it is there. */
function resolveRef(model: LscChart, u: Unfolding, ref: OrderRef): LocRef | undefined {
  const inUnfolding = new Set(u.locations.map((r) => `${r.instance}/${r.part}/${r.index}`));
  const has = (r: LocRef | undefined) => r && inUnfolding.has(`${r.instance}/${r.part}/${r.index}`);
  const located = /^(?:(.+)@)?L(\d+)$/.exec(ref);
  if (located) {
    const [, instance, line] = located;
    // A condition's locations may be shared with other statements' events (simultaneous regions).
    const condition = model.conditions.find((c) => c.span.start.line === Number(line));
    if (condition)
      return condition.locations.find(
        (r) => has(r) && (instance === undefined || r.instance === instance),
      );
    const match = locations(model).find(
      (l) =>
        l.ref.index > 0 &&
        l.span.start.line === Number(line) &&
        (instance === undefined || l.ref.instance === instance) &&
        has(l.ref),
    );
    return match?.ref;
  }
  const event = /^(.+)([!?])$/.exec(ref)!;
  const message = model.messages.find((m) => m.id === event[1]);
  const at = event[2] === '!' ? message?.send : message?.receive;
  return has(at) ? at : undefined;
}

export function checkFixture(text: string, expected: FixtureExpectation): void {
  const parsed = parseLsc(text);
  const model = parsed.model!;

  it('parses into a model', () => {
    expect(parsed.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    expect(model).toBeDefined();
  });

  it('has the expected chart-level facts', () => {
    expect(model.kind).toBe(expected.kind);
    expect(model.mode).toBe(expected.mode);
    expect(model.title).toBe(expected.title);
    expect(model.accTitle).toBe(expected.accTitle);
    expect(model.accDescr).toBe(expected.accDescr);
    expect(model.defaults).toBe(expected.defaults);
    expect(
      model.variables.map(
        (v) => `${v.instance ? `${v.instance}.` : ''}${v.name}${printType(v.type)}`,
      ),
    ).toEqual(expected.variables);
    expect(model.visibleEvents).toEqual(expected.visibleEvents);
    const activation = model.activation && {
      ...(model.activation.condition && { condition: printExpr(model.activation.condition) }),
      ...(model.activation.message && { message: model.activation.message }),
    };
    expect(activation).toEqual(expected.activation);
  });

  it('has the expected instances', () => {
    const names = subchartNames(model);
    const line = (ref: LocRef | undefined) => ref && find(model, ref).span.start.line;
    expect(
      model.instances.map((i) => ({
        id: i.id,
        name: i.name,
        label: i.label,
        column: i.column,
        head: i.head,
        scope: i.scope === 'chart' ? undefined : names.get(i.scope.subchart),
        createdBy: i.createdBy,
        createdAtLine: line(i.createdAt),
        destroyedAtLine: line(i.destroyedAt),
      })),
    ).toEqual(
      expected.instances.map((i) => ({
        id: i.id,
        name: i.name ?? i.id,
        label: i.label,
        column: i.column,
        head: i.head ?? 'box',
        scope: i.scope,
        createdBy: i.createdBy,
        createdAtLine: i.createdAtLine,
        destroyedAtLine: i.destroyedAtLine,
      })),
    );
  });

  it('has the expected messages', () => {
    expect(
      model.messages.map((m) => {
        const send = m.span.start.line;
        const receive = (m.receiveSpan ?? m.span).start.line;
        return {
          id: m.id,
          name: m.name,
          ...(m.args !== undefined && { args: m.args }),
          from: m.from,
          to: m.to,
          kind: m.kind,
          temp: m.temp,
          sendLine: send,
          receiveLine: receive,
        };
      }),
    ).toEqual(expected.messages);
  });

  it('has the expected conditions', () => {
    const guarded = guards(model);
    expect(
      model.conditions.map((c) => ({
        line: c.span.start.line,
        instances: c.instances,
        sharedBy: c.sharedBy,
        temp: c.temp,
        expr: printExpr(c.expr),
        ...(guarded.has(c.id) && { guardOf: guarded.get(c.id) }),
      })),
    ).toEqual(expected.conditions);
  });

  it('has the expected notes', () => {
    expect(
      model.notes.map((n) => ({ line: n.span.start.line, placement: n.placement, text: n.text })),
    ).toEqual(expected.notes ?? []);
  });

  if (expected.locations) {
    it('has the expected location temperatures', () => {
      const actual = Object.fromEntries(
        model.instances.map((i) => {
          const part = (p: 'prechart' | 'body') =>
            i.locations.filter((l) => l.ref.part === p).map((l) => l.temp);
          return [
            i.id,
            model.prechart
              ? { prechart: part('prechart'), body: part('body') }
              : { body: part('body') },
          ];
        }),
      );
      expect(actual).toEqual(expected.locations);
    });
  }

  const all = model ? unfoldings(model) : [];

  it('has the expected unfoldings', () => {
    expect({ count: all.length, main: all.filter((u) => u.main).length }).toEqual(
      expected.unfoldings,
    );
  });

  it('satisfies the order facts in every unfolding', () => {
    let checked = 0;
    for (const u of all) {
      const order = partialOrder(model, u);
      for (const [a, b] of expected.order.before) {
        const ra = resolveRef(model, u, a);
        const rb = resolveRef(model, u, b);
        if (!ra || !rb) continue;
        checked++;
        expect(order.before(ra, rb), `${a} < ${b} in unfolding ${u.index}`).toBe(true);
        expect(order.before(rb, ra), `not ${b} < ${a} in unfolding ${u.index}`).toBe(false);
      }
      for (const [a, b] of expected.order.unordered) {
        const ra = resolveRef(model, u, a);
        const rb = resolveRef(model, u, b);
        if (!ra || !rb) continue;
        checked++;
        expect(
          order.before(ra, rb) || order.before(rb, ra),
          `${a} ∥ ${b} in unfolding ${u.index}`,
        ).toBe(false);
      }
    }
    // Every fact holds somewhere: each reference resolves in at least one unfolding.
    for (const fact of [...expected.order.before, ...expected.order.unordered]) {
      expect(
        all.some((u) => fact.every((ref) => resolveRef(model, u, ref))),
        `${fact.join(' / ')} appears in some unfolding`,
      ).toBe(true);
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('reports exactly the expected diagnostics', () => {
    const actual = [...parsed.diagnostics, ...validateLsc(model)].map((d) => ({
      code: d.code,
      severity: d.severity,
      line: d.span?.start.line,
    }));
    const key = (d: { code: string; line?: number }) => `${String(d.line).padStart(4)} ${d.code}`;
    expect(actual.sort((a, b) => key(a).localeCompare(key(b)))).toEqual(
      [...expected.diagnostics].sort((a, b) => key(a).localeCompare(key(b))),
    );
  });

  it('round-trips through JSON', () => {
    const json = JSON.stringify(toJSON(model));
    const back = fromJSON(JSON.parse(json));
    expect(back).toEqual(model);
    expect(fromJSON(json)).toEqual(model);
    expect(validateLsc(back)).toEqual(validateLsc(model));
    expect(unfoldings(back)).toEqual(all);
  });
}
