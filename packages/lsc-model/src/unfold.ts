// Unfoldings: the basic charts obtained by taking every subchart once (a `repeat` is one pass)
// or leaving it at one of its cold conditions, and by choosing one branch of each `if … else`.
// See "Derived structures" in the proposal.

import type { Alternative, LocRef, LscChart, Location, RegionItem, Subchart } from './model.js';

export interface Unfolding {
  index: number;
  /** No cold condition fails: the main unfolding of its branch choices. */
  main: boolean;
  /** Alternative.id → the branch taken. */
  branches: Record<string, 'then' | 'else'>;
  /** Cold conditions that held. */
  passed: string[];
  /** Cold conditions at which a block was left. */
  exits: string[];
  /** The locations of this basic chart, including location 0 of each lifetime alive in it. */
  locations: LocRef[];
}

export interface UnfoldOptions {
  /** Maximum number of unfoldings; the rest are skipped. Default 256. */
  limit?: number;
}

export const DEFAULT_UNFOLDING_LIMIT = 256;

export function locKey(ref: LocRef): string {
  return `${ref.instance}/${ref.part}/${ref.index}`;
}

interface Fragment {
  locations: LocRef[];
  branches: [string, 'then' | 'else'][];
  passed: string[];
  exits: string[];
}

const EMPTY: Fragment = { locations: [], branches: [], passed: [], exits: [] };

function join(a: Fragment, b: Fragment): Fragment {
  return {
    locations: [...a.locations, ...b.locations],
    branches: [...a.branches, ...b.branches],
    passed: [...a.passed, ...b.passed],
    exits: [...a.exits, ...b.exits],
  };
}

function withLocations(f: Fragment, before: LocRef[], after: LocRef[] = []): Fragment {
  return { ...f, locations: [...before, ...f.locations, ...after] };
}

class Unfolder {
  private readonly locations = new Map<string, Location>();
  private readonly conditions;
  private readonly barriers;

  constructor(
    private readonly model: LscChart,
    private readonly limit: number,
  ) {
    for (const i of model.instances)
      for (const l of i.locations) this.locations.set(locKey(l.ref), l);
    this.conditions = new Map(model.conditions.map((c) => [c.id, c]));
    this.barriers = new Map(model.barriers.map((b) => [b.id, b]));
  }

  private product(as: Fragment[], bs: Fragment[]): Fragment[] {
    const out: Fragment[] = [];
    for (const a of as) {
      for (const b of bs) {
        out.push(join(a, b));
        if (out.length >= this.limit) return out;
      }
    }
    return out;
  }

  /** The cold condition held by a row, if leaving the enclosing block there is possible. */
  private coldCondition(locations: LocRef[]): string | undefined {
    for (const ref of locations) {
      const id = this.locations.get(locKey(ref))?.label.condition;
      if (id !== undefined && this.conditions.get(id)?.temp === 'cold') return id;
    }
    return undefined;
  }

  region(items: RegionItem[], block: boolean): { completed: Fragment[]; exited: Fragment[] } {
    let current: Fragment[] = [EMPTY];
    const exited: Fragment[] = [];
    for (const item of items) {
      if (item.kind === 'row') {
        current = current.map((f) => withLocations(f, [], item.locations));
        const cold =
          item.locations[0]?.part === 'body' ? this.coldCondition(item.locations) : undefined;
        if (cold === undefined) continue;
        if (block) {
          for (const f of current) {
            if (exited.length < this.limit) exited.push({ ...f, exits: [...f.exits, cold] });
          }
        }
        // Outside every block, a false cold condition ends the chart; that run adds nothing
        // that the full run lacks, so it is not a separate unfolding.
        current = current.map((f) => ({ ...f, passed: [...f.passed, cold] }));
      } else if (item.kind === 'subchart') {
        current = this.product(current, this.subchart(item));
      } else {
        current = this.product(current, this.alternative(item));
      }
    }
    return { completed: current, exited };
  }

  subchart(sub: Subchart): Fragment[] {
    const entry = sub.guard ? [] : (this.barriers.get(sub.entry)?.locations ?? []);
    const exit = this.barriers.get(sub.exit)?.locations ?? [];
    const { completed, exited } = this.region(sub.body.items, true);
    return [...completed, ...exited].slice(0, this.limit).map((f) => withLocations(f, entry, exit));
  }

  alternative(alt: Alternative): Fragment[] {
    const guard = this.conditions.get(alt.guard)?.locations ?? [];
    const exit = this.barriers.get(alt.then.exit)?.locations ?? [];
    const then = this.subchart(alt.then).map((f) => ({
      ...f,
      branches: [[alt.id, 'then'], ...f.branches] as Fragment['branches'],
      passed: [alt.guard, ...f.passed],
    }));
    const otherwise = (alt.else ? this.subchart(alt.else) : [EMPTY]).map((f) => ({
      ...f,
      branches: [[alt.id, 'else'], ...f.branches] as Fragment['branches'],
    }));
    return [...then, ...otherwise].slice(0, this.limit).map((f) => withLocations(f, guard, exit));
  }

  unfoldings(): Unfolding[] {
    const prechart = this.model.prechart
      ? this.region(this.model.prechart.items, false).completed
      : [EMPTY];
    const { completed } = this.region(this.model.body.items, false);
    return this.product(prechart, completed).map((f, index) => this.finish(f, index));
  }

  private finish(f: Fragment, index: number): Unfolding {
    const keys = new Set(f.locations.map(locKey));
    // A lifetime whose creation is not in this unfolding does not exist in it.
    for (const instance of this.model.instances) {
      if (instance.createdAt && !keys.has(locKey(instance.createdAt))) {
        for (const l of instance.locations) keys.delete(locKey(l.ref));
      }
    }
    const locations: LocRef[] = [];
    for (const instance of this.model.instances) {
      const present = instance.scope === 'chart' && !instance.createdAt;
      for (const l of instance.locations) {
        const key = locKey(l.ref);
        if (l.ref.index === 0) {
          const created = instance.createdAt !== undefined && keys.has(locKey(instance.createdAt));
          const used = instance.locations.some(
            (x) => x.ref.part === l.ref.part && x.ref.index > 0 && keys.has(locKey(x.ref)),
          );
          if (present || created || used) locations.push(l.ref);
        } else if (keys.has(key)) {
          locations.push(l.ref);
        }
      }
    }
    return {
      index,
      main: f.exits.length === 0,
      branches: Object.fromEntries(f.branches),
      passed: [...new Set(f.passed)],
      exits: f.exits,
      locations,
    };
  }
}

/** Every unfolding of the chart, up to the limit (default 256). */
export function unfoldings(model: LscChart, options: UnfoldOptions = {}): Unfolding[] {
  return new Unfolder(model, options.limit ?? DEFAULT_UNFOLDING_LIMIT).unfoldings();
}
