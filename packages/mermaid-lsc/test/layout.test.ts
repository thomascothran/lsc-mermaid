import { describe, expect, it } from 'vitest';
import { parseLsc, validateLsc, type LscChart } from 'lsc-model';
import { fixtureNames, loadFixture } from '../../../fixtures/index.js';
import { defaultLscConfig, type LscConfig } from '../src/config.js';
import { layoutChart, type Layout } from '../src/layout.js';
import { findAll, hasClass, type SceneNode } from '../src/scene.js';

function chart(...lines: string[]): LscChart {
  const { model, diagnostics } = parseLsc(lines.join('\n'));
  expect(model, JSON.stringify(diagnostics)).toBeDefined();
  return model!;
}

function lay(model: LscChart, config: Partial<LscConfig> = {}, title = model.title): Layout {
  return layoutChart({
    model,
    config: { ...defaultLscConfig, ...config },
    ...(title !== undefined ? { title } : {}),
  });
}

const byClass = (scene: SceneNode, cls: string) => findAll(scene, (n) => hasClass(n, cls));
const texts = (scene: SceneNode, cls?: string) =>
  findAll(scene, (n) => n.tag === 'text' && (!cls || hasClass(n, cls))).map((n) => n.text);
const num = (n: SceneNode, attr: string) => Number(n.attrs[attr]);

function lines(scene: SceneNode, instance: string) {
  return byClass(scene, 'lsc-line')
    .filter((n) => n.attrs['data-instance'] === instance)
    .map((n) => ({
      y1: num(n, 'y1'),
      y2: num(n, 'y2'),
      style: ['hot', 'cold', 'neutral'].find((s) => hasClass(n, `lsc-${s}`)),
    }));
}

function message(scene: SceneNode, id: string): SceneNode {
  const found = findAll(scene, (n) => n.attrs['data-message'] === id);
  expect(found, id).toHaveLength(1);
  return found[0]!;
}

function head(scene: SceneNode, instance: string): SceneNode {
  const g = findAll(
    scene,
    (n) => hasClass(n, 'lsc-head-group') && n.attrs['data-instance'] === instance,
  );
  expect(g, instance).toHaveLength(1);
  return g[0]!;
}

function frame(scene: SceneNode): SceneNode {
  return byClass(scene, 'lsc-frame')[0]!;
}

describe('frames and header', () => {
  it('draws a universal chart solid and an existential chart dashed', () => {
    expect(
      hasClass(frame(lay(chart('lsc-alpha universal', '  a ->> b: m')).scene), 'lsc-hot'),
    ).toBe(true);
    expect(
      hasClass(frame(lay(chart('lsc-alpha existential', '  a ->> b: m')).scene), 'lsc-cold'),
    ).toBe(true);
  });

  it('draws a standalone subchart solid, with a "Subchart:" tab', () => {
    const { scene } = lay(chart('lsc-alpha subchart', '  title Approach', '  a ->> b: m'));
    expect(hasClass(frame(scene), 'lsc-hot')).toBe(true);
    expect(texts(scene, 'lsc-tab-text')).toEqual(['Subchart: Approach']);
    // The chart's own block is the chart frame, not a nested frame.
    expect(byClass(scene, 'lsc-subchart-frame')).toHaveLength(0);
  });

  it('puts the title, activation condition and visible events in the header tab', () => {
    const model = chart(
      'lsc-alpha universal',
      '  title Car',
      '  instance car, handler',
      '  var car.state: {idle, busy}',
      '  visible car ->> handler: arrivReq',
      '  visible receive handler -) car: ack',
      '  activation when car.idle',
      '  car ->> handler: m',
    );
    expect(texts(lay(model).scene, 'lsc-tab-text')).toEqual([
      'LSC: Car',
      'AC: car.idle',
      'visible: car ->> handler: arrivReq',
      'receive handler -) car: ack',
    ]);
    expect(texts(lay(model, { showVisibleEvents: false }).scene, 'lsc-tab-text')).toEqual([
      'LSC: Car',
      'AC: car.idle',
    ]);
  });

  it('draws no tab for an untitled chart with nothing to put in it', () => {
    expect(byClass(lay(chart('lsc-alpha universal', '  a ->> b: m')).scene, 'lsc-tab')).toEqual([]);
  });

  it('shows a front-matter title when the chart has none', () => {
    const { scene } = lay(chart('lsc-alpha universal', '  a ->> b: m'), {}, 'From front matter');
    expect(texts(scene, 'lsc-tab-text')).toEqual(['LSC: From front matter']);
  });
});

describe('instance lines and temperature', () => {
  it('draws hot segments solid and cold segments dashed', async () => {
    const { model } = parseLsc((await loadFixture('fig04-prechart-cold-locations')).text);
    const car = lines(lay(model!).scene, 'car');
    // Pre-chart lines are drawn solid; the body starts hot, then `cold progress` after arrivReq.
    expect(car.map((s) => s.style)).toEqual(['neutral', 'hot', 'cold']);
  });

  it('continues the style of the line above below a lifetime’s last location', () => {
    const hot = lines(lay(chart('lsc-alpha universal', '  a ->> b: m')).scene, 'a');
    expect(hot.map((s) => s.style)).toEqual(['hot']);
    const cold = lines(
      lay(chart('lsc-alpha universal', '  defaults cold', '  a ->> b: m')).scene,
      'a',
    );
    expect(cold.map((s) => s.style)).toEqual(['cold']);
  });

  it('hides the lines of instances that take no part in a subchart inside its frame', () => {
    const model = chart(
      'lsc-alpha universal',
      '  instance a, b, c',
      '  subchart "S"',
      '    a ->> c: m',
      '  end',
      '  b ->> c: n',
    );
    const { scene } = lay(model);
    const f = byClass(scene, 'lsc-subchart-frame')[0]!;
    const top = num(f, 'y');
    const bottom = top + num(f, 'height');
    const b = lines(scene, 'b');
    expect(b.length).toBeGreaterThan(1);
    for (const s of b) expect(s.y2 <= top || s.y1 >= bottom).toBe(true);
    // The participants' lines run through it.
    expect(lines(scene, 'a').some((s) => s.y1 < top && s.y2 > top)).toBe(true);
  });

  it('ends a destroyed line at its X and starts a created lifetime at its head box', () => {
    const model = chart(
      'lsc-alpha universal',
      '  instance a, b',
      '  create c by a',
      '  c ->> b: m',
      '  destroy c',
    );
    const { scene } = lay(model);
    const x = byClass(scene, 'lsc-destroy');
    expect(x).toHaveLength(1);
    const c = lines(scene, 'c');
    const box = findAll(head(scene, 'c'), (n) => n.tag === 'rect')[0]!;
    expect(c[0]!.y1).toBeCloseTo(num(box, 'y') + num(box, 'height'));
    expect(c.at(-1)!.y2).toBeLessThan(num(frame(scene), 'y') + num(frame(scene), 'height') - 20);
    expect(texts(scene, 'lsc-create-text')).toEqual(['new']);
    expect(byClass(scene, 'lsc-create')).toHaveLength(1);
  });

  it('gives each later lifetime a new head box in the same column', async () => {
    const { model } = parseLsc((await loadFixture('fig10-car-behavior')).text);
    const { scene } = lay(model!);
    const first = findAll(head(scene, 'carHandler'), (n) => n.tag === 'rect')[0]!;
    const second = findAll(head(scene, 'carHandler@2'), (n) => n.tag === 'rect')[0]!;
    expect(num(second, 'x')).toBe(num(first, 'x'));
    expect(num(second, 'y')).toBeGreaterThan(num(first, 'y'));
  });

  it('draws a coregion as a dotted bracket beside the instance line', () => {
    const model = chart(
      'lsc-alpha universal',
      '  instance a, b, c',
      '  coregion a',
      '    a ->> b: m',
      '    a ->> c: n',
      '  end',
    );
    const co = byClass(lay(model).scene, 'lsc-coregion');
    expect(co).toHaveLength(1);
    expect(String(co[0]!.attrs.d)).toMatch(/^M[\d.-]+,[\d.-]+ H[\d.-]+ V[\d.-]+ H[\d.-]+$/);
  });

  it('repeats the heads at the bottom with mirrorInstances', () => {
    const model = chart('lsc-alpha universal', '  a ->> b: m');
    expect(byClass(lay(model).scene, 'lsc-head')).toHaveLength(2);
    expect(byClass(lay(model, { mirrorInstances: true }).scene, 'lsc-head')).toHaveLength(4);
  });
});

describe('messages', () => {
  it('draws arrowheads by synchrony and lines by temperature', () => {
    const { scene } = lay(
      chart('lsc-alpha universal', '  a ->> b: s', '  cold a -) b: c', '  b ->> a: t'),
    );
    expect(hasClass(message(scene, 's'), 'lsc-hot')).toBe(true);
    expect(hasClass(message(scene, 'c'), 'lsc-cold')).toBe(true);
    const heads = byClass(scene, 'lsc-arrowhead');
    expect(heads.map((h) => h.tag)).toEqual(['polygon', 'polyline', 'polygon']);
  });

  it('draws a split message as a slanted arrow from its send row to its receive row', async () => {
    const { model } = parseLsc((await loadFixture('crossing-overtaking')).text);
    const { scene } = lay(model!);
    const request = message(scene, 'request');
    expect(num(request, 'y2')).toBeGreaterThan(num(request, 'y1'));
    const notify = message(scene, 'notify');
    // The two cross: request starts above notify and ends below notify's start.
    expect(num(request, 'y1')).toBeLessThan(num(notify, 'y1'));
    expect(num(request, 'y2')).toBeGreaterThan(num(notify, 'y1'));
  });

  it('ends messages to or from env at the nearer frame edge', async () => {
    const { model } = parseLsc((await loadFixture('fig10-car-behavior')).text);
    const { scene } = lay(model!);
    expect(num(message(scene, 'button Pressed'), 'x1')).toBe(num(frame(scene), 'x'));
    const right = chart('lsc-alpha universal', '  instance a, b, c', '  c ->> env: out');
    const f = frame(lay(right).scene);
    expect(num(message(lay(right).scene, 'out'), 'x2')).toBeCloseTo(num(f, 'x') + num(f, 'width'));
  });

  it('draws self-messages and timeouts as loops with the label beside them', () => {
    const { scene } = lay(chart('lsc-alpha universal', '  a ->> a: think', '  timeout a: tm(5)'));
    expect(message(scene, 'think').tag).toBe('path');
    expect(byClass(scene, 'lsc-timeout')).toHaveLength(1);
    expect(texts(scene, 'lsc-timeout-text')).toEqual(['tm(5)']);
  });

  it('draws the activation message as a dashed arrow entering from above the frame', async () => {
    const { model } = parseLsc((await loadFixture('fig02-car-departure')).text);
    const { scene } = lay(model!);
    const activation = byClass(scene, 'lsc-activation');
    const arrow = activation.find((n) => hasClass(n, 'lsc-msg'))!;
    const extension = activation.find((n) => hasClass(n, 'lsc-activation-line'))!;
    const top = num(frame(scene), 'y');
    expect(num(arrow, 'y2')).toBeLessThan(top);
    expect(extension.attrs['data-instance']).toBe('car');
    expect(num(extension, 'y2')).toBeGreaterThan(top);
  });
});

describe('conditions', () => {
  it('draws a shared condition from the leftmost to the rightmost sharer, with other lines over it', () => {
    const model = chart(
      'lsc-alpha universal',
      '  instance a, b, c',
      '  a ->> c: m',
      '  condition a, c: ready',
    );
    const { scene } = lay(model);
    const hex = byClass(scene, 'lsc-condition')[0]!;
    const xs = String(hex.attrs.points)
      .split(' ')
      .map((p) => Number(p.split(',')[0]));
    const ax = num(message(scene, 'm'), 'x1');
    const cx = num(message(scene, 'm'), 'x2');
    expect(Math.min(...xs)).toBeLessThan(ax);
    expect(Math.max(...xs)).toBeGreaterThan(cx);
    expect(byClass(scene, 'lsc-over-condition')).toHaveLength(1);
  });

  it('draws conditions as written, quoted ones without quotes', () => {
    const model = chart(
      'lsc-alpha universal',
      '  instance car',
      '  var car.state: {idle, busy}',
      '  condition car: idle',
      '  cold condition car: "stops_at->isEmpty=TRUE"',
    );
    const { scene } = lay(model);
    expect(texts(scene, 'lsc-condition-text')).toEqual(['idle', 'stops_at->isEmpty=TRUE']);
    expect(byClass(scene, 'lsc-condition').map((n) => hasClass(n, 'lsc-cold'))).toEqual([
      false,
      true,
    ]);
  });

  it("attaches a subchart's opening condition to the frame's top border, inside", async () => {
    const { model } = parseLsc((await loadFixture('fig10-car-behavior')).text);
    const { scene } = lay(model!);
    const f = byClass(scene, 'lsc-subchart-frame')[0]!;
    const hex = findAll(scene, (n) => n.attrs['data-condition'] === 'c1')[0]!;
    const ys = String(hex.attrs.points)
      .split(' ')
      .map((p) => Number(p.split(',')[1]));
    expect(Math.min(...ys)).toBeCloseTo(num(f, 'y'));
  });
});

describe('structure', () => {
  it('draws a subchart frame with its tab and multiplicity', () => {
    const model = chart(
      'lsc-alpha universal',
      '  instance a, b',
      '  subchart "Poll" repeat *',
      '    cold condition a: "more"',
      '    a ->> b: m',
      '  end',
    );
    const { scene } = lay(model);
    expect(byClass(scene, 'lsc-subchart-frame')).toHaveLength(1);
    expect(texts(scene, 'lsc-subchart-tab-text')).toEqual(['Subchart: Poll']);
    expect(texts(scene, 'lsc-repeat')).toEqual(['*']);
  });

  it('draws if … else as one frame in two compartments, each with a tab', async () => {
    const { model } = parseLsc((await loadFixture('fig11-standalone-subchart')).text);
    const { scene } = lay(model!);
    const alt = byClass(scene, 'lsc-alt-frame');
    expect(alt).toHaveLength(1);
    const divider = byClass(scene, 'lsc-divider')[0]!;
    const top = num(alt[0]!, 'y');
    expect(num(divider, 'y1')).toBeGreaterThan(top);
    expect(num(divider, 'y1')).toBeLessThan(top + num(alt[0]!, 'height'));
    expect(texts(scene, 'lsc-subchart-tab-text')).toContain('Subchart: Stop at terminal');
    expect(texts(scene, 'lsc-subchart-tab-text')).toContain('Subchart: Temporary stop at terminal');
  });

  it('draws a subchart-local instance’s head and line inside its subchart only', async () => {
    const { model } = parseLsc((await loadFixture('iteration-local-instances')).text);
    const { scene } = lay(model!);
    const frames = byClass(scene, 'lsc-subchart-frame');
    const summarise = frames[1]!;
    const top = num(summarise, 'y');
    const bottom = top + num(summarise, 'height');
    const box = findAll(head(scene, 'scratch'), (n) => n.tag === 'rect')[0]!;
    expect(num(box, 'y')).toBeGreaterThan(top);
    for (const s of lines(scene, 'scratch')) {
      expect(s.y1).toBeGreaterThanOrEqual(top);
      expect(s.y2).toBeLessThanOrEqual(bottom);
    }
  });

  it('draws a pre-chart as a dashed hexagon above the body, holding the heads', async () => {
    const { model } = parseLsc((await loadFixture('fig04-prechart-cold-locations')).text);
    const { scene } = lay(model!);
    const hex = byClass(scene, 'lsc-prechart')[0]!;
    const ys = String(hex.attrs.points)
      .split(' ')
      .map((p) => Number(p.split(',')[1]));
    const bodyTop = num(frame(scene), 'y');
    expect(Math.max(...ys)).toBeCloseTo(bodyTop);
    const box = findAll(head(scene, 'car'), (n) => n.tag === 'rect')[0]!;
    expect(num(box, 'y')).toBeGreaterThan(Math.min(...ys));
    expect(num(box, 'y')).toBeLessThan(bodyTop);
  });

  it('places notes over, left of and right of instances', async () => {
    const { model } = parseLsc((await loadFixture('cold-defaults-notes')).text);
    const { scene } = lay(model!);
    const note = (id: string) => findAll(scene, (n) => n.attrs['data-note'] === id)[0]!;
    const shopX = num(message(scene, 'charge'), 'x1');
    const shopperX = num(message(scene, 'checkout'), 'x1');
    expect(num(note('n1'), 'x')).toBeGreaterThan(shopX);
    expect(num(note('n3'), 'x') + num(note('n3'), 'width')).toBeLessThan(shopperX);
    const over = note('n2');
    expect(num(over, 'x')).toBeLessThan(shopX);
    expect(num(over, 'x') + num(over, 'width')).toBeGreaterThan(
      num(message(scene, 'charge'), 'x2'),
    );
  });

  it('draws actors as figures and other heads as boxes', async () => {
    const { model } = parseLsc((await loadFixture('cold-defaults-notes')).text);
    const { scene } = lay(model!);
    expect(byClass(head(scene, 'shopper'), 'lsc-actor').length).toBeGreaterThan(0);
    expect(byClass(head(scene, 'shop'), 'lsc-head')).toHaveLength(1);
  });

  it('spaces rows by rowHeight', () => {
    const model = chart('lsc-alpha universal', '  a ->> b: m', '  b ->> a: n');
    const gap = (h: number) => {
      const { scene } = lay(model, { rowHeight: h });
      return num(message(scene, 'n'), 'y1') - num(message(scene, 'm'), 'y1');
    };
    expect(gap(80)).toBeGreaterThan(gap(36));
  });
});

describe('temperature cues', () => {
  const model = () => chart('lsc-alpha universal', '  cold a ->> b: m', '  cold condition a: "x"');

  it('adds no second cue by default', () => {
    const { scene } = lay(model());
    expect(byClass(scene, 'lsc-badge')).toEqual([]);
    expect(hasClass(scene, 'lsc-cue-color')).toBe(false);
  });

  it('marks cold elements with a badge in line+badge', () => {
    const { scene } = lay(model(), { temperatureCue: 'line+badge' });
    expect(texts(scene, 'lsc-badge-text').length).toBeGreaterThanOrEqual(2);
  });

  it('switches to the colour cue in line+color', () => {
    expect(hasClass(lay(model(), { temperatureCue: 'line+color' }).scene, 'lsc-cue-color')).toBe(
      true,
    );
  });
});

describe('diagnostics', () => {
  const text = ['lsc-alpha universal', '  instance a, b', '  a ->> b: m'];

  function withDiagnostics(config: Partial<LscConfig> = {}) {
    const { model, diagnostics } = parseLsc(text.join('\n'), { firstLine: 4 });
    const all = [...diagnostics, ...validateLsc(model!)].filter((d) => d.severity !== 'info');
    return layoutChart({
      model: model!,
      config: { ...defaultLscConfig, ...config },
      diagnostics: all,
    }).scene;
  }

  it('marks the row and lists the diagnostic under the chart, counting front matter', () => {
    const scene = withDiagnostics();
    expect(byClass(scene, 'lsc-diag-marker')).toHaveLength(1);
    const list = texts(scene, 'lsc-diag-text').join(' ');
    expect(list).toMatch(/^1\. line 4 · V11 warning: /);
    const title = findAll(scene, (n) => n.tag === 'title')[0]!;
    expect(title.text).toMatch(/^1\. V11: /);
  });

  it('shows nothing with showDiagnostics off', () => {
    expect(byClass(withDiagnostics({ showDiagnostics: false }), 'lsc-diag-marker')).toEqual([]);
  });
});

describe('every fixture', () => {
  it.each(fixtureNames)(
    '%s lays out inside its view box without overlapping heads',
    async (name) => {
      const { model } = parseLsc((await loadFixture(name)).text);
      const { scene, viewBox } = lay(model!);
      const inside = (x: number, y: number) =>
        x >= viewBox.x - 0.5 &&
        x <= viewBox.x + viewBox.width + 0.5 &&
        y >= viewBox.y - 0.5 &&
        y <= viewBox.y + viewBox.height + 0.5;
      for (const n of findAll(scene, (n) => n.tag === 'line')) {
        expect(inside(num(n, 'x1'), num(n, 'y1')) && inside(num(n, 'x2'), num(n, 'y2'))).toBe(true);
      }
      for (const n of findAll(scene, (n) => n.tag === 'rect')) {
        expect(inside(num(n, 'x'), num(n, 'y'))).toBe(true);
        expect(inside(num(n, 'x') + num(n, 'width'), num(n, 'y') + num(n, 'height'))).toBe(true);
      }
      const boxes = byClass(scene, 'lsc-head').map((n) => ({
        x: num(n, 'x'),
        y: num(n, 'y'),
        w: num(n, 'width'),
        h: num(n, 'height'),
      }));
      for (const [k, a] of boxes.entries()) {
        for (const b of boxes.slice(k + 1)) {
          const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
          expect(overlap).toBe(false);
        }
      }
    },
  );
});
