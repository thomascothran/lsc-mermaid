// Semantic model for Live Sequence Charts, shaped like the paper's abstract syntax (Damm & Harel
// 2001, pp. 55–56 and Appendix A). See "Semantic model and public API" in the proposal.
//
// The model is plain data: no classes, maps or functions, so it survives JSON unchanged.

import type { Span } from './diagnostics.js';

export type SourceSpan = Span;
export type Temp = 'hot' | 'cold';
export type Part = 'prechart' | 'body';
export type MessageKind = 'synch' | 'asynch';

/** ⟨i, l⟩: location `index` of lifetime `instance` within one part of the chart. */
export interface LocRef {
  instance: string;
  part: Part;
  index: number;
}

export interface LscChart {
  modelVersion: 1;
  /** `subchart`: a standalone subchart (Fig. 11). */
  kind: 'chart' | 'subchart';
  /** mod(m); absent for standalone subcharts. */
  mode?: 'universal' | 'existential';
  title?: string;
  accTitle?: string;
  accDescr?: string;
  defaults: Temp;
  /** inst(m): one entry per lifetime, in column order and then creation order. */
  instances: Instance[];
  /** The declared part of vis_var(m). */
  variables: Variable[];
  /** vis_events(m) beyond the events drawn in the chart. */
  visibleEvents: EventSpec[];
  /** ac(m). The activation message is cold. `conditionText` is the condition as written. */
  activation?: { condition?: Expr; conditionText?: string; message?: EventSpec };
  /** pch(m). */
  prechart?: Region;
  body: Region;
  messages: Message[];
  conditions: Condition[];
  /** Synchronisation barriers of blocks (reading 11). */
  barriers: Barrier[];
  /** Annotations; no semantics. */
  notes: Note[];
}

export interface Instance {
  /** Unique per lifetime: `carHandler`, `carHandler@2`. */
  id: string;
  /** As written: `carHandler`. */
  name: string;
  label: string;
  /** Shared by all lifetimes of a name. */
  column: number;
  head: 'box' | 'actor';
  /** `{ subchart }` holds the id of the subchart a local instance belongs to. */
  scope: 'chart' | { subchart: string };
  /** The creator's creation location; absent for instances present from the start. */
  createdAt?: LocRef;
  createdBy?: string;
  destroyedAt?: LocRef;
  /** dom(m, i): pre-chart locations, then body locations. Location 0 of each part is the top. */
  locations: Location[];
}

export interface Location {
  ref: LocRef;
  /** temp(m)(⟨i, l⟩); always `cold` in the pre-chart. */
  temp: Temp;
  /** Locations sharing a coregion id are mutually unordered. */
  coregion?: string;
  label: LocationLabel;
  /** Layout row. */
  row: number;
  span: SourceSpan;
}

export interface LocationLabel {
  events: MessageEvent[];
  /** Condition.id */
  condition?: string;
  /** Barrier.id (synthetic, always true). */
  barrier?: string;
  /** Lifetime id of the instance created here. */
  create?: string;
  destroy?: true;
  timeout?: string;
}

export interface Message {
  /** Unique occurrence id: `departReq`, `departReq#2`, `data#first`. */
  id: string;
  /** User label, from `#label`. */
  occurrence?: string;
  /** The event identity: the label without trailing `(…)`, whitespace normalised. */
  name: string;
  /** Text between the trailing parentheses. */
  args?: string;
  /** The label as written. */
  text: string;
  /** Lifetime id or `env`. */
  from: string;
  to: string;
  kind: MessageKind;
  temp: Temp;
  /** Absent on the `env` side. */
  send?: LocRef;
  receive?: LocRef;
  /** The statement that sends the message (a one-line message, or its `send`). */
  span: SourceSpan;
  /** The `receive` statement of a split message. */
  receiveSpan?: SourceSpan;
}

export interface MessageEvent {
  /** Message.id */
  message: string;
  dir: '!' | '?';
}

export interface EventSpec {
  from: string;
  to: string;
  name: string;
  kind: MessageKind;
  /** Absent: both events. */
  dir?: '!' | '?';
}

export interface Condition {
  id: string;
  /** Lifetimes as written, used to resolve unqualified names. */
  instances: string[];
  /** Lifetimes the condition synchronises, in column order. Guards: the block's lifetimes alive at entry. */
  sharedBy: string[];
  expr: Expr;
  /** The condition as written, for display; a quoted condition without its quotes. */
  text: string;
  temp: Temp;
  locations: LocRef[];
  /** The condition statement, or the `if` line of a guard. */
  span: SourceSpan;
}

export interface Barrier {
  id: string;
  /** Lifetimes alive at the barrier, in column order. */
  instances: string[];
  locations: LocRef[];
  at: 'entry' | 'exit';
  /** Subchart.id or Alternative.id */
  block: string;
}

export interface Note {
  id: string;
  text: string;
  row: number;
  span: SourceSpan;
  placement: { over: string[] } | { leftOf: string } | { rightOf: string };
}

export interface Variable {
  /** Instance name; absent for global variables. */
  instance?: string;
  name: string;
  type?: Type;
}

export type Type =
  { kind: 'bool' } | { kind: 'int'; lo?: number; hi?: number } | { kind: 'enum'; values: string[] };

export type BinaryOp = '=' | '!=' | '<' | '<=' | '>' | '>=' | '+' | '-' | '*' | '/' | 'and' | 'or';

export type Expr =
  | { kind: 'bool'; value: boolean }
  | { kind: 'int'; value: number }
  /** A resolved variable. */
  | { kind: 'ref'; instance?: string; name: string }
  /** An opaque dotted path. */
  | { kind: 'path'; parts: string[] }
  /** An enum constant. */
  | { kind: 'const'; name: string }
  /** An opaque proposition. */
  | { kind: 'prop'; name: string }
  /** A quoted condition, verbatim. */
  | { kind: 'text'; text: string }
  | { kind: 'not'; arg: Expr }
  | { kind: 'bin'; op: BinaryOp; left: Expr; right: Expr };

export type RegionItem = { kind: 'row'; locations: LocRef[] } | Subchart | Alternative;

export interface Region {
  items: RegionItem[];
}

export interface Subchart {
  kind: 'subchart';
  id: string;
  name?: string;
  /** The block's lifetimes, in column order. */
  instances: string[];
  localInstances: string[];
  repeat?: '*' | number | string;
  /** Condition.id of an opening condition, which is the entry barrier (reading 12). */
  guard?: string;
  /** Barrier.id */
  entry: string;
  exit: string;
  body: Region;
  semantics: 'informal';
}

export interface Alternative {
  kind: 'alt';
  id: string;
  /** Condition.id; evaluated once, as a cold condition (reading 15). */
  guard: string;
  then: Subchart;
  else?: Subchart;
  semantics: 'informal';
}
