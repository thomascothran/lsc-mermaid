// A DOM-free description of the SVG the renderer draws. The layout builds it, tests inspect it,
// and `appendScene` turns it into DOM nodes inside the SVG element Mermaid provides.

export type Attrs = Record<string, string | number | undefined>;

export interface SceneNode {
  tag: string;
  attrs: Attrs;
  /** Text content; set with `textContent`, so it is never parsed as markup. */
  text?: string;
  children?: SceneNode[];
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Rounds coordinates so the SVG output is stable and compact. */
export function num(value: number): number {
  return Math.round(value * 100) / 100;
}

export function node(tag: string, attrs: Attrs, children?: SceneNode[]): SceneNode {
  const n: SceneNode = { tag, attrs };
  if (children) n.children = children;
  return n;
}

export function textNode(attrs: Attrs, text: string): SceneNode {
  return { tag: 'text', attrs, text };
}

export function group(cls: string, children: SceneNode[] = []): SceneNode {
  return { tag: 'g', attrs: { class: cls }, children };
}

export function appendScene(parent: Element, scene: SceneNode): Element {
  const element = parent.ownerDocument.createElementNS(SVG_NS, scene.tag);
  for (const [name, value] of Object.entries(scene.attrs)) {
    if (value === undefined) continue;
    element.setAttribute(name, typeof value === 'number' ? String(num(value)) : value);
  }
  if (scene.text !== undefined) element.textContent = scene.text;
  for (const child of scene.children ?? []) appendScene(element, child);
  parent.appendChild(element);
  return element;
}

/** Depth-first search of a scene, for tests and post-processing. */
export function findAll(scene: SceneNode, test: (n: SceneNode) => boolean): SceneNode[] {
  const out: SceneNode[] = [];
  const visit = (n: SceneNode) => {
    if (test(n)) out.push(n);
    for (const c of n.children ?? []) visit(c);
  };
  visit(scene);
  return out;
}

export function hasClass(n: SceneNode, cls: string): boolean {
  const value = n.attrs.class;
  return typeof value === 'string' && value.split(/\s+/).includes(cls);
}
