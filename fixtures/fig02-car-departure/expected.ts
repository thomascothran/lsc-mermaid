import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Fig. 2, p. 51: universal chart with an activation message',
  kind: 'chart',
  mode: 'universal',
  title: 'Car departure',
  defaults: 'hot',
  instances: [
    { id: 'cruiser', label: 'cruiser', column: 0 },
    { id: 'car', label: 'car', column: 1 },
    { id: 'carHandler', label: 'carHandler', column: 2 },
  ],
  variables: [],
  visibleEvents: [],
  // The activating event is the receipt (reading 6); the activation message is not a location.
  activation: { message: { from: 'env', to: 'car', name: 'setDest', kind: 'synch', dir: '?' } },
  messages: [
    { id: 'departReq', name: 'departReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 6, receiveLine: 6 },
    { id: 'departAck', name: 'departAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 7, receiveLine: 7 },
    { id: 'start', name: 'start', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 8, receiveLine: 8 },
    { id: 'started', name: 'started', from: 'cruiser', to: 'car', kind: 'synch', temp: h, sendLine: 9, receiveLine: 9 },
    { id: 'engage', name: 'engage', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 10, receiveLine: 10 },
  ],
  conditions: [],
  locations: {
    cruiser: { body: [h, h, h, c] },
    car: { body: [h, h, h, h, h, c] },
    carHandler: { body: [h, h, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['departReq?', 'departAck!'],
      ['departAck?', 'start!'],
      ['start?', 'started!'],
      ['started?', 'engage!'],
      ['departAck!', 'engage?'],
    ],
    unordered: [],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
