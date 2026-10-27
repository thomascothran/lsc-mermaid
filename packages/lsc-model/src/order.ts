// The partial order ≤m of one unfolding. See "Derived structures" in the proposal.
//
// Rules:
// - order along each instance line, with the locations of one coregion unordered among
//   themselves and bounded by the locations around it (reading 3);
// - send before receive (p. 69);
// - a synchronous receipt precedes every location on the sender's line after the send's
//   coregion or simultaneous location (reading 4; p. 70);
// - the locations of a shared condition or a barrier form one point (p. 70; reading 11);
// - every pre-chart location precedes every body location (reading 9);
// - the creator's creation location precedes the created lifetime's first location (reading 18).
//
// Location 0, the top of each line, holds no events and takes no part in the order.

import type { LocRef, Location, LscChart } from './model.js';
import { locKey, unfoldings, type Unfolding } from './unfold.js';

export interface OrderPoint {
  id: number;
  /** Locations merged into this point. The pre-chart hand-over point has none. */
  locations: LocRef[];
}

export interface PartialOrder {
  /** Index of the unfolding the order belongs to. */
  unfolding: number;
  points: OrderPoint[];
  /** Immediate constraints `[before, after]` between point ids. */
  edges: [number, number][];
  /** Topological layering of point ids: each point after every point it follows. Empty when cyclic. */
  layers: number[][];
  /** Point ids on a cycle, when the order is not acyclic. */
  cycle?: number[];
  /** The point a location belongs to, if it is in the unfolding. */
  pointOf(ref: LocRef): number | undefined;
  /** Strict order: `a` precedes `b`, and they are not the same point. */
  before(a: LocRef, b: LocRef): boolean;
}

class UnionFind {
  private readonly parent = new Map<string, string>();
  find(x: string): string {
    let root = x;
    while (this.parent.has(root) && this.parent.get(root) !== root) root = this.parent.get(root)!;
    this.parent.set(x, root);
    return root;
  }
  union(a: string, b: string): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent.set(rb, ra);
  }
}

const HANDOVER = '#handover';

/** The partial order of an unfolding; by default the first main unfolding. */
export function partialOrder(model: LscChart, unfolding?: Unfolding): PartialOrder {
  const u = unfolding ?? unfoldings(model).find((x) => x.main) ?? unfoldings(model)[0]!;
  const byKey = new Map<string, Location>();
  for (const i of model.instances) for (const l of i.locations) byKey.set(locKey(l.ref), l);
  const included = new Set(u.locations.filter((r) => r.index > 0).map(locKey));

  // Merge shared conditions and barriers into single points.
  const uf = new UnionFind();
  for (const group of [
    ...model.conditions.map((c) => c.locations),
    ...model.barriers.map((b) => b.locations),
  ]) {
    const keys = group.map(locKey).filter((k) => included.has(k));
    for (const k of keys.slice(1)) uf.union(keys[0]!, k);
  }

  const pointIds = new Map<string, number>();
  const points: OrderPoint[] = [];
  const pointOfKey = (key: string): number => {
    const root = uf.find(key);
    let id = pointIds.get(root);
    if (id === undefined) {
      id = points.length;
      pointIds.set(root, id);
      points.push({ id, locations: [] });
    }
    return id;
  };
  for (const key of included) points[pointOfKey(key)]!.locations.push(byKey.get(key)!.ref);

  const edges = new Set<string>();
  const addEdge = (a: number, b: number) => {
    if (a !== b) edges.add(`${a} ${b}`);
  };
  const keyEdge = (a: string, b: string) => addEdge(pointOfKey(a), pointOfKey(b));

  // Instance lines, as segments: a coregion is one segment, any other location its own.
  const segments = new Map<string, string[][]>();
  for (const instance of model.instances) {
    for (const part of ['prechart', 'body'] as const) {
      const locs = instance.locations.filter(
        (l) => l.ref.part === part && included.has(locKey(l.ref)),
      );
      const segs: string[][] = [];
      let previous: Location | undefined;
      for (const l of locs) {
        if (previous && l.coregion !== undefined && l.coregion === previous.coregion)
          segs.at(-1)!.push(locKey(l.ref));
        else segs.push([locKey(l.ref)]);
        previous = l;
      }
      segments.set(`${instance.id}/${part}`, segs);
      for (let i = 0; i + 1 < segs.length; i++) {
        for (const a of segs[i]!) for (const b of segs[i + 1]!) keyEdge(a, b);
      }
    }
  }
  const segmentAfter = (ref: LocRef): string[] => {
    const segs = segments.get(`${ref.instance}/${ref.part}`) ?? [];
    const i = segs.findIndex((s) => s.includes(locKey(ref)));
    return i >= 0 ? (segs[i + 1] ?? []) : [];
  };

  for (const m of model.messages) {
    if (!m.send || !m.receive) continue;
    const send = locKey(m.send);
    const receive = locKey(m.receive);
    if (!included.has(send) || !included.has(receive)) continue;
    keyEdge(send, receive);
    if (m.kind === 'synch') for (const next of segmentAfter(m.send)) keyEdge(receive, next);
  }

  for (const instance of model.instances) {
    if (!instance.createdAt || !included.has(locKey(instance.createdAt))) continue;
    const first = segments.get(`${instance.id}/${instance.createdAt.part}`)?.[0] ?? [];
    for (const k of first) keyEdge(locKey(instance.createdAt), k);
  }

  // Hand-over barrier between the pre-chart and the body.
  const hasPrechart = [...included].some((k) => byKey.get(k)!.ref.part === 'prechart');
  if (hasPrechart) {
    const h = points.length;
    points.push({ id: h, locations: [] });
    pointIds.set(HANDOVER, h);
    for (const [key, segs] of segments) {
      if (key.endsWith('/prechart')) for (const k of segs.at(-1) ?? []) addEdge(pointOfKey(k), h);
      else for (const k of segs[0] ?? []) addEdge(h, pointOfKey(k));
    }
  }

  const edgeList = [...edges].map((e) => e.split(' ').map(Number) as [number, number]);
  const successors: number[][] = points.map(() => []);
  for (const [a, b] of edgeList) successors[a]!.push(b);

  // Topological layering (Kahn); leftover points lie on or after a cycle.
  const indegree = points.map(() => 0);
  for (const [, b] of edgeList) indegree[b]!++;
  const layer = points.map(() => 0);
  let frontier = points.filter((p) => indegree[p.id] === 0).map((p) => p.id);
  const order: number[] = [];
  while (frontier.length > 0) {
    const next: number[] = [];
    for (const p of frontier) {
      order.push(p);
      for (const s of successors[p]!) {
        layer[s] = Math.max(layer[s]!, layer[p]! + 1);
        if (--indegree[s]! === 0) next.push(s);
      }
    }
    frontier = next;
  }
  const acyclic = order.length === points.length;
  const layers: number[][] = [];
  if (acyclic) for (const p of order) (layers[layer[p]!] ??= []).push(p);

  // Reachability.
  const reach: Set<number>[] = points.map(() => new Set());
  if (acyclic) {
    for (const p of [...order].reverse()) {
      for (const s of successors[p]!) {
        reach[p]!.add(s);
        for (const r of reach[s]!) reach[p]!.add(r);
      }
    }
  } else {
    for (const p of points) {
      const stack = [...successors[p.id]!];
      while (stack.length > 0) {
        const s = stack.pop()!;
        if (reach[p.id]!.has(s)) continue;
        reach[p.id]!.add(s);
        stack.push(...successors[s]!);
      }
    }
  }

  const result: PartialOrder = {
    unfolding: u.index,
    points,
    edges: edgeList,
    layers,
    pointOf: (ref) => (included.has(locKey(ref)) ? pointOfKey(locKey(ref)) : undefined),
    before: (a, b) => {
      const pa = result.pointOf(a);
      const pb = result.pointOf(b);
      return pa !== undefined && pb !== undefined && pa !== pb && reach[pa]!.has(pb);
    },
  };
  if (!acyclic) result.cycle = findCycle(points.length, successors, reach);
  return result;
}

function findCycle(n: number, successors: number[][], reach: Set<number>[]): number[] {
  const start = [...Array(n).keys()].find((p) => reach[p]!.has(p));
  if (start === undefined) return [];
  // Walk successors that can get back to the start.
  const cycle = [start];
  let at = start;
  for (let guard = 0; guard < n; guard++) {
    const next: number | undefined = successors[at]!.find(
      (s) => s === start || reach[s]!.has(start),
    );
    if (next === undefined || next === start) break;
    cycle.push(next);
    at = next;
  }
  return cycle;
}
