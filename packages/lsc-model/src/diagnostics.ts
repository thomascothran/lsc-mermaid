export type Severity = 'error' | 'warning' | 'info';

/** A position in the source text. `line` and `column` are 1-based; `offset` is 0-based. */
export interface Position {
  line: number;
  column: number;
  offset: number;
}

/** A source range; `end` is exclusive. */
export interface Span {
  start: Position;
  end: Position;
}

export interface Diagnostic {
  severity: Severity;
  /**
   * Stable identifier: `syntax` (including statements in a place the notation does not allow),
   * a validation rule such as `V23`, or `unfoldings` when the unfolding cap is reached.
   */
  code: string;
  message: string;
  span?: Span;
  /** For rules checked per unfolding: the index of an unfolding that shows the problem. */
  unfolding?: number;
}

/**
 * Codes whose errors stop rendering: syntax errors and the rules marked ✱ in the proposal.
 * Without them the chart can't be laid out. `parseLsc` returns no model when one occurs.
 */
export const BLOCKING_CODES: ReadonlySet<string> = new Set(['syntax', 'V6', 'V18', 'V22', 'V23']);

export function isBlocking(d: Diagnostic): boolean {
  return d.severity === 'error' && BLOCKING_CODES.has(d.code);
}
