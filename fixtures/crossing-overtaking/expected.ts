import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Not from a figure: crossing and overtaking asynchronous messages (p. 55)',
  kind: 'chart',
  mode: 'existential',
  title: 'Crossing and overtaking',
  defaults: 'hot',
  instances: [
    { id: 'client', label: 'client', column: 0 },
    { id: 'server', label: 'server', column: 1 },
  ],
  variables: [],
  visibleEvents: [],
  messages: [
    { id: 'request', name: 'request', from: 'client', to: 'server', kind: 'asynch', temp: h, sendLine: 5, receiveLine: 7 },
    { id: 'notify', name: 'notify', from: 'server', to: 'client', kind: 'asynch', temp: h, sendLine: 6, receiveLine: 8 },
    // A labelled occurrence's id is `name#label`.
    { id: 'data#first', name: 'data', from: 'client', to: 'server', kind: 'asynch', temp: h, sendLine: 10, receiveLine: 13 },
    { id: 'data#second', name: 'data', from: 'client', to: 'server', kind: 'asynch', temp: h, sendLine: 11, receiveLine: 12 },
  ],
  conditions: [],
  locations: {
    client: { body: [h, h, h, h, c] },
    server: { body: [h, h, h, h, c] },
  },
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['request!', 'request?'],
      ['notify!', 'notify?'],
      ['request!', 'notify?'],
      ['notify!', 'request?'],
      ['data#first!', 'data#second!'],
      ['data#second?', 'data#first?'],
      ['data#first!', 'data#second?'],
    ],
    unordered: [
      ['request!', 'notify!'],
      ['request?', 'notify?'],
    ],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
