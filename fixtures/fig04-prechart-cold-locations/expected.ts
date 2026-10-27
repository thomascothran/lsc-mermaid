import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Fig. 4, pp. 53–54: pre-chart and cold locations',
  kind: 'chart',
  mode: 'universal',
  title: 'Perform approach',
  defaults: 'hot',
  instances: [
    { id: 'proxSensor', label: 'proxSensor', column: 0 },
    { id: 'car', label: 'car', column: 1 },
    { id: 'carHandler', label: 'carHandler', column: 2 },
  ],
  variables: [],
  visibleEvents: [],
  messages: [
    // Pre-chart messages carry no temperature in the semantics; the model records the default.
    { id: 'departAck', name: 'departAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 6, receiveLine: 6 },
    { id: 'alert100', name: 'alert100', from: 'proxSensor', to: 'car', kind: 'synch', temp: h, sendLine: 7, receiveLine: 7 },
    { id: 'arrivReq', name: 'arrivReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 10, receiveLine: 10 },
    { id: 'arrivAck', name: 'arrivAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 12, receiveLine: 12 },
  ],
  conditions: [],
  // Pre-chart locations are always cold (reading 7). `cold progress` on line 11 cools each
  // line's current location (location 1, after arrivReq) and everything after it.
  locations: {
    proxSensor: { prechart: [c, c], body: [c] },
    car: { prechart: [c, c, c], body: [h, c, c] },
    carHandler: { prechart: [c, c], body: [h, c, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['departAck?', 'alert100?'],
      // Hand-over barrier (reading 9).
      ['alert100?', 'arrivReq!'],
      ['alert100!', 'arrivReq?'],
      ['departAck!', 'arrivAck!'],
    ],
    unordered: [['departAck!', 'alert100!']],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
