import { isBlocking, parseLsc, validateLsc, type Diagnostic } from 'lsc-model';
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

export const parser = {
  // Mermaid assigns the fresh db here before calling `parse`.
  parser: { yy: undefined as unknown as DiagramDb },

  parse(text: string): void {
    const db = parser.parser.yy;
    if (!(db instanceof LscDb)) {
      throw new Error('mermaid-lsc: parser.parser.yy is not an LscDb');
    }
    // Mermaid strips the front matter; count its lines so positions match the whole text.
    const { model, diagnostics } = parseLsc(text, { firstLine: db.frontmatterLineOffset + 1 });
    // The rules checked on unfoldings and the partial order cost more, so they run only when
    // the chart shows their results.
    db.diagnostics =
      model && db.getConfig().showDiagnostics
        ? [...diagnostics, ...validateLsc(model)]
        : diagnostics;
    // Only syntax errors and the rules marked ✱ in the proposal stop rendering.
    if (!model) {
      throw new LscParseError(db.diagnostics.filter(isBlocking));
    }
    db.model = model;
    // Front-matter `title` arrives through setDiagramTitle before parsing; the chart's own title wins.
    if (model.title !== undefined) db.setDiagramTitle(model.title);
    if (model.accTitle !== undefined) db.setAccTitle(model.accTitle);
    if (model.accDescr !== undefined) db.setAccDescription(model.accDescr);
  },
};
