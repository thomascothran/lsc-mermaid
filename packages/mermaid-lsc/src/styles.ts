// Colours come only from theme variables. The diagram's own variables default to values derived
// from Mermaid's standard ones and can be overridden through `themeVariables`.

import { FONT_SIZE, SMALL_FONT_SIZE } from './layout.js';

export interface LscThemeVariables {
  lscFrameColor?: string;
  lscHotColor?: string;
  lscColdColor?: string;
  lscConditionFill?: string;
  lineColor?: string;
  primaryColor?: string;
  mainBkg?: string;
  textColor?: string;
  background?: string;
  actorBkg?: string;
  actorBorder?: string;
  actorTextColor?: string;
  noteBkgColor?: string;
  noteBorderColor?: string;
  noteTextColor?: string;
  errorTextColor?: string;
  errorBkgColor?: string;
  fontFamily?: string;
  [key: string]: unknown;
}

const NAMED: Record<string, string> = { white: '#ffffff', black: '#000000' };

/** Mixes two colours given as `#rgb`, `#rrggbb`, `rgb()`, white or black; otherwise lets CSS mix them. */
export function mixColors(a: string, b: string, weight: number): string {
  const pa = parseColor(a);
  const pb = parseColor(b);
  if (!pa || !pb) return `color-mix(in srgb, ${a} ${Math.round(weight * 100)}%, ${b})`;
  const mix = pa.map((v, k) => Math.round(v * weight + pb[k]! * (1 - weight)));
  return `#${mix.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

function parseColor(c: string): number[] | undefined {
  const s = NAMED[c.trim().toLowerCase()] ?? c.trim().toLowerCase();
  let m = /^#([0-9a-f]{3})$/.exec(s);
  if (m) return [...m[1]!].map((h) => parseInt(h + h, 16));
  m = /^#([0-9a-f]{6})$/.exec(s);
  if (m) return [0, 2, 4].map((k) => parseInt(m![1]!.slice(k, k + 2), 16));
  m = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/.exec(s);
  if (m) return [m[1]!, m[2]!, m[3]!].map(Number);
  return undefined;
}

export function lscThemeVariables(o: LscThemeVariables) {
  const line = o.lineColor ?? '#333333';
  const text = o.textColor ?? line;
  const background = o.background ?? o.mainBkg ?? '#ffffff';
  const hot = o.lscHotColor ?? line;
  const cold = o.lscColdColor ?? line;
  return {
    frame: o.lscFrameColor ?? line,
    hot,
    cold,
    /** With `temperatureCue: line+color`: cold elements fade towards the background. */
    coldCue: o.lscColdColor ?? mixColors(line, background, 0.45),
    conditionFill: o.lscConditionFill ?? o.mainBkg ?? o.primaryColor ?? background,
    text,
    background,
    headFill: o.actorBkg ?? o.mainBkg ?? background,
    headBorder: o.actorBorder ?? line,
    headText: o.actorTextColor ?? text,
    noteFill: o.noteBkgColor ?? background,
    noteBorder: o.noteBorderColor ?? line,
    noteText: o.noteTextColor ?? text,
    error: o.errorTextColor ?? text,
    errorFill: o.errorBkgColor ?? background,
  };
}

export const styles = (options: LscThemeVariables): string => {
  const v = lscThemeVariables(options);
  const font = options.fontFamily ?? '"trebuchet ms", verdana, arial, sans-serif';
  return `
  .lsc text {
    font-family: ${font};
    font-size: ${FONT_SIZE}px;
    fill: ${v.text};
  }
  .lsc .lsc-frame, .lsc .lsc-subchart-frame, .lsc .lsc-divider {
    fill: none;
    stroke: ${v.frame};
    stroke-width: 1.5px;
  }
  .lsc .lsc-prechart {
    fill: none;
    stroke: ${v.frame};
    stroke-width: 1.5px;
    stroke-dasharray: 6 4;
  }
  .lsc .lsc-tab {
    fill: ${v.background};
    stroke: ${v.frame};
    stroke-width: 1.5px;
  }
  .lsc .lsc-subchart-tab-text, .lsc .lsc-note-text, .lsc .lsc-diag-text, .lsc .lsc-diag-badge-text {
    font-size: ${SMALL_FONT_SIZE}px;
  }
  .lsc .lsc-repeat {
    font-weight: bold;
  }
  .lsc .lsc-line, .lsc .lsc-msg, .lsc .lsc-timeout, .lsc .lsc-create, .lsc .lsc-destroy,
  .lsc .lsc-coregion, .lsc .lsc-actor {
    fill: none;
    stroke-width: 1.5px;
  }
  .lsc .lsc-hot { stroke: ${v.hot}; stroke-dasharray: none; }
  .lsc .lsc-cold { stroke: ${v.cold}; stroke-dasharray: 6 4; }
  .lsc .lsc-neutral, .lsc .lsc-timeout, .lsc .lsc-destroy, .lsc .lsc-actor {
    stroke: ${v.frame};
    stroke-dasharray: none;
  }
  .lsc.lsc-cue-color .lsc-cold { stroke: ${v.coldCue}; }
  .lsc .lsc-frame.lsc-hot, .lsc .lsc-frame.lsc-cold { stroke: ${v.frame}; }
  .lsc .lsc-coregion {
    stroke: ${v.frame};
    stroke-dasharray: 1.5 3;
    stroke-linecap: round;
  }
  .lsc .lsc-create, .lsc .lsc-activation {
    stroke: ${v.frame};
    stroke-dasharray: 6 4;
  }
  .lsc.lsc-cue-color .lsc-activation { stroke: ${v.coldCue}; }
  .lsc .lsc-arrowhead { stroke-width: 1.5px; stroke-dasharray: none; }
  .lsc .lsc-arrowhead.lsc-filled { fill: ${v.hot}; stroke: ${v.hot}; }
  .lsc .lsc-arrowhead.lsc-filled.lsc-cold { fill: ${v.cold}; stroke: ${v.cold}; }
  .lsc.lsc-cue-color .lsc-arrowhead.lsc-filled.lsc-cold { fill: ${v.coldCue}; stroke: ${v.coldCue}; }
  .lsc .lsc-arrowhead.lsc-filled.lsc-neutral { fill: ${v.frame}; stroke: ${v.frame}; }
  .lsc .lsc-arrowhead.lsc-open { fill: none; }
  .lsc .lsc-condition {
    fill: ${v.conditionFill};
    stroke-width: 1.5px;
  }
  .lsc .lsc-head {
    fill: ${v.headFill};
    stroke: ${v.headBorder};
    stroke-width: 1.5px;
  }
  .lsc .lsc-head-text { fill: ${v.headText}; }
  .lsc .lsc-note {
    fill: ${v.noteFill};
    stroke: ${v.noteBorder};
    stroke-width: 1px;
  }
  .lsc .lsc-note-text { fill: ${v.noteText}; }
  .lsc .lsc-badge {
    fill: ${v.background};
    stroke: ${v.cold};
    stroke-width: 1px;
  }
  .lsc .lsc-badge-text {
    font-size: 9px;
    font-weight: bold;
    fill: ${v.cold};
  }
  .lsc .lsc-diag-badge {
    fill: ${v.background};
    stroke: ${v.error};
    stroke-width: 1px;
  }
  .lsc .lsc-diag-badge-text { fill: ${v.error}; font-weight: bold; }
  .lsc .lsc-diag-text.lsc-diag-error { fill: ${v.error}; }
`;
};
