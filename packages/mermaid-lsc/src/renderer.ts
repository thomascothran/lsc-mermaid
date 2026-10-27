// Draws the chart into the SVG element Mermaid provides. All geometry comes from the DOM-free
// layout, so the drawing is the same in a browser and in the command-line renderer.

import type { LscDb } from './db.js';
import { layoutChart } from './layout.js';
import { configureSvgSize, type DrawDefinition } from './mermaid-adapter.js';
import { appendScene } from './scene.js';

export const draw: DrawDefinition = (_text, id, _version, diagram) => {
  const db = diagram.db as LscDb;
  const model = db.model;
  const svg = document.getElementById(id) as SVGSVGElement | null;
  if (!svg || !model) return;
  const config = db.getConfig();
  const title = db.getDiagramTitle();
  const { scene, viewBox } = layoutChart({
    model,
    config,
    ...(title ? { title } : {}),
    diagnostics: db.displayedDiagnostics(),
  });
  appendScene(svg, scene);
  configureSvgSize(svg, viewBox, config.useMaxWidth);
};

export const renderer = { draw };
