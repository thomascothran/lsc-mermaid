// Builds the semantic model from the Langium AST.
//
// Pass A walks the statements in text order. It resolves names to lifetimes (reading 17), pairs
// `send` and `receive`, assigns message occurrence ids, and records each block's lifetimes,
// producing an intermediate tree. Pass B walks that tree to create locations, rows,
// temperatures and barriers: a block's entry barrier needs every lifetime used inside the block,
// which is only known once the block has been read.
//
// The builder also reports every rule that is tied to the source text: syntax-level context
// rules, name resolution, pairing, expressions and the statement-level V-rules. `validateLsc`
// reports the rules checked on the model's unfoldings and partial order.

import { GrammarUtils, type AstNode } from 'langium';
import type { Diagnostic, Position, Severity, Span } from './diagnostics.js';
import { parseExpr, resolveExpr, type ExprIssue, type RawExpr } from './expr.js';
import * as ast from './language/generated/ast.js';
import type {
  Alternative,
  Barrier,
  Condition,
  EventSpec,
  Expr,
  Instance,
  Location,
  LocationLabel,
  LscChart,
  Message,
  MessageKind,
  Note,
  Part,
  Region,
  RegionItem,
  Subchart,
  Temp,
  Type,
  Variable,
} from './model.js';

// ---- Source positions ---------------------------------------------------------------------

export class Source {
  private readonly lineStarts: number[] = [0];

  constructor(readonly text: string) {
    for (let i = 0; i < text.length; i++)
      if (text.charCodeAt(i) === 10) this.lineStarts.push(i + 1);
  }

  position(offset: number): Position {
    let lo = 0;
    let hi = this.lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.lineStarts[mid]! <= offset) lo = mid;
      else hi = mid - 1;
    }
    return { line: lo + 1, column: offset - this.lineStarts[lo]! + 1, offset };
  }

  span(start: number, end: number): Span {
    return { start: this.position(start), end: this.position(end) };
  }

  node(node: AstNode): Span {
    const cst = node.$cstNode;
    return cst ? this.span(cst.offset, cst.end) : this.span(0, 0);
  }

  /** The span of a property's source, falling back to the whole node. */
  property(node: AstNode, property: string, index?: number): Span {
    const cst = GrammarUtils.findNodeForProperty(node.$cstNode, property, index);
    return cst ? this.span(cst.offset, cst.end) : this.node(node);
  }

  /** A terminal written as `<prefix><content>` (such as `TEXT`), with the content trimmed. */
  content(node: AstNode, property: string, prefix: RegExp): { text: string; offset: number } {
    const cst = GrammarUtils.findNodeForProperty(node.$cstNode, property);
    const raw = cst?.text ?? '';
    const head = prefix.exec(raw)?.[0].length ?? 0;
    const rest = raw.slice(head);
    const lead = rest.length - rest.trimStart().length;
    return { text: rest.trim(), offset: (cst?.offset ?? 0) + head + lead };
  }
}

const AFTER_COLON = /^:/;

// ---- Pass A: intermediate tree -----------------------------------------------------------

interface Lifetime {
  id: string;
  name: string;
  label: string;
  column: number;
  head: 'box' | 'actor';
  scope: 'chart' | Scope;
  /** Order of creation, for sorting lifetimes that share a column. */
  order: number;
  span: Span;
  alive: boolean;
  createdBy?: Lifetime;
  createdIn?: Part;
  destroyedLine?: number;
  instance?: Instance;
}

interface Scope {
  kind: 'subchart' | 'branch' | 'alt';
  id: string;
  name?: string;
  uses: Set<Lifetime>;
  created: Set<Lifetime>;
  destroyed: Set<Lifetime>;
}

interface MessageIR {
  message: Message;
  fromLt?: Lifetime;
  toLt?: Lifetime;
  label?: string;
  received: boolean;
  sendSpan: Span;
  sendScope: Scope | undefined;
}

interface ConditionIR {
  condition: Condition;
  lifetimes: Lifetime[];
  raw?: RawExpr;
  textOffset: number;
  span: Span;
  /** Set for a block's opening condition and an `if` guard. */
  guardOf?: BlockIR | AltIR;
}

interface BlockIR {
  scope: Scope;
  span: Span;
  endSpan: Span;
  local: Lifetime[];
  repeat?: '*' | number | string;
  children: IR[];
  guard?: ConditionIR;
  entry: Lifetime[];
  exit: Lifetime[];
}

interface AltIR {
  scope: Scope;
  span: Span;
  elseSpan?: Span;
  endSpan: Span;
  guard: ConditionIR;
  then: BlockIR;
  else?: BlockIR;
  entry: Lifetime[];
  exit: Lifetime[];
}

type IR =
  | { t: 'msg'; m: MessageIR; span: Span }
  | { t: 'send'; m: MessageIR; span: Span }
  | { t: 'receive'; m: MessageIR; span: Span }
  | { t: 'condition'; c: ConditionIR; span: Span }
  | { t: 'timeout'; lt: Lifetime; label: string; span: Span }
  | { t: 'create'; creator: Lifetime; created: Lifetime; span: Span }
  | { t: 'destroy'; lt: Lifetime; span: Span }
  | { t: 'progress'; temp: Temp; lts: Lifetime[]; span: Span }
  | { t: 'note'; note: Note; span: Span }
  | { t: 'simultaneous'; lts: Lifetime[]; children: IR[]; span: Span }
  | { t: 'coregion'; lt: Lifetime; children: IR[]; span: Span }
  | { t: 'block'; b: BlockIR; span: Span }
  | { t: 'alt'; a: AltIR; span: Span };

type Context =
  | { where: 'top' | 'prechart' | 'block' }
  | { where: 'coregion'; lt: Lifetime | undefined }
  | { where: 'simultaneous'; lts: Lifetime[]; conditions: number };

interface PendingExpr {
  target: { expr: Expr };
  raw: RawExpr;
  offset: number;
  instances: string[];
}

const MERMAID_ARROWS: Record<string, string> = {
  '-->>': 'cold {a} ->> {b}: {m}',
  '--)': 'cold {a} -) {b}: {m}',
  '->': '{a} ->> {b}: {m}',
  '-->': 'cold {a} ->> {b}: {m}',
  '-x': 'cold {a} -) {b}: {m}',
  '--x': 'cold {a} -) {b}: {m}',
  '<<->>': '{a} ->> {b}: {m}',
  '<<-->>': '{a} ->> {b}: {m}',
};

function byColumn(a: Lifetime, b: Lifetime): number {
  return a.column - b.column || a.order - b.order;
}

function sorted(lts: Iterable<Lifetime>): Lifetime[] {
  return [...new Set(lts)].sort(byColumn);
}

/** Splits a message label into its name (the event identity) and argument text. */
export function messageName(label: string): { name: string; args?: string } {
  const text = label.trim();
  const call = /^([\s\S]*?)\s*\(([^()]*)\)\s*$/.exec(text);
  const normalise = (s: string) => s.replace(/\s+/g, ' ').trim();
  if (call && normalise(call[1]!) !== '') return { name: normalise(call[1]!), args: call[2]! };
  return { name: normalise(text) };
}

export interface BuildResult {
  model: LscChart;
  diagnostics: Diagnostic[];
}

export function buildModel(root: ast.LscChart, text: string): BuildResult {
  return new Builder(new Source(text)).build(root);
}

class Builder {
  private readonly diagnostics: Diagnostic[] = [];

  // Chart-level facts
  private kind: 'chart' | 'subchart' = 'chart';
  private mode: 'universal' | 'existential' | undefined;
  private title?: string;
  private accTitle?: string;
  private accDescr?: string;
  private defaults: Temp = 'hot';
  private readonly variables: Variable[] = [];
  private readonly variableSpans: Span[] = [];
  private readonly visibleEvents: EventSpec[] = [];
  private activationMessage?: EventSpec;
  private activationCondition?: { expr: Expr };
  private hasPrechart = false;

  // Lifetimes
  private readonly lifetimes: Lifetime[] = [];
  private readonly current = new Map<string, Lifetime>();
  private readonly columns = new Map<string, number>();

  // Pass A results
  private readonly messages: MessageIR[] = [];
  private readonly conditions: ConditionIR[] = [];
  private readonly occurrenceCounts = new Map<string, number>();
  private readonly labelledSends = new Map<string, MessageIR>();
  private readonly scopes: Scope[] = [];
  private readonly pending: PendingExpr[] = [];
  private readonly hotProgress: { lt: Lifetime; index: number; span: Span }[] = [];
  private readonly counter = { subchart: 0, alt: 0, condition: 0, note: 0 };
  private part: Part = 'body';
  private reportedV15 = false;

  constructor(private readonly src: Source) {}

  private report(code: string, severity: Severity, message: string, span: Span): void {
    this.diagnostics.push({ severity, code, message, span });
  }

  private error(code: string, message: string, span: Span): void {
    this.report(code, 'error', message, span);
  }

  // ---- Entry --------------------------------------------------------------------------------

  build(root: ast.LscChart): BuildResult {
    const headerSpan = this.src.span(
      this.src.property(root, 'keyword').start.offset,
      this.src.property(root, root.mode === undefined ? 'keyword' : 'mode').end.offset,
    );
    if (root.mode === undefined) {
      this.error(
        'V22',
        'The header must name the mode: `lsc-alpha universal`, `lsc-alpha existential` or `lsc-alpha subchart`.',
        headerSpan,
      );
    } else if (root.mode === 'subchart') {
      this.kind = 'subchart';
    } else {
      this.mode = root.mode as 'universal' | 'existential';
    }

    this.hasPrechart = root.statements.some((s) => ast.isPrechart(s)) && this.kind === 'chart';
    const prechart: IR[] = [];
    const body: IR[] = [];
    let phase: 'declarations' | 'prechart' | 'body' = 'declarations';
    let activationOn = false;
    let activationWhen = false;

    for (const s of root.statements) {
      if (this.isDeclaration(s)) {
        if (phase !== 'declarations') {
          this.error(
            'syntax',
            ast.isInstanceDecl(s)
              ? 'Instances are declared before the first body statement. Inside a `subchart`, `instance` declares a local instance.'
              : 'Declarations (`title`, `defaults`, `instance`, `var`, `visible`, `activation`, …) must come before the pre-chart and the first body statement.',
            this.src.node(s),
          );
          continue;
        }
        if (ast.isActivationOn(s) || ast.isActivationWhen(s)) {
          if (this.kind === 'subchart') {
            this.error(
              'V27',
              'A chart with the `subchart` header has no activation.',
              this.src.node(s),
            );
            continue;
          }
          const isOn = ast.isActivationOn(s);
          if (isOn ? activationOn : activationWhen) {
            this.error(
              'V4',
              `A chart has at most one \`activation ${isOn ? 'on' : 'when'}\`. Combine conditions with \`and\`.`,
              this.src.node(s),
            );
            continue;
          }
          if (isOn) activationOn = true;
          else activationWhen = true;
        }
        this.declaration(s);
        continue;
      }
      if (ast.isPrechart(s)) {
        if (this.kind === 'subchart') {
          this.error(
            'V27',
            'A chart with the `subchart` header has no pre-chart.',
            this.firstLine(s),
          );
          continue;
        }
        if (phase !== 'declarations') {
          this.error(
            'syntax',
            phase === 'prechart'
              ? 'A chart has at most one `prechart`.'
              : 'The `prechart` comes after the declarations and before the first body statement.',
            this.firstLine(s),
          );
          continue;
        }
        phase = 'prechart';
        this.part = 'prechart';
        prechart.push(...this.statements(s.statements, { where: 'prechart' }));
        this.part = 'body';
        continue;
      }
      if (phase !== 'body') {
        phase = 'body';
        this.startBody();
        if (this.kind === 'subchart') {
          this.chartBlock = this.openBlock('subchart', this.title, root, 's0');
        }
      }
      body.push(...this.statement(s, { where: this.chartBlock ? 'block' : 'top' }));
    }
    if (phase !== 'body') this.startBody();
    const chartBlock = this.chartBlock;
    if (chartBlock) {
      chartBlock.children = body.splice(0);
      // The chart is a block over all of its instances (reading 13).
      for (const lt of this.lifetimes) if (lt.scope === 'chart') chartBlock.scope.uses.add(lt);
      this.closeBlock(chartBlock, root.statements);
      chartBlock.endSpan = this.src.span(this.src.text.length, this.src.text.length);
      body.push({ t: 'block', b: chartBlock, span: chartBlock.span });
    }

    if (
      this.mode === 'universal' &&
      !this.activationCondition &&
      !this.activationMessage &&
      !this.hasPrechart
    ) {
      this.report(
        'V11',
        'warning',
        'This universal chart has no activation and no pre-chart, so it applies at every point of every run.',
        headerSpan,
      );
    }
    for (const m of this.messages) {
      if (!m.received) {
        this.error(
          'V18',
          `This \`send\` of \`${m.message.name}\` has no matching \`receive\`.`,
          m.sendSpan,
        );
      }
    }
    this.checkVariables();
    this.resolveExpressions();

    const model = new Emitter(this, this.src).emit(prechart, body);
    return {
      model,
      diagnostics: this.diagnostics.sort(
        (a, b) => (a.span?.start.offset ?? 0) - (b.span?.start.offset ?? 0),
      ),
    };
  }

  private firstLine(node: AstNode): Span {
    const cst = node.$cstNode;
    if (!cst) return this.src.node(node);
    const lineEnd = this.src.text.indexOf('\n', cst.offset);
    return this.src.span(cst.offset, lineEnd < 0 ? cst.end : Math.min(lineEnd, cst.end));
  }

  private isDeclaration(s: ast.Statement): boolean {
    return (
      ast.isTitleStatement(s) ||
      ast.isAccTitleStatement(s) ||
      ast.isAccDescrStatement(s) ||
      ast.isDefaultsStatement(s) ||
      ast.isVarDecl(s) ||
      ast.isVisibleDecl(s) ||
      ast.isActivationOn(s) ||
      ast.isActivationWhen(s) ||
      ast.isInstanceDecl(s)
    );
  }

  private startBody(): void {
    this.part = 'body';
  }

  // ---- Declarations -------------------------------------------------------------------------

  private declaration(s: ast.Statement): void {
    if (ast.isTitleStatement(s)) this.title = s.text;
    else if (ast.isAccTitleStatement(s)) this.accTitle = s.text;
    else if (ast.isAccDescrStatement(s)) this.accDescr = s.text;
    else if (ast.isDefaultsStatement(s)) this.defaults = s.temp as Temp;
    else if (ast.isInstanceDecl(s)) this.instanceDecl(s, undefined);
    else if (ast.isVarDecl(s)) this.varDecl(s);
    else if (ast.isVisibleDecl(s)) {
      const spec = this.eventSpec(s);
      if (spec) this.visibleEvents.push(spec);
    } else if (ast.isActivationOn(s)) {
      const spec = this.eventSpec(s);
      if (spec) {
        spec.dir ??= '?';
        if (spec.dir === '!' && spec.from === 'env') {
          this.error(
            'V25',
            '`activation on send` needs a named sender; the environment has no send event in the chart.',
            this.src.node(s),
          );
        }
        this.activationMessage = spec;
      }
    } else if (ast.isActivationWhen(s)) {
      const { text, offset } = this.src.content(s, 'text', /^activation[\t ]+when/);
      const target = { expr: { kind: 'bool', value: true } as Expr };
      this.activationCondition = target;
      this.expression(text, offset, [], target);
    }
  }

  private eventSpec(s: ast.VisibleDecl | ast.ActivationOn): EventSpec | undefined {
    const kind = this.arrow(s, s.arrow, s.from, s.to);
    const from = this.endpoint(s, 'from', s.from, true);
    const to = this.endpoint(s, 'to', s.to, true);
    const label = this.src.content(s, 'text', AFTER_COLON);
    const { name } = messageName(label.text);
    if (!name) {
      this.error('syntax', 'A message needs a name after `:`.', this.src.property(s, 'text'));
      return undefined;
    }
    const spec: EventSpec = {
      from: from === 'env' ? 'env' : (from?.id ?? s.from),
      to: to === 'env' ? 'env' : (to?.id ?? s.to),
      name,
      kind,
    };
    if (s.dir) spec.dir = s.dir === 'send' ? '!' : '?';
    return spec;
  }

  private instanceDecl(s: ast.InstanceDecl, local: BlockIR | undefined): void {
    for (const item of s.items) {
      const span = this.src.property(item, 'name');
      if (item.name === 'env') {
        this.error(
          'syntax',
          '`env` is the environment and cannot be declared as an instance.',
          span,
        );
        continue;
      }
      let label = item.name;
      if (item.label !== undefined) {
        const raw = item.label.replace(/^as[\t ]+/, '').trim();
        label = raw.startsWith('"') ? raw.slice(1, -1) : raw;
      }
      const existing = this.current.get(item.name);
      if (existing && (existing.alive || !local)) {
        this.error('syntax', `\`${item.name}\` is already declared.`, span);
        continue;
      }
      const lt = this.newLifetime(item.name, label, span, local ? local.scope : 'chart');
      lt.head = s.kind === 'actor' ? 'actor' : 'box';
      if (local) {
        local.local.push(lt);
        local.scope.uses.add(lt);
        for (const scope of this.scopes) {
          if (scope !== local.scope) {
            scope.created.add(lt);
            scope.destroyed.add(lt);
          }
        }
      }
    }
  }

  private varDecl(s: ast.VarDecl): void {
    const span = this.src.node(s);
    const variable: Variable =
      s.second === undefined ? { name: s.first } : { instance: s.first, name: s.second };
    if (s.type !== undefined) {
      const { text, offset } = this.src.content(s, 'type', AFTER_COLON);
      const type = this.parseType(text, offset);
      if (type) variable.type = type;
    }
    if (this.variables.some((v) => v.instance === variable.instance && v.name === variable.name)) {
      this.error(
        'syntax',
        `Variable \`${s.second === undefined ? s.first : `${s.first}.${s.second}`}\` is already declared.`,
        span,
      );
      return;
    }
    this.variables.push(variable);
    this.variableSpans.push(span);
  }

  private parseType(text: string, offset: number): Type | undefined {
    if (text === 'bool') return { kind: 'bool' };
    if (text === 'int') return { kind: 'int' };
    const range = /^int\s*\[\s*(-?\d+)\s*\.\.\s*(-?\d+)\s*\]$/.exec(text);
    if (range) {
      const lo = Number(range[1]);
      const hi = Number(range[2]);
      if (lo > hi)
        this.error(
          'syntax',
          `The range \`${lo}..${hi}\` is empty.`,
          this.src.span(offset, offset + text.length),
        );
      return { kind: 'int', lo, hi };
    }
    const values = /^\{([^}]*)\}$/.exec(text);
    if (values) {
      const list = values[1]!.split(',').map((v) => v.trim());
      if (
        list.length > 0 &&
        list.every((v) => /^[A-Za-z_\u00C0-\u024F][A-Za-z0-9_\u00C0-\u024F]*$/.test(v))
      ) {
        if (new Set(list).size !== list.length) {
          this.error(
            'syntax',
            'An enumeration lists each value once.',
            this.src.span(offset, offset + text.length),
          );
        }
        return { kind: 'enum', values: list };
      }
    }
    this.error(
      'syntax',
      'A type is `bool`, `int`, `int[lo..hi]` or an enumeration such as `{idle, busy}`.',
      this.src.span(offset, offset + Math.max(text.length, 1)),
    );
    return undefined;
  }

  private checkVariables(): void {
    this.variables.forEach((v, i) => {
      if (v.instance !== undefined && !this.columns.has(v.instance)) {
        this.error(
          'V6',
          `Variable \`${v.instance}.${v.name}\` belongs to \`${v.instance}\`, which is not an instance of the chart.`,
          this.variableSpans[i]!,
        );
      }
    });
  }

  // ---- Lifetimes ----------------------------------------------------------------------------

  private newLifetime(name: string, label: string, span: Span, scope: 'chart' | Scope): Lifetime {
    const previous = this.lifetimes.filter((l) => l.name === name);
    let column = this.columns.get(name);
    if (column === undefined) {
      column = this.columns.size;
      this.columns.set(name, column);
    }
    const lt: Lifetime = {
      id: previous.length === 0 ? name : `${name}@${previous.length + 1}`,
      name,
      label,
      column,
      head: previous.at(-1)?.head ?? 'box',
      scope,
      order: this.lifetimes.length,
      span,
      alive: true,
    };
    this.lifetimes.push(lt);
    this.current.set(name, lt);
    return lt;
  }

  private use(lt: Lifetime): Lifetime {
    for (const scope of this.scopes) scope.uses.add(lt);
    return lt;
  }

  /** Resolves a name to the lifetime alive at this point in the text. */
  private resolve(name: string, span: Span, implicit: boolean): Lifetime | undefined {
    const lt = this.current.get(name);
    if (lt?.alive) return this.use(lt);
    if (lt) {
      if (lt.scope !== 'chart' && lt.destroyedLine === undefined) {
        this.error(
          'V6',
          `\`${name}\` is local to subchart ${this.scopeName(lt.scope)} and does not exist here.`,
          span,
        );
      } else {
        this.error(
          'V8',
          `\`${name}\` is used after it is destroyed on line ${lt.destroyedLine}. A later \`create ${name} by …\` starts a new lifetime.`,
          span,
        );
      }
      return lt;
    }
    if (implicit) {
      const created = this.newLifetime(name, name, span, 'chart');
      return this.use(created);
    }
    this.error(
      'V6',
      `\`${name}\` is not an instance of the chart. Declare it with \`instance ${name}\`, or use it in a message first.`,
      span,
    );
    return undefined;
  }

  private scopeName(scope: Scope): string {
    return scope.name !== undefined ? `"${scope.name}"` : scope.id;
  }

  private endpoint(
    node: AstNode,
    property: string,
    name: string,
    implicit: boolean,
  ): Lifetime | 'env' | undefined {
    if (name === 'env') return 'env';
    return this.resolve(name, this.src.property(node, property), implicit);
  }

  private lifetimeList(node: AstNode, property: string, names: string[]): Lifetime[] {
    const out: Lifetime[] = [];
    names.forEach((name, i) => {
      const span = this.src.property(node, property, i);
      if (name === 'env') {
        this.error('V6', 'The environment `env` has no locations, so it cannot appear here.', span);
        return;
      }
      const lt = this.resolve(name, span, false);
      if (lt && !out.includes(lt)) out.push(lt);
    });
    return out;
  }

  // ---- Statements ---------------------------------------------------------------------------

  private statements(list: ast.Statement[], ctx: Context): IR[] {
    return list.flatMap((s) => this.statement(s, ctx));
  }

  private notAllowed(s: ast.Statement, ctx: Context, what: string): IR[] {
    const where: Record<Context['where'], string> = {
      top: 'at the top level of a chart',
      prechart: 'inside a `prechart`',
      block: 'here',
      coregion: 'inside a `coregion`',
      simultaneous: 'inside a `simultaneous` region',
    };
    const allowed: Record<Context['where'], string> = {
      top: '',
      prechart:
        ' A pre-chart holds messages, `send`, `receive`, conditions, `coregion`, `simultaneous`, `timeout`, `create`, `destroy` and notes.',
      block: '',
      coregion:
        ' A coregion holds messages, `send`, `receive`, conditions, timeouts and `simultaneous` regions on its instance.',
      simultaneous:
        ' A simultaneous region holds messages, `send`, `receive` and at most one condition.',
    };
    this.error(
      'syntax',
      `${what} is not allowed ${where[ctx.where]}.${allowed[ctx.where]}`,
      this.firstLine(s),
    );
    return [];
  }

  private noTemperatureInPrechart(s: { temp?: string } & AstNode): void {
    if (s.temp !== undefined && this.part === 'prechart') {
      this.error(
        'V12',
        'A pre-chart is matched, not required: it takes no `hot` or `cold`.',
        this.src.property(s, 'temp'),
      );
    }
  }

  private statement(s: ast.Statement, ctx: Context): IR[] {
    const span = this.src.node(s);
    if (ast.isInstanceDecl(s)) {
      // At the top level, instances are declarations; inside a subchart they are local.
      const block = this.blockStack.at(-1);
      if (ctx.where !== 'block' || !block || block === this.chartBlock) {
        return this.notAllowed(s, ctx, 'An instance declaration');
      }
      this.instanceDecl(s, block);
      return [];
    }
    if (this.isDeclaration(s) || ast.isPrechart(s)) {
      const what = ast.isPrechart(s) ? 'A `prechart`' : 'A declaration';
      if (ast.isPrechart(s) && this.kind === 'subchart') {
        this.error(
          'V27',
          'A chart with the `subchart` header has no pre-chart.',
          this.firstLine(s),
        );
        return [];
      }
      return this.notAllowed(s, ctx, what);
    }
    if (ast.isMessageStatement(s)) return this.message(s, ctx, span);
    if (ast.isSendStatement(s)) return this.send(s, ctx, span);
    if (ast.isReceiveStatement(s)) return this.receive(s, ctx, span);
    if (ast.isConditionStatement(s)) return this.condition(s, ctx, span);
    if (ast.isProgressStatement(s)) {
      if (this.part === 'prechart') {
        this.error('V12', 'A pre-chart is matched, not required: it has no `progress`.', span);
        return [];
      }
      if (ctx.where === 'coregion' || ctx.where === 'simultaneous')
        return this.notAllowed(s, ctx, '`progress`');
      const lts = this.lifetimeList(s, 'instances', s.instances);
      return [{ t: 'progress', temp: s.temp as Temp, lts, span }];
    }
    if (ast.isTimeoutStatement(s)) {
      if (ctx.where === 'simultaneous') return this.notAllowed(s, ctx, 'A timeout');
      const lt = this.resolve(s.instance, this.src.property(s, 'instance'), false);
      if (!lt) return [];
      this.onCoregionInstance(ctx, [lt], span);
      return [{ t: 'timeout', lt, label: this.src.content(s, 'text', AFTER_COLON).text, span }];
    }
    if (ast.isCreateStatement(s)) return this.create(s, ctx, span);
    if (ast.isDestroyStatement(s)) {
      if (ctx.where === 'coregion' || ctx.where === 'simultaneous')
        return this.notAllowed(s, ctx, '`destroy`');
      const lt = this.resolve(s.instance, this.src.property(s, 'instance'), false);
      if (!lt || !lt.alive) return [];
      lt.alive = false;
      lt.destroyedLine = span.start.line;
      for (const scope of this.scopes) scope.destroyed.add(lt);
      return [{ t: 'destroy', lt, span }];
    }
    if (ast.isNoteStatement(s)) return this.note(s, ctx, span);
    if (ast.isCoregion(s)) return this.coregion(s, ctx);
    if (ast.isSimultaneous(s)) return this.simultaneous(s, ctx);
    if (ast.isSubchartBlock(s)) return this.subchart(s, ctx, span);
    if (ast.isIfBlock(s)) return this.ifBlock(s, ctx, span);
    return [];
  }

  /** In a coregion, every statement must be on the coregion's instance (V9). */
  private onCoregionInstance(
    ctx: Context,
    lts: (Lifetime | 'env' | undefined)[],
    span: Span,
  ): void {
    if (ctx.where !== 'coregion' || !ctx.lt) return;
    if (!lts.includes(ctx.lt)) {
      this.error('V9', `A coregion holds only events of its instance \`${ctx.lt.name}\`.`, span);
    }
  }

  private inSimultaneous(ctx: Context, lts: (Lifetime | 'env' | undefined)[], span: Span): void {
    if (ctx.where !== 'simultaneous') return;
    if (!lts.some((lt) => lt !== 'env' && lt !== undefined && ctx.lts.includes(lt))) {
      this.error(
        'syntax',
        `A statement in a simultaneous region must touch one of its instances (${ctx.lts.map((l) => `\`${l.name}\``).join(', ')}).`,
        span,
      );
    }
  }

  private arrow(node: AstNode, arrow: string, from: string, to: string): MessageKind {
    if (arrow === '->>') return 'synch';
    if (arrow === '-)') return 'asynch';
    const label = (node as { text?: string }).text?.replace(/^:\s*/, '').trim() || 'm';
    const form = (MERMAID_ARROWS[arrow] ?? '{a} ->> {b}: {m}')
      .replace('{a}', from)
      .replace('{b}', to)
      .replace('{m}', label);
    const reason = arrow.startsWith('--')
      ? 'A dashed line means cold in an LSC, not a reply.'
      : arrow.startsWith('<<')
        ? 'An LSC message goes one way; write two messages.'
        : arrow.endsWith('x')
          ? 'An LSC has no lost-message arrow; a cold message need not arrive.'
          : 'An LSC arrow has a head: `->>` is synchronous and `-)` asynchronous.';
    this.error(
      'V23',
      `\`${arrow}\` is a Mermaid sequence-diagram arrow. ${reason} Write \`${form}\`.`,
      this.src.property(node, 'arrow'),
    );
    return arrow.includes(')') || arrow.endsWith('x') ? 'asynch' : 'synch';
  }

  private newMessage(
    s: ast.MessageStatement | ast.SendStatement,
    span: Span,
  ): MessageIR | undefined {
    const kind = this.arrow(s, s.arrow, s.from, s.to);
    const from = this.endpoint(s, 'from', s.from, true);
    const to = this.endpoint(s, 'to', s.to, true);
    const label = this.src.content(s, 'text', AFTER_COLON);
    const { name, args } = messageName(label.text);
    if (!name) {
      this.error('syntax', 'A message needs a name after `:`.', this.src.property(s, 'text'));
      return undefined;
    }
    if (from === 'env' && to === 'env') {
      this.error('syntax', 'A message needs at least one named instance.', span);
      return undefined;
    }
    const occurrence = ast.isSendStatement(s) ? s.occurrence?.slice(1) : undefined;
    let id: string;
    if (occurrence !== undefined) {
      id = `${name}#${occurrence}`;
    } else {
      const n = (this.occurrenceCounts.get(name) ?? 0) + 1;
      this.occurrenceCounts.set(name, n);
      id = n === 1 ? name : `${name}#${n}`;
    }
    const temp = (s.temp as Temp | undefined) ?? this.defaults;
    const message: Message = {
      id,
      name,
      text: label.text,
      from: from === 'env' ? 'env' : (from?.id ?? s.from),
      to: to === 'env' ? 'env' : (to?.id ?? s.to),
      kind,
      temp,
      span,
    };
    if (occurrence !== undefined) message.occurrence = occurrence;
    if (args !== undefined) message.args = args;
    const m: MessageIR = {
      message,
      received: false,
      sendSpan: span,
      sendScope: this.scopes.at(-1),
    };
    if (from !== 'env' && from) m.fromLt = from;
    if (to !== 'env' && to) m.toLt = to;
    if (occurrence !== undefined) m.label = occurrence;
    this.messages.push(m);
    return m;
  }

  private message(s: ast.MessageStatement, ctx: Context, span: Span): IR[] {
    this.noTemperatureInPrechart(s);
    const m = this.newMessage(s, span);
    if (!m) return [];
    m.received = true;
    const ends: (Lifetime | 'env' | undefined)[] = [
      m.fromLt ?? (m.message.from === 'env' ? 'env' : undefined),
      m.toLt ?? (m.message.to === 'env' ? 'env' : undefined),
    ];
    this.onCoregionInstance(ctx, ends, span);
    this.inSimultaneous(ctx, ends, span);
    this.noteV15(ctx, m);
    return [{ t: 'msg', m, span }];
  }

  private noteV15(ctx: Context, m: MessageIR): void {
    if (this.reportedV15 || m.message.kind !== 'synch' || !m.fromLt) return;
    const regionSpan =
      ctx.where === 'coregion' && ctx.lt === m.fromLt
        ? this.coregionSpans.at(-1)
        : ctx.where === 'simultaneous' && ctx.lts.includes(m.fromLt)
          ? this.simultaneousSpans.at(-1)
          : undefined;
    if (!regionSpan) return;
    this.reportedV15 = true;
    this.report(
      'V15',
      'info',
      'Synchronous sends inside a coregion or simultaneous region are not ordered among themselves; each receipt precedes only the locations after the region (reading 4).',
      regionSpan,
    );
  }

  private send(s: ast.SendStatement, ctx: Context, span: Span): IR[] {
    this.noTemperatureInPrechart(s);
    if (s.from === 'env' || s.to === 'env') {
      this.error(
        'V19',
        '`send` and `receive` connect named instances. A message to or from `env` is written on one line.',
        span,
      );
      return [];
    }
    if (s.occurrence !== undefined) {
      const label = s.occurrence.slice(1);
      const earlier = this.labelledSends.get(label);
      if (earlier) {
        this.error(
          'V18',
          `The occurrence label \`#${label}\` is already used on line ${earlier.sendSpan.start.line}.`,
          this.src.property(s, 'occurrence'),
        );
        return [];
      }
    }
    const m = this.newMessage(s, span);
    if (!m) return [];
    if (m.label !== undefined) this.labelledSends.set(m.label, m);
    this.onCoregionInstance(ctx, [m.fromLt], span);
    this.inSimultaneous(ctx, [m.fromLt], span);
    this.noteV15(ctx, m);
    return [{ t: 'send', m, span }];
  }

  private receive(s: ast.ReceiveStatement, ctx: Context, span: Span): IR[] {
    if (s.from === 'env' || s.to === 'env') {
      this.error(
        'V19',
        '`send` and `receive` connect named instances. A message to or from `env` is written on one line.',
        span,
      );
      return [];
    }
    const to = this.resolve(s.to, this.src.property(s, 'to'), false);
    const from = this.resolve(s.from, this.src.property(s, 'from'), false);
    const { name } = messageName(this.src.content(s, 'text', AFTER_COLON).text);
    if (!to || !from) return [];
    let m: MessageIR | undefined;
    if (s.occurrence !== undefined) {
      const label = s.occurrence.slice(1);
      m = this.labelledSends.get(label);
      const where = this.src.property(s, 'occurrence');
      if (!m) {
        this.error('V18', `No earlier \`send #${label}\` matches this \`receive\`.`, where);
        return [];
      }
      if (m.message.name !== name) {
        this.error(
          'V18',
          `\`send #${label}\` on line ${m.sendSpan.start.line} sends \`${m.message.name}\`, not \`${name}\`.`,
          where,
        );
        return [];
      }
      if (m.received) {
        this.error('V18', `\`send #${label}\` already has a matching \`receive\`.`, where);
        return [];
      }
      if (m.fromLt !== from || m.toLt !== to) {
        this.error(
          'V18',
          `\`send #${label}\` on line ${m.sendSpan.start.line} goes from \`${m.message.from}\` to \`${m.message.to}\`.`,
          span,
        );
        return [];
      }
    } else {
      m = this.messages.find(
        (x) =>
          !x.received &&
          x.label === undefined &&
          x.toLt !== undefined &&
          x.message.name === name &&
          x.fromLt === from &&
          x.toLt === to,
      );
      if (!m) {
        this.error(
          'V18',
          `No earlier unmatched \`send ${from.name} … ${to.name}: ${name}\` matches this \`receive\`.`,
          span,
        );
        return [];
      }
    }
    m.received = true;
    m.message.receiveSpan = span;
    if (m.sendScope !== this.scopes.at(-1)) {
      this.report(
        'V21',
        'warning',
        `The \`send\` of \`${name}\` on line ${m.sendSpan.start.line} is in a different block; keep a split message's \`send\` and \`receive\` in one block.`,
        span,
      );
    }
    this.onCoregionInstance(ctx, [to], span);
    this.inSimultaneous(ctx, [to], span);
    return [{ t: 'receive', m, span }];
  }

  private conditionIR(
    node: AstNode,
    temp: Temp,
    lts: Lifetime[],
    instanceNames: string[],
    span: Span,
  ): ConditionIR {
    const { text, offset } = this.src.content(node, 'text', AFTER_COLON);
    const condition: Condition = {
      id: `c${++this.counter.condition}`,
      instances: lts.map((l) => l.id),
      sharedBy: sorted(lts).map((l) => l.id),
      expr: { kind: 'bool', value: true },
      temp,
      locations: [],
      span,
    };
    const c: ConditionIR = { condition, lifetimes: sorted(lts), textOffset: offset, span };
    this.conditions.push(c);
    this.expression(text, offset, instanceNames, condition);
    return c;
  }

  private expression(
    text: string,
    offset: number,
    instances: string[],
    target: { expr: Expr },
  ): void {
    if (text === '') {
      this.error('syntax', 'Expected a condition after `:`.', this.src.span(offset, offset));
      return;
    }
    if (text.startsWith('"')) {
      if (text.length < 2 || !text.endsWith('"') || text.slice(1, -1).includes('"')) {
        this.error(
          'syntax',
          'A quoted condition is one double-quoted string.',
          this.src.span(offset, offset + text.length),
        );
        return;
      }
      target.expr = { kind: 'text', text: text.slice(1, -1) };
      return;
    }
    const { expr, issue } = parseExpr(text);
    if (issue) {
      this.exprIssue(issue, offset);
      return;
    }
    this.pending.push({ target, raw: expr!, offset, instances });
  }

  private exprIssue(issue: ExprIssue, offset: number): void {
    this.report(
      issue.code,
      issue.severity,
      issue.message,
      this.src.span(offset + issue.start, offset + issue.end),
    );
  }

  private resolveExpressions(): void {
    const chartInstances = new Set(this.lifetimes.map((l) => l.name));
    for (const p of this.pending) {
      const { expr, issues } = resolveExpr(p.raw, {
        instances: p.instances,
        chartInstances,
        variables: this.variables,
      });
      p.target.expr = expr;
      for (const issue of issues) this.exprIssue(issue, p.offset);
    }
  }

  private condition(s: ast.ConditionStatement, ctx: Context, span: Span): IR[] {
    this.noTemperatureInPrechart(s);
    const lts = this.lifetimeList(s, 'instances', s.instances);
    this.onCoregionInstance(ctx, lts, span);
    if (ctx.where === 'simultaneous') {
      this.inSimultaneous(ctx, lts, span);
      if (++ctx.conditions > 1) {
        this.error('V3', 'A simultaneous region holds at most one condition.', span);
        return [];
      }
    }
    // Pre-chart conditions carry no temperature in the semantics; the model records the default.
    const temp = (s.temp as Temp | undefined) ?? this.defaults;
    const c = this.conditionIR(
      s,
      temp,
      lts,
      lts.map((l) => l.name),
      span,
    );
    return [{ t: 'condition', c, span }];
  }

  private create(s: ast.CreateStatement, ctx: Context, span: Span): IR[] {
    if (s.mermaidKeyword !== undefined) {
      this.error(
        'V24',
        `Mermaid's \`create ${s.mermaidKeyword} ${s.name}\` is not LSC notation. Write \`create ${s.name} by y\`, where \`y\` is the creating instance; the creation arrow is not a message.`,
        span,
      );
      return [];
    }
    if (ctx.where === 'coregion' || ctx.where === 'simultaneous')
      return this.notAllowed(s, ctx, '`create`');
    let creatorName = s.creator;
    let creatorSpan = s.creator !== undefined ? this.src.property(s, 'creator') : span;
    let label: string | undefined;
    if (s.label !== undefined) {
      const raw = s.label.replace(/^as[\t ]+/, '').trim();
      if (raw.startsWith('"')) {
        label = raw.slice(1, -1);
      } else {
        const split = /^(.*?)\s+by\s+(\S+)\s*$/.exec(raw);
        if (split && creatorName === undefined) {
          label = split[1]!;
          creatorName = split[2]!;
          creatorSpan = this.src.property(s, 'label');
        } else {
          label = raw;
        }
      }
    }
    if (creatorName === undefined) {
      this.error('syntax', `\`create\` names its creator: \`create ${s.name} by y\`.`, span);
      return [];
    }
    if (s.name === 'env') {
      this.error(
        'syntax',
        '`env` is the environment and cannot be created.',
        this.src.property(s, 'name'),
      );
      return [];
    }
    const creator =
      creatorName === 'env' ? undefined : this.resolve(creatorName, creatorSpan, false);
    if (creatorName === 'env')
      this.error('V6', 'The creator must be a named instance.', creatorSpan);
    if (!creator) return [];
    const previous = this.lifetimes.filter((l) => l.name === s.name).at(-1);
    const created = this.newLifetime(
      s.name,
      label ?? previous?.label ?? s.name,
      this.src.property(s, 'name'),
      'chart',
    );
    created.createdBy = creator;
    created.createdIn = this.part;
    for (const scope of this.scopes) {
      scope.created.add(created);
      scope.uses.add(created);
    }
    return [{ t: 'create', creator, created, span }];
  }

  private note(s: ast.NoteStatement, ctx: Context, span: Span): IR[] {
    if (ctx.where === 'coregion' || ctx.where === 'simultaneous')
      return this.notAllowed(s, ctx, 'A note');
    const ids: string[] = [];
    s.instances.forEach((name, i) => {
      const at = this.src.property(s, 'instances', i);
      if (name === 'env') {
        this.error('V6', 'A note is placed on named instances.', at);
        return;
      }
      const lt = this.current.get(name);
      if (!lt) {
        this.error('V6', `\`${name}\` is not an instance of the chart.`, at);
        return;
      }
      ids.push(lt.id);
    });
    if (ids.length === 0) return [];
    const note: Note = {
      id: `n${++this.counter.note}`,
      text: this.src.content(s, 'text', AFTER_COLON).text,
      row: 0,
      span,
      placement:
        s.placement === 'over'
          ? { over: ids }
          : s.placement === 'left'
            ? { leftOf: ids[0]! }
            : { rightOf: ids[0]! },
    };
    return [{ t: 'note', note, span }];
  }

  private readonly coregionSpans: Span[] = [];
  private readonly simultaneousSpans: Span[] = [];

  private coregion(s: ast.Coregion, ctx: Context): IR[] {
    const head = this.firstLine(s);
    if (ctx.where === 'coregion') return this.notAllowed(s, ctx, 'A nested `coregion`');
    if (ctx.where === 'simultaneous') return this.notAllowed(s, ctx, 'A `coregion`');
    const lt = this.resolve(s.instance, this.src.property(s, 'instance'), false);
    this.coregionSpans.push(head);
    const children = this.statements(s.statements, { where: 'coregion', lt });
    this.coregionSpans.pop();
    if (!lt) return [];
    return [{ t: 'coregion', lt, children, span: head }];
  }

  private simultaneous(s: ast.Simultaneous, ctx: Context): IR[] {
    const head = this.firstLine(s);
    if (ctx.where === 'simultaneous')
      return this.notAllowed(s, ctx, 'A nested `simultaneous` region');
    const lts = this.lifetimeList(s, 'instances', s.instances);
    if (ctx.where === 'coregion' && ctx.lt && !lts.includes(ctx.lt)) {
      this.error('V9', `A coregion holds only events of its instance \`${ctx.lt.name}\`.`, head);
    }
    this.simultaneousSpans.push(head);
    const children = this.statements(s.statements, { where: 'simultaneous', lts, conditions: 0 });
    this.simultaneousSpans.pop();
    return [{ t: 'simultaneous', lts, children, span: head }];
  }

  // ---- Blocks -------------------------------------------------------------------------------

  private readonly blockStack: BlockIR[] = [];
  private chartBlock: BlockIR | undefined;

  private openBlock(
    kind: 'subchart' | 'branch',
    name: string | undefined,
    node: AstNode,
    id?: string,
  ): BlockIR {
    const scope: Scope = {
      kind,
      id: id ?? `s${++this.counter.subchart}`,
      uses: new Set(),
      created: new Set(),
      destroyed: new Set(),
    };
    if (name !== undefined) scope.name = name;
    const block: BlockIR = {
      scope,
      span: this.firstLine(node),
      endSpan: this.src.node(node),
      local: [],
      children: [],
      entry: [],
      exit: [],
    };
    this.scopes.push(scope);
    this.blockStack.push(block);
    return block;
  }

  /** Finds the opening condition, computes barrier participants and ends local lifetimes. */
  private closeBlock(block: BlockIR, statements: ast.Statement[]): void {
    this.scopes.splice(this.scopes.indexOf(block.scope), 1);
    this.blockStack.splice(this.blockStack.indexOf(block), 1);
    const { uses, created, destroyed } = block.scope;
    block.entry = sorted([...uses].filter((l) => !created.has(l)));
    block.exit = sorted([...uses].filter((l) => !destroyed.has(l)));
    // A later reference to a local instance's name finds it out of scope.
    for (const lt of block.local) lt.alive = false;
    if (block.scope.kind === 'subchart') {
      const first = statements.find(
        (s) => !this.isDeclaration(s) && !ast.isNoteStatement(s) && !ast.isPrechart(s),
      );
      if (first && ast.isConditionStatement(first)) {
        const ir = block.children.find(
          (c): c is Extract<IR, { t: 'condition' }> => c.t === 'condition',
        );
        if (ir) {
          ir.c.guardOf = block;
          block.guard = ir.c;
        }
      }
    }
  }

  private subchart(s: ast.SubchartBlock, ctx: Context, span: Span): IR[] {
    if (ctx.where !== 'top' && ctx.where !== 'block')
      return this.notAllowed(s, ctx, 'A `subchart`');
    const block = this.openBlock('subchart', s.name, s);
    block.endSpan = this.src.node(s.end);
    const over = s.over.length > 0 ? this.lifetimeList(s, 'over', s.over) : undefined;
    if (s.repeatAny) block.repeat = '*';
    else if (s.repeatCount !== undefined) block.repeat = s.repeatCount;
    else if (s.repeatVar !== undefined) {
      block.repeat = s.repeatVar;
      const candidates = this.variables.filter((v) => v.name === s.repeatVar);
      const v =
        candidates.find((x) => x.instance === undefined) ??
        (candidates.length === 1 ? candidates[0] : undefined);
      if (!v || (v.type !== undefined && v.type.kind !== 'int')) {
        this.error(
          'V17',
          v
            ? `\`repeat ${s.repeatVar}\` needs an \`int\` variable.`
            : `\`repeat ${s.repeatVar}\` needs a declared \`int\` variable: \`var ${s.repeatVar}: int\`.`,
          this.src.property(s, 'repeatVar'),
        );
      }
    }
    block.children = this.statements(s.statements, { where: 'block' });
    this.closeBlock(block, s.statements);
    if (over) {
      const missing = sorted(block.scope.uses).filter(
        (l) => l.scope === 'chart' && !block.scope.created.has(l) && !over.includes(l),
      );
      if (missing.length > 0) {
        this.error(
          'V7',
          `The \`over\` list must include every instance used inside the subchart; add ${missing.map((l) => `\`${l.name}\``).join(', ')}.`,
          this.src.property(s, 'over', 0),
        );
      }
    }
    if (block.repeat === '*' && !this.hasColdCondition(block.children)) {
      this.report(
        'V10',
        'warning',
        "`repeat *` without a cold condition can end only by aborting. Add a cold condition, such as the loop's guard.",
        block.span,
      );
    }
    return [{ t: 'block', b: block, span }];
  }

  private hasColdCondition(children: IR[]): boolean {
    return children.some(
      (c) =>
        (c.t === 'condition' && c.c.condition.temp === 'cold') ||
        ((c.t === 'coregion' || c.t === 'simultaneous') && this.hasColdCondition(c.children)),
    );
  }

  private ifBlock(s: ast.IfBlock, ctx: Context, span: Span): IR[] {
    if (ctx.where !== 'top' && ctx.where !== 'block') return this.notAllowed(s, ctx, 'An `if`');
    const scope: Scope = {
      kind: 'alt',
      id: `a${++this.counter.alt}`,
      uses: new Set(),
      created: new Set(),
      destroyed: new Set(),
    };
    if (s.name !== undefined) scope.name = s.name;
    this.scopes.push(scope);
    const lts = this.lifetimeList(s, 'instances', s.instances);
    const guard = this.conditionIR(
      s,
      'cold',
      lts,
      lts.map((l) => l.name),
      this.firstLine(s),
    );

    // Each branch starts from the state after the guard: a `destroy` or `create` in `then`
    // does not happen in `else`.
    const afterGuard = this.lifetimeState();
    const then = this.openBlock('branch', s.name, s);
    then.children = this.statements(s.then, { where: 'block' });
    this.closeBlock(then, s.then);
    const afterThen = this.lifetimeState();
    let otherwise: BlockIR | undefined;
    if (s.else) {
      this.restoreLifetimes(afterGuard);
      otherwise = this.openBlock('branch', s.else.name, s.else);
      otherwise.children = this.statements(s.else.statements, { where: 'block' });
      this.closeBlock(otherwise, s.else.statements);
      this.mergeLifetimes(afterThen);
    }
    this.scopes.splice(this.scopes.indexOf(scope), 1);
    const alt: AltIR = {
      scope,
      span: this.firstLine(s),
      endSpan: this.src.node(s.end),
      guard,
      then,
      entry: sorted([...scope.uses].filter((l) => !scope.created.has(l))),
      exit: sorted([...scope.uses].filter((l) => !scope.destroyed.has(l))),
    };
    guard.guardOf = alt;
    if (otherwise) {
      alt.else = otherwise;
      alt.elseSpan = this.firstLine(s.else!);
    }
    return [{ t: 'alt', a: alt, span }];
  }

  private lifetimeState(): { current: Map<string, Lifetime>; alive: Map<Lifetime, boolean> } {
    return {
      current: new Map(this.current),
      alive: new Map(this.lifetimes.map((l) => [l, l.alive])),
    };
  }

  private restoreLifetimes(state: ReturnType<Builder['lifetimeState']>): void {
    this.current.clear();
    for (const [name, lt] of state.current) this.current.set(name, lt);
    for (const lt of this.lifetimes) lt.alive = state.alive.get(lt) ?? false;
  }

  /** After an `if … else`, a lifetime alive at the end of either branch is alive. */
  private mergeLifetimes(other: ReturnType<Builder['lifetimeState']>): void {
    for (const lt of this.lifetimes)
      if (other.alive.get(lt) && lt.scope === 'chart') lt.alive = true;
    for (const [name, lt] of other.current) {
      if (!this.current.get(name)?.alive && lt.alive) this.current.set(name, lt);
    }
  }

  // ---- Accessors for the emitter ------------------------------------------------------------

  get facts() {
    return {
      kind: this.kind,
      mode: this.mode,
      title: this.title,
      accTitle: this.accTitle,
      accDescr: this.accDescr,
      defaults: this.defaults,
      variables: this.variables,
      visibleEvents: this.visibleEvents,
      activationMessage: this.activationMessage,
      activationCondition: this.activationCondition,
      hasPrechart: this.hasPrechart,
      lifetimes: this.lifetimes,
      messages: this.messages,
      conditions: this.conditions,
      hotProgress: this.hotProgress,
    };
  }

  reportFromEmitter(code: string, severity: Severity, message: string, span: Span): void {
    this.report(code, severity, message, span);
  }
}

// ---- Pass B: locations, rows, temperatures and barriers -----------------------------------

interface EmitContext {
  part: Part;
  region: RegionItem[];
  coregion?: { lt: Lifetime; id: string; count: number };
  simultaneous?: { lts: Lifetime[]; locations: Map<Lifetime, Location>; row: number };
}

class Emitter {
  private row = 0;
  private readonly settings = new Map<Lifetime, Temp>();
  /** Each lifetime's latest location on the path being written (an `else` does not see its `then`). */
  private current = new Map<Lifetime, Location>();
  private readonly instances = new Map<Lifetime, Instance>();
  private readonly barriers: Barrier[] = [];
  private readonly notes: Note[] = [];
  private barrierCount = 0;
  private coregionCount = 0;

  constructor(
    private readonly builder: Builder,
    private readonly src: Source,
  ) {}

  emit(prechart: IR[], body: IR[]): LscChart {
    const f = this.builder.facts;
    for (const lt of f.lifetimes) {
      const instance: Instance = {
        id: lt.id,
        name: lt.name,
        label: lt.label,
        column: lt.column,
        head: lt.head,
        scope: lt.scope === 'chart' ? 'chart' : { subchart: lt.scope.id },
        locations: [],
      };
      if (lt.createdBy) instance.createdBy = lt.createdBy.id;
      this.instances.set(lt, instance);
      lt.instance = instance;
      this.settings.set(lt, f.defaults);
    }
    const initial = f.lifetimes.filter((l) => l.scope === 'chart' && !l.createdBy);
    const survives = (l: Lifetime) => !this.isDestroyedIn(l, 'prechart');

    let prechartRegion: Region | undefined;
    if (f.hasPrechart) {
      prechartRegion = { items: [] };
      for (const lt of initial) this.top(lt, 'prechart', 0);
      this.nodes(prechart, { part: 'prechart', region: prechartRegion.items });
    }
    const bodyRegion: Region = { items: [] };
    const bodyStart = this.row;
    const fromPrechart = f.lifetimes.filter((l) => l.createdIn === 'prechart');
    for (const lt of [...initial, ...fromPrechart].filter(survives))
      this.top(lt, 'body', bodyStart);
    this.nodes(body, { part: 'body', region: bodyRegion.items });

    // Maximal locations are cold, in each part and for each lifetime (p. 56).
    for (const instance of this.instances.values()) {
      for (const part of ['prechart', 'body'] as const) {
        const last = instance.locations.filter((l) => l.ref.part === part).at(-1);
        if (last) last.temp = 'cold';
      }
    }
    for (const { lt, index, span } of f.hotProgress) {
      const body = lt.instance!.locations.filter((l) => l.ref.part === 'body');
      if (body.at(-1)?.ref.index === index) {
        this.builder.reportFromEmitter(
          'V2',
          'error',
          `\`${lt.name}\` has no location after this point, and its last location is always cold.`,
          span,
        );
      }
    }

    const chart: LscChart = {
      modelVersion: 1,
      kind: f.kind,
      defaults: f.defaults,
      instances: [...this.instances.values()].sort(
        (a, b) =>
          a.column - b.column ||
          f.lifetimes.findIndex((l) => l.id === a.id) - f.lifetimes.findIndex((l) => l.id === b.id),
      ),
      variables: f.variables,
      visibleEvents: f.visibleEvents,
      body: bodyRegion,
      messages: f.messages.map((m) => m.message),
      conditions: f.conditions.map((c) => c.condition),
      barriers: this.barriers,
      notes: this.notes,
    };
    if (f.mode) chart.mode = f.mode;
    if (f.title !== undefined) chart.title = f.title;
    if (f.accTitle !== undefined) chart.accTitle = f.accTitle;
    if (f.accDescr !== undefined) chart.accDescr = f.accDescr;
    if (f.activationMessage || f.activationCondition) {
      chart.activation = {};
      if (f.activationCondition) chart.activation.condition = f.activationCondition.expr;
      if (f.activationMessage) chart.activation.message = f.activationMessage;
    }
    if (prechartRegion) chart.prechart = prechartRegion;
    return chart;
  }

  private isDestroyedIn(lt: Lifetime, part: Part): boolean {
    return lt.instance!.locations.some((l) => l.ref.part === part && l.label.destroy);
  }

  /** Location 0: the top of a lifetime's line in a part. */
  private top(lt: Lifetime, part: Part, row: number, span = lt.span): Location {
    const instance = this.instances.get(lt)!;
    const location: Location = {
      ref: { instance: lt.id, part, index: 0 },
      temp: part === 'prechart' ? 'cold' : this.settings.get(lt)!,
      label: { events: [] },
      row,
      span,
    };
    instance.locations.push(location);
    this.current.set(lt, location);
    return location;
  }

  private nextRow(ctx: EmitContext): number {
    return ctx.simultaneous ? ctx.simultaneous.row : ++this.row;
  }

  private location(
    lt: Lifetime,
    ctx: EmitContext,
    label: Partial<LocationLabel>,
    row: number,
    span: Span,
  ): Location {
    const sim = ctx.simultaneous;
    if (sim && sim.lts.includes(lt)) {
      const existing = sim.locations.get(lt);
      if (existing) {
        mergeLabel(existing.label, label);
        this.current.set(lt, existing);
        return existing;
      }
    }
    const instance = this.instances.get(lt)!;
    const index = instance.locations.filter((l) => l.ref.part === ctx.part).length;
    const location: Location = {
      ref: { instance: lt.id, part: ctx.part, index },
      temp: ctx.part === 'prechart' ? 'cold' : this.settings.get(lt)!,
      label: { events: [] },
      row,
      span,
    };
    mergeLabel(location.label, label);
    if (ctx.coregion && ctx.coregion.lt === lt) {
      location.coregion = ctx.coregion.id;
      ctx.coregion.count++;
    }
    if (sim && sim.lts.includes(lt)) sim.locations.set(lt, location);
    instance.locations.push(location);
    this.current.set(lt, location);
    return location;
  }

  private pushRow(ctx: EmitContext, locations: Location[]): void {
    if (ctx.simultaneous || locations.length === 0) return;
    ctx.region.push({ kind: 'row', locations: locations.map((l) => l.ref) });
  }

  private nodes(nodes: IR[], ctx: EmitContext): void {
    for (const node of nodes) this.node(node, ctx);
  }

  private node(node: IR, ctx: EmitContext): void {
    switch (node.t) {
      case 'msg': {
        const row = this.nextRow(ctx);
        const { m } = node;
        const locations: Location[] = [];
        if (m.fromLt) {
          const send = this.location(
            m.fromLt,
            ctx,
            { events: [{ message: m.message.id, dir: '!' }] },
            row,
            node.span,
          );
          m.message.send = send.ref;
          locations.push(send);
        }
        if (m.toLt) {
          const receive = this.location(
            m.toLt,
            ctx,
            { events: [{ message: m.message.id, dir: '?' }] },
            row,
            node.span,
          );
          m.message.receive = receive.ref;
          if (!locations.includes(receive)) locations.push(receive);
        }
        this.pushRow(ctx, locations);
        return;
      }
      case 'send': {
        const row = this.nextRow(ctx);
        const send = this.location(
          node.m.fromLt!,
          ctx,
          { events: [{ message: node.m.message.id, dir: '!' }] },
          row,
          node.span,
        );
        node.m.message.send = send.ref;
        this.pushRow(ctx, [send]);
        return;
      }
      case 'receive': {
        const row = this.nextRow(ctx);
        const receive = this.location(
          node.m.toLt!,
          ctx,
          { events: [{ message: node.m.message.id, dir: '?' }] },
          row,
          node.span,
        );
        node.m.message.receive = receive.ref;
        this.pushRow(ctx, [receive]);
        return;
      }
      case 'condition':
        this.condition(node.c, ctx, undefined);
        return;
      case 'timeout': {
        const row = this.nextRow(ctx);
        this.pushRow(ctx, [this.location(node.lt, ctx, { timeout: node.label }, row, node.span)]);
        return;
      }
      case 'create': {
        const row = this.nextRow(ctx);
        const location = this.location(
          node.creator,
          ctx,
          { create: node.created.id },
          row,
          node.span,
        );
        const instance = this.instances.get(node.created)!;
        instance.createdAt = location.ref;
        this.settings.set(node.created, this.builder.facts.defaults);
        this.top(node.created, ctx.part, row, node.span);
        this.pushRow(ctx, [location]);
        return;
      }
      case 'destroy': {
        const row = this.nextRow(ctx);
        const location = this.location(node.lt, ctx, { destroy: true }, row, node.span);
        this.instances.get(node.lt)!.destroyedAt = location.ref;
        this.pushRow(ctx, [location]);
        return;
      }
      case 'progress':
        for (const lt of node.lts) {
          this.settings.set(lt, node.temp);
          const current = this.current.get(lt);
          if (!current || current.ref.part !== 'body') continue;
          current.temp = node.temp;
          if (node.temp === 'hot')
            this.builder.facts.hotProgress.push({ lt, index: current.ref.index, span: node.span });
        }
        return;
      case 'note': {
        node.note.row = ++this.row;
        this.notes.push(node.note);
        return;
      }
      case 'simultaneous': {
        const row = this.nextRow(ctx);
        const inner: EmitContext = {
          ...ctx,
          simultaneous: { lts: node.lts, locations: new Map(), row },
        };
        const before = this.snapshotLocations();
        this.nodes(node.children, inner);
        for (const lt of node.lts) {
          if (!inner.simultaneous!.locations.has(lt)) {
            this.builder.reportFromEmitter(
              'V26',
              'error',
              `\`${lt.name}\` is listed but has no event in this simultaneous region.`,
              node.span,
            );
          }
        }
        this.pushRow(ctx, this.newLocations(before));
        return;
      }
      case 'coregion': {
        const coregion = { lt: node.lt, id: `co${++this.coregionCount}`, count: 0 };
        this.nodes(node.children, { ...ctx, coregion });
        if (coregion.count < 2) {
          this.builder.reportFromEmitter(
            'V9',
            'error',
            'A coregion holds at least two locations on its instance.',
            node.span,
          );
        }
        return;
      }
      case 'block':
        ctx.region.push(this.block(node.b, ctx));
        return;
      case 'alt':
        ctx.region.push(this.alternative(node.a, ctx));
        return;
    }
  }

  private snapshotLocations(): Map<Instance, number> {
    return new Map([...this.instances.values()].map((i) => [i, i.locations.length]));
  }

  private newLocations(before: Map<Instance, number>): Location[] {
    return [...this.instances.values()].flatMap((i) =>
      i.locations
        .slice(before.get(i) ?? 0)
        .filter((l) => l.ref.index > 0 || l.label.events.length > 0),
    );
  }

  private condition(
    c: ConditionIR,
    ctx: EmitContext,
    barrier: string | undefined,
    sharers?: Lifetime[],
  ): Location[] {
    const row = this.nextRow(ctx);
    const lts = sharers ?? c.lifetimes;
    c.condition.sharedBy = lts.map((l) => l.id);
    const label: Partial<LocationLabel> = { condition: c.condition.id };
    if (barrier) label.barrier = barrier;
    const locations = lts.map((lt) => this.location(lt, ctx, label, row, c.span));
    c.condition.locations = locations.map((l) => l.ref);
    if (!barrier) this.pushRow(ctx, locations);
    return locations;
  }

  private newBarrier(
    at: 'entry' | 'exit',
    block: string,
    lts: Lifetime[],
    ctx: EmitContext,
    span: Span,
    existing?: Location[],
  ): Barrier {
    const id = `b${++this.barrierCount}`;
    let locations = existing;
    if (!locations) {
      const row = ++this.row;
      locations = lts.map((lt) =>
        this.location(lt, { part: ctx.part, region: [] }, { barrier: id }, row, span),
      );
    }
    const barrier: Barrier = {
      id,
      instances: lts.map((l) => l.id),
      locations: locations.map((l) => l.ref),
      at,
      block,
    };
    this.barriers.push(barrier);
    return barrier;
  }

  private block(b: BlockIR, ctx: EmitContext): Subchart {
    const saved = new Map(this.settings);
    const body: Region = { items: [] };
    const inner: EmitContext = { part: ctx.part, region: body.items };
    for (const lt of b.local) this.top(lt, ctx.part, this.row + 1, lt.span);

    let entry: Barrier;
    let children = b.children;
    if (b.guard) {
      const id = `b${this.barrierCount + 1}`;
      const locations = this.condition(b.guard, inner, id, b.entry);
      body.items.push({ kind: 'row', locations: locations.map((l) => l.ref) });
      entry = this.newBarrier('entry', b.scope.id, b.entry, inner, b.span, locations);
      children = b.children.filter((c) => !(c.t === 'condition' && c.c === b.guard));
    } else {
      entry = this.newBarrier('entry', b.scope.id, b.entry, inner, b.span);
    }
    this.nodes(children, inner);
    for (const [lt, temp] of saved) this.settings.set(lt, temp);
    const exit = this.newBarrier('exit', b.scope.id, b.exit, inner, b.endSpan);

    const sub: Subchart = {
      kind: 'subchart',
      id: b.scope.id,
      instances: sorted(b.scope.uses).map((l) => l.id),
      localInstances: b.local.map((l) => l.id),
      entry: entry.id,
      exit: exit.id,
      body,
      semantics: 'informal',
    };
    if (b.scope.name !== undefined) sub.name = b.scope.name;
    if (b.repeat !== undefined) sub.repeat = b.repeat;
    if (b.guard) sub.guard = b.guard.condition.id;
    return sub;
  }

  private alternative(a: AltIR, ctx: EmitContext): Alternative {
    const saved = new Map(this.settings);
    const scratch: EmitContext = { part: ctx.part, region: [] };
    const entryId = `b${this.barrierCount + 1}`;
    const guardLocations = this.condition(a.guard, scratch, entryId, a.entry);
    const entry = this.newBarrier('entry', a.scope.id, a.entry, scratch, a.span, guardLocations);
    const afterGuard = new Map(this.current);

    const branch = (b: BlockIR): Subchart => {
      const body: Region = { items: [] };
      for (const lt of b.local) this.top(lt, ctx.part, this.row + 1, lt.span);
      this.nodes(b.children, { part: ctx.part, region: body.items });
      for (const [lt, temp] of saved) this.settings.set(lt, temp);
      const sub: Subchart = {
        kind: 'subchart',
        id: b.scope.id,
        instances: sorted(b.scope.uses).map((l) => l.id),
        localInstances: b.local.map((l) => l.id),
        entry: entry.id,
        exit: '',
        body,
        semantics: 'informal',
      };
      if (b.scope.name !== undefined) sub.name = b.scope.name;
      return sub;
    };
    const then = branch(a.then);
    let otherwise: Subchart | undefined;
    if (a.else) {
      ++this.row; // the divider between the compartments
      this.current = new Map(afterGuard);
      otherwise = branch(a.else);
    }
    const exit = this.newBarrier('exit', a.scope.id, a.exit, scratch, a.endSpan);
    then.exit = exit.id;
    if (otherwise) otherwise.exit = exit.id;
    const alt: Alternative = {
      kind: 'alt',
      id: a.scope.id,
      guard: a.guard.condition.id,
      then,
      semantics: 'informal',
    };
    if (otherwise) alt.else = otherwise;
    return alt;
  }
}

function mergeLabel(target: LocationLabel, patch: Partial<LocationLabel>): void {
  if (patch.events) target.events.push(...patch.events);
  if (patch.condition !== undefined) target.condition = patch.condition;
  if (patch.barrier !== undefined) target.barrier = patch.barrier;
  if (patch.create !== undefined) target.create = patch.create;
  if (patch.destroy) target.destroy = true;
  if (patch.timeout !== undefined) target.timeout = patch.timeout;
}
