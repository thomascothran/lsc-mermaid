import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  decodeHash,
  defaultSettings,
  encodeHash,
  readSavedState,
  readSettings,
  svgFileName,
  type PageState,
} from '../src/share.js';

const chart = 'lsc-alpha universal\n  title Café — “quotes” & ünïcödé\n  car ->> carHandler: go\n';

describe('links', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips the text and the settings', async () => {
    const state: PageState = { theme: 'dark', cue: 'line+badge', diagnostics: false, text: chart };
    const hash = await encodeHash(state);
    expect(hash).toContain('z=');
    expect(await decodeHash(`#${hash}`)).toEqual(state);
  });

  it('leaves settings at their defaults out of the link', async () => {
    const hash = await encodeHash({ ...defaultSettings, text: chart });
    expect([...new URLSearchParams(hash).keys()]).toEqual(['z']);
    expect(await decodeHash(hash)).toEqual({ text: chart });
  });

  it('keeps the text uncompressed where the browser cannot compress', async () => {
    vi.stubGlobal('CompressionStream', undefined);
    const hash = await encodeHash({ ...defaultSettings, text: chart });
    expect([...new URLSearchParams(hash).keys()]).toEqual(['t']);
    expect((await decodeHash(hash)).text).toBe(chart);
  });

  it('compresses long charts', async () => {
    const text = chart.repeat(50);
    const hash = await encodeHash({ ...defaultSettings, text });
    expect(hash.length).toBeLessThan(text.length / 4);
  });

  it('reads plain percent-encoded text from lsc, as a language model writes it', async () => {
    const text = 'lsc-alpha existential\n  a ->> b: ping(x + 1) & #1';
    const written = `#theme=dark&lsc=${encodeURIComponent(text)}`;
    expect(await decodeHash(written)).toEqual({ theme: 'dark', text });
    // Spaces written as +, and characters left unencoded where a link allows them.
    expect((await decodeHash('#lsc=lsc-alpha+existential%0A++a+->>+b:+ping')).text).toBe(
      'lsc-alpha existential\n  a ->> b: ping',
    );
    // A stray % doesn't lose the rest of the text.
    expect((await decodeHash('#lsc=a%20100%25%20b%zz')).text).toBe('a 100% b%zz');
  });

  it('ignores unknown settings and damaged text', async () => {
    expect(await decodeHash('#theme=neon&cue=line%2Bcolor&z=not-deflate')).toEqual({
      cue: 'line+color',
    });
    expect(await decodeHash('')).toEqual({});
  });
});

describe('saved state', () => {
  it('reads what the page saves', () => {
    const state: PageState = { theme: 'forest', cue: 'line', diagnostics: true, text: chart };
    expect(readSavedState(JSON.stringify(state))).toEqual(state);
  });

  it('drops anything it does not recognise', () => {
    expect(readSavedState('{"theme":"neon","diagnostics":"yes","text":3}')).toEqual({});
    expect(readSavedState('not json')).toEqual({});
    expect(readSavedState(null)).toEqual({});
    expect(readSettings(['dark'])).toEqual({});
  });
});

describe('svgFileName', () => {
  it('uses the chart title', () => {
    expect(svgFileName('lsc-alpha universal\n  title Car departure!\n')).toBe('car-departure.svg');
  });

  it('falls back to a generic name', () => {
    expect(svgFileName('lsc-alpha universal\n')).toBe('live-sequence-chart.svg');
    expect(svgFileName('lsc-alpha universal\n  title ***\n')).toBe('live-sequence-chart.svg');
  });
});
