import { parseLsc, validateLsc, type Diagnostic } from 'lsc-model';
import { renderSvg } from 'mermaid-lsc/node';
import { describe, expect, it } from 'vitest';
import {
  collectTutorialCharts,
  parts,
  readLessons,
  renderMarkdown,
  type TutorialChart,
} from '../tutorial/pages.ts';

const lessons = readLessons();
const charts = await collectTutorialCharts(lessons);

function diagnose(text: string): Diagnostic[] {
  const { model, diagnostics } = parseLsc(text);
  if (model) diagnostics.push(...validateLsc(model));
  return diagnostics.filter((d) => d.severity !== 'info');
}

function describeChart(chart: TutorialChart, index: number): string {
  const title = /^\s*title\s+(.+)$/m.exec(chart.text)?.[1];
  return `${chart.lesson} #${index + 1}${chart.inAnswer ? ' (answer)' : ''}${title ? `: ${title}` : ''}`;
}

describe('tutorial lessons', () => {
  it('are numbered 1, 2, 3… and go through the parts in order', () => {
    expect(lessons.map((l) => l.number)).toEqual(lessons.map((_, i) => i + 1));
    const used = lessons.map((l) => l.part);
    expect(used).toEqual([...used].sort((a, b) => a - b));
    expect(new Set(used).size).toBe(parts.length);
  });

  it.each(lessons.map((l) => [l.slug, l] as const))(
    '%s has charts, something to try and a check question, each with an answer',
    async (_slug, lesson) => {
      const { html, charts: own } = await renderMarkdown(lesson.markdown, lesson.slug);
      expect(own.filter((c) => !c.inAnswer).length).toBeGreaterThan(0);
      expect(html).toContain('<h2 id="try-it">Try it</h2>');
      expect(html).toContain('<h2 id="check-your-understanding">Check your understanding</h2>');
      const tail = html.slice(html.indexOf('<h2 id="try-it">'));
      const answers = tail.match(/<details class="answer">/g) ?? [];
      expect(answers.length).toBeGreaterThanOrEqual(2);
      expect(html).not.toContain(':::');
    },
  );
});

describe('tutorial charts', () => {
  it('there are plenty, and every lesson has one', () => {
    expect(charts.length).toBeGreaterThan(lessons.length * 2);
    expect(new Set(charts.map((c) => c.lesson)).size).toBe(lessons.length);
  });

  it.each(charts.map((chart, i) => [describeChart(chart, i), chart] as const))(
    '%s shows only the problems it means to show',
    (_name, chart) => {
      const found = diagnose(chart.text);
      const worst = found.some((d) => d.severity === 'error')
        ? 'error'
        : found.length
          ? 'warning'
          : undefined;
      expect(
        worst,
        found
          .map((d) => `${d.severity} ${d.code} line ${d.span?.start.line}: ${d.message}`)
          .join('\n'),
      ).toBe(chart.expect);
    },
  );

  it.each(
    charts
      .map((chart, i) => [describeChart(chart, i), chart] as const)
      .filter(([, chart]) => chart.expect !== 'error'),
  )('%s is drawn', async (_name, chart) => {
    const { svg } = await renderSvg(chart.text, { config: { lsc: { temperatureCue: chart.cue } } });
    expect(svg).toMatch(/^<svg/);
  });
});
