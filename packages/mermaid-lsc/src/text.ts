// Text measurement without a DOM.
//
// The layout must run the same way in a browser, in jsdom (the command-line renderer) and in
// tests, so text widths are estimated from a fixed table instead of being measured. The table
// holds Helvetica advance widths (per 1000 em) for printable ASCII; the result is scaled up a
// little because Mermaid's default fonts (Trebuchet MS, Verdana) run wider than Helvetica.

const ASCII_WIDTHS = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278, 556, 556, 556,
  556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556, 1015, 667, 667, 722, 722, 667,
  611, 778, 722, 278, 500, 667, 556, 833, 722, 778, 667, 778, 722, 667, 611, 722, 667, 944, 667,
  667, 611, 278, 278, 278, 469, 556, 333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500,
  222, 833, 556, 556, 556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];

const SCALE = 1.1;

function charWidth(code: number): number {
  if (code >= 32 && code <= 126) return ASCII_WIDTHS[code - 32]!;
  // Wide East Asian characters and emoji take a full em; other characters a typical width.
  if ((code >= 0x1100 && code <= 0x115f) || (code >= 0x2e80 && code <= 0xa4cf)) return 1000;
  if ((code >= 0xac00 && code <= 0xd7a3) || (code >= 0xf900 && code <= 0xfaff)) return 1000;
  if ((code >= 0xff00 && code <= 0xff60) || code >= 0x1f300) return 1000;
  return 600;
}

/** Estimated width in pixels of one line of text at the given font size. */
export function textWidth(text: string, fontSize: number): number {
  let total = 0;
  for (const ch of text) total += charWidth(ch.codePointAt(0)!);
  return (total / 1000) * fontSize * SCALE;
}

/** Splits text at Mermaid-style `<br>` line breaks. */
export function textLines(text: string): string[] {
  return text.split(/<br\s*\/?>/i);
}

/** Width of the widest line of possibly multi-line text. */
export function blockWidth(lines: string[], fontSize: number): number {
  return Math.max(0, ...lines.map((l) => textWidth(l, fontSize)));
}

/** Breaks a line into lines no wider than `width`, at spaces where possible. */
export function wrapText(text: string, width: number, fontSize: number): string[] {
  const out: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && textWidth(candidate, fontSize) > width) {
      out.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) out.push(line);
  return out.length > 0 ? out : [''];
}
