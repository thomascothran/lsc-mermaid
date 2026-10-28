// The skeleton automaton of a basic chart (Appendix A.2, with readings 1–23 applied). See
// "Skeleton automaton and pavlov" in the proposal.
//
// States are cuts through the partial order of the chart's single unfolding. From a cut, every
// enabled event moves the cut past one point; an enabled condition is evaluated before anything
// else happens; the pre-chart hand-over point is passed as soon as it is enabled.

import type { Diagnostic, Span } from './diagnostics.js';
import type { EventSpec, Expr, LocRef, Location, LscChart, Part, Temp } from './model.js';
import { partialOrder } from './order.js';
import { locKey, unfoldings } from './unfold.js';
import { validateLsc } from './validate.js';

export const AUTOMATON_VERSION = 1;
export const DEFAULT_AUTOMATON_LIMIT = 4096;

export interface AutomatonEvent {
  from: string;
  to: string;
  name: string;
  kind: 'synch' | 'asynch';
  /** Absent for a synchronous message, which is one event (reading 20). */
  dir?: '!' | '?';
  /** False only for an activation event the chart doesn't otherwise contain. */
  visible: boolean;
}

export interface AutomatonCondition {
  id: string;
  text: string;
  temp: Temp;
  part: Part;
  /** Present when the condition has no variables, paths, propositions or quoted text. */
  value?: boolean;
}

export type Deviation = 'ignore' | 'not-activated' | 'abort';
export type Outcome = 'completed' | 'exit' | 'abort' | 'not-activated';

export interface WaitState {
  id: number;
  kind: 'wait';
  phase: 'inactive' | 'prechart' | 'body';
  hot: boolean;
  /** `[event index, next state id]` */
  on: [number, number][];
  deviation: Deviation;
  cut: LocRef[];
}

export interface ConditionState {
  id: number;
  kind: 'condition';
  phase: 'prechart' | 'body';
  hot: boolean;
  /** Index into `conditions`. */
  condition: number;
  ifTrue: number;
  ifFalse: number;
  cut: LocRef[];
}

export interface OutcomeState {
  id: number;
  kind: 'outcome';
  outcome: Outcome;
}

export type AutomatonState = WaitState | ConditionState | OutcomeState;

export interface SkeletonAutomaton {
  automatonVersion: 1;
  mode: 'universal' | 'existential';
  title?: string;
  events: AutomatonEvent[];
  /** Index into `events`. */
  activation?: number;
  conditions: AutomatonCondition[];
  start: number;
  states: AutomatonState[];
}

export interface AutomatonOptions {
  /** Maximum number of states. Default 4,096. */
  limit?: number;
}

export interface AutomatonResult {
  automaton?: SkeletonAutomaton;
  diagnostics: Diagnostic[];
}

/** The skeleton automaton of a basic chart, or the reasons there is none. */
export function skeletonAutomaton(
  model: LscChart,
  options: AutomatonOptions = {},
): AutomatonResult {
  const diagnostics = unsupported(model);
  if (diagnostics.length > 0) return { diagnostics };
  try {
    return {
      automaton: new Builder(model, options.limit ?? DEFAULT_AUTOMATON_LIMIT).build(),
      diagnostics,
    };
  } catch (e) {
    if (e instanceof BuildError) return { diagnostics: [e.diagnostic] };
    throw e;
  }
}

class BuildError extends Error {
  constructor(readonly diagnostic: Diagnostic) {
    super(diagnostic.message);
  }
}

function error(code: string, message: string, span?: Span): Diagnostic {
  return span ? { severity: 'error', code, message, span } : { severity: 'error', code, message };
}

// ---- Supported charts (A1–A4, A6) -----------------------------------------------------------

function unsupported(model: LscChart): Diagnostic[] {
  const out: Diagnostic[] = [];
  if (model.kind === 'subchart' || !model.mode) {
    out.push(
      error(
        'A1',
        'A chart with the `subchart` header has no skeleton automaton; only basic charts do.',
      ),
    );
    return out;
  }
  for (const region of [model.prechart, model.body]) {
    for (const item of region?.items ?? []) {
      if (item.kind === 'row') continue;
      const span =
        item.kind === 'alt'
          ? blockSpan(model, item.guard, item.then.entry)
          : blockSpan(model, item.guard, item.entry);
      out.push(
        error(
          'A1',
          item.kind === 'alt'
            ? '`if … else` is not supported by the skeleton automaton; only basic charts are.'
            : item.repeat !== undefined
              ? '`repeat` is not supported by the skeleton automaton; only basic charts are.'
              : 'Subcharts are not supported by the skeleton automaton; only basic charts are.',
          span,
        ),
      );
    }
  }
  let simultaneous = false;
  for (const instance of model.instances) {
    if (instance.createdAt) {
      out.push(
        error(
          'A3',
          `\`create\` is not supported by the skeleton automaton: \`${instance.name}\` is created in the chart.`,
          spanOf(model, instance.createdAt),
        ),
      );
    }
    for (const l of instance.locations) {
      const { label } = l;
      if (label.destroy)
        out.push(error('A3', '`destroy` is not supported by the skeleton automaton.', l.span));
      if (label.timeout !== undefined)
        out.push(error('A3', '`timeout` is not supported by the skeleton automaton.', l.span));
      if (
        !simultaneous &&
        (label.events.length > 1 || (label.events.length > 0 && label.condition !== undefined))
      ) {
        simultaneous = true;
        out.push(
          error(
            'A2',
            '`simultaneous` is not supported by the skeleton automaton: pavlov selects one event per step.',
            l.span,
          ),
        );
      }
    }
  }
  if (model.activation?.condition) {
    out.push(
      error(
        'A4',
        '`activation when` is not supported by the skeleton automaton: it needs a condition watched after every event.',
      ),
    );
  }
  if (out.length > 0) return out;
  for (const d of validateLsc(model)) {
    if (d.severity === 'error') {
      out.push(
        error('A6', `The chart has errors, so it has no skeleton automaton: ${d.message}`, d.span),
      );
    }
  }
  return out;
}

function blockSpan(model: LscChart, guard: string | undefined, entry: string): Span | undefined {
  if (guard) return model.conditions.find((c) => c.id === guard)?.span;
  const barrier = model.barriers.find((b) => b.id === entry);
  const ref = barrier?.locations[0];
  return ref ? spanOf(model, ref) : undefined;
}

function spanOf(model: LscChart, ref: LocRef): Span | undefined {
  return model.instances
    .find((i) => i.id === ref.instance)
    ?.locations.find((l) => l.ref.part === ref.part && l.ref.index === ref.index)?.span;
}

// ---- Constant conditions --------------------------------------------------------------------

type Value = boolean | number | undefined;

/** The value of an expression made of literals and operators only. */
export function constantValue(expr: Expr): Value {
  switch (expr.kind) {
    case 'bool':
    case 'int':
      return expr.value;
    case 'not': {
      const v = constantValue(expr.arg);
      return typeof v === 'boolean' ? !v : undefined;
    }
    case 'bin': {
      const a = constantValue(expr.left);
      const b = constantValue(expr.right);
      if (a === undefined || b === undefined) return undefined;
      switch (expr.op) {
        case 'and':
          return typeof a === 'boolean' && typeof b === 'boolean' ? a && b : undefined;
        case 'or':
          return typeof a === 'boolean' && typeof b === 'boolean' ? a || b : undefined;
        case '=':
          return a === b;
        case '!=':
          return a !== b;
      }
      if (typeof a !== 'number' || typeof b !== 'number') return undefined;
      switch (expr.op) {
        case '<':
          return a < b;
        case '<=':
          return a <= b;
        case '>':
          return a > b;
        case '>=':
          return a >= b;
        case '+':
          return a + b;
        case '-':
          return a - b;
        case '*':
          return a * b;
        case '/':
          return b === 0 ? undefined : Math.trunc(a / b);
      }
      return undefined;
    }
    default:
      return undefined;
  }
}

// ---- Construction ---------------------------------------------------------------------------

/** One way to move the cut: an event at one or two points (a synchronous message is one step). */
interface Step {
  event: number;
  points: number[];
  /** Text order. */
  row: number;
}

interface ConditionPoint {
  point: number;
  condition: number;
  row: number;
}

const OUTCOMES: Outcome[] = ['completed', 'exit', 'abort', 'not-activated'];

class Builder {
  private readonly events: AutomatonEvent[] = [];
  private readonly eventIds = new Map<string, number>();
  private readonly conditions: AutomatonCondition[] = [];
  private readonly steps: Step[] = [];
  private readonly conditionPoints: ConditionPoint[] = [];
  private readonly states: AutomatonState[] = [];
  private readonly stateOfCut = new Map<string, number>();
  private readonly outcomeIds = new Map<Outcome, number>();
  private readonly queue: { id: number; done: Set<number> }[] = [];

  private readonly byKey = new Map<string, Location>();
  private pointCount = 0;
  private preds: number[][] = [];
  private prechartPoints = new Set<number>();
  /** Points of the hand-over barrier, passed as soon as they are enabled. */
  private silentPoints: number[] = [];
  private pointOfKey = new Map<string, number>();
  private activation?: number;
  /** The first cut, when there is no activation message. */
  private startCut?: string;

  constructor(
    private readonly model: LscChart,
    private readonly limit: number,
  ) {}

  build(): SkeletonAutomaton {
    const model = this.model;
    for (const i of model.instances) for (const l of i.locations) this.byKey.set(locKey(l.ref), l);
    const unfolding = unfoldings(model)[0]!;
    const order = partialOrder(model, unfolding);
    this.pointCount = order.points.length;
    this.preds = order.points.map(() => []);
    for (const [a, b] of order.edges) this.preds[b]!.push(a);
    for (const p of order.points) {
      if (p.locations.length === 0) this.silentPoints.push(p.id);
      for (const ref of p.locations) {
        this.pointOfKey.set(locKey(ref), p.id);
        if (ref.part === 'prechart') this.prechartPoints.add(p.id);
      }
    }
    // The hand-over point belongs to the pre-chart.
    for (const p of this.silentPoints) this.prechartPoints.add(p);

    this.collectEvents();
    this.collectConditions();

    const message = model.activation?.message;
    if (message) {
      const keys = specKeys(message);
      this.activation = this.event(keys[0]!, false);
    }

    for (const outcome of OUTCOMES) {
      const id = this.states.length;
      this.states.push({ id, kind: 'outcome', outcome });
      this.outcomeIds.set(outcome, id);
    }

    let start: number;
    if (this.activation !== undefined) {
      start = this.states.length;
      const inactive: WaitState = {
        id: start,
        kind: 'wait',
        phase: 'inactive',
        hot: false,
        on: [],
        deviation: 'ignore',
        cut: this.cutRefs(new Set(), model.prechart ? 'prechart' : 'body'),
      };
      this.states.push(inactive);
      const first = this.close(new Set());
      inactive.on.push([this.activation, this.stateFor(first)]);
    } else {
      const first = this.close(new Set());
      this.startCut = cutKey(first);
      start = this.stateFor(first);
      if (this.states[start]!.kind !== 'wait') {
        throw new BuildError(
          error(
            'A4',
            this.states[start]!.kind === 'condition'
              ? 'The chart starts with a condition and has no activation message or pre-chart before it, so the condition would be watched after every event.'
              : 'The chart has no events, so it would complete again after every event.',
            this.states[start]!.kind === 'condition'
              ? model.conditions.find(
                  (c) =>
                    c.id === this.conditions[(this.states[start] as ConditionState).condition]!.id,
                )?.span
              : undefined,
          ),
        );
      }
    }

    while (this.queue.length > 0) this.expand(this.queue.shift()!);

    const automaton: SkeletonAutomaton = {
      automatonVersion: AUTOMATON_VERSION,
      mode: model.mode!,
      ...(model.title !== undefined ? { title: model.title } : {}),
      events: this.events,
      ...(this.activation !== undefined ? { activation: this.activation } : {}),
      conditions: this.conditions,
      start,
      states: this.states,
    };
    return automaton;
  }

  // ---- Alphabet --------------------------------------------------------------------------

  private event(key: EventKey, visible: boolean): number {
    const k = `${key.from}\u0000${key.to}\u0000${key.name}\u0000${key.kind}\u0000${key.dir ?? ''}`;
    let id = this.eventIds.get(k);
    if (id === undefined) {
      id = this.events.length;
      this.eventIds.set(k, id);
      this.events.push({
        from: key.from,
        to: key.to,
        name: key.name,
        kind: key.kind,
        ...(key.dir ? { dir: key.dir } : {}),
        visible,
      });
    } else if (visible) {
      this.events[id]!.visible = true;
    }
    return id;
  }

  private nameOf(lifetime: string): string {
    if (lifetime === 'env') return 'env';
    return this.model.instances.find((i) => i.id === lifetime)?.name ?? lifetime;
  }

  private point(ref: LocRef): number {
    return this.pointOfKey.get(locKey(ref))!;
  }

  private collectEvents(): void {
    for (const m of this.model.messages) {
      const from = this.nameOf(m.from);
      const to = this.nameOf(m.to);
      const base = { from, to, name: m.name, kind: m.kind };
      if (m.kind === 'synch') {
        const event = this.event(base, true);
        const refs = [m.send, m.receive].filter((r): r is LocRef => r !== undefined);
        this.steps.push({
          event,
          points: [...new Set(refs.map((r) => this.point(r)))],
          row: Math.min(...refs.map((r) => this.byKey.get(locKey(r))!.row)),
        });
      } else {
        for (const [ref, dir] of [
          [m.send, '!'],
          [m.receive, '?'],
        ] as const) {
          if (!ref) continue;
          const event = this.event({ ...base, dir }, true);
          this.steps.push({
            event,
            points: [this.point(ref)],
            row: this.byKey.get(locKey(ref))!.row,
          });
        }
      }
    }
    this.steps.sort((a, b) => a.row - b.row);
    for (const spec of this.model.visibleEvents) {
      for (const key of specKeys(spec)) this.event(key, true);
    }
  }

  private collectConditions(): void {
    for (const c of this.model.conditions) {
      const ref = c.locations[0];
      if (!ref) continue;
      const value = constantValue(c.expr);
      const index = this.conditions.length;
      this.conditions.push({
        id: c.id,
        text: c.text,
        temp: ref.part === 'prechart' ? 'cold' : c.temp,
        part: ref.part,
        ...(typeof value === 'boolean' ? { value } : {}),
      });
      this.conditionPoints.push({
        point: this.point(ref),
        condition: index,
        row: Math.min(...c.locations.map((r) => this.byKey.get(locKey(r))!.row)),
      });
    }
    this.conditionPoints.sort((a, b) => a.row - b.row);
  }

  // ---- Cuts ------------------------------------------------------------------------------

  private enabled(done: Set<number>, point: number, also?: number): boolean {
    return !done.has(point) && this.preds[point]!.every((p) => done.has(p) || p === also);
  }

  private stepEnabled(done: Set<number>, step: Step): boolean {
    if (step.points.length === 1) return this.enabled(done, step.points[0]!);
    const [send, receive] = step.points as [number, number];
    return this.enabled(done, send) && this.enabled(done, receive, send);
  }

  /** Pass the hand-over point as soon as it is enabled. */
  private close(done: Set<number>): Set<number> {
    for (const p of this.silentPoints) if (this.enabled(done, p)) done.add(p);
    return done;
  }

  private phase(done: Set<number>): 'prechart' | 'body' {
    for (const p of this.prechartPoints) if (!done.has(p)) return 'prechart';
    return 'body';
  }

  /** The location each lifetime has reached in the current part. */
  private cutRefs(done: Set<number>, part: Part): LocRef[] {
    const out: LocRef[] = [];
    for (const instance of this.model.instances) {
      let reached: LocRef | undefined;
      for (const l of instance.locations) {
        if (l.ref.part !== part) continue;
        if (l.ref.index === 0) reached ??= l.ref;
        else if (done.has(this.point(l.ref)) && (!reached || l.ref.index > reached.index))
          reached = l.ref;
      }
      if (reached) out.push(reached);
    }
    return out;
  }

  /** A promise is held: a hot current location (reading 1), or a hot message in flight. */
  private hot(done: Set<number>): boolean {
    if (this.phase(done) !== 'body') return false;
    // With no activation message and no pre-chart, promises start with the first event (reading 23).
    if (cutKey(done) === this.startCut) return false;
    for (const ref of this.cutRefs(done, 'body')) {
      if (this.byKey.get(locKey(ref))!.temp === 'hot') return true;
    }
    for (const m of this.model.messages) {
      if (m.kind !== 'asynch' || m.temp !== 'hot' || !m.send || !m.receive) continue;
      if (done.has(this.point(m.send)) && !done.has(this.point(m.receive))) return true;
    }
    return false;
  }

  private stateFor(done: Set<number>): number {
    if (done.size === this.pointCount) return this.outcomeIds.get('completed')!;
    const key = cutKey(done);
    const known = this.stateOfCut.get(key);
    if (known !== undefined) return known;
    if (this.states.length - OUTCOMES.length >= this.limit) {
      throw new BuildError(
        error(
          'A5',
          `The chart's skeleton automaton has more than ${this.limit} states; coregions multiply cuts.`,
        ),
      );
    }
    const id = this.states.length;
    this.stateOfCut.set(key, id);
    const phase = this.phase(done);
    const hot = this.hot(done);
    const cut = this.cutRefs(done, phase);
    const condition = this.conditionPoints.find((c) => this.enabled(done, c.point));
    if (condition) {
      this.states.push({
        id,
        kind: 'condition',
        phase,
        hot,
        condition: condition.condition,
        ifTrue: -1,
        ifFalse: -1,
        cut,
      });
    } else {
      this.states.push({ id, kind: 'wait', phase, hot, on: [], deviation: 'abort', cut });
    }
    this.queue.push({ id, done });
    return id;
  }

  private expand({ id, done }: { id: number; done: Set<number> }): void {
    const state = this.states[id]!;
    if (state.kind === 'condition') {
      const c = this.conditions[state.condition]!;
      const point = this.conditionPoints.find((x) => x.condition === state.condition)!.point;
      state.ifTrue = this.stateFor(this.close(new Set([...done, point])));
      state.ifFalse = this.outcomeIds.get(
        c.part === 'prechart' ? 'not-activated' : c.temp === 'hot' ? 'abort' : 'exit',
      )!;
      return;
    }
    if (state.kind !== 'wait') return;
    state.deviation =
      state.phase === 'body'
        ? 'abort'
        : this.activation === undefined && cutKey(done) === this.startCut
          ? 'ignore'
          : 'not-activated';
    const seen = new Set<number>();
    for (const step of this.steps) {
      if (seen.has(step.event) || !this.stepEnabled(done, step)) continue;
      seen.add(step.event);
      state.on.push([step.event, this.stateFor(this.close(new Set([...done, ...step.points])))]);
    }
  }
}

interface EventKey {
  from: string;
  to: string;
  name: string;
  kind: 'synch' | 'asynch';
  dir?: '!' | '?';
}

/** The events an event specification denotes: both of an asynchronous message unless directed. */
function specKeys(spec: EventSpec): EventKey[] {
  const base = { from: spec.from, to: spec.to, name: spec.name, kind: spec.kind };
  if (spec.kind === 'synch') return [base];
  if (spec.dir) return [{ ...base, dir: spec.dir }];
  return [
    { ...base, dir: '!' },
    { ...base, dir: '?' },
  ];
}

function cutKey(done: Set<number>): string {
  return [...done].sort((a, b) => a - b).join(',');
}
