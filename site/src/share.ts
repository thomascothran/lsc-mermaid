// The page's state as a URL hash and as a saved value. Both readers are tolerant: anything they
// don't recognise is dropped, so an old or hand-edited link still opens.

export const THEMES = ['default', 'dark', 'forest', 'neutral', 'base'] as const;
export const CUES = ['line', 'line+color', 'line+badge'] as const;

export type Theme = (typeof THEMES)[number];
export type Cue = (typeof CUES)[number];

export interface Settings {
  theme: Theme;
  cue: Cue;
  diagnostics: boolean;
}

export interface PageState extends Settings {
  text: string;
}

export const defaultSettings: Settings = { theme: 'default', cue: 'line', diagnostics: true };

/** Keeps the recognised settings in `raw` and drops everything else. */
export function readSettings(raw: unknown): Partial<Settings> {
  if (typeof raw !== 'object' || raw === null) return {};
  const r = raw as Record<string, unknown>;
  const settings: Partial<Settings> = {};
  if (THEMES.includes(r.theme as Theme)) settings.theme = r.theme as Theme;
  if (CUES.includes(r.cue as Cue)) settings.cue = r.cue as Cue;
  if (typeof r.diagnostics === 'boolean') settings.diagnostics = r.diagnostics;
  return settings;
}

/** Reads a saved state, as written by `JSON.stringify(state)`. */
export function readSavedState(json: string | null): Partial<PageState> {
  if (!json) return {};
  try {
    const raw: unknown = JSON.parse(json);
    const state: Partial<PageState> = readSettings(raw);
    const text = (raw as { text?: unknown }).text;
    if (typeof text === 'string') state.text = text;
    return state;
  } catch {
    return {};
  }
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(text: string): Uint8Array {
  const binary = atob(text.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function pipe(bytes: Uint8Array, stream: GenericTransformStream): Promise<Uint8Array> {
  const piped = new Blob([bytes as BlobPart]).stream().pipeThrough(stream);
  return new Uint8Array(await new Response(piped).arrayBuffer());
}

const canCompress = () =>
  typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

/**
 * Encodes the state as a hash, without the leading `#`. Settings at their defaults are left
 * out. The chart text is deflated into `z` where the browser can, and otherwise kept in `t`.
 */
export async function encodeHash(state: PageState): Promise<string> {
  const params = new URLSearchParams();
  if (state.theme !== defaultSettings.theme) params.set('theme', state.theme);
  if (state.cue !== defaultSettings.cue) params.set('cue', state.cue);
  if (state.diagnostics !== defaultSettings.diagnostics) params.set('diagnostics', 'off');
  const bytes = new TextEncoder().encode(state.text);
  if (canCompress()) {
    params.set('z', toBase64Url(await pipe(bytes, new CompressionStream('deflate-raw'))));
  } else {
    params.set('t', toBase64Url(bytes));
  }
  return params.toString();
}

/** Decodes a hash written by `encodeHash`, with or without its `#`. */
export async function decodeHash(hash: string): Promise<Partial<PageState>> {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const state: Partial<PageState> = readSettings({
    theme: params.get('theme') ?? undefined,
    cue: params.get('cue') ?? undefined,
    diagnostics: params.has('diagnostics') ? params.get('diagnostics') !== 'off' : undefined,
  });
  try {
    const z = params.get('z');
    const t = params.get('t');
    if (z !== null && canCompress()) {
      const bytes = await pipe(fromBase64Url(z), new DecompressionStream('deflate-raw'));
      state.text = new TextDecoder().decode(bytes);
    } else if (t !== null) {
      state.text = new TextDecoder().decode(fromBase64Url(t));
    }
  } catch {
    // A damaged link opens with its settings and without its text.
  }
  return state;
}

/** A file name for a chart's SVG, from its title when it has one. */
export function svgFileName(text: string): string {
  const title = /^\s*title\s+(.+?)\s*$/m.exec(text)?.[1] ?? '';
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `${slug || 'live-sequence-chart'}.svg`;
}
