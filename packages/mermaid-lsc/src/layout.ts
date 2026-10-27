// Layout: turns an LSC model into a positioned scene, following "Rendering specification" in the
// proposal. It runs without a DOM, so the command-line renderer and the tests use the same code.
//
// Columns come from `Instance.column` and rows from `Location.row` and `Note.row`; the builder in
// lsc-model assigns both in text order. The layout gives each row a height, places the frames of
// subcharts and alternatives around their rows, and draws every element on its row.

import {
  locKey,
  type Alternative,
  type Barrier,
  type Condition,
  type Diagnostic,
  type EventSpec,
  type Instance,
  type LocRef,
  type Location,
  type LscChart,
  type Message,
  type Note,
  type Region,
  type Subchart,
  type Temp,
} from 'lsc-model';
import type { LscConfig } from './config.js';
import { group, node, textNode, type SceneNode } from './scene.js';
import { blockWidth, textLines, textWidth, wrapText } from './text.js';

export interface LayoutInput {
  model: LscChart;
  config: LscConfig;
  /** The title to show; Mermaid's front-matter title when the chart has none of its own. */
  title?: string;
  /** Diagnostics to mark; their lines are counted as in the model's spans. */
  diagnostics?: Diagnostic[];
}

export interface ViewBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  scene: SceneNode;
  viewBox: ViewBox;
}

// ---- Metrics ------------------------------------------------------------------------------------

export const FONT_SIZE = 14;
export const SMALL_FONT_SIZE = 12;
const LINE_H = 17;
const SMALL_LINE_H = 15;
const HEAD_MIN_W = 64;
const HEAD_MIN_H = 32;
const HEAD_PAD_X = 12;
const ACTOR_FIGURE_H = 26;
const FRAME_PAD = 20;
const NEST_PAD = 10;
const TAB_PAD_X = 8;
const TAB_PAD_Y = 4;
const TAB_INDENT = 12;
const HEX_H = 24;
const HEX_TIP = 10;
const HEX_OUT = 14;
const HEX_TEXT_PAD = 6;
const PRECHART_INSET = 26;
const LOOP_W = 20;
const SELF_H = 14;
const TIMEOUT_H = 12;
const ARROW_LEN = 9;
const ARROW_HALF = 4;
const LABEL_PAD = 10;
const NOTE_PAD = 6;
const NOTE_GAP = 10;
const NOTE_OUT = 12;
const CO_OFFSET = 6;
const ACTIVATION_H = 44;
const DESTROY_R = 7;
const BADGE_R = 6;
const MARKER_GAP = 14;
const PADDING = 8;

// ---- Internal structures ------------------------------------------------------------------------

interface Block {
  id: string;
  kind: 'subchart' | 'alt';
  /** The chart itself, for a chart with the `subchart` header: drawn as the chart frame. */
  isChart: boolean;
  depth: number;
  name?: string;
  elseName?: string;
  hasElse: boolean;
  repeat?: string;
  entryRow: number;
  exitRow: number;
  dividerRow?: number;
  guard?: Condition;
  participants: Set<string>;
  /** Local instances whose head is drawn below the frame top (subchart) or after the guard (alt). */
  locals: string[];
  elseLocals: string[];
  children: Block[];
  top: number;
  bottom: number;
  divider: number;
  left: number;
  right: number;
}

interface MessageItem {
  m: Message;
  /** Row of the label: the send row, or the receive row of a message from `env`. */
  row: number;
  sendRow?: number;
  receiveRow?: number;
  fromCol?: number;
  toCol?: number;
  self: boolean;
  envSide?: 'left' | 'right';
  lines: string[];
  width: number;
}

interface ConditionItem {
  c: Condition;
  row: number;
  lo: number;
  hi: number;
  lines: string[];
  width: number;
  attachedTo?: Block;
}

interface Segment {
  y1: number;
  y2: number;
  style: Temp | 'neutral';
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const cls = (...names: (string | false | undefined)[]) => names.filter(Boolean).join(' ');

function exprLabel(text: string): string[] {
  return textLines(text.replace(/\s+/g, ' ').trim());
}

function eventSpecText(e: EventSpec): string {
  const dir = e.dir === '!' ? 'send ' : e.dir === '?' ? 'receive ' : '';
  return `${dir}${e.from} ${e.kind === 'synch' ? '->>' : '-)'} ${e.to}: ${e.name}`;
}

function repeatText(repeat: Subchart['repeat']): string | undefined {
  return repeat === undefined ? undefined : String(repeat);
}

// ---- Layout -------------------------------------------------------------------------------------

export function layoutChart(input: LayoutInput): Layout {
  return new ChartLayout(input).run();
}

class ChartLayout {
  private readonly model: LscChart;
  private readonly config: LscConfig;
  private readonly lifetimes = new Map<string, Instance>();
  private readonly locations = new Map<string, Location>();
  private readonly conditions = new Map<string, Condition>();
  private readonly barriers = new Map<string, Barrier>();
  private readonly nCols: number;
  private readonly colWidth: number[] = [];
  private readonly x: number[] = [];

  private readonly blocks: Block[] = [];
  private readonly rootBlocks: Block[] = [];
  private chartBlock: Block | undefined;
  private maxRow = 0;
  private prechartLastRow = -1;

  private readonly messageItems: MessageItem[] = [];
  private readonly conditionItems: ConditionItem[] = [];
  private readonly guardItems = new Map<string, ConditionItem>();
  private readonly notesByRow = new Map<number, Note[]>();

  // Vertical positions.
  private readonly rowY = new Map<number, number>();
  private readonly locY = new Map<string, number>();
  private readonly noteTop = new Map<string, number>();
  private readonly headTop = new Map<string, number>();
  private readonly headH = new Map<string, number>();
  private headRowTop = 0;
  private headRowBottom = 0;
  private activationTop = 0;
  private tabTop = 0;
  private containerTop = 0;
  private bodyTop = 0;
  private linesEnd = 0;
  private mirrorTop = 0;
  private frameBottom = 0;
  private frameLeft = 0;
  private frameRight = 0;
  private tabLines: string[] = [];
  private tabX = 0;

  private readonly labelBoxes: Box[] = [];
  private readonly bounds = { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity };

  constructor(private readonly input: LayoutInput) {
    this.model = input.model;
    this.config = input.config;
    for (const i of this.model.instances) {
      this.lifetimes.set(i.id, i);
      for (const l of i.locations) this.locations.set(locKey(l.ref), l);
    }
    for (const c of this.model.conditions) this.conditions.set(c.id, c);
    for (const b of this.model.barriers) this.barriers.set(b.id, b);
    this.nCols = Math.max(0, ...this.model.instances.map((i) => i.column + 1));
    for (let c = 0; c < this.nCols; c++) this.colWidth[c] = HEAD_MIN_W;
    for (const i of this.model.instances) {
      this.colWidth[i.column] = Math.max(this.colWidth[i.column]!, this.headWidth(i));
    }
  }

  run(): Layout {
    this.collect();
    this.placeColumns();
    this.placeRows();
    this.placeFrames();
    const scene = this.draw();
    const b = this.bounds;
    const viewBox: ViewBox = {
      x: b.x1 - PADDING,
      y: b.y1 - PADDING,
      width: b.x2 - b.x1 + 2 * PADDING,
      height: b.y2 - b.y1 + 2 * PADDING,
    };
    return { scene, viewBox };
  }

  // ---- Lookups ----

  private loc(ref: LocRef | undefined): Location | undefined {
    return ref ? this.locations.get(locKey(ref)) : undefined;
  }

  private col(lifetime: string): number | undefined {
    return this.lifetimes.get(lifetime)?.column;
  }

  private colX(lifetime: string): number {
    return this.x[this.col(lifetime) ?? 0] ?? 0;
  }

  private headLines(i: Instance): string[] {
    return textLines(i.label);
  }

  private headWidth(i: Instance): number {
    return Math.max(HEAD_MIN_W, blockWidth(this.headLines(i), FONT_SIZE) + 2 * HEAD_PAD_X);
  }

  private headHeight(i: Instance): number {
    const text = this.headLines(i).length * LINE_H;
    return i.head === 'actor' ? ACTOR_FIGURE_H + text + 4 : Math.max(HEAD_MIN_H, text + 12);
  }

  private barrierRow(id: string): number | undefined {
    return this.loc(this.barriers.get(id)?.locations[0])?.row;
  }

  private extend(x1: number, y1: number, x2 = x1, y2 = y1): void {
    const b = this.bounds;
    b.x1 = Math.min(b.x1, x1, x2);
    b.y1 = Math.min(b.y1, y1, y2);
    b.x2 = Math.max(b.x2, x1, x2);
    b.y2 = Math.max(b.y2, y1, y2);
  }

  // ---- Collection ----

  private collect(): void {
    const occupied = new Set<number>();
    for (const i of this.model.instances) {
      for (const l of i.locations) {
        this.maxRow = Math.max(this.maxRow, l.row);
        if (l.ref.index > 0) occupied.add(l.row);
        if (l.ref.part === 'prechart') this.prechartLastRow = Math.max(this.prechartLastRow, l.row);
      }
    }
    for (const n of this.model.notes) {
      this.maxRow = Math.max(this.maxRow, n.row);
      occupied.add(n.row);
      const list = this.notesByRow.get(n.row) ?? [];
      list.push(n);
      this.notesByRow.set(n.row, list);
    }

    const visit = (region: Region, depth: number, out: Block[]) => {
      for (const item of region.items) {
        if (item.kind === 'subchart') {
          const block = this.subchartBlock(item, depth);
          if (block) out.push(block);
          visit(item.body, depth + 1, block?.children ?? out);
        } else if (item.kind === 'alt') {
          const block = this.altBlock(item, depth);
          visit(item.then.body, depth + 1, block?.children ?? out);
          if (block && item.else) {
            for (let r = block.entryRow + 1; r < block.exitRow; r++) {
              if (!occupied.has(r)) {
                block.dividerRow = r;
                occupied.add(r);
                break;
              }
            }
          }
          if (item.else) visit(item.else.body, depth + 1, block?.children ?? out);
          if (block) out.push(block);
        }
      }
    };
    const first = this.model.body.items[0];
    if (this.model.kind === 'subchart' && first?.kind === 'subchart') {
      this.chartBlock = this.subchartBlock(first, -1);
      if (this.chartBlock) this.chartBlock.isChart = true;
      visit(first.body, 0, this.rootBlocks);
    } else {
      visit(this.model.body, 0, this.rootBlocks);
    }
    if (this.model.prechart) visit(this.model.prechart, 0, this.rootBlocks);
    const all = (list: Block[]) => {
      for (const b of list) {
        this.blocks.push(b);
        all(b.children);
      }
    };
    all(this.rootBlocks);

    // Messages.
    for (const m of this.model.messages) {
      const send = this.loc(m.send);
      const receive = this.loc(m.receive);
      const row = send?.row ?? receive?.row;
      if (row === undefined) continue;
      const lines = textLines(m.text);
      const item: MessageItem = {
        m,
        row,
        self: m.from === m.to,
        lines,
        width: blockWidth(lines, FONT_SIZE),
      };
      if (send) item.sendRow = send.row;
      if (receive) item.receiveRow = receive.row;
      const fromCol = this.col(m.from);
      const toCol = this.col(m.to);
      if (fromCol !== undefined) item.fromCol = fromCol;
      if (toCol !== undefined) item.toCol = toCol;
      const known = fromCol ?? toCol;
      if ((m.from === 'env' || m.to === 'env') && known !== undefined) {
        item.envSide = known <= (this.nCols - 1) / 2 ? 'left' : 'right';
      }
      this.messageItems.push(item);
    }

    // Conditions. A guard is drawn over the instances written in it, as in the paper's figures.
    const guardOf = new Map<string, Block>();
    for (const b of [...this.blocks, ...(this.chartBlock ? [this.chartBlock] : [])]) {
      if (b.guard) guardOf.set(b.guard.id, b);
    }
    for (const c of this.model.conditions) {
      const row = this.loc(c.locations[0])?.row;
      if (row === undefined) continue;
      const block = guardOf.get(c.id);
      const drawn = block ? c.instances : c.sharedBy;
      const cols = drawn.map((id) => this.col(id)).filter((v): v is number => v !== undefined);
      if (cols.length === 0) continue;
      const lines = exprLabel(c.text);
      const item: ConditionItem = {
        c,
        row,
        lo: Math.min(...cols),
        hi: Math.max(...cols),
        lines,
        width: blockWidth(lines, FONT_SIZE),
      };
      if (block && !block.isChart && block.kind === 'subchart' && block.locals.length === 0) {
        item.attachedTo = block;
      }
      if (block && !block.isChart && block.kind === 'alt') item.attachedTo = block;
      if (block) this.guardItems.set(c.id, item);
      this.conditionItems.push(item);
    }
  }

  private newBlock(
    id: string,
    kind: Block['kind'],
    depth: number,
    entryRow: number,
    exitRow: number,
  ): Block {
    return {
      id,
      kind,
      isChart: false,
      depth,
      hasElse: false,
      entryRow,
      exitRow,
      participants: new Set(),
      locals: [],
      elseLocals: [],
      children: [],
      top: 0,
      bottom: 0,
      divider: 0,
      left: 0,
      right: 0,
    };
  }

  private subchartBlock(sub: Subchart, depth: number): Block | undefined {
    const entryRow = this.barrierRow(sub.entry);
    const exitRow = this.barrierRow(sub.exit);
    if (entryRow === undefined || exitRow === undefined) return undefined;
    const block = this.newBlock(sub.id, 'subchart', depth, entryRow, exitRow);
    if (sub.name !== undefined) block.name = sub.name;
    const repeat = repeatText(sub.repeat);
    if (repeat !== undefined) block.repeat = repeat;
    if (sub.guard) block.guard = this.conditions.get(sub.guard);
    block.locals = [...sub.localInstances];
    for (const id of [
      ...sub.instances,
      ...(this.barriers.get(sub.entry)?.instances ?? []),
      ...(this.barriers.get(sub.exit)?.instances ?? []),
    ]) {
      block.participants.add(id);
    }
    return block;
  }

  private altBlock(alt: Alternative, depth: number): Block | undefined {
    const entryRow = this.barrierRow(alt.then.entry);
    const exitRow = this.barrierRow(alt.then.exit);
    if (entryRow === undefined || exitRow === undefined) return undefined;
    const block = this.newBlock(alt.id, 'alt', depth, entryRow, exitRow);
    if (alt.then.name !== undefined) block.name = alt.then.name;
    if (alt.else?.name !== undefined) block.elseName = alt.else.name;
    block.hasElse = alt.else !== undefined;
    block.guard = this.conditions.get(alt.guard);
    block.locals = [...alt.then.localInstances];
    block.elseLocals = [...(alt.else?.localInstances ?? [])];
    for (const sub of [alt.then, ...(alt.else ? [alt.else] : [])]) {
      for (const id of [
        ...sub.instances,
        ...(this.barriers.get(sub.entry)?.instances ?? []),
        ...(this.barriers.get(sub.exit)?.instances ?? []),
      ]) {
        block.participants.add(id);
      }
    }
    return block;
  }

  // ---- Columns ----

  private conditionWidth(item: ConditionItem): number {
    return item.width + 2 * HEX_TIP + 2 * HEX_TEXT_PAD;
  }

  private noteWidth(n: Note): number {
    return blockWidth(textLines(n.text), SMALL_FONT_SIZE) + 2 * NOTE_PAD;
  }

  private placeColumns(): void {
    const n = this.nCols;
    if (n === 0) return;
    const gaps: number[] = [];
    for (let c = 0; c < n - 1; c++) {
      gaps[c] = this.colWidth[c]! / 2 + this.colWidth[c + 1]! / 2 + this.config.instanceSpacing;
    }
    const needs: { a: number; b: number; d: number }[] = [];
    const between = (c1: number, c2: number, d: number) => {
      if (c1 !== c2) needs.push({ a: Math.min(c1, c2), b: Math.max(c1, c2), d });
    };
    const rightOf = (c: number, d: number) => {
      if (c < n - 1) between(c, c + 1, d);
    };
    const leftOf = (c: number, d: number) => {
      if (c > 0) between(c - 1, c, d);
    };

    for (const item of this.messageItems) {
      if (item.self && item.fromCol !== undefined) {
        rightOf(item.fromCol, LOOP_W + 6 + item.width + LABEL_PAD);
      } else if (item.fromCol !== undefined && item.toCol !== undefined) {
        between(item.fromCol, item.toCol, item.width + 2 * LABEL_PAD + ARROW_LEN);
      }
    }
    for (const i of this.model.instances) {
      for (const l of i.locations) {
        if (l.label.timeout !== undefined) {
          rightOf(i.column, LOOP_W + 6 + textWidth(l.label.timeout, FONT_SIZE) + LABEL_PAD);
        }
        if (l.label.create) {
          const created = this.lifetimes.get(l.label.create);
          if (created) {
            between(
              i.column,
              created.column,
              this.headWidth(created) / 2 + textWidth('new', FONT_SIZE) + 3 * LABEL_PAD,
            );
          }
        }
      }
    }
    for (const item of this.conditionItems) {
      const w = this.conditionWidth(item);
      if (item.lo === item.hi) {
        leftOf(item.lo, w / 2 + LABEL_PAD);
        rightOf(item.lo, w / 2 + LABEL_PAD);
      } else {
        between(item.lo, item.hi, w - 2 * HEX_OUT);
      }
    }
    for (const note of this.model.notes) {
      const w = this.noteWidth(note);
      const p = note.placement;
      if ('over' in p) {
        const cols = p.over.map((id) => this.col(id)).filter((v): v is number => v !== undefined);
        if (cols.length === 0) continue;
        const lo = Math.min(...cols);
        const hi = Math.max(...cols);
        if (lo === hi) {
          leftOf(lo, w / 2 + LABEL_PAD);
          rightOf(lo, w / 2 + LABEL_PAD);
        } else {
          between(lo, hi, w - 2 * NOTE_OUT);
        }
      } else if ('leftOf' in p) {
        const c = this.col(p.leftOf);
        if (c !== undefined) leftOf(c, w + NOTE_GAP + LABEL_PAD);
      } else {
        const c = this.col(p.rightOf);
        if (c !== undefined) rightOf(c, w + NOTE_GAP + LABEL_PAD);
      }
    }

    needs.sort((p, q) => p.b - p.a - (q.b - q.a));
    for (const { a, b, d } of needs) {
      let current = 0;
      for (let c = a; c < b; c++) current += gaps[c]!;
      if (current < d) {
        const add = (d - current) / (b - a);
        for (let c = a; c < b; c++) gaps[c]! += add;
      }
    }
    this.x[0] = 0;
    for (let c = 1; c < n; c++) this.x[c] = this.x[c - 1]! + gaps[c - 1]!;
  }

  // ---- Rows ----

  private tabHeight(lines: number, small: boolean): number {
    return lines * (small ? SMALL_LINE_H : LINE_H) + 2 * TAB_PAD_Y;
  }

  private chartTabLines(): string[] {
    const m = this.model;
    const lines: string[] = [];
    const heading = m.kind === 'subchart' ? 'Subchart' : 'LSC';
    const title = this.input.title;
    const hasTitle = title !== undefined && title !== '';
    const ac = m.activation?.conditionText;
    const visible = this.config.showVisibleEvents ? m.visibleEvents.map(eventSpecText) : [];
    if (!hasTitle && ac === undefined && visible.length === 0 && m.kind !== 'subchart') return [];
    lines.push(hasTitle ? `${heading}: ${title}` : heading);
    if (ac !== undefined) lines.push(`AC: ${ac.replace(/\s+/g, ' ')}`);
    visible.forEach((v, i) => lines.push(i === 0 ? `visible: ${v}` : v));
    return lines;
  }

  private headRowHeight(ids: string[]): number {
    let h = 0;
    for (const id of ids) {
      const i = this.lifetimes.get(id);
      if (i) h = Math.max(h, this.headHeight(i));
    }
    return h;
  }

  /** Places heads with their bottoms aligned at `bottom`. */
  private placeHeads(ids: string[], bottom: number): void {
    for (const id of ids) {
      const i = this.lifetimes.get(id);
      if (!i) continue;
      const h = this.headHeight(i);
      this.headH.set(id, h);
      this.headTop.set(id, bottom - h);
      this.setLoc0(i, bottom);
    }
  }

  private setLoc0(i: Instance, y: number): void {
    for (const l of i.locations) {
      if (l.ref.index === 0 && !this.locY.has(locKey(l.ref))) this.locY.set(locKey(l.ref), y);
    }
  }

  private placeRows(): void {
    const m = this.model;
    const rowHeight = this.config.rowHeight;
    let y = 0;
    if (m.activation?.message) {
      this.activationTop = y;
      y += ACTIVATION_H;
    }
    this.tabLines = this.chartTabLines();
    this.tabTop = y;
    if (this.tabLines.length > 0) y += this.tabHeight(this.tabLines.length, false);
    this.containerTop = y;
    y += 10;

    // Heads of the lifetimes present from the start.
    const initial = m.instances.filter((i) => i.scope === 'chart' && !i.createdAt);
    this.headRowTop = y;
    y += this.headRowHeight(initial.map((i) => i.id));
    this.headRowBottom = y;
    for (const i of initial) {
      const h = this.headHeight(i);
      this.headH.set(i.id, h);
      this.headTop.set(i.id, y - h);
      for (const l of i.locations) {
        if (l.ref.index === 0 && (l.ref.part === 'prechart' || !m.prechart)) {
          this.locY.set(locKey(l.ref), y);
        }
      }
    }
    y += 6;

    // Rows grouped by what they hold.
    const openings = new Map<number, Block[]>();
    const closings = new Map<number, Block[]>();
    const dividers = new Map<number, Block>();
    const allBlocks = [...this.blocks, ...(this.chartBlock ? [this.chartBlock] : [])];
    for (const b of allBlocks) {
      openings.set(b.entryRow, [...(openings.get(b.entryRow) ?? []), b]);
      closings.set(b.exitRow, [...(closings.get(b.exitRow) ?? []), b]);
      if (b.dividerRow !== undefined) dividers.set(b.dividerRow, b);
    }
    for (const list of openings.values()) list.sort((p, q) => p.depth - q.depth);
    for (const list of closings.values()) list.sort((p, q) => q.depth - p.depth);

    const rowLocations = new Map<number, Location[]>();
    for (const i of m.instances) {
      for (const l of i.locations) {
        if (l.ref.index === 0) continue;
        rowLocations.set(l.row, [...(rowLocations.get(l.row) ?? []), l]);
      }
    }
    const messagesByRow = new Map<number, MessageItem[]>();
    for (const item of this.messageItems) {
      messagesByRow.set(item.row, [...(messagesByRow.get(item.row) ?? []), item]);
    }

    const localHeads = (ids: string[]) => {
      if (ids.length === 0) return;
      y += 4;
      const h = this.headRowHeight(ids);
      this.placeHeads(ids, y + h);
      y += h + 6;
    };

    let bodyStarted = !m.prechart;
    const startBody = () => {
      if (bodyStarted) return;
      bodyStarted = true;
      y += 12;
      this.bodyTop = y;
      for (const i of m.instances) {
        for (const l of i.locations) {
          if (l.ref.part === 'body' && l.ref.index === 0 && !this.locY.has(locKey(l.ref))) {
            if (!i.createdAt || this.loc(i.createdAt)?.ref.part === 'prechart') {
              this.locY.set(locKey(l.ref), y);
            }
          }
        }
      }
      y += 10;
    };

    for (let r = 1; r <= this.maxRow; r++) {
      if (r > this.prechartLastRow) startBody();
      const locs = rowLocations.get(r) ?? [];
      const opening = openings.get(r) ?? [];
      const closing = closings.get(r) ?? [];

      for (const b of opening) {
        if (b.isChart) {
          b.top = y;
          continue;
        }
        y += this.tabHeight(1, true) + 2;
        b.top = y;
        y += 6;
        if (b.kind === 'subchart') localHeads(b.locals);
      }

      const guarded = opening.find((b) => b.guard && this.guardItems.get(b.guard.id)?.attachedTo);
      const content = locs.filter((l) => !(l.label.barrier && !l.label.condition));
      if (guarded) {
        const lineY = guarded.top + HEX_H / 2;
        this.rowY.set(r, lineY);
        y = lineY + HEX_H / 2 + 8;
      } else if (content.length > 0 || messagesByRow.has(r)) {
        let above = 8;
        let below = 8;
        for (const item of messagesByRow.get(r) ?? []) {
          above = Math.max(above, item.lines.length * LINE_H + 6);
          if (item.self) below = Math.max(below, SELF_H + 8);
        }
        for (const l of content) {
          if (l.label.condition) {
            above = Math.max(above, HEX_H / 2 + 6);
            below = Math.max(below, HEX_H / 2 + 8);
          }
          if (l.label.timeout !== undefined) below = Math.max(below, TIMEOUT_H + 8);
          if (l.label.create) {
            const created = this.lifetimes.get(l.label.create);
            const h = created ? this.headHeight(created) : HEAD_MIN_H;
            above = Math.max(above, h / 2 + 4, LINE_H + 6);
            below = Math.max(below, h / 2 + 6);
          }
          if (l.label.destroy) {
            above = Math.max(above, DESTROY_R + 4);
            below = Math.max(below, DESTROY_R + 4);
          }
        }
        above = Math.max(above, rowHeight - below);
        const lineY = y + above;
        this.rowY.set(r, lineY);
        y = lineY + below;
        for (const l of content) {
          if (!l.label.create) continue;
          const created = this.lifetimes.get(l.label.create);
          if (!created) continue;
          const h = this.headHeight(created);
          this.headH.set(created.id, h);
          this.headTop.set(created.id, lineY - h / 2);
          this.setLoc0(created, lineY + h / 2);
        }
      }
      if (this.rowY.has(r)) {
        for (const l of content) this.locY.set(locKey(l.ref), this.rowY.get(r)!);
      }
      for (const b of opening) {
        if (b.isChart && !b.guard) this.setBarrierY(r, y);
        else if (!b.isChart && !b.guard) this.setBarrierY(r, b.top);
        if (b.kind === 'alt') localHeads(b.locals);
      }

      const divider = dividers.get(r);
      if (divider) {
        y += 6 + this.tabHeight(1, true);
        divider.divider = y;
        y += 8;
        localHeads(divider.elseLocals);
      }

      for (const note of this.notesByRow.get(r) ?? []) {
        y += 6;
        this.noteTop.set(note.id, y);
        y += this.noteHeight(note) + 6;
      }

      for (const b of closing) {
        if (b.isChart) {
          b.bottom = y + 8;
          this.setBarrierY(r, b.bottom);
          continue;
        }
        y += 10;
        b.bottom = y;
        this.setBarrierY(r, y);
        y += 4;
      }
    }
    startBody();

    y += 12;
    this.linesEnd = y;
    if (this.config.mirrorInstances) {
      this.mirrorTop = y;
      y += this.headRowHeight(this.mirrored().map((i) => i.id)) + 2;
    }
    this.frameBottom = y + 8;
    if (this.chartBlock) this.chartBlock.bottom = this.frameBottom;
  }

  private setBarrierY(row: number, y: number): void {
    for (const i of this.model.instances) {
      for (const l of i.locations) {
        if (l.row === row && l.label.barrier && !l.label.condition) this.locY.set(locKey(l.ref), y);
      }
    }
  }

  private noteHeight(n: Note): number {
    return textLines(n.text).length * SMALL_LINE_H + 2 * NOTE_PAD;
  }

  private mirrored(): Instance[] {
    const last = new Map<number, Instance>();
    for (const i of this.model.instances) {
      if (i.scope === 'chart') last.set(i.column, i);
    }
    return [...last.values()].filter((i) => !i.destroyedAt);
  }

  // ---- Frames ----

  private rowExtents(): Map<number, [number, number]> {
    const ext = new Map<number, [number, number]>();
    const add = (row: number, lo: number, hi: number) => {
      const e = ext.get(row);
      ext.set(row, e ? [Math.min(e[0], lo), Math.max(e[1], hi)] : [lo, hi]);
    };
    for (const i of this.model.instances) {
      const x = this.x[i.column]!;
      for (const l of i.locations) {
        if (l.ref.index > 0) add(l.row, x - FRAME_PAD, x + FRAME_PAD);
        if (l.label.timeout !== undefined) {
          add(l.row, x, x + LOOP_W + 6 + textWidth(l.label.timeout, FONT_SIZE) + 8);
        }
        if (l.label.create) {
          const created = this.lifetimes.get(l.label.create);
          if (created) {
            const cx = this.x[created.column]!;
            add(l.row, cx - this.headWidth(created) / 2 - 8, cx + this.headWidth(created) / 2 + 8);
          }
        }
      }
    }
    for (const item of this.messageItems) {
      if (item.self && item.fromCol !== undefined) {
        const x = this.x[item.fromCol]!;
        add(item.row, x, x + LOOP_W + 6 + item.width + 8);
      }
    }
    for (const item of this.conditionItems) {
      const [x1, x2] = this.conditionSpan(item);
      add(item.row, x1 - 8, x2 + 8);
    }
    for (const note of this.model.notes) {
      const box = this.noteBox(note);
      if (box) add(note.row, box.x - 8, box.x + box.width + 8);
    }
    return ext;
  }

  private placeFrames(): void {
    const ext = this.rowExtents();
    const extentOf = (b: Block): void => {
      let lo = Infinity;
      let hi = -Infinity;
      for (const id of b.participants) {
        const x = this.colX(id);
        lo = Math.min(lo, x - FRAME_PAD);
        hi = Math.max(hi, x + FRAME_PAD);
      }
      for (let r = b.entryRow; r <= b.exitRow; r++) {
        const e = ext.get(r);
        if (e) {
          lo = Math.min(lo, e[0]);
          hi = Math.max(hi, e[1]);
        }
      }
      for (const id of [...b.locals, ...b.elseLocals]) {
        const i = this.lifetimes.get(id);
        if (!i) continue;
        lo = Math.min(lo, this.colX(id) - this.headWidth(i) / 2 - 8);
        hi = Math.max(hi, this.colX(id) + this.headWidth(i) / 2 + 8);
      }
      for (const child of b.children) {
        extentOf(child);
        lo = Math.min(lo, child.left - NEST_PAD);
        hi = Math.max(hi, child.right + NEST_PAD);
      }
      if (!Number.isFinite(lo)) {
        lo = 0;
        hi = 2 * FRAME_PAD;
      }
      const tabs = Math.max(
        this.subchartTabWidth(b.name, b.repeat),
        b.hasElse ? this.subchartTabWidth(b.elseName, undefined) : 0,
      );
      hi = Math.max(hi, lo + TAB_INDENT + tabs + TAB_INDENT);
      // Keep the frame's edges clear of the lines of instances that don't take part.
      for (let c = 0; c < this.nCols; c++) {
        const x = this.x[c]!;
        const outside = this.model.instances.every(
          (i) => i.column !== c || !b.participants.has(i.id),
        );
        if (!outside) continue;
        if (Math.abs(x - lo) < 10) lo = x - 14;
        if (Math.abs(x - hi) < 10) hi = x + 14;
      }
      b.left = lo;
      b.right = hi;
    };
    for (const b of this.rootBlocks) extentOf(b);

    // The chart frame holds every column, row and block.
    let lo = Infinity;
    let hi = -Infinity;
    for (let c = 0; c < this.nCols; c++) {
      lo = Math.min(lo, this.x[c]! - this.colWidth[c]! / 2 - FRAME_PAD);
      hi = Math.max(hi, this.x[c]! + this.colWidth[c]! / 2 + FRAME_PAD);
    }
    for (const [, [a, b]] of ext) {
      lo = Math.min(lo, a - FRAME_PAD / 2);
      hi = Math.max(hi, b + FRAME_PAD / 2);
    }
    for (const b of this.rootBlocks) {
      lo = Math.min(lo, b.left - NEST_PAD);
      hi = Math.max(hi, b.right + NEST_PAD);
    }
    for (const item of this.messageItems) {
      const c = item.fromCol ?? item.toCol;
      if (item.envSide === undefined || c === undefined) continue;
      const need = item.width + 2 * LABEL_PAD + ARROW_LEN;
      if (item.envSide === 'left') lo = Math.min(lo, this.x[c]! - need);
      else hi = Math.max(hi, this.x[c]! + need);
    }
    if (!Number.isFinite(lo)) {
      lo = 0;
      hi = 120;
    }
    if (this.model.prechart) {
      lo -= PRECHART_INSET;
      hi += PRECHART_INSET;
    }
    const tabW = this.tabLines.length > 0 ? this.chartTabWidth() : 0;
    hi = Math.max(hi, lo + TAB_INDENT + tabW + TAB_INDENT);
    this.frameLeft = lo;
    this.frameRight = hi;
    if (this.chartBlock) {
      this.chartBlock.left = lo;
      this.chartBlock.right = hi;
    }
    this.tabX = this.chartTabX(tabW);
  }

  private chartTabWidth(): number {
    return blockWidth(this.tabLines, FONT_SIZE) + 2 * TAB_PAD_X;
  }

  /** Keeps the header tab clear of the dashed activation lines above the frame. */
  private chartTabX(tabW: number): number {
    const inset = this.model.prechart ? PRECHART_INSET : 0;
    const start = this.frameLeft + inset + TAB_INDENT;
    const spec = this.model.activation?.message;
    if (!spec) return start;
    const xs = [spec.from, spec.to]
      .filter((id) => id !== 'env')
      .map((id) => this.colX(id))
      .sort((a, b) => a - b);
    const clear = (x: number) => xs.every((ex) => ex < x - 6 || ex > x + tabW + 6);
    if (clear(start)) return start;
    // Prefer the space left of the dashed lines, then the space right of each.
    const left = xs[0]! - 12 - tabW;
    if (left >= this.frameLeft + inset && clear(left)) return left;
    for (const ex of xs) if (clear(ex + 12)) return ex + 12;
    return xs.at(-1)! + 12;
  }

  private subchartTabWidth(name: string | undefined, repeat: string | undefined): number {
    const label = name !== undefined && name !== '' ? `Subchart: ${name}` : 'Subchart';
    const extra = repeat !== undefined ? textWidth(repeat, FONT_SIZE) + 10 : 0;
    return textWidth(label, SMALL_FONT_SIZE) + 2 * TAB_PAD_X + extra;
  }

  private conditionSpan(item: ConditionItem): [number, number] {
    const w = this.conditionWidth(item);
    const xl = this.x[item.lo]!;
    const xh = this.x[item.hi]!;
    if (item.lo === item.hi) return [xl - w / 2, xl + w / 2];
    const span = xh - xl + 2 * HEX_OUT;
    const extra = Math.max(0, w - span) / 2;
    return [xl - HEX_OUT - extra, xh + HEX_OUT + extra];
  }

  private noteBox(n: Note): Box | undefined {
    const w = this.noteWidth(n);
    const h = this.noteHeight(n);
    const y = this.noteTop.get(n.id) ?? 0;
    const p = n.placement;
    if ('over' in p) {
      const xs = p.over.filter((id) => this.col(id) !== undefined).map((id) => this.colX(id));
      if (xs.length === 0) return undefined;
      const lo = Math.min(...xs);
      const hi = Math.max(...xs);
      if (lo === hi) return { x: lo - w / 2, y, width: w, height: h };
      const span = hi - lo + 2 * NOTE_OUT;
      const width = Math.max(span, w);
      return { x: (lo + hi) / 2 - width / 2, y, width, height: h };
    }
    if ('leftOf' in p) {
      if (this.col(p.leftOf) === undefined) return undefined;
      return { x: this.colX(p.leftOf) - NOTE_GAP - w, y, width: w, height: h };
    }
    if (this.col(p.rightOf) === undefined) return undefined;
    return { x: this.colX(p.rightOf) + NOTE_GAP, y, width: w, height: h };
  }

  /** The x of the chart's left or right edge at height y; slanted beside the pre-chart. */
  private edgeX(side: 'left' | 'right', y: number): number {
    const edge = side === 'left' ? this.frameLeft : this.frameRight;
    if (!this.model.prechart || y >= this.bodyTop) return edge;
    const top = this.containerTop;
    const mid = (top + this.bodyTop) / 2;
    const d = Math.min(PRECHART_INSET, (this.bodyTop - top) / 2);
    const t = y < mid ? (mid - y) / (mid - top) : (y - mid) / (this.bodyTop - mid);
    return side === 'left' ? edge + d * t : edge - d * t;
  }

  // ---- Drawing ----

  private draw(): SceneNode {
    const frames = group('lsc-frames');
    const lines = group('lsc-lines');
    const conditions = group('lsc-conditions');
    const events = group('lsc-events');
    const heads = group('lsc-heads');
    const notes = group('lsc-notes');
    const tabs = group('lsc-tabs');
    const badges = group('lsc-badges');
    const diagnostics = group('lsc-diagnostics');

    this.drawChartFrame(frames, tabs, badges);
    for (const b of this.blocks) this.drawBlock(b, frames, tabs);
    this.drawLines(lines, badges);
    this.drawCoregions(lines);
    for (const item of this.conditionItems) this.drawCondition(item, conditions, badges);
    this.drawMessages(events, badges);
    this.drawLocationEvents(events);
    this.drawActivation(events);
    this.drawHeads(heads);
    for (const n of this.model.notes) this.drawNote(n, notes);
    this.drawDiagnostics(diagnostics);

    const root = group(
      cls('lsc', this.config.temperatureCue === 'line+color' && 'lsc-cue-color'),
      [frames, lines, conditions, events, heads, notes, tabs, badges, diagnostics].filter(
        (g) => (g.children?.length ?? 0) > 0,
      ),
    );
    return root;
  }

  private text(
    parent: SceneNode,
    className: string,
    x: number,
    y: number,
    lines: string[],
    anchor: 'start' | 'middle' | 'end',
    small = false,
  ): Box {
    const size = small ? SMALL_FONT_SIZE : FONT_SIZE;
    const lh = small ? SMALL_LINE_H : LINE_H;
    const width = blockWidth(lines, size);
    lines.forEach((line, i) => {
      parent.children!.push(
        textNode({ class: className, x, y: y + i * lh, 'text-anchor': anchor }, line),
      );
    });
    const x1 = anchor === 'start' ? x : anchor === 'middle' ? x - width / 2 : x - width;
    const box = { x: x1, y: y - size, width, height: lines.length * lh };
    this.extend(box.x, box.y, box.x + box.width, box.y + box.height);
    return box;
  }

  private badge(parent: SceneNode, x: number, y: number): void {
    if (this.config.temperatureCue !== 'line+badge') return;
    parent.children!.push(
      node('rect', {
        class: 'lsc-badge',
        x: x - BADGE_R,
        y: y - BADGE_R,
        width: 2 * BADGE_R,
        height: 2 * BADGE_R,
        rx: 1.5,
      }),
      textNode({ class: 'lsc-badge-text', x, y: y + 3.5, 'text-anchor': 'middle' }, 'C'),
    );
    this.extend(x - BADGE_R, y - BADGE_R, x + BADGE_R, y + BADGE_R);
  }

  private drawChartFrame(frames: SceneNode, tabs: SceneNode, badges: SceneNode): void {
    const m = this.model;
    const l = this.frameLeft;
    const r = this.frameRight;
    const top = m.prechart ? this.bodyTop : this.containerTop;
    const bottom = this.frameBottom;
    const temp = m.kind === 'subchart' || m.mode !== 'existential' ? 'hot' : 'cold';
    frames.children!.push(
      node('rect', {
        class: cls('lsc-frame', `lsc-${temp}`),
        x: l,
        y: top,
        width: r - l,
        height: bottom - top,
      }),
    );
    this.extend(l, top, r, bottom);
    if (temp === 'cold') this.badge(badges, l, top);
    if (m.prechart) {
      const t = this.containerTop;
      const b = this.bodyTop;
      const mid = (t + b) / 2;
      const d = Math.min(PRECHART_INSET, (b - t) / 2);
      const points = [
        [l + d, t],
        [r - d, t],
        [r, mid],
        [r - d, b],
        [l + d, b],
        [l, mid],
      ];
      frames.children!.push(
        node('polygon', {
          class: 'lsc-prechart',
          points: points.map(([px, py]) => `${num2(px!)},${num2(py!)}`).join(' '),
        }),
      );
      this.extend(l, t, r, b);
    }
    if (this.tabLines.length > 0) {
      const w = this.chartTabWidth();
      const h = this.tabHeight(this.tabLines.length, false);
      tabs.children!.push(
        node('rect', { class: 'lsc-tab', x: this.tabX, y: this.tabTop, width: w, height: h }),
      );
      this.text(
        tabs,
        'lsc-tab-text',
        this.tabX + TAB_PAD_X,
        this.tabTop + TAB_PAD_Y + FONT_SIZE,
        this.tabLines,
        'start',
      );
      this.extend(this.tabX, this.tabTop, this.tabX + w, this.tabTop + h);
    }
  }

  private subchartTab(
    tabs: SceneNode,
    x: number,
    bottom: number,
    name: string | undefined,
    repeat: string | undefined,
  ): void {
    const label = name !== undefined && name !== '' ? `Subchart: ${name}` : 'Subchart';
    const w = textWidth(label, SMALL_FONT_SIZE) + 2 * TAB_PAD_X;
    const h = this.tabHeight(1, true);
    tabs.children!.push(
      node('rect', { class: 'lsc-tab lsc-subchart-tab', x, y: bottom - h, width: w, height: h }),
    );
    this.text(
      tabs,
      'lsc-tab-text lsc-subchart-tab-text',
      x + TAB_PAD_X,
      bottom - h + TAB_PAD_Y + SMALL_FONT_SIZE,
      [label],
      'start',
      true,
    );
    if (repeat !== undefined) {
      this.text(tabs, 'lsc-repeat', x + w + 6, bottom - TAB_PAD_Y - 2, [repeat], 'start');
    }
  }

  private drawBlock(b: Block, frames: SceneNode, tabs: SceneNode): void {
    frames.children!.push(
      node('rect', {
        class: cls('lsc-subchart-frame', b.kind === 'alt' && 'lsc-alt-frame'),
        x: b.left,
        y: b.top,
        width: b.right - b.left,
        height: b.bottom - b.top,
      }),
    );
    this.extend(b.left, b.top - this.tabHeight(1, true), b.right, b.bottom);
    this.subchartTab(tabs, b.left + TAB_INDENT, b.top, b.name, b.repeat);
    if (b.kind === 'alt' && b.hasElse) {
      frames.children!.push(
        node('line', {
          class: 'lsc-divider',
          x1: b.left,
          y1: b.divider,
          x2: b.right,
          y2: b.divider,
        }),
      );
      this.subchartTab(tabs, b.left + TAB_INDENT, b.divider, b.elseName, undefined);
    }
  }

  // ---- Instance lines ----

  private segments(i: Instance): Segment[] {
    const ordered = [...i.locations].sort(
      (p, q) =>
        (p.ref.part === q.ref.part ? 0 : p.ref.part === 'prechart' ? -1 : 1) ||
        p.ref.index - q.ref.index,
    );
    const points = ordered
      .map((l) => ({ l, y: this.locY.get(locKey(l.ref)) }))
      .filter((p): p is { l: Location; y: number } => p.y !== undefined);
    const out: Segment[] = [];
    for (let k = 0; k + 1 < points.length; k++) {
      const p = points[k]!;
      const q = points[k + 1]!;
      if (q.y <= p.y) continue;
      out.push({ y1: p.y, y2: q.y, style: p.l.ref.part === 'prechart' ? 'neutral' : p.l.temp });
    }
    const last = points.at(-1);
    if (last && !i.destroyedAt) {
      const end =
        i.scope === 'chart'
          ? this.config.mirrorInstances
            ? this.mirrorTop
            : this.linesEnd
          : (this.blocks.find((b) => b.id === (i.scope as { subchart: string }).subchart)?.bottom ??
            last.y);
      if (end > last.y) {
        // A lifetime's last location is always cold (p. 56); the tail continues the line's
        // style so that the end of a line carries no meaning of its own.
        const style =
          out.at(-1)?.style ?? (last.l.ref.part === 'prechart' ? 'neutral' : this.model.defaults);
        out.push({ y1: last.y, y2: end, style });
      }
    }
    return this.mergeSegments(out);
  }

  private mergeSegments(segs: Segment[]): Segment[] {
    const out: Segment[] = [];
    for (const s of segs) {
      const prev = out.at(-1);
      if (prev && prev.style === s.style && Math.abs(prev.y2 - s.y1) < 0.01) prev.y2 = s.y2;
      else out.push({ ...s });
    }
    return out;
  }

  /** Lines of instances that don't take part in a subchart are not drawn inside its frame. */
  private hidden(i: Instance): [number, number][] {
    const x = this.x[i.column]!;
    return this.blocks
      .filter((b) => !b.participants.has(i.id) && x > b.left && x < b.right)
      .map((b) => [b.top, b.bottom] as [number, number]);
  }

  private visibleSegments(i: Instance): Segment[] {
    let segs = this.segments(i);
    for (const [h1, h2] of this.hidden(i)) {
      const next: Segment[] = [];
      for (const s of segs) {
        if (s.y2 <= h1 || s.y1 >= h2) {
          next.push(s);
          continue;
        }
        if (s.y1 < h1) next.push({ ...s, y2: h1 });
        if (s.y2 > h2) next.push({ ...s, y1: h2 });
      }
      segs = next;
    }
    return segs;
  }

  private drawLines(parent: SceneNode, badges: SceneNode): void {
    for (const i of this.model.instances) {
      const x = this.x[i.column]!;
      let previous: Segment['style'] | undefined;
      for (const s of this.visibleSegments(i)) {
        parent.children!.push(
          node('line', {
            class: cls('lsc-line', `lsc-${s.style}`),
            x1: x,
            y1: s.y1,
            x2: x,
            y2: s.y2,
            'data-instance': i.id,
          }),
        );
        this.extend(x, s.y1, x, s.y2);
        if (s.style === 'cold' && previous !== 'cold') this.badge(badges, x - 10, s.y1 + 10);
        previous = s.style;
      }
    }
  }

  private styleAt(i: Instance, y: number): Segment['style'] | undefined {
    return this.visibleSegments(i).find((s) => s.y1 <= y && s.y2 >= y)?.style;
  }

  private drawCoregions(parent: SceneNode): void {
    const groups = new Map<string, { x: number; ys: number[] }>();
    for (const i of this.model.instances) {
      for (const l of i.locations) {
        if (!l.coregion) continue;
        const y = this.locY.get(locKey(l.ref));
        if (y === undefined) continue;
        const g = groups.get(l.coregion) ?? { x: this.x[i.column]!, ys: [] };
        g.ys.push(y);
        groups.set(l.coregion, g);
      }
    }
    for (const [id, g] of groups) {
      const x = g.x + CO_OFFSET;
      const y1 = Math.min(...g.ys) - 8;
      const y2 = Math.max(...g.ys) + 8;
      parent.children!.push(
        node('path', {
          class: 'lsc-coregion',
          d: `M${num2(g.x)},${num2(y1)} H${num2(x)} V${num2(y2)} H${num2(g.x)}`,
          'data-coregion': id,
        }),
      );
      this.extend(x, y1, x, y2);
    }
  }

  // ---- Conditions ----

  private drawCondition(item: ConditionItem, parent: SceneNode, badges: SceneNode): void {
    const y = this.rowY.get(item.row);
    if (y === undefined) return;
    const [x1, x2] = this.conditionSpan(item);
    const h = HEX_H / 2;
    const tip = Math.min(HEX_TIP, (x2 - x1) / 2);
    const points = [
      [x1, y],
      [x1 + tip, y - h],
      [x2 - tip, y - h],
      [x2, y],
      [x2 - tip, y + h],
      [x1 + tip, y + h],
    ];
    parent.children!.push(
      node('polygon', {
        class: cls('lsc-condition', `lsc-${item.c.temp}`),
        points: points.map(([px, py]) => `${num2(px!)},${num2(py!)}`).join(' '),
        'data-condition': item.c.id,
      }),
    );
    this.extend(x1, y - h, x2, y + h);
    this.labelBoxes.push({ x: x1, y: y - h, width: x2 - x1, height: HEX_H });
    const textY = y + FONT_SIZE / 2 - 2 - ((item.lines.length - 1) * LINE_H) / 2;
    this.text(parent, 'lsc-condition-text', (x1 + x2) / 2, textY, item.lines, 'middle');
    if (item.c.temp === 'cold') this.badge(badges, x2 + 2, y - h);

    // Lines of instances between the sharers that don't share the condition are drawn over it.
    const sharers = new Set(item.c.sharedBy);
    for (const i of this.model.instances) {
      if (i.column <= item.lo || i.column >= item.hi || sharers.has(i.id)) continue;
      const style = this.styleAt(i, y);
      if (!style) continue;
      const x = this.x[i.column]!;
      parent.children!.push(
        node('line', {
          class: cls('lsc-line', `lsc-${style}`, 'lsc-over-condition'),
          x1: x,
          y1: y - h,
          x2: x,
          y2: y + h,
        }),
      );
    }
  }

  // ---- Messages ----

  private arrowHead(
    parent: SceneNode,
    from: [number, number],
    to: [number, number],
    kind: 'synch' | 'asynch',
    temp: Temp | 'neutral',
    extra?: string,
  ): void {
    const dx = to[0] - from[0];
    const dy = to[1] - from[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len;
    const uy = dy / len;
    const bx = to[0] - ux * ARROW_LEN;
    const by = to[1] - uy * ARROW_LEN;
    const px = -uy * ARROW_HALF;
    const py = ux * ARROW_HALF;
    const a = `${num2(bx + px)},${num2(by + py)}`;
    const b = `${num2(bx - px)},${num2(by - py)}`;
    const tip = `${num2(to[0])},${num2(to[1])}`;
    const className = cls(
      'lsc-arrowhead',
      kind === 'synch' ? 'lsc-filled' : 'lsc-open',
      `lsc-${temp}`,
      extra,
    );
    parent.children!.push(
      kind === 'synch'
        ? node('polygon', { class: className, points: `${a} ${tip} ${b}` })
        : node('polyline', { class: className, points: `${a} ${tip} ${b}` }),
    );
  }

  private overlaps(box: Box): boolean {
    return this.labelBoxes.some(
      (b) =>
        box.x < b.x + b.width &&
        box.x + box.width > b.x &&
        box.y < b.y + b.height &&
        box.y + box.height > b.y,
    );
  }

  /** Places a label above a slanted line, trying a few positions to avoid other labels. */
  private slantedLabel(
    parent: SceneNode,
    className: string,
    p: [number, number],
    q: [number, number],
    lines: string[],
  ): void {
    const width = blockWidth(lines, FONT_SIZE);
    const height = lines.length * LINE_H;
    const slope = Math.abs((q[1] - p[1]) / (q[0] - p[0] || 1));
    // A slanted line always descends from its send, so text just above the start, on the
    // side the line runs to, stays clear of it.
    const start: Box =
      q[0] >= p[0]
        ? { x: p[0] + 8, y: p[1] - 4 - height, width, height }
        : { x: p[0] - 8 - width, y: p[1] - 4 - height, width, height };
    let chosen: Box | undefined = this.overlaps(start) ? undefined : start;
    for (const t of chosen ? [] : [0.5, 0.33, 0.67, 0.2, 0.8]) {
      const x = p[0] + (q[0] - p[0]) * t;
      const y = p[1] + (q[1] - p[1]) * t;
      const lift = slope * (width / 2);
      const box: Box =
        lift > 30
          ? { x: x + 6, y: y - height / 2, width, height }
          : { x: x - width / 2, y: y - lift - 4 - height, width, height };
      if (!chosen) chosen = box;
      if (!this.overlaps(box)) {
        chosen = box;
        break;
      }
    }
    this.labelBoxes.push(chosen!);
    this.text(parent, className, chosen!.x, chosen!.y + FONT_SIZE - 1, lines, 'start');
  }

  /** Moves a message end that sits on a condition's location to the edge of its hexagon. */
  private clip(point: [number, number], other: [number, number], ref: LocRef | undefined) {
    const id = this.loc(ref)?.label.condition;
    const item = id ? this.conditionItems.find((c) => c.c.id === id) : undefined;
    if (!item) return point;
    const [x1, x2] = this.conditionSpan(item);
    const dx = other[0] - point[0];
    const dy = other[1] - point[1];
    const tx = dx > 0 ? (x2 - point[0]) / dx : dx < 0 ? (x1 - point[0]) / dx : Infinity;
    const ty = dy !== 0 ? HEX_H / 2 / Math.abs(dy) : Infinity;
    const t = Math.min(tx, ty);
    if (!Number.isFinite(t) || t <= 0 || t >= 1) return point;
    return [point[0] + dx * t, point[1] + dy * t] as [number, number];
  }

  private drawMessages(parent: SceneNode, badges: SceneNode): void {
    const slanted: (() => void)[] = [];
    for (const i of this.model.instances) {
      const top = this.headTop.get(i.id);
      const h = this.headH.get(i.id);
      if (top === undefined || h === undefined) continue;
      const w = this.headWidth(i);
      this.labelBoxes.push({ x: this.x[i.column]! - w / 2, y: top, width: w, height: h });
    }
    for (const n of this.model.notes) {
      const box = this.noteBox(n);
      if (box) this.labelBoxes.push(box);
    }
    for (const item of this.messageItems) {
      const m = item.m;
      const temp = m.temp;
      const lineClass = cls('lsc-msg', `lsc-${temp}`, m.kind === 'asynch' && 'lsc-asynch');
      const sendY = item.sendRow !== undefined ? this.rowY.get(item.sendRow) : undefined;
      const receiveY = item.receiveRow !== undefined ? this.rowY.get(item.receiveRow) : undefined;
      const y1 = sendY ?? receiveY;
      const y2 = receiveY ?? sendY;
      if (y1 === undefined || y2 === undefined) continue;

      if (item.self && item.fromCol !== undefined) {
        const x = this.x[item.fromCol]!;
        const w = LOOP_W * 1.4;
        parent.children!.push(
          node('path', {
            class: lineClass,
            d: `M${num2(x)},${num2(y1)} C${num2(x + w)},${num2(y1)} ${num2(x + w)},${num2(y1 + SELF_H)} ${num2(x)},${num2(y1 + SELF_H)}`,
            'data-message': m.id,
          }),
        );
        this.arrowHead(parent, [x + 8, y1 + SELF_H], [x, y1 + SELF_H], m.kind, temp);
        const box = this.text(
          parent,
          'lsc-msg-text',
          x + LOOP_W + 6,
          y1 + SELF_H / 2 + FONT_SIZE / 2 - 2,
          item.lines,
          'start',
        );
        this.labelBoxes.push(box);
        if (temp === 'cold') this.badge(badges, box.x + box.width + 9, y1 + SELF_H / 2);
        this.extend(x, y1, x + w, y1 + SELF_H);
        continue;
      }

      const fromX =
        item.fromCol !== undefined ? this.x[item.fromCol]! : this.edgeX(item.envSide ?? 'left', y1);
      const toX =
        item.toCol !== undefined ? this.x[item.toCol]! : this.edgeX(item.envSide ?? 'left', y2);
      const p0: [number, number] = [fromX, y1];
      const q0: [number, number] = [toX, y2];
      const p = this.clip(p0, q0, m.send);
      const q = this.clip(q0, p0, m.receive);
      parent.children!.push(
        node('line', {
          class: lineClass,
          x1: p[0],
          y1: p[1],
          x2: q[0],
          y2: q[1],
          'data-message': m.id,
        }),
      );
      this.arrowHead(parent, p, q, m.kind, temp);
      this.extend(p[0], p[1], q[0], q[1]);
      if (y1 === y2) {
        const box = this.text(
          parent,
          'lsc-msg-text',
          (p[0] + q[0]) / 2,
          y1 - 6 - (item.lines.length - 1) * LINE_H,
          item.lines,
          'middle',
        );
        this.labelBoxes.push(box);
        if (temp === 'cold') this.badge(badges, box.x + box.width + 9, box.y + 7);
      } else {
        slanted.push(() => {
          this.slantedLabel(parent, 'lsc-msg-text', p, q, item.lines);
          if (temp === 'cold') {
            const last = this.labelBoxes.at(-1)!;
            this.badge(badges, last.x + last.width + 9, last.y + 7);
          }
        });
      }
    }
    for (const place of slanted) place();
  }

  private drawLocationEvents(parent: SceneNode): void {
    for (const i of this.model.instances) {
      const x = this.x[i.column]!;
      for (const l of i.locations) {
        const y = this.locY.get(locKey(l.ref));
        if (y === undefined) continue;
        if (l.label.timeout !== undefined) {
          parent.children!.push(
            node('path', {
              class: 'lsc-timeout',
              d: `M${num2(x)},${num2(y)} H${num2(x + LOOP_W)} V${num2(y + TIMEOUT_H)} H${num2(x)}`,
            }),
          );
          this.arrowHead(parent, [x + 8, y + TIMEOUT_H], [x, y + TIMEOUT_H], 'synch', 'neutral');
          this.text(
            parent,
            'lsc-timeout-text',
            x + LOOP_W + 6,
            y + TIMEOUT_H / 2 + FONT_SIZE / 2 - 2,
            textLines(l.label.timeout),
            'start',
          );
        }
        if (l.label.destroy) {
          const r = DESTROY_R;
          parent.children!.push(
            node('path', {
              class: 'lsc-destroy',
              d: `M${num2(x - r)},${num2(y - r)} L${num2(x + r)},${num2(y + r)} M${num2(x + r)},${num2(y - r)} L${num2(x - r)},${num2(y + r)}`,
              'data-instance': i.id,
            }),
          );
          this.extend(x - r, y - r, x + r, y + r);
        }
        if (l.label.create) {
          const created = this.lifetimes.get(l.label.create);
          if (!created) continue;
          const cx = this.x[created.column]!;
          const half = this.headWidth(created) / 2;
          const end = cx > x ? cx - half : cx + half;
          parent.children!.push(
            node('line', { class: 'lsc-create', x1: x, y1: y, x2: end, y2: y }),
          );
          this.arrowHead(parent, [x, y], [end, y], 'synch', 'neutral', 'lsc-create-head');
          const box = this.text(parent, 'lsc-create-text', (x + end) / 2, y - 6, ['new'], 'middle');
          this.labelBoxes.push(box);
        }
      }
    }
  }

  private drawActivation(parent: SceneNode): void {
    const spec = this.model.activation?.message;
    if (!spec) return;
    const top = this.activationTop;
    const arrowY = top + ACTIVATION_H - 14;
    const extensionEnd = this.headRowTop;
    const extension = (id: string) => {
      const x = this.colX(id);
      parent.children!.push(
        node('line', {
          class: 'lsc-activation lsc-activation-line',
          x1: x,
          y1: arrowY,
          x2: x,
          y2: extensionEnd,
          'data-instance': id,
        }),
      );
      this.extend(x, arrowY, x, extensionEnd);
      return x;
    };
    const lines = textLines(spec.name);
    const width = blockWidth(lines, FONT_SIZE);
    let p: [number, number];
    let q: [number, number];
    if (spec.from !== 'env' && spec.to !== 'env') {
      p = [extension(spec.from), arrowY];
      q = [extension(spec.to), arrowY];
    } else if (spec.to !== 'env') {
      const x = extension(spec.to);
      q = [x, arrowY];
      p = [x - Math.max(90, width + 40), top + 6];
    } else {
      const x = extension(spec.from);
      p = [x, arrowY];
      q = [x + Math.max(90, width + 40), top + 6];
    }
    parent.children!.push(
      node('line', { class: 'lsc-activation lsc-msg', x1: p[0], y1: p[1], x2: q[0], y2: q[1] }),
    );
    this.arrowHead(parent, p, q, spec.kind, 'cold', 'lsc-activation-head');
    this.extend(p[0], p[1], q[0], q[1]);
    if (p[1] === q[1]) {
      const box = this.text(parent, 'lsc-msg-text', (p[0] + q[0]) / 2, p[1] - 6, lines, 'middle');
      this.labelBoxes.push(box);
    } else {
      this.slantedLabel(parent, 'lsc-msg-text', p, q, lines);
    }
  }

  // ---- Heads and notes ----

  private drawHead(parent: SceneNode, i: Instance, cx: number, top: number, h: number): void {
    const w = this.headWidth(i);
    const lines = this.headLines(i);
    const g = node('g', { class: 'lsc-head-group', 'data-instance': i.id }, []);
    if (i.head === 'actor') {
      const r = 5;
      const fy = top + 2;
      g.children!.push(
        node('circle', { class: 'lsc-actor', cx, cy: fy + r, r }),
        node('path', {
          class: 'lsc-actor',
          d: [
            `M${num2(cx)},${num2(fy + 2 * r)} V${num2(fy + 18)}`,
            `M${num2(cx - 8)},${num2(fy + 13)} H${num2(cx + 8)}`,
            `M${num2(cx)},${num2(fy + 18)} L${num2(cx - 7)},${num2(fy + 25)}`,
            `M${num2(cx)},${num2(fy + 18)} L${num2(cx + 7)},${num2(fy + 25)}`,
          ].join(' '),
        }),
      );
      this.text(g, 'lsc-head-text', cx, top + ACTOR_FIGURE_H + FONT_SIZE, lines, 'middle');
    } else {
      g.children!.push(
        node('rect', { class: 'lsc-head', x: cx - w / 2, y: top, width: w, height: h, rx: 3 }),
      );
      const textY = top + h / 2 + FONT_SIZE / 2 - 2 - ((lines.length - 1) * LINE_H) / 2;
      this.text(g, 'lsc-head-text', cx, textY, lines, 'middle');
    }
    this.extend(cx - w / 2, top, cx + w / 2, top + h);
    parent.children!.push(g);
  }

  private drawHeads(parent: SceneNode): void {
    for (const i of this.model.instances) {
      const top = this.headTop.get(i.id);
      const h = this.headH.get(i.id);
      if (top === undefined || h === undefined) continue;
      this.drawHead(parent, i, this.x[i.column]!, top, h);
    }
    if (this.config.mirrorInstances) {
      for (const i of this.mirrored()) {
        this.drawHead(parent, i, this.x[i.column]!, this.mirrorTop, this.headHeight(i));
      }
    }
  }

  private drawNote(n: Note, parent: SceneNode): void {
    const box = this.noteBox(n);
    if (!box) return;
    parent.children!.push(
      node('rect', {
        class: 'lsc-note',
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        'data-note': n.id,
      }),
    );
    this.text(
      parent,
      'lsc-note-text',
      box.x + box.width / 2,
      box.y + NOTE_PAD + SMALL_FONT_SIZE - 1,
      textLines(n.text),
      'middle',
      true,
    );
    this.extend(box.x, box.y, box.x + box.width, box.y + box.height);
  }

  // ---- Diagnostics ----

  private lineYs(): Map<number, number> {
    const ys = new Map<number, number>();
    const put = (line: number | undefined, y: number | undefined) => {
      if (line !== undefined && y !== undefined && !ys.has(line)) ys.set(line, y);
    };
    for (const i of this.model.instances) {
      for (const l of i.locations) put(l.span.start.line, this.locY.get(locKey(l.ref)));
    }
    for (const m of this.model.messages) {
      put(m.span.start.line, this.locY.get(locKey(m.send ?? m.receive!)));
      if (m.receiveSpan && m.receive) {
        put(m.receiveSpan.start.line, this.locY.get(locKey(m.receive)));
      }
    }
    for (const c of this.model.conditions)
      put(c.span.start.line, this.rowY.get(this.loc(c.locations[0])?.row ?? -1));
    for (const n of this.model.notes) {
      const top = this.noteTop.get(n.id);
      if (top !== undefined) put(n.span.start.line, top + this.noteHeight(n) / 2);
    }
    return ys;
  }

  private drawDiagnostics(parent: SceneNode): void {
    const list = this.input.diagnostics ?? [];
    if (!this.config.showDiagnostics || list.length === 0) return;
    const ys = this.lineYs();
    const fallback = this.containerTop + 12;
    const markers = new Map<number, { numbers: number[]; messages: string[]; error: boolean }>();
    list.forEach((d, k) => {
      const y = (d.span && ys.get(d.span.start.line)) ?? fallback;
      const entry = markers.get(y) ?? { numbers: [], messages: [], error: false };
      entry.numbers.push(k + 1);
      entry.messages.push(`${k + 1}. ${d.code}: ${d.message}`);
      entry.error ||= d.severity === 'error';
      markers.set(y, entry);
    });
    const markerRight = this.frameLeft - 6;
    for (const [y, entry] of markers) {
      const label = entry.numbers.join(',');
      const w = textWidth(label, SMALL_FONT_SIZE) + 8;
      const g = node(
        'g',
        { class: cls('lsc-diag-marker', entry.error ? 'lsc-diag-error' : 'lsc-diag-warning') },
        [
          node('title', {}),
          node('rect', {
            class: 'lsc-diag-badge',
            x: markerRight - w,
            y: y - 8,
            width: w,
            height: 16,
            rx: 8,
          }),
          textNode(
            {
              class: 'lsc-diag-badge-text',
              x: markerRight - w / 2,
              y: y + 4,
              'text-anchor': 'middle',
            },
            label,
          ),
        ],
      );
      g.children![0]!.text = entry.messages.join('\n');
      parent.children!.push(g);
      this.extend(markerRight - w - MARKER_GAP / 2, y - 8, markerRight, y + 8);
    }

    const width = Math.max(this.frameRight - this.frameLeft, 360);
    let y = this.frameBottom + 12 + SMALL_FONT_SIZE;
    list.forEach((d, k) => {
      const where = d.span ? `line ${d.span.start.line}` : 'chart';
      const severity = d.severity === 'error' ? 'error' : d.severity;
      const lines = wrapText(
        `${k + 1}. ${where} · ${d.code} ${severity}: ${d.message}`,
        width,
        SMALL_FONT_SIZE,
      );
      this.text(
        parent,
        cls('lsc-diag-text', d.severity === 'error' ? 'lsc-diag-error' : 'lsc-diag-warning'),
        this.frameLeft,
        y,
        lines,
        'start',
        true,
      );
      y += lines.length * SMALL_LINE_H + 2;
    });
  }
}

function num2(value: number): number {
  return Math.round(value * 100) / 100;
}
