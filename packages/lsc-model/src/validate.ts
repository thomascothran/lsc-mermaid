// Validation rules checked on the model: per unfolding (V1, V2, V5, V8) and per message
// (V14, V16). `parseLsc` reports the rules tied to the source text.
//
// A violation found on a main unfolding has the rule's severity. One found only on unfoldings
// that leave a block at a cold condition is a warning. When a violation occurs only where two
// sibling subcharts with cold guards both run, the message suggests `if … else`.

import type { Diagnostic, Severity, Span } from './diagnostics.js';
import type { Instance, LocRef, Location, LscChart, RegionItem, Subchart } from './model.js';
import { partialOrder } from './order.js';
import { DEFAULT_UNFOLDING_LIMIT, locKey, unfoldings, type Unfolding } from './unfold.js';

export interface ValidateOptions {
  /** Maximum number of unfoldings checked. Default 256. */
  limit?: number;
}

interface Violation {
  code: string;
  severity: Severity;
  message: string;
  span: Span;
  unfoldings: Unfolding[];
}

export function validateLsc(model: LscChart, options: ValidateOptions = {}): Diagnostic[] {
  const limit = options.limit ?? DEFAULT_UNFOLDING_LIMIT;
  const diagnostics: Diagnostic[] = [];
  const byKey = new Map<string, Location>();
  for (const i of model.instances) for (const l of i.locations) byKey.set(locKey(l.ref), l);
  const location = (ref: LocRef) => byKey.get(locKey(ref))!;

  const all = unfoldings(model, { limit: limit + 1 });
  if (all.length > limit) {
    all.length = limit;
    diagnostics.push({
      severity: 'warning',
      code: 'unfoldings',
      message: `The chart has more than ${limit} unfoldings; only the first ${limit} were checked.`,
    });
  }

  const violations = new Map<string, Violation>();
  const violate = (u: Unfolding, code: string, severity: Severity, message: string, span: Span) => {
    const key = `${code} ${span.start.offset} ${message}`;
    const v = violations.get(key) ?? { code, severity, message, span, unfoldings: [] };
    v.unfoldings.push(u);
    violations.set(key, v);
  };

  for (const u of all) {
    const included = new Set(u.locations.map(locKey));
    const order = partialOrder(model, u);

    // V1: ≤m is acyclic once shared conditions and barriers are merged.
    if (order.cycle) {
      const locs = order.cycle.flatMap((p) => order.points[p]!.locations).map(location);
      const lines = [...new Set(locs.map((l) => l.span.start.line))].sort((a, b) => a - b);
      const first = locs.sort((a, b) => a.span.start.offset - b.span.start.offset)[0];
      if (first) {
        violate(
          u,
          'V1',
          'error',
          `The partial order has a cycle through lines ${lines.join(', ')}.`,
          first.span,
        );
      }
    } else {
      // V5: the text order is a linearisation of ≤m.
      const rowOf = (p: number) =>
        Math.min(...order.points[p]!.locations.map((r) => location(r).row));
      for (const [a, b] of order.edges) {
        if (order.points[a]!.locations.length === 0 || order.points[b]!.locations.length === 0)
          continue;
        if (rowOf(a) > rowOf(b)) {
          const later = order.points[a]!.locations.map(location)[0]!;
          const early = order.points[b]!.locations.map(location)[0]!;
          violate(
            u,
            'V5',
            'error',
            `This must happen after line ${later.span.start.line}, so it must be written after it: the text order must be one order the chart allows.`,
            early.span,
          );
        }
      }
    }

    // V2: maximal locations are cold (main unfoldings only).
    if (u.main) {
      for (const instance of model.instances) {
        for (const part of ['prechart', 'body'] as const) {
          const last = instance.locations
            .filter((l) => l.ref.part === part && included.has(locKey(l.ref)))
            .at(-1);
          if (last && last.temp === 'hot') {
            violate(
              u,
              'V2',
              'error',
              `\`${instance.name}\` can stop here, so this location must be cold. Add \`cold progress ${instance.name}\` before its last event in this branch.`,
              last.span,
            );
          }
        }
      }
    }

    // V8: a lifetime is used only between its creation and its destruction.
    for (const instance of model.instances) {
      if (!instance.destroyedAt || !included.has(locKey(instance.destroyedAt))) continue;
      const end = location(instance.destroyedAt);
      const late = instance.locations.find(
        (l) =>
          l.ref.part === end.ref.part && l.ref.index > end.ref.index && included.has(locKey(l.ref)),
      );
      if (late) {
        violate(
          u,
          'V8',
          'error',
          `\`${instance.name}\` is used after it is destroyed on line ${end.span.start.line} in this run.`,
          late.span,
        );
      }
    }
    // V8: `create x` requires that no lifetime of `x` is alive.
    for (const created of model.instances) {
      if (!created.createdAt || !included.has(locKey(created.createdAt))) continue;
      const at = location(created.createdAt);
      for (const earlier of model.instances) {
        if (earlier === created || earlier.name !== created.name) continue;
        if (model.instances.indexOf(earlier) > model.instances.indexOf(created)) continue;
        if (aliveAt(earlier, at, included, location)) {
          violate(
            u,
            'V8',
            'error',
            `\`${created.name}\` is created here while an earlier lifetime of it is still alive${earlier.destroyedAt ? `: in this run it is not destroyed on line ${location(earlier.destroyedAt).span.start.line}` : ''}.`,
            at.span,
          );
        }
      }
    }
  }

  const siblings = guardedSiblings(model);
  for (const v of violations.values()) {
    const onMain = v.unfoldings.some((u) => u.main);
    let message = v.message;
    const pair = siblings.find(([a, b]) => {
      const both = (u: Unfolding) => u.passed.includes(a.guard!) && u.passed.includes(b.guard!);
      const violating = new Set(v.unfoldings);
      return v.unfoldings.every(both) && all.some((u) => !both(u) && !violating.has(u));
    });
    if (pair) {
      const [a, b] = pair;
      message += ` This happens only when both ${name(a)} and ${name(b)} run; if they are alternatives, write them as \`if … else\`, which makes them exclusive.`;
    }
    diagnostics.push({
      severity: onMain ? v.severity : 'warning',
      code: v.code,
      message,
      span: v.span,
      unfolding: (v.unfoldings.find((u) => u.main) ?? v.unfoldings[0]!).index,
    });
  }

  for (const m of model.messages) {
    const span = m.span;
    // V14: synchronous messages to or from the environment add no ordering constraint.
    if (m.kind === 'synch' && (m.from === 'env' || m.to === 'env')) {
      diagnostics.push({
        severity: 'info',
        code: 'V14',
        message:
          'The environment has no locations, so this synchronous message orders nothing on the environment side.',
        span,
      });
    }
    // V16: repeated message names get distinct occurrence ids.
    if (m.occurrence === undefined && /#\d+$/.test(m.id)) {
      diagnostics.push({
        severity: 'info',
        code: 'V16',
        message: `\`${m.name}\` occurs more than once; this occurrence's id is \`${m.id}\`. Label it (\`send #label …\`) to give it a stable id.`,
        span,
      });
    }
  }

  return diagnostics.sort((a, b) => (a.span?.start.offset ?? -1) - (b.span?.start.offset ?? -1));
}

function aliveAt(
  lifetime: Instance,
  at: Location,
  included: Set<string>,
  location: (ref: LocRef) => Location,
): boolean {
  const exists = !lifetime.createdAt || included.has(locKey(lifetime.createdAt));
  if (!exists) return false;
  if (lifetime.createdAt && location(lifetime.createdAt).row >= at.row) return false;
  if (!lifetime.destroyedAt) return true;
  if (!included.has(locKey(lifetime.destroyedAt))) return true;
  return location(lifetime.destroyedAt).row > at.row;
}

function name(s: Subchart): string {
  return s.name !== undefined ? `"${s.name}"` : `subchart ${s.id}`;
}

/** Pairs of subcharts in one region that both open with a cold condition. */
function guardedSiblings(model: LscChart): [Subchart, Subchart][] {
  const pairs: [Subchart, Subchart][] = [];
  const cold = new Set(model.conditions.filter((c) => c.temp === 'cold').map((c) => c.id));
  const visit = (items: RegionItem[]) => {
    const guarded = items.filter(
      (i): i is Subchart => i.kind === 'subchart' && i.guard !== undefined && cold.has(i.guard),
    );
    for (let i = 0; i < guarded.length; i++) {
      for (let j = i + 1; j < guarded.length; j++) pairs.push([guarded[i]!, guarded[j]!]);
    }
    for (const item of items) {
      if (item.kind === 'subchart') visit(item.body.items);
      else if (item.kind === 'alt') {
        visit(item.then.body.items);
        if (item.else) visit(item.else.body.items);
      }
    }
  };
  if (model.prechart) visit(model.prechart.items);
  visit(model.body.items);
  return pairs;
}
