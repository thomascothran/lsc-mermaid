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
    expect(svg).toContain('max-width: 400px');
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
      expect(svg).toContain('width="400"');
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
    expect(svg).toContain('width="400"');
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
