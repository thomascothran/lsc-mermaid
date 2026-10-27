import type { ParseResult as LangiumParseResult } from 'langium';
import { buildModel, Source } from './build.js';
import { isBlocking, type Diagnostic, type Span } from './diagnostics.js';
import type { LscChart as AstChart } from './language/generated/ast.js';
import { lscServices } from './language/lsc-module.js';
import type { LscChart } from './model.js';

type LexerError = LangiumParseResult['lexerErrors'][number];
type ParserError = LangiumParseResult['parserErrors'][number];

export interface ParseResult {
  /**
   * The chart, or `undefined` when it can't be laid out: on syntax errors and on errors from
   * the rules marked ✱ in the proposal (see `isBlocking`).
   */
  model: LscChart | undefined;
  /**
   * Syntax errors and the findings tied to the source text. `validateLsc` adds the rules
   * checked on the model's unfoldings and partial order.
   */
  diagnostics: Diagnostic[];
}

export interface ParseOptions {
  /**
   * The line number of the text's first line (default 1). An embedding that strips lines
   * before the chart, such as Mermaid's front matter, sets it so that every line number in
   * spans and messages matches the full document. Offsets stay relative to `text`.
   */
  firstLine?: number;
}

/** Parses LSC text into a model. Never throws on bad input; problems are returned as diagnostics. */
export function parseLsc(text: string, options: ParseOptions = {}): ParseResult {
  const firstLine = options.firstLine ?? 1;
  const result = lscServices().parser.LangiumParser.parse<AstChart>(text);
  const source = new Source(text, firstLine);
  const diagnostics: Diagnostic[] = [
    ...result.lexerErrors.map((e) => lexerDiagnostic(source, e)),
    ...result.parserErrors.map((e) => parserDiagnostic(source, e)),
  ];
  if (diagnostics.length > 0) {
    return { model: undefined, diagnostics };
  }
  const built = buildModel(result.value, text, firstLine);
  return {
    model: built.diagnostics.some(isBlocking) ? undefined : built.model,
    diagnostics: built.diagnostics,
  };
}

function lexerDiagnostic(source: Source, error: LexerError): Diagnostic {
  return {
    severity: 'error',
    code: 'syntax',
    message: error.message,
    span: source.span(error.offset, error.offset + error.length),
  };
}

function parserDiagnostic(source: Source, error: ParserError): Diagnostic {
  const diagnostic: Diagnostic = { severity: 'error', code: 'syntax', message: error.message };
  const span = tokenSpan(source, error.token);
  if (span) diagnostic.span = span;
  return diagnostic;
}

function tokenSpan(source: Source, token: ParserError['token']): Span | undefined {
  // At end of input Chevrotain reports a synthetic EOF token with NaN offsets.
  const length = source.text.length;
  const offset = Number.isNaN(token.startOffset) ? length : token.startOffset;
  const end = Number.isNaN(token.endOffset ?? NaN) ? offset : (token.endOffset as number) + 1;
  return source.span(offset, end);
}
