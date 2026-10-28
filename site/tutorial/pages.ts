// Reads the tutorial's lessons and turns them into pages. Each lesson is a Markdown file in
// lessons/ with a short front matter. Two additions to Markdown:
//
//   ```lsc [expect=warning|error] [cue=line|line+color|line+badge]
//   …chart text…
//   ```
//   A chart, drawn live in the page, with its text editable below it and a link that opens it
//   in the playground. `expect` says that the chart shows a warning or an error on purpose.
//
//   :::answer Optional summary text
//   …Markdown…
//   :::
//   A model answer, hidden until the reader opens it. `:::aside Title` is a side note.

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Marked, type Token, type Tokens } from 'marked';
import { CUES, defaultSettings, encodeHash, type Cue } from '../src/share.ts';

const tutorialDir = dirname(fileURLToPath(import.meta.url));

export interface Part {
  title: string;
  intro: string;
}

export const parts: Part[] = [
  {
    title: 'Telling a story',
    intro: 'No rules yet. A chart is a picture of something that happened.',
  },
  {
    title: 'From stories to rules',
    intro: 'The core idea of Live Sequence Charts: saying what must happen, and what may.',
  },
  {
    title: 'Shaping longer stories',
    intro: 'Chapters, repeats, choices, and participants who come and go.',
  },
  {
    title: 'Putting it together',
    intro: 'A full chart from the paper, and what to do when the page complains.',
  },
];

export interface Lesson {
  /** 1-based, from the file name. */
  number: number;
  /** The file name without its extension, such as `01-who-and-when`. */
  slug: string;
  title: string;
  /** 1-based index into `parts`. */
  part: number;
  /** One sentence for the contents page. */
  summary: string;
  markdown: string;
}

/** A chart in a lesson, as written in its ```lsc block. */
export interface TutorialChart {
  lesson: string;
  /** Whether the chart is inside a model answer. */
  inAnswer: boolean;
  text: string;
  /** The worst diagnostic the chart shows on purpose. */
  expect?: 'warning' | 'error';
  cue: Cue;
}

function frontMatter(text: string, file: string): { meta: Record<string, string>; body: string } {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!match?.[1]) throw new Error(`${file}: missing front matter`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split('\n')) {
    const field = /^(\w+):\s*(.*)$/.exec(line);
    if (!field?.[1]) throw new Error(`${file}: bad front matter line "${line}"`);
    meta[field[1]] = field[2] ?? '';
  }
  return { meta, body: text.slice(match[0].length) };
}

/** Reads every lesson, in order. */
export function readLessons(dir = join(tutorialDir, 'lessons')): Lesson[] {
  return readdirSync(dir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file): Lesson => {
      const number = Number(/^(\d+)-/.exec(file)?.[1]);
      const { meta, body } = frontMatter(readFileSync(join(dir, file), 'utf8'), file);
      const part = Number(meta.part);
      if (!number || !meta.title || !meta.summary || !(part >= 1 && part <= parts.length)) {
        throw new Error(`${file}: needs a number, and a title, part and summary`);
      }
      return {
        number,
        slug: file.replace(/\.md$/, ''),
        title: meta.title,
        part,
        summary: meta.summary,
        markdown: body,
      };
    });
}

/** The introduction shown above the contents. */
export function readIntro(file = join(tutorialDir, 'index.md')): string {
  return readFileSync(file, 'utf8');
}

// ---- Markdown -----------------------------------------------------------------------------

interface ChartToken extends Tokens.Code {
  chart?: TutorialChart;
  playgroundHash?: string;
}

interface ContainerToken extends Tokens.Generic {
  type: 'container';
  kind: 'answer' | 'aside';
  title: string;
  tokens: Token[];
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/&[a-z]+;/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function chartOptions(info: string, file: string): Pick<TutorialChart, 'expect' | 'cue'> {
  const options: Pick<TutorialChart, 'expect' | 'cue'> = { cue: 'line' };
  for (const option of info.split(/\s+/).slice(1).filter(Boolean)) {
    const [key, value] = option.split('=');
    if (key === 'expect' && (value === 'warning' || value === 'error')) options.expect = value;
    else if (key === 'cue' && CUES.includes(value as Cue)) options.cue = value as Cue;
    else throw new Error(`${file}: unknown chart option "${option}"`);
  }
  return options;
}

const container = {
  name: 'container',
  level: 'block' as const,
  start: (src: string) => /^:::/m.exec(src)?.index,
  tokenizer(this: { lexer: { blockTokens(src: string, tokens: Token[]): Token[] } }, src: string) {
    const match = /^:::(answer|aside)[ \t]*([^\n]*)\n([\s\S]*?)\n:::[ \t]*(?:\n|$)/.exec(src);
    if (!match) return undefined;
    return {
      type: 'container',
      raw: match[0],
      kind: match[1] as ContainerToken['kind'],
      title: match[2]?.trim() ?? '',
      tokens: this.lexer.blockTokens(match[3] ?? '', []),
    };
  },
};

/** Lesson Markdown as HTML, with every chart it contains. */
export async function renderMarkdown(
  markdown: string,
  lesson: string,
): Promise<{ html: string; charts: TutorialChart[] }> {
  const charts: TutorialChart[] = [];
  const marked = new Marked({
    async: true,
    extensions: [
      {
        ...container,
        renderer(token) {
          const { kind, title, tokens } = token as ContainerToken;
          const inner = this.parser.parse(tokens);
          if (kind === 'answer') {
            return `<details class="answer"><summary>${escapeHtml(title || 'Show the answer')}</summary><div class="answer-body">${inner}</div></details>\n`;
          }
          const heading = title ? `<p class="aside-title">${escapeHtml(title)}</p>` : '';
          return `<aside class="aside">${heading}${inner}</aside>\n`;
        },
      },
    ],
    async walkTokens(token) {
      if (token.type === 'container') {
        for (const child of (token as ContainerToken).tokens) {
          if (child.type === 'code' && (token as ContainerToken).kind === 'answer') {
            (child as ChartToken & { inAnswer?: boolean }).inAnswer = true;
          }
        }
      }
      if (token.type !== 'code' || !/^lsc(\s|$)/.test(token.lang ?? '')) return;
      const code = token as ChartToken & { inAnswer?: boolean };
      const chart: TutorialChart = {
        lesson,
        inAnswer: code.inAnswer ?? false,
        text: `${code.text}\n`,
        ...chartOptions(code.lang ?? '', lesson),
      };
      code.chart = chart;
      charts.push(chart);
      code.playgroundHash = await encodeHash({
        ...defaultSettings,
        cue: chart.cue,
        text: chart.text,
      });
    },
    renderer: {
      code(token) {
        const { chart, playgroundHash } = token as ChartToken;
        if (!chart) return `<pre class="snippet"><code>${escapeHtml(token.text)}</code></pre>\n`;
        const rows = chart.text.split('\n').length - 1;
        const label = chart.expect === 'error' ? ' data-expect="error"' : '';
        return `<figure class="lsc-example" data-cue="${chart.cue}"${label}>
<div class="figure"><span class="pending">Drawing…</span></div>
<div class="example-error" role="alert" hidden><pre></pre></div>
<div class="example-source">
<div class="example-bar"><span>Chart text — try changing it</span><span class="example-actions"><button type="button" class="reset" hidden>Undo my changes</button><a class="open" href="../index.html#${playgroundHash}">Open in playground</a></span></div>
<textarea spellcheck="false" autocapitalize="off" autocomplete="off" wrap="off" rows="${rows}" aria-label="Chart text">${escapeHtml(chart.text)}</textarea>
</div>
</figure>\n`;
      },
      heading({ tokens, depth }) {
        const text = this.parser.parseInline(tokens);
        return `<h${depth} id="${slugify(text)}">${text}</h${depth}>\n`;
      },
    },
  });
  const html = await marked.parse(markdown);
  return { html, charts };
}

/** Every chart in every lesson, including the model answers. */
export async function collectTutorialCharts(lessons = readLessons()): Promise<TutorialChart[]> {
  const all: TutorialChart[] = [];
  for (const lesson of lessons)
    all.push(...(await renderMarkdown(lesson.markdown, lesson.slug)).charts);
  return all;
}

// ---- Pages --------------------------------------------------------------------------------

const logo = `<svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
          <rect x="2" y="2" width="28" height="28" rx="5" />
          <path d="M10 7v18M22 7v18" />
          <path d="M10 12h10l-3-2.5M10 12h10l-3 2.5" />
          <path class="cold" d="M22 20H12" />
        </svg>`;

function page(options: { title: string; description: string; body: string }): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(options.title)} — Live Sequence Charts tutorial</title>
    <meta name="description" content="${escapeHtml(options.description)}" />
    <link rel="stylesheet" href="../styles.css" />
  </head>
  <body class="tutorial-page">
    <header class="topbar">
      <a class="brand" href="index.html">
        ${logo}
        <div>
          <p class="brand-title">Live Sequence Charts <span>for Mermaid</span></p>
          <p class="tagline">A step-by-step tutorial. No background needed.</p>
        </div>
      </a>
      <nav class="views" aria-label="View">
        <a href="../index.html">Editor</a>
        <a href="../index.html#view=gallery">Gallery</a>
        <a href="index.html" aria-current="page">Tutorial</a>
      </nav>
    </header>
${options.body}
    <footer class="footer">
      <span>
        Notation <code>lsc-alpha</code>: experimental and subject to change.
        <a href="../LICENSE.txt">MIT licence</a> ·
        <a href="../THIRD-PARTY-NOTICES.txt">Third-party notices</a>
      </span>
      <span>
        Based on W. Damm and D. Harel, “LSCs: Breathing Life into Message Sequence Charts”, 2001.
      </span>
    </footer>
    <noscript><p class="noscript">This page needs JavaScript to draw charts.</p></noscript>
    <script src="../mermaid.min.js"></script>
    <script src="tutorial.js"></script>
  </body>
</html>
`;
}

function lessonList(lessons: Lesson[], current?: Lesson): string {
  return parts
    .map((part, i) => {
      const items = lessons
        .filter((lesson) => lesson.part === i + 1)
        .map((lesson) => {
          const here = lesson === current ? ' aria-current="page"' : '';
          return `<li><a href="${lesson.slug}.html"${here}><span class="num">${lesson.number}</span> ${escapeHtml(lesson.title)}</a></li>`;
        })
        .join('');
      return `<li><p class="part-title">Part ${i + 1}: ${escapeHtml(part.title)}</p><ol>${items}</ol></li>`;
    })
    .join('');
}

function sidebar(lessons: Lesson[], current?: Lesson): string {
  return `<nav class="lessons" aria-label="Lessons">
      <details open>
        <summary>Lessons</summary>
        <p class="contents-link"><a href="index.html"${current ? '' : ' aria-current="page"'}>Contents</a></p>
        <ol class="parts">${lessonList(lessons, current)}</ol>
      </details>
    </nav>`;
}

function pager(lessons: Lesson[], index: number): string {
  const prev = lessons[index - 1];
  const next = lessons[index + 1];
  const link = (lesson: Lesson | undefined, rel: 'prev' | 'next') =>
    lesson
      ? `<a class="${rel}" rel="${rel}" href="${lesson.slug}.html"><span>${rel === 'prev' ? '← Previous' : 'Next →'}</span>${lesson.number}. ${escapeHtml(lesson.title)}</a>`
      : `<a class="${rel}" href="${rel === 'prev' ? 'index.html' : '../index.html'}"><span>${rel === 'prev' ? '← Back to' : 'Done? →'}</span>${rel === 'prev' ? 'Contents' : 'Open the playground'}</a>`;
  return `<nav class="pager" aria-label="Lesson">${link(prev, 'prev')}${link(next, 'next')}</nav>`;
}

export interface TutorialPage {
  file: string;
  html: string;
}

/** The contents page and one page per lesson. */
export async function tutorialPages(lessons = readLessons()): Promise<TutorialPage[]> {
  const intro = await renderMarkdown(readIntro(), 'index');
  const contents = parts
    .map((part, i) => {
      const items = lessons
        .filter((lesson) => lesson.part === i + 1)
        .map(
          (lesson) =>
            `<li><a href="${lesson.slug}.html"><span class="num">${lesson.number}</span><span><strong>${escapeHtml(lesson.title)}</strong><span class="summary">${escapeHtml(lesson.summary)}</span></span></a></li>`,
        )
        .join('');
      return `<section class="part"><h2>Part ${i + 1}: ${escapeHtml(part.title)}</h2><p>${escapeHtml(part.intro)}</p><ol class="lesson-cards">${items}</ol></section>`;
    })
    .join('\n');
  const pages: TutorialPage[] = [
    {
      file: 'index.html',
      html: page({
        title: 'Contents',
        description: 'Learn to write Live Sequence Charts, one idea at a time.',
        body: `    <div class="tutorial">
    ${sidebar(lessons)}
    <main class="lesson" id="content">
      <article>
        <h1>Writing Live Sequence Charts</h1>
        ${intro.html}
        ${contents}
      </article>
    </main>
    </div>`,
      }),
    },
  ];
  for (const [index, lesson] of lessons.entries()) {
    const { html } = await renderMarkdown(lesson.markdown, lesson.slug);
    const part = parts[lesson.part - 1];
    pages.push({
      file: `${lesson.slug}.html`,
      html: page({
        title: `${lesson.number}. ${lesson.title}`,
        description: lesson.summary,
        body: `    <div class="tutorial">
    ${sidebar(lessons, lesson)}
    <main class="lesson" id="content">
      <article>
        <p class="kicker">Part ${lesson.part}: ${escapeHtml(part?.title ?? '')} · Lesson ${lesson.number} of ${lessons.length}</p>
        <h1>${escapeHtml(lesson.title)}</h1>
        ${html}
        ${pager(lessons, index)}
      </article>
    </main>
    </div>`,
      }),
    });
  }
  return pages;
}
