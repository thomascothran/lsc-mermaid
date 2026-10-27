import { isBlocking, type Diagnostic, type LscChart } from 'lsc-model';
import { lscConfig, type LscConfig } from './config.js';
import { describeChart } from './describe.js';
import { sanitize, type DiagramDb } from './mermaid-adapter.js';

/**
 * Per-render state. The diagram definition's `db` getter returns a new
 * instance each time, so nothing leaks between two charts on one page.
 */
export class LscDb implements DiagramDb {
  /** Parse the source with `%%` comments intact, so reported positions match it. */
  readonly preserveCommentsWhenParsing = true;

  model: LscChart | undefined;
  /** Every diagnostic. Lines, here and in the model, count the front matter. */
  diagnostics: Diagnostic[] = [];
  frontmatterLineOffset = 0;

  private title = '';
  private accTitle = '';
  private accDescription = '';

  clear(): void {
    this.model = undefined;
    this.diagnostics = [];
    this.frontmatterLineOffset = 0;
    this.title = '';
    this.accTitle = '';
    this.accDescription = '';
  }

  getConfig(): LscConfig {
    return lscConfig();
  }

  setFrontmatterLineOffset(offset: number): void {
    this.frontmatterLineOffset = offset;
  }

  setDiagramTitle(title: string): void {
    this.title = sanitize(title);
  }

  getDiagramTitle(): string {
    return this.title;
  }

  setAccTitle(title: string): void {
    this.accTitle = sanitize(title);
  }

  getAccTitle(): string {
    return this.accTitle;
  }

  setAccDescription(description: string): void {
    this.accDescription = sanitize(description);
  }

  /** The chart's `accDescr`, or a description generated from the model. */
  getAccDescription(): string {
    if (this.accDescription !== '' || !this.model) return this.accDescription;
    return describeChart(this.model);
  }

  /** The diagnostics the chart marks: warnings and errors that don't stop rendering, in line order. */
  displayedDiagnostics(): Diagnostic[] {
    return this.diagnostics
      .filter((d) => d.severity !== 'info' && !isBlocking(d))
      .sort((a, b) => (a.span?.start.offset ?? -1) - (b.span?.start.offset ?? -1));
  }
}
