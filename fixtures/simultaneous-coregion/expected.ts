import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Not from a figure: a simultaneous region over two instances, and a coregion holding a timeout, a receipt and a condition (p. 55)',
  kind: 'chart',
  mode: 'universal',
  title: 'Tap and refresh',
  defaults: 'hot',
  instances: [
    { id: 'ui', label: 'ui', column: 0 },
    { id: 'app', label: 'app', column: 1 },
    { id: 'server', label: 'server', column: 2 },
  ],
  variables: ['app.ready: bool'],
  visibleEvents: [],
  activation: { message: { from: 'env', to: 'ui', name: 'click', kind: 'synch', dir: '?' } },
  messages: [
    { id: 'tap', name: 'tap', from: 'ui', to: 'app', kind: 'asynch', temp: h, sendLine: 8, receiveLine: 8 },
    { id: 'log', name: 'log', from: 'app', to: 'server', kind: 'asynch', temp: h, sendLine: 9, receiveLine: 11 },
    { id: 'ack', name: 'ack', from: 'server', to: 'app', kind: 'asynch', temp: h, sendLine: 14, receiveLine: 14 },
    { id: 'status', name: 'status', from: 'app', to: 'server', kind: 'asynch', temp: h, sendLine: 16, receiveLine: 20 },
    { id: 'refresh', name: 'refresh', from: 'app', to: 'ui', kind: 'asynch', temp: h, sendLine: 21, receiveLine: 21 },
  ],
  conditions: [{ line: 17, instances: ['app'], sharedBy: ['app'], temp: h, expr: 'app.ready' }],
  // app: 1 holds tap? and log! (the region, line 7); 2–4 are the coregion's timeout, ack? and
  // inner region (status! and the condition); 5 is refresh!.
  locations: {
    ui: { body: [h, h, c] },
    app: { body: [h, h, h, h, h, c] },
    server: { body: [h, h, h, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['tap!', 'tap?'],
      // tap? and log! share app's location, so tap! precedes log!.
      ['tap!', 'log!'],
      ['log!', 'log?'],
      ['log?', 'ack!'],
      // Bounded coregion (reading 3): everything before it precedes each of its locations, and
      // each of them precedes everything after it.
      ['log!', 'L13'],
      ['log!', 'ack?'],
      ['log!', 'status!'],
      ['L13', 'refresh!'],
      ['ack?', 'refresh!'],
      ['L17', 'refresh!'],
      ['status!', 'status?'],
      ['ack!', 'status?'],
      ['tap!', 'refresh?'],
    ],
    unordered: [
      ['L13', 'ack?'],
      ['L13', 'status!'],
      ['ack?', 'status!'],
      ['ack?', 'L17'],
      ['L13', 'status?'],
    ],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
