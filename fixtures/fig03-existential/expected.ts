import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Fig. 3, p. 52: existential chart',
  kind: 'chart',
  mode: 'existential',
  title: 'Car stopping at terminal',
  defaults: 'hot',
  instances: [
    { id: 'proxSensor', label: 'proxSensor', column: 0 },
    { id: 'cruiser', label: 'cruiser', column: 1 },
    { id: 'car', label: 'car', column: 2 },
    { id: 'carHandler', label: 'carHandler', column: 3 },
  ],
  variables: [],
  visibleEvents: [],
  messages: [
    { id: 'arrivReq', name: 'arrivReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 5, receiveLine: 5 },
    { id: 'arrivAck', name: 'arrivAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 6, receiveLine: 6 },
    { id: 'alertStop', name: 'alertStop', from: 'proxSensor', to: 'car', kind: 'synch', temp: h, sendLine: 7, receiveLine: 7 },
    { id: 'disengage', name: 'disengage', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 8, receiveLine: 8 },
    { id: 'stop', name: 'stop', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 9, receiveLine: 9 },
  ],
  conditions: [],
  locations: {
    proxSensor: { body: [h, c] },
    cruiser: { body: [h, h, c] },
    car: { body: [h, h, h, h, h, c] },
    carHandler: { body: [h, h, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['arrivAck?', 'alertStop?'],
      ['alertStop?', 'disengage!'],
      ['disengage?', 'stop?'],
    ],
    unordered: [
      ['arrivReq!', 'alertStop!'],
      ['arrivAck!', 'alertStop!'],
    ],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
