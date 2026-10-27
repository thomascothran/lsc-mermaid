import type { Diagnostic, LscChart } from 'lsc-model';
import { lscConfig, type LscConfig } from './config.js';
import { sanitize, type DiagramDb } from './mermaid-adapter.js';

/**
 * Per-render state. The diagram definition's `db` getter returns a new
 * instance each time, so nothing leaks between two charts on one page.
 */
export class LscDb implements DiagramDb {
  /** Parse the source with `%%` comments intact, so reported positions match it. */
  readonly preserveCommentsWhenParsing = true;

  model: LscChart | undefined;
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

  getAccDescription(): string {
    return this.accDescription;
  }
}
