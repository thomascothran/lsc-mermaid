// Shape of a fixture's expected results. See fixtures/README.md for the conventions.

export type Temp = 'hot' | 'cold';
export type Severity = 'error' | 'warning' | 'info';

/**
 * A reference to a point in the partial order:
 * - `departReq!` / `departReq?`: the send / receive event of the message with that id;
 * - `L12`: the location(s) created by the statement on line 12 (all locations of a shared
 *   condition or barrier are equivalent in the order);
 * - `destPanel@L13`: the location of instance `destPanel` created by line 13 (for example its
 *   share of a block's entry barrier).
 */
export type OrderRef = string;

export interface ExpectedInstance {
  /** Lifetime id: `carHandler`, `carHandler@2`. */
  id: string;
  /** Name as written; defaults to `id`. */
  name?: string;
  label: string;
  column: number;
  head?: 'box' | 'actor';
  createdBy?: string;
  createdAtLine?: number;
  destroyedAtLine?: number;
}

export interface ExpectedMessage {
  /** Unique occurrence id: `departReq`, `departReq#2`, `data#first`. */
  id: string;
  name: string;
  args?: string;
  /** Lifetime id or `env`. */
  from: string;
  to: string;
  kind: 'synch' | 'asynch';
  temp: Temp;
  sendLine: number;
  receiveLine: number;
}

export interface ExpectedCondition {
  line: number;
  /** As written, used to resolve unqualified names. */
  instances: string[];
  /** Lifetimes the condition synchronises, in column order. Guards: the block's live lifetimes. */
  sharedBy: string[];
  temp: Temp;
  /** Canonical printed form after resolution, e.g. `car.state = idle`, `"verbatim"`, `armed`. */
  expr: string;
  /** Set when the condition is a block's entry barrier (reading 12). */
  guardOf?: string;
}

export interface ExpectedEventSpec {
  from: string;
  to: string;
  name: string;
  kind: 'synch' | 'asynch';
  dir?: '!' | '?';
}

export interface ExpectedDiagnostic {
  code: string;
  severity: Severity;
  line: number;
}

export interface FixtureExpectation {
  /** Where the example comes from in the paper, or why it exists. */
  source: string;
  kind: 'chart' | 'subchart';
  mode?: 'universal' | 'existential';
  title: string;
  defaults: Temp;
  instances: ExpectedInstance[];
  /** Declared variables, as `inst.name: type`. */
  variables: string[];
  visibleEvents: ExpectedEventSpec[];
  activation?: { condition?: string; message?: ExpectedEventSpec };
  messages: ExpectedMessage[];
  conditions: ExpectedCondition[];
  /**
   * Location temperatures per lifetime, indexed by location number: index 0 is the top of the
   * line (no events); event locations start at 1. Pre-chart and body are numbered separately.
   * Given only for charts with a single unfolding.
   */
  locations?: Record<string, { prechart?: Temp[]; body: Temp[] }>;
  unfoldings: { count: number; main: number };
  order: { before: [OrderRef, OrderRef][]; unordered: [OrderRef, OrderRef][] };
  /** Every diagnostic `parseLsc` + `validateLsc` must report, and no others. */
  diagnostics: ExpectedDiagnostic[];
}
