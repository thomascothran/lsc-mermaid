// Condition expressions: a small hand-written parser, name resolution and type checks.
//
// Precedence, tightest first: `* /`, `+ -`, comparisons (non-chaining), `not`, `and`, `or`.
// Arithmetic associates to the left. See "Labels and expressions" in the proposal.

import type { Severity } from './diagnostics.js';
import type { BinaryOp, Expr, Type, Variable } from './model.js';

/** A problem found in an expression; offsets are relative to the expression text. */
export interface ExprIssue {
  code: 'syntax' | 'V13' | 'V20';
  severity: Severity;
  message: string;
  start: number;
  end: number;
}

// ---- Tokens -------------------------------------------------------------------------------

type TokenKind = 'int' | 'name' | 'word' | 'op' | 'eof';
interface Token {
  kind: TokenKind;
  text: string;
  start: number;
  end: number;
}

const WORDS = new Set(['and', 'or', 'not', 'true', 'false', 'TRUE', 'FALSE']);
const OPERATORS = ['!=', '<=', '>=', '=', '<', '>', '+', '-', '*', '/', '(', ')', '.'];
const NAME_START = /[A-Za-z_\u00C0-\u024F]/;
const NAME_PART = /[A-Za-z0-9_\u00C0-\u024F]/;

function tokenize(text: string): { tokens: Token[]; issue?: ExprIssue } {
  const tokens: Token[] = [];
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === ' ' || ch === '\t') {
      i++;
    } else if (/[0-9]/.test(ch)) {
      const start = i;
      while (i < text.length && /[0-9]/.test(text[i]!)) i++;
      tokens.push({ kind: 'int', text: text.slice(start, i), start, end: i });
    } else if (NAME_START.test(ch)) {
      const start = i;
      while (i < text.length && NAME_PART.test(text[i]!)) i++;
      const word = text.slice(start, i);
      tokens.push({ kind: WORDS.has(word) ? 'word' : 'name', text: word, start, end: i });
    } else if (text.startsWith('->', i)) {
      return {
        tokens,
        issue: syntax(
          '`->` is not an operator. Write the condition in double quotes to keep it verbatim.',
          i,
          i + 2,
        ),
      };
    } else {
      const op = OPERATORS.find((o) => text.startsWith(o, i));
      if (!op) {
        return { tokens, issue: syntax(`Unexpected character '${ch}' in condition.`, i, i + 1) };
      }
      tokens.push({ kind: 'op', text: op, start: i, end: i + op.length });
      i += op.length;
    }
  }
  tokens.push({ kind: 'eof', text: '', start: text.length, end: text.length });
  return { tokens };
}

function syntax(message: string, start: number, end: number): ExprIssue {
  return { code: 'syntax', severity: 'error', message, start, end };
}

// ---- Parsing ------------------------------------------------------------------------------

/** Parsed but unresolved expression, with source offsets. */
export type RawExpr = { start: number; end: number } & (
  | { kind: 'bool'; value: boolean }
  | { kind: 'int'; value: number }
  | { kind: 'path'; parts: string[] }
  | { kind: 'not'; arg: RawExpr }
  | { kind: 'bin'; op: BinaryOp; left: RawExpr; right: RawExpr }
);

const COMPARISONS = new Set<string>(['=', '!=', '<', '<=', '>', '>=']);

class ExprSyntaxError extends Error {
  constructor(readonly issue: ExprIssue) {
    super(issue.message);
  }
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private get peek(): Token {
    return this.tokens[this.pos]!;
  }

  private next(): Token {
    return this.tokens[this.pos++]!;
  }

  private atEnd(): boolean {
    return this.peek.kind === 'eof';
  }

  private is(text: string): boolean {
    const t = this.peek;
    return (t.kind === 'op' || t.kind === 'word') && t.text === text;
  }

  private fail(message: string, token = this.peek): never {
    throw new ExprSyntaxError(syntax(message, token.start, Math.max(token.end, token.start + 1)));
  }

  parse(): RawExpr {
    if (this.atEnd()) this.fail('Expected a condition.');
    const expr = this.or();
    if (!this.atEnd()) this.fail(`Unexpected '${this.peek.text}' in condition.`);
    return expr;
  }

  private binary(op: BinaryOp, left: RawExpr, right: RawExpr): RawExpr {
    return { kind: 'bin', op, left, right, start: left.start, end: right.end };
  }

  private or(): RawExpr {
    let left = this.and();
    while (this.is('or')) {
      this.next();
      left = this.binary('or', left, this.and());
    }
    return left;
  }

  private and(): RawExpr {
    let left = this.not();
    while (this.is('and')) {
      this.next();
      left = this.binary('and', left, this.not());
    }
    return left;
  }

  private not(): RawExpr {
    if (this.is('not')) {
      const start = this.next().start;
      const arg = this.not();
      return { kind: 'not', arg, start, end: arg.end };
    }
    return this.comparison();
  }

  private comparison(): RawExpr {
    const left = this.additive();
    if (this.peek.kind === 'op' && COMPARISONS.has(this.peek.text)) {
      const op = this.next().text as BinaryOp;
      const right = this.additive();
      if (this.peek.kind === 'op' && COMPARISONS.has(this.peek.text)) {
        this.fail('Comparisons do not chain; use `and`, or parentheses.');
      }
      return this.binary(op, left, right);
    }
    return left;
  }

  private additive(): RawExpr {
    let left = this.multiplicative();
    while (this.is('+') || this.is('-')) {
      const op = this.next().text as BinaryOp;
      left = this.binary(op, left, this.multiplicative());
    }
    return left;
  }

  private multiplicative(): RawExpr {
    let left = this.primary();
    while (this.is('*') || this.is('/')) {
      const op = this.next().text as BinaryOp;
      left = this.binary(op, left, this.primary());
    }
    return left;
  }

  private primary(): RawExpr {
    const t = this.peek;
    if (t.kind === 'int') {
      this.next();
      return { kind: 'int', value: Number(t.text), start: t.start, end: t.end };
    }
    if (t.kind === 'word' && /^(true|false)$/i.test(t.text)) {
      this.next();
      return { kind: 'bool', value: t.text.toLowerCase() === 'true', start: t.start, end: t.end };
    }
    if (this.is('(')) {
      this.next();
      const inner = this.or();
      if (!this.is(')')) this.fail("Expected ')'.");
      this.next();
      return inner;
    }
    if (t.kind === 'name') {
      this.next();
      const parts = [t.text];
      let end = t.end;
      while (this.is('.')) {
        this.next();
        const part = this.peek;
        if (part.kind !== 'name') this.fail("Expected a name after '.'.");
        this.next();
        parts.push(part.text);
        end = part.end;
      }
      return { kind: 'path', parts, start: t.start, end };
    }
    if (t.kind === 'eof') this.fail('Condition ends too early.');
    return this.fail(`Unexpected '${t.text}' in condition.`);
  }
}

/** Parses condition text (without quotes). */
export function parseExpr(text: string): { expr?: RawExpr; issue?: ExprIssue } {
  const { tokens, issue } = tokenize(text);
  if (issue) return { issue };
  try {
    return { expr: new Parser(tokens).parse() };
  } catch (e) {
    if (e instanceof ExprSyntaxError) return { issue: e.issue };
    throw e;
  }
}

// ---- Resolution and type checks -----------------------------------------------------------

export interface ResolveContext {
  /** Instance names the condition is written on; unqualified names resolve against these first. */
  instances: string[];
  /** Every instance name in the chart, for `inst.var` references. */
  chartInstances: ReadonlySet<string>;
  variables: readonly Variable[];
}

type ValueType =
  | { kind: 'bool' }
  | { kind: 'int' }
  | { kind: 'enum'; values: string[]; of: string }
  | { kind: 'const'; name: string }
  | undefined;

interface Resolved {
  expr: Expr;
  type: ValueType;
  issues: ExprIssue[];
}

const BOOL: ValueType = { kind: 'bool' };
const INT: ValueType = { kind: 'int' };

function varLabel(v: Variable): string {
  return v.instance === undefined ? v.name : `${v.instance}.${v.name}`;
}

function typeOf(v: Variable): ValueType {
  const t: Type | undefined = v.type;
  if (!t) return undefined;
  if (t.kind === 'enum') return { kind: 'enum', values: t.values, of: varLabel(v) };
  return t.kind === 'bool' ? BOOL : INT;
}

function refOf(v: Variable): Expr {
  return v.instance === undefined
    ? { kind: 'ref', name: v.name }
    : { kind: 'ref', instance: v.instance, name: v.name };
}

function describe(t: ValueType): string {
  if (!t) return 'unknown';
  if (t.kind === 'enum') return `a value of ${t.of}`;
  if (t.kind === 'const') return `the constant ${t.name}`;
  return t.kind === 'bool' ? 'a truth value' : 'an integer';
}

/**
 * Resolves names in a parsed expression and type-checks it against declared variables.
 * The result is in canonical form: the value shorthand is expanded (`idle` on `car` becomes
 * `car.state = idle`).
 */
export function resolveExpr(
  raw: RawExpr,
  ctx: ResolveContext,
): { expr: Expr; issues: ExprIssue[] } {
  const resolver = new Resolver(ctx);
  const r = resolver.resolve(raw, 'bool');
  const issues = [...r.issues];
  if (r.type && r.type.kind !== 'bool') {
    issues.push(typeError(`The condition is ${describe(r.type)}, not a truth value.`, raw));
  }
  return { expr: r.expr, issues };
}

function typeError(message: string, at: { start: number; end: number }): ExprIssue {
  return { code: 'V13', severity: 'error', message, start: at.start, end: at.end };
}

class Resolver {
  private readonly declares: boolean;

  constructor(private readonly ctx: ResolveContext) {
    this.declares = ctx.variables.length > 0;
  }

  resolve(raw: RawExpr, position: 'bool' | 'value'): Resolved {
    switch (raw.kind) {
      case 'bool':
        return { expr: { kind: 'bool', value: raw.value }, type: BOOL, issues: [] };
      case 'int':
        return { expr: { kind: 'int', value: raw.value }, type: INT, issues: [] };
      case 'path':
        return this.path(raw, position);
      case 'not': {
        const arg = this.resolve(raw.arg, 'bool');
        return {
          expr: { kind: 'not', arg: arg.expr },
          type: BOOL,
          issues: [...arg.issues, ...this.expect(arg, BOOL, raw.arg, '`not` needs a truth value')],
        };
      }
      case 'bin':
        return this.binary(raw);
    }
  }

  private expect(r: Resolved, want: ValueType, at: RawExpr, what: string): ExprIssue[] {
    if (!r.type || !want || r.type.kind === want.kind) return [];
    return [typeError(`${what}, but this is ${describe(r.type)}.`, at)];
  }

  private binary(raw: Extract<RawExpr, { kind: 'bin' }>): Resolved {
    const { op } = raw;
    if (op === 'and' || op === 'or') {
      const l = this.resolve(raw.left, 'bool');
      const r = this.resolve(raw.right, 'bool');
      const what = `\`${op}\` needs truth values`;
      return {
        expr: { kind: 'bin', op, left: l.expr, right: r.expr },
        type: BOOL,
        issues: [
          ...l.issues,
          ...r.issues,
          ...this.expect(l, BOOL, raw.left, what),
          ...this.expect(r, BOOL, raw.right, what),
        ],
      };
    }
    let l = this.resolve(raw.left, 'value');
    let r = this.resolve(raw.right, 'value');
    if (op === '=' || op === '!=') {
      // A bare name compared with an enum variable is one of its constants.
      l = this.asConstant(raw.left, l, r.type);
      r = this.asConstant(raw.right, r, l.type);
      const issues = [...l.issues, ...r.issues, ...this.comparable(l, r, raw)];
      return { expr: { kind: 'bin', op, left: l.expr, right: r.expr }, type: BOOL, issues };
    }
    const what = COMPARISONS.has(op) ? `\`${op}\` compares integers` : `\`${op}\` needs integers`;
    return {
      expr: { kind: 'bin', op, left: l.expr, right: r.expr },
      type: COMPARISONS.has(op) ? BOOL : INT,
      issues: [
        ...l.issues,
        ...r.issues,
        ...this.expect(l, INT, raw.left, what),
        ...this.expect(r, INT, raw.right, what),
      ],
    };
  }

  private asConstant(raw: RawExpr, side: Resolved, other: ValueType): Resolved {
    if (other?.kind !== 'enum' || raw.kind !== 'path' || raw.parts.length !== 1) return side;
    if (side.expr.kind !== 'const' && side.expr.kind !== 'prop') return side;
    const name = raw.parts[0]!;
    if (other.values.includes(name)) {
      return { expr: { kind: 'const', name }, type: { kind: 'const', name }, issues: [] };
    }
    return {
      expr: { kind: 'const', name },
      type: { kind: 'const', name },
      issues: [
        typeError(`\`${name}\` is not a value of ${other.of} ({${other.values.join(', ')}}).`, raw),
      ],
    };
  }

  private comparable(
    l: Resolved,
    r: Resolved,
    raw: Extract<RawExpr, { kind: 'bin' }>,
  ): ExprIssue[] {
    const a = l.type;
    const b = r.type;
    if (!a || !b) return [];
    if (a.kind === 'const' && b.kind === 'const') return [];
    if (a.kind === 'enum' && b.kind === 'const') return [];
    if (a.kind === 'const' && b.kind === 'enum') return [];
    if (a.kind === 'enum' && b.kind === 'enum') return [];
    if (a.kind === b.kind) return [];
    return [typeError(`Cannot compare ${describe(a)} with ${describe(b)}.`, raw)];
  }

  private path(raw: Extract<RawExpr, { kind: 'path' }>, position: 'bool' | 'value'): Resolved {
    const { parts } = raw;
    const vars = this.ctx.variables;
    if (parts.length === 1) {
      const name = parts[0]!;
      const local = vars.filter(
        (v) =>
          v.name === name && v.instance !== undefined && this.ctx.instances.includes(v.instance),
      );
      const candidates =
        local.length > 0 ? local : vars.filter((v) => v.name === name && v.instance === undefined);
      if (candidates.length > 1) {
        return {
          ...this.variable(candidates[0]!),
          issues: [
            typeError(
              `\`${name}\` is ambiguous: it could be ${candidates.map(varLabel).join(' or ')}. Qualify it.`,
              raw,
            ),
          ],
        };
      }
      if (candidates.length === 1) return this.variable(candidates[0]!);
      const owners = this.enumsWithValue(name, this.ctx.instances);
      if (owners.length > 0) return this.shorthand(name, owners, raw, position);
      return this.proposition(name, raw);
    }
    if (parts.length === 2) {
      const [inst, name] = parts as [string, string];
      if (this.ctx.chartInstances.has(inst)) {
        const v = vars.find((x) => x.instance === inst && x.name === name);
        if (v) return this.variable(v);
        const owners = this.enumsWithValue(name, [inst]);
        if (owners.length > 0 && position === 'bool')
          return this.shorthand(name, owners, raw, position);
      }
    }
    return { expr: { kind: 'path', parts }, type: undefined, issues: [] };
  }

  private enumsWithValue(value: string, instances: string[]): Variable[] {
    const onInstances = this.ctx.variables.filter(
      (v) =>
        v.type?.kind === 'enum' &&
        v.type.values.includes(value) &&
        v.instance !== undefined &&
        instances.includes(v.instance),
    );
    if (onInstances.length > 0) return onInstances;
    return this.ctx.variables.filter(
      (v) => v.type?.kind === 'enum' && v.type.values.includes(value) && v.instance === undefined,
    );
  }

  /** `c` or `inst.c`, where `c` is a value of exactly one enum variable `v`: `v = c`. */
  private shorthand(
    value: string,
    owners: Variable[],
    raw: RawExpr,
    position: 'bool' | 'value',
  ): Resolved {
    if (position === 'value')
      return {
        expr: { kind: 'const', name: value },
        type: { kind: 'const', name: value },
        issues: [],
      };
    const owner = owners[0]!;
    const issues =
      owners.length > 1
        ? [
            typeError(
              `\`${value}\` is ambiguous: it is a value of ${owners.map(varLabel).join(' and ')}. Write the comparison.`,
              raw,
            ),
          ]
        : [];
    return {
      expr: { kind: 'bin', op: '=', left: refOf(owner), right: { kind: 'const', name: value } },
      type: BOOL,
      issues,
    };
  }

  /** A variable; whatever uses it checks its type. */
  private variable(v: Variable): Resolved {
    return { expr: refOf(v), type: typeOf(v), issues: [] };
  }

  private proposition(name: string, raw: RawExpr): Resolved {
    const message = this.declares
      ? `\`${name}\` is not a declared variable or value, so it is read as an opaque proposition. Check the spelling, or quote the condition.`
      : `\`${name}\` is read as an opaque proposition.`;
    return {
      expr: { kind: 'prop', name },
      type: undefined,
      issues: [
        {
          code: 'V20',
          severity: this.declares ? 'warning' : 'info',
          message,
          start: raw.start,
          end: raw.end,
        },
      ],
    };
  }
}

// ---- Printing -----------------------------------------------------------------------------

function precedence(e: Expr): number {
  if (e.kind === 'not') return 3;
  if (e.kind !== 'bin') return 7;
  switch (e.op) {
    case 'or':
      return 1;
    case 'and':
      return 2;
    case '+':
    case '-':
      return 5;
    case '*':
    case '/':
      return 6;
    default:
      return 4;
  }
}

/** Canonical text of an expression: single spaces, parentheses only where precedence needs them. */
export function printExpr(e: Expr): string {
  switch (e.kind) {
    case 'bool':
      return String(e.value);
    case 'int':
      return String(e.value);
    case 'ref':
      return e.instance === undefined ? e.name : `${e.instance}.${e.name}`;
    case 'path':
      return e.parts.join('.');
    case 'const':
    case 'prop':
      return e.name;
    case 'text':
      return `"${e.text}"`;
    case 'not': {
      const arg = printExpr(e.arg);
      return `not ${precedence(e.arg) < 3 ? `(${arg})` : arg}`;
    }
    case 'bin': {
      const p = precedence(e);
      const comparison = p === 4;
      const lp = precedence(e.left);
      const rp = precedence(e.right);
      const left =
        lp < p || (comparison && lp === p) ? `(${printExpr(e.left)})` : printExpr(e.left);
      const right = rp <= p ? `(${printExpr(e.right)})` : printExpr(e.right);
      return `${left} ${e.op} ${right}`;
    }
  }
}

/** Collects the variables an expression refers to. */
export function referencedVariables(e: Expr): { instance?: string; name: string }[] {
  switch (e.kind) {
    case 'ref':
      return [e];
    case 'not':
      return referencedVariables(e.arg);
    case 'bin':
      return [...referencedVariables(e.left), ...referencedVariables(e.right)];
    default:
      return [];
  }
}
