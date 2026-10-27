import { parseLsc, type Diagnostic } from 'lsc-model';
import { LscDb } from './db.js';
import type { DiagramDb } from './mermaid-adapter.js';

/** Thrown for charts that cannot be rendered; Mermaid shows its message in the error diagram. */
export class LscParseError extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics.map(formatDiagnostic).join('\n'));
    this.name = 'LscParseError';
  }
}

function formatDiagnostic(d: Diagnostic): string {
  const where = d.span ? ` on line ${d.span.start.line}, column ${d.span.start.column}` : '';
  return `${d.severity === 'error' ? 'Parse error' : 'Warning'}${where}: ${d.message}`;
}

function withLineOffset(d: Diagnostic, offset: number): Diagnostic {
  if (!d.span || offset === 0) return d;
  const shift = (p: typeof d.span.start) => ({ ...p, line: p.line + offset });
  return { ...d, span: { start: shift(d.span.start), end: shift(d.span.end) } };
}

export const parser = {
  // Mermaid assigns the fresh db here before calling `parse`.
  parser: { yy: undefined as unknown as DiagramDb },

  parse(text: string): void {
    const db = parser.parser.yy;
    if (!(db instanceof LscDb)) {
      throw new Error('mermaid-lsc: parser.parser.yy is not an LscDb');
    }
    const { model, diagnostics } = parseLsc(text);
    db.diagnostics = diagnostics.map((d) => withLineOffset(d, db.frontmatterLineOffset));
    const errors = db.diagnostics.filter((d) => d.severity === 'error');
    if (!model || errors.length > 0) {
      throw new LscParseError(errors);
    }
    db.model = model;
    // Front-matter `title` arrives through setDiagramTitle before parsing; the chart's own title wins.
    if (model.title !== undefined) db.setDiagramTitle(model.title);
    if (model.accTitle !== undefined) db.setAccTitle(model.accTitle);
    if (model.accDescr !== undefined) db.setAccDescription(model.accDescr);
  },
};
