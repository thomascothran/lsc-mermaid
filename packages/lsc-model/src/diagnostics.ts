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
  /** Stable identifier: `syntax`, or a validation rule such as `V23`. */
  code: string;
  message: string;
  span?: Span;
}
