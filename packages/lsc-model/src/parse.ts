import type { ParseResult as LangiumParseResult } from 'langium';
import type { Diagnostic, Position, Span } from './diagnostics.js';
import type { LscChart as AstChart } from './language/generated/ast.js';
import { lscServices } from './language/lsc-module.js';
import type { LscChart } from './model.js';

type LexerError = LangiumParseResult['lexerErrors'][number];
type ParserError = LangiumParseResult['parserErrors'][number];

export interface ParseResult {
  /** The chart, or `undefined` when the text has syntax errors. */
  model: LscChart | undefined;
  diagnostics: Diagnostic[];
}

/** Parses LSC text into a model. Never throws on bad input; problems are returned as diagnostics. */
export function parseLsc(text: string): ParseResult {
  const result = lscServices().parser.LangiumParser.parse<AstChart>(text);
  const diagnostics: Diagnostic[] = [
    ...result.lexerErrors.map((e) => lexerDiagnostic(text, e)),
    ...result.parserErrors.map((e) => parserDiagnostic(text, e)),
  ];
  if (diagnostics.length > 0) {
    return { model: undefined, diagnostics };
  }
  return { model: buildModel(result.value), diagnostics };
}

function buildModel(ast: AstChart): LscChart {
  const chart: LscChart = { keyword: ast.keyword, mode: ast.mode };
  for (const statement of ast.statements) {
    switch (statement.$type) {
      case 'TitleStatement':
        chart.title = statement.text;
        break;
      case 'AccTitleStatement':
        chart.accTitle = statement.text;
        break;
      case 'AccDescrStatement':
        chart.accDescr = statement.text;
        break;
    }
  }
  return chart;
}

function lexerDiagnostic(text: string, error: LexerError): Diagnostic {
  const start = positionAt(text, error.offset);
  return {
    severity: 'error',
    code: 'syntax',
    message: error.message,
    span: { start, end: positionAt(text, error.offset + error.length) },
  };
}

function parserDiagnostic(text: string, error: ParserError): Diagnostic {
  const diagnostic: Diagnostic = { severity: 'error', code: 'syntax', message: error.message };
  const span = tokenSpan(text, error.token);
  if (span) diagnostic.span = span;
  return diagnostic;
}

function tokenSpan(text: string, token: ParserError['token']): Span | undefined {
  // At end of input Chevrotain reports a synthetic EOF token with NaN offsets.
  const offset = Number.isNaN(token.startOffset) ? text.length : token.startOffset;
  const end = Number.isNaN(token.endOffset ?? NaN) ? offset : (token.endOffset as number) + 1;
  return { start: positionAt(text, offset), end: positionAt(text, end) };
}

function positionAt(text: string, offset: number): Position {
  let line = 1;
  let lineStart = 0;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text.charCodeAt(i) === 10) {
      line++;
      lineStart = i + 1;
    }
  }
  return { line, column: offset - lineStart + 1, offset };
}
