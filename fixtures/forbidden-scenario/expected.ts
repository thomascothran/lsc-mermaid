import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Forbidden-scenario idiom (pp. 47, 53)',
  kind: 'chart',
  mode: 'universal',
  title: 'No arrival request while departing',
  defaults: 'hot',
  instances: [
    { id: 'car', label: 'car', column: 0 },
    { id: 'carHandler', label: 'carHandler', column: 1 },
  ],
  variables: [],
  visibleEvents: [],
  messages: [
    { id: 'departReq', name: 'departReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 6, receiveLine: 6 },
    { id: 'arrivReq', name: 'arrivReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 7, receiveLine: 7 },
  ],
  conditions: [{ line: 10, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'false' }],
  // car's top body location is hot, so the hot false condition must be reached.
  locations: {
    car: { prechart: [c, c, c], body: [h, c] },
    carHandler: { prechart: [c, c, c], body: [c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['departReq?', 'arrivReq!'],
      ['arrivReq?', 'L10'],
    ],
    unordered: [],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
