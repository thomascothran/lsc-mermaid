import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Fig. 1, pp. 49–50: visible events, written as a universal chart',
  kind: 'chart',
  mode: 'universal',
  title: 'Visible events',
  defaults: 'hot',
  instances: [
    { id: 'car', label: 'car', column: 0 },
    { id: 'carHandler', label: 'carHandler', column: 1 },
    { id: 'destPanel', label: 'destPanel', column: 2 },
    { id: 'passenger', label: 'passenger', column: 3 },
  ],
  variables: [],
  visibleEvents: [
    { from: 'car', to: 'carHandler', name: 'arrivReq', kind: 'synch' },
    { from: 'carHandler', to: 'car', name: 'arrivAck', kind: 'synch' },
  ],
  messages: [
    { id: 'setDest', name: 'setDest', from: 'env', to: 'car', kind: 'synch', temp: h, sendLine: 7, receiveLine: 7 },
    { id: 'departReq', name: 'departReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 8, receiveLine: 8 },
    { id: 'pressButton', name: 'pressButton', from: 'passenger', to: 'destPanel', kind: 'synch', temp: h, sendLine: 9, receiveLine: 9 },
    { id: 'departAck', name: 'departAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 10, receiveLine: 10 },
    { id: 'flashSign', name: 'flashSign', from: 'destPanel', to: 'passenger', kind: 'synch', temp: h, sendLine: 11, receiveLine: 11 },
  ],
  conditions: [],
  locations: {
    car: { body: [h, h, h, c] },
    carHandler: { body: [h, h, c] },
    destPanel: { body: [h, h, c] },
    passenger: { body: [h, h, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['setDest?', 'departReq!'],
      ['departReq!', 'departReq?'],
      ['departReq?', 'departAck?'],
      ['pressButton?', 'flashSign!'],
    ],
    unordered: [
      ['departReq!', 'pressButton!'],
      ['setDest?', 'pressButton?'],
      ['departAck?', 'flashSign?'],
    ],
  },
  diagnostics: [
    // Universal, with neither activation nor pre-chart: applies at every point of every run.
    { code: 'V11', severity: 'warning', line: 1 },
    { code: 'V14', severity: 'info', line: 7 },
  ],
} satisfies FixtureExpectation;
