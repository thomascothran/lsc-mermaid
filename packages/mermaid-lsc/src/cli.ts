// mermaid-lsc: renders a Live Sequence Chart to SVG, for sites that can't load the plugin, or
// writes its skeleton automaton as JSON.

import { readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';
import { parseLsc, skeletonAutomaton, type Diagnostic } from 'lsc-model';
import { LscRenderError, renderSvg } from './node.js';

const USAGE = `Usage: mermaid-lsc [options] [input]

Renders a Live Sequence Chart (lsc-alpha …) to SVG. Reads standard input when no input
file is given and writes standard output when no output file is given.

Options:
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

/** The skeleton automaton of a chart as JSON, after any front matter. */
export function automatonJson(text: string): { json?: string; diagnostics: Diagnostic[] } {
  const front = FRONT_MATTER.exec(text)?.[0] ?? '';
  const firstLine = front.split('\n').length - (front.endsWith('\n') ? 0 : 1);
  const { model, diagnostics } = parseLsc(text.slice(front.length), { firstLine });
  if (!model) return { diagnostics };
  const result = skeletonAutomaton(model);
  const all = [...diagnostics, ...result.diagnostics];
  if (!result.automaton) return { diagnostics: all };
  return { json: `${JSON.stringify(result.automaton, null, 2)}\n`, diagnostics: all };
}
