// mermaid-lsc: renders a Live Sequence Chart to SVG, for sites that can't load the plugin,
// writes its skeleton automaton as JSON, or checks charts without drawing them.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseLsc, skeletonAutomaton, validateLsc, type Diagnostic } from 'lsc-model';
import { LscRenderError, renderSvg } from './node.js';

const USAGE = `Usage: mermaid-lsc [options] [input]

Renders a Live Sequence Chart (lsc-alpha …) to SVG. Reads standard input when no input
file is given and writes standard output when no output file is given.

Options:
      --check           check the charts in one or more files without drawing them: .lsc
                        files, or the \`\`\`lsc blocks of Markdown (.md) files. Exits with 1
                        if any chart has an error
      --automaton       write the chart's skeleton automaton as JSON instead of SVG
  -o, --output <file>   write the SVG to <file>
  -t, --theme <name>    Mermaid theme: default, dark, forest, neutral or base
  -c, --config <file>   JSON passed to mermaid.initialize, e.g. {"lsc": {"temperatureCue": "line+badge"}}
      --id <id>         id of the <svg> element (default: lsc)
  -q, --quiet           don't print warnings
  -v, --verbose         also print notes (diagnostics of severity info)
  -h, --help            show this help
`;

export interface CliIo {
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  readStdin(): Promise<string>;
  stdout(text: string): void;
  stderr(text: string): void;
}

const nodeIo: CliIo = {
  readText: (path) => readFile(path, 'utf8'),
  writeText: (path, text) => writeFile(path, text, 'utf8'),
  readStdin: async () => {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
    return Buffer.concat(chunks).toString('utf8');
  },
  stdout: (text) => process.stdout.write(text),
  stderr: (text) => process.stderr.write(text),
};

function formatDiagnostic(file: string, d: Diagnostic): string {
  const where = d.span ? `${file}:${d.span.start.line}:${d.span.start.column}` : file;
  return `${where}: ${d.severity} ${d.code}: ${d.message}\n`;
}

/** Runs the command line; returns the exit code. */
export async function runCli(argv: string[], io: CliIo = nodeIo): Promise<number> {
  let args;
  try {
    args = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        output: { type: 'string', short: 'o' },
        check: { type: 'boolean' },
        automaton: { type: 'boolean' },
        theme: { type: 'string', short: 't' },
        config: { type: 'string', short: 'c' },
        id: { type: 'string' },
        quiet: { type: 'boolean', short: 'q' },
        verbose: { type: 'boolean', short: 'v' },
        help: { type: 'boolean', short: 'h' },
      },
    });
  } catch (error) {
    io.stderr(`mermaid-lsc: ${(error as Error).message}\n\n${USAGE}`);
    return 2;
  }
  const { values, positionals } = args;
  if (values.help) {
    io.stdout(USAGE);
    return 0;
  }
  if (values.check) return runCheck(positionals, values, io);
  if (positionals.length > 1) {
    io.stderr(`mermaid-lsc: expected at most one input file\n\n${USAGE}`);
    return 2;
  }
  const input = positionals[0];
  const file = input ?? '<stdin>';
  let config: Record<string, unknown> = {};
  try {
    if (values.config) config = JSON.parse(await io.readText(values.config)) as typeof config;
  } catch (error) {
    io.stderr(`mermaid-lsc: can't read config ${values.config}: ${(error as Error).message}\n`);
    return 2;
  }
  if (values.theme) config.theme = values.theme;

  let text: string;
  try {
    text = input === undefined || input === '-' ? await io.readStdin() : await io.readText(input);
  } catch (error) {
    io.stderr(`mermaid-lsc: can't read ${file}: ${(error as Error).message}\n`);
    return 2;
  }

  if (values.automaton) {
    const { json, diagnostics } = automatonJson(text);
    for (const d of diagnostics) {
      if (d.severity === 'error' || (!values.quiet && (d.severity !== 'info' || values.verbose)))
        io.stderr(formatDiagnostic(file, d));
    }
    if (json === undefined) return 1;
    if (values.output) await io.writeText(values.output, json);
    else io.stdout(json);
    return 0;
  }

  try {
    const { svg, diagnostics } = await renderSvg(text, {
      config,
      ...(values.id ? { id: values.id } : {}),
    });
    if (!values.quiet) {
      for (const d of diagnostics) {
        if (d.severity !== 'info' || values.verbose) io.stderr(formatDiagnostic(file, d));
      }
    }
    if (values.output) await io.writeText(values.output, `${svg}\n`);
    else io.stdout(`${svg}\n`);
    return 0;
  } catch (error) {
    if (error instanceof LscRenderError && error.diagnostics.length > 0) {
      for (const d of error.diagnostics) io.stderr(formatDiagnostic(file, d));
    } else {
      io.stderr(`${file}: ${(error as Error).message}\n`);
    }
    return 1;
  }
}

const FRONT_MATTER = /^---[\t ]*\r?\n[\s\S]*?\r?\n---[\t ]*(?:\r?\n|$)/;

/** Splits off any front matter; `firstLine` is the line, counted from `line`, where the chart starts. */
function afterFrontMatter(text: string, line = 1): { chart: string; firstLine: number } {
  const front = FRONT_MATTER.exec(text)?.[0] ?? '';
  const newlines = front.match(/\n/g)?.length ?? 0;
  return { chart: text.slice(front.length), firstLine: line + newlines };
}

/** Every diagnostic of a chart, from parsing and validation, after any front matter. */
export function checkChart(text: string, line = 1): Diagnostic[] {
  const { chart, firstLine } = afterFrontMatter(text, line);
  const { model, diagnostics } = parseLsc(chart, { firstLine });
  if (model) diagnostics.push(...validateLsc(model));
  return diagnostics;
}

/** A chart found in a Markdown file: its text and the line it starts on. */
export interface MarkdownChart {
  text: string;
  line: number;
}

const FENCE = /^ {0,3}(`{3,}|~{3,})[\t ]*([^\s`]*)[^\n`]*$/;

/**
 * The charts in a Markdown file: fenced blocks marked `lsc`, and `mermaid` blocks whose
 * diagram starts with `lsc-alpha` or `lsc`.
 */
export function markdownCharts(markdown: string): MarkdownChart[] {
  const lines = markdown.split(/\r?\n/);
  const charts: MarkdownChart[] = [];
  for (let i = 0; i < lines.length; i++) {
    const open = FENCE.exec(lines[i]!);
    if (!open) continue;
    const [, fence, info] = open as unknown as [string, string, string];
    const close = new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[\\t ]*$`);
    let end = i + 1;
    while (end < lines.length && !close.test(lines[end]!)) end++;
    const text = lines.slice(i + 1, end).join('\n');
    const lang = info.toLowerCase();
    const isLsc =
      lang === 'lsc' ||
      (lang === 'mermaid' && /^\s*lsc(-alpha)?\b/.test(afterFrontMatter(text).chart));
    if (isLsc) charts.push({ text, line: i + 2 });
    i = end;
  }
  return charts;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** `--check`: prints each file's problems and a summary line; returns the exit code. */
async function runCheck(
  inputs: string[],
  options: { quiet?: boolean; verbose?: boolean },
  io: CliIo,
): Promise<number> {
  let failed = false;
  for (const input of inputs.length ? inputs : ['-']) {
    const file = input === '-' ? '<stdin>' : input;
    let text: string;
    try {
      text = input === '-' ? await io.readStdin() : await io.readText(input);
    } catch (error) {
      io.stderr(`mermaid-lsc: can't read ${file}: ${(error as Error).message}\n`);
      return 2;
    }
    const markdown = /\.(md|markdown)$/i.test(input);
    const charts = markdown ? markdownCharts(text) : [{ text, line: 1 }];
    if (charts.length === 0) {
      io.stdout(`${file}: no charts found (expected \`\`\`lsc blocks)\n`);
      failed = true;
      continue;
    }
    let errors = 0;
    let warnings = 0;
    for (const chart of charts) {
      for (const d of checkChart(chart.text, chart.line)) {
        if (d.severity === 'error') errors++;
        if (d.severity === 'warning') warnings++;
        if (
          d.severity === 'error' ||
          (!options.quiet && (d.severity !== 'info' || options.verbose))
        )
          io.stderr(formatDiagnostic(file, d));
      }
    }
    const counts =
      errors || warnings ? `${plural(errors, 'error')}, ${plural(warnings, 'warning')}` : 'ok';
    io.stdout(`${file}: ${markdown ? `${plural(charts.length, 'chart')}, ` : ''}${counts}\n`);
    if (errors) failed = true;
  }
  return failed ? 1 : 0;
}

/** The skeleton automaton of a chart as JSON, after any front matter. */
export function automatonJson(text: string): { json?: string; diagnostics: Diagnostic[] } {
  const { chart, firstLine } = afterFrontMatter(text);
  const { model, diagnostics } = parseLsc(chart, { firstLine });
  if (!model) return { diagnostics };
  const result = skeletonAutomaton(model);
  const all = [...diagnostics, ...result.diagnostics];
  if (!result.automaton) return { diagnostics: all };
  return { json: `${JSON.stringify(result.automaton, null, 2)}\n`, diagnostics: all };
}
