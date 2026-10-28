import { describe, expect, it } from 'vitest';
import { runCli, type CliIo } from '../src/cli.js';

function io(files: Record<string, string> = {}, stdin = '') {
  const out: string[] = [];
  const err: string[] = [];
  const written: Record<string, string> = {};
  const value: CliIo = {
    readText: async (path) => {
      if (!(path in files)) throw new Error(`ENOENT: no such file '${path}'`);
      return files[path]!;
    },
    writeText: async (path, text) => {
      written[path] = text;
    },
    readStdin: async () => stdin,
    stdout: (text) => out.push(text),
    stderr: (text) => err.push(text),
  };
  return { io: value, out, err, written };
}

const CHART = ['lsc-alpha universal', '  title Ping', '  a ->> b: ping'].join('\n');

describe('mermaid-lsc command line', () => {
  it('renders a file to standard output, printing warnings to standard error', async () => {
    const t = io({ 'ping.lsc': CHART });
    expect(await runCli(['ping.lsc'], t.io)).toBe(0);
    expect(t.out.join('')).toMatch(/^<svg id="lsc"[\s\S]*LSC: Ping[\s\S]*<\/svg>\n$/);
    expect(t.err.join('')).toMatch(/^ping\.lsc:1:1: warning V11: /);
  });

  it('writes to the output file and reads standard input', async () => {
    const t = io({}, CHART);
    expect(await runCli(['-q', '-o', 'out.svg', '--id', 'ping'], t.io)).toBe(0);
    expect(t.written['out.svg']).toMatch(/^<svg id="ping"/);
    expect(t.out).toEqual([]);
    expect(t.err).toEqual([]);
  });

  it('applies the theme and config options', async () => {
    const t = io({
      'c.lsc': CHART,
      'config.json': JSON.stringify({ themeVariables: { lscHotColor: '#123456' } }),
    });
    expect(await runCli(['-q', '-t', 'dark', '-c', 'config.json', 'c.lsc'], t.io)).toBe(0);
    expect(t.out.join('')).toContain('stroke:#123456');
  });

  it('reports blocking errors with their position and exits with 1', async () => {
    const t = io({ 'bad.lsc': 'lsc-alpha universal\n  a -->> b: reply' });
    expect(await runCli(['bad.lsc'], t.io)).toBe(1);
    expect(t.err.join('')).toMatch(/^bad\.lsc:2:5: error V23: `-->>` is a Mermaid/);
    expect(t.out).toEqual([]);
  });

  it('writes the skeleton automaton as JSON with --automaton', async () => {
    const t = io({ 'ping.lsc': `---\ntitle: Front\n---\n${CHART}` });
    expect(await runCli(['--automaton', '-o', 'ping.json', 'ping.lsc'], t.io)).toBe(0);
    const automaton = JSON.parse(t.written['ping.json']!) as { mode: string; events: unknown[] };
    expect(automaton).toMatchObject({
      automatonVersion: 1,
      mode: 'universal',
      title: 'Ping',
      events: [{ from: 'a', to: 'b', name: 'ping', kind: 'synch', visible: true }],
    });
    // Lines count the front matter.
    expect(t.err.join('')).toMatch(/^ping\.lsc:4:1: warning V11: /);
  });

  it('reports charts the automaton does not support and exits with 1', async () => {
    const t = io({}, 'lsc-alpha existential\n  subchart\n    a ->> b: m\n  end');
    expect(await runCli(['--automaton', '-q'], t.io)).toBe(1);
    expect(t.err.join('')).toMatch(/^<stdin>:\d+:\d+: error A1: Subcharts are not supported/);
    expect(t.out).toEqual([]);
  });

  it('refuses other diagram types', async () => {
    const t = io({ 'seq.mmd': 'sequenceDiagram\n  a->>b: hi' });
    expect(await runCli(['seq.mmd'], t.io)).toBe(1);
    expect(t.err.join('')).toContain('Not a Live Sequence Chart');
  });

  it('prints help and rejects bad usage', async () => {
    const help = io();
    expect(await runCli(['--help'], help.io)).toBe(0);
    expect(help.out.join('')).toContain('Usage: mermaid-lsc');
    const bad = io();
    expect(await runCli(['--nope'], bad.io)).toBe(2);
    const missing = io();
    expect(await runCli(['missing.lsc'], missing.io)).toBe(2);
    expect(missing.err.join('')).toContain("can't read missing.lsc");
  });
});
