import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Not from a figure: simultaneous region with separate receipts (p. 55; D12)',
  kind: 'chart',
  mode: 'existential',
  title: 'Simultaneous start',
  defaults: 'hot',
  instances: [
    { id: 'controller', label: 'controller', column: 0 },
    { id: 'left', label: 'left', column: 1 },
    { id: 'right', label: 'right', column: 2 },
  ],
  variables: [],
  visibleEvents: [],
  messages: [
    { id: 'start', name: 'start', from: 'controller', to: 'left', kind: 'asynch', temp: h, sendLine: 6, receiveLine: 11 },
    { id: 'start#2', name: 'start', from: 'controller', to: 'right', kind: 'asynch', temp: h, sendLine: 7, receiveLine: 10 },
  ],
  conditions: [{ line: 8, instances: ['controller'], sharedBy: ['controller'], temp: h, expr: 'armed' }],
  // controller's location 1 holds both sends and the condition.
  locations: {
    controller: { body: [h, c] },
    left: { body: [h, c] },
    right: { body: [h, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['start!', 'start?'],
      ['start#2!', 'start#2?'],
      ['L8', 'start?'],
    ],
    unordered: [['start?', 'start#2?']],
  },
  diagnostics: [
    { code: 'V16', severity: 'info', line: 7 },
    // `armed` resolves to no variable and the chart declares none.
    { code: 'V20', severity: 'info', line: 8 },
  ],
} satisfies FixtureExpectation;
