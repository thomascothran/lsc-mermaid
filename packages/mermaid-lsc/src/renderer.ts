// Placeholder renderer: draws the chart frame and header tab only.
// Phase 2 replaces this with the layout and renderer from the proposal's
// "Rendering specification" section.

import type { LscDb } from './db.js';
import { configureSvgSize, type DrawDefinition } from './mermaid-adapter.js';

const SVG_NS = 'http://www.w3.org/2000/svg';
const WIDTH = 400;
const HEIGHT = 120;
const MARGIN = 8;

function el<K extends keyof SVGElementTagNameMap>(
  parent: Element,
  tag: K,
  attrs: Record<string, string | number>,
): SVGElementTagNameMap[K] {
  const node = parent.ownerDocument.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attrs)) node.setAttribute(name, String(value));
  parent.appendChild(node);
  return node;
}

export const draw: DrawDefinition = (_text, id, _version, diagram) => {
  const db = diagram.db as LscDb;
  const model = db.model;
  const svg = document.getElementById(id) as SVGSVGElement | null;
  if (!svg || !model) return;

  const root = el(svg, 'g', { class: 'lsc' });
  const universal = model.mode !== 'existential';
  el(root, 'rect', {
    class: `lsc-frame ${universal ? 'lsc-hot' : 'lsc-cold'}`,
    x: MARGIN,
    y: MARGIN,
    width: WIDTH - 2 * MARGIN,
    height: HEIGHT - 2 * MARGIN,
  });
  const heading = model.kind === 'subchart' ? 'Subchart' : 'LSC';
  const title = db.getDiagramTitle();
  const label = el(root, 'text', { class: 'lsc-tab-text', x: MARGIN + 8, y: MARGIN + 18 });
  label.textContent = title ? `${heading}: ${title}` : heading;

  configureSvgSize(svg, WIDTH, HEIGHT, db.getConfig().useMaxWidth);
};

export const renderer = { draw };
