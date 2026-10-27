import mermaid from 'mermaid';
import { beforeAll, describe, expect, it } from 'vitest';
import lsc from 'mermaid-lsc';

beforeAll(async () => {
  await mermaid.registerExternalDiagrams([lsc]);
  mermaid.initialize({ startOnLoad: false });
});

describe('detector', () => {
  it.each(['lsc-alpha universal', 'lsc existential', '  lsc-alpha subchart', 'lsc-alpha'])(
    'claims %j',
    (text) => expect(lsc.detector(text)).toBe(true),
  );

  it.each(['sequenceDiagram', 'lscx universal', 'lsc-beta universal'])('ignores %j', (text) =>
    expect(lsc.detector(text)).toBe(false),
  );
});

describe('mermaid integration', () => {
  it('parses through mermaid', async () => {
    await expect(
      mermaid.parse('lsc-alpha universal\n  title Car departure'),
    ).resolves.toMatchObject({ diagramType: 'liveSequenceChart' });
  });

  it('renders an SVG with title and accessibility information', async () => {
    const { svg } = await mermaid.render(
      'lsc-render',
      [
        'lsc-alpha universal',
        '  title Car departure',
        '  accTitle: Departure chart',
        '  accDescr: Car and handler agree to depart',
      ].join('\n'),
    );
    expect(svg).toContain('LSC: Car departure');
    expect(svg).toContain('aria-roledescription="liveSequenceChart"');
    expect(svg).toMatch(/<title[^>]*>Departure chart<\/title>/);
    expect(svg).toMatch(/<desc[^>]*>Car and handler agree to depart<\/desc>/);
    expect(svg).toMatch(/max-width: [\d.]+px/);
  });

  it('accepts front matter and init directives', async () => {
    const text = [
      '---',
      'title: From front matter',
      '---',
      '%%{init: {"theme": "dark"}}%%',
      'lsc-alpha existential',
    ].join('\n');
    const { svg } = await mermaid.render('lsc-frontmatter', text);
    expect(svg).toContain('LSC: From front matter');
    expect(svg).toContain('lsc-cold');
  });

  it('reads the lsc config block from mermaid.initialize', async () => {
    mermaid.initialize({ startOnLoad: false, lsc: { useMaxWidth: false } } as never);
    try {
      const { svg } = await mermaid.render('lsc-site-config', 'lsc-alpha universal');
      expect(svg).toMatch(/<svg[^>]* width="[\d.]+" [^>]*height="[\d.]+"/);
      expect(svg).not.toContain('max-width');
    } finally {
      mermaid.initialize({ startOnLoad: false });
    }
  });

  // Mermaid 12 drops directive and front-matter config keys that are absent from its
  // own default config, so an external diagram cannot receive an `lsc` block that way.
  // This test starts passing (and must be flipped) if Mermaid lifts that restriction.
  it.fails('reads the lsc config block from front matter (blocked by Mermaid)', async () => {
    const text = [
      '---',
      'config:',
      '  lsc:',
      '    useMaxWidth: false',
      '---',
      'lsc-alpha universal',
    ];
    const { svg } = await mermaid.render('lsc-fm-config', text.join('\n'));
    expect(svg).not.toContain('max-width');
  });

  it('generates a description when the chart has no accDescr', async () => {
    const { svg } = await mermaid.render(
      'lsc-generated-desc',
      [
        'lsc-alpha universal',
        '  instance cruiser, car, carHandler',
        '  activation on env ->> car: setDest',
        '  car ->> carHandler: departReq',
        '  carHandler ->> car: departAck',
      ].join('\n'),
    );
    expect(svg).toMatch(
      /<desc[^>]*>Universal chart, 3 instances, 2 messages, activated by setDest<\/desc>/,
    );
  });

  it('marks warnings, including those found by validateLsc', async () => {
    // V11 comes from parsing and V8 from validateLsc. Lines count the front matter, also
    // where a message cites another line.
    const text = [
      '---',
      'title: t',
      '---',
      'lsc-alpha universal',
      '  instance a, b',
      '  subchart "Done"',
      '    cold condition a: finished',
      '    destroy b',
      '  end',
      '  create b by a',
    ].join('\n');
    const { svg } = await mermaid.render('lsc-diags', text);
    expect(svg.match(/class="lsc-diag-marker/g)).toHaveLength(2);
    expect(svg).toMatch(/1\. line 4 · V11 warning/);
    expect(svg).toMatch(/2\. line 10 · V8 warning: [\s\S]*not destroyed on line[\s\S]{0,120}8\./);
  });

  it('hides diagnostics with showDiagnostics off', async () => {
    mermaid.initialize({ startOnLoad: false, lsc: { showDiagnostics: false } } as never);
    try {
      const { svg } = await mermaid.render('lsc-no-diags', 'lsc-alpha universal\n  a ->> b: m');
      expect(svg).not.toContain('class="lsc-diag');
    } finally {
      mermaid.initialize({ startOnLoad: false });
    }
  });

  it('applies lsc theme variables', async () => {
    mermaid.initialize({ startOnLoad: false, themeVariables: { lscHotColor: '#b03030' } });
    try {
      const { svg } = await mermaid.render('lsc-theme', 'lsc-alpha universal\n  a ->> b: m');
      expect(svg).toMatch(/\.lsc-hot\{stroke:#b03030;/);
    } finally {
      mermaid.initialize({ startOnLoad: false });
    }
  });

  it('keeps state separate between renders', async () => {
    await mermaid.render('lsc-first', 'lsc-alpha universal\n  title First');
    const { svg } = await mermaid.render('lsc-second', 'lsc-alpha universal');
    expect(svg).not.toContain('First');
  });

  it('reports syntax errors with the source line, counting front matter', async () => {
    const text = ['---', 'title: x', '---', 'lsc-alpha', ''].join('\n');
    await expect(mermaid.parse(text)).rejects.toThrow(/line 4, column/);
  });
});
