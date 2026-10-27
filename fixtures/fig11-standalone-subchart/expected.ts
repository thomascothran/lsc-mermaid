import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Fig. 11, p. 63: standalone subchart',
  kind: 'subchart',
  title: 'Perform approach',
  defaults: 'hot',
  instances: [
    { id: 'proxSensor', label: 'Proximity Sensor', column: 0 },
    { id: 'cruiser', label: 'Cruiser', column: 1 },
    { id: 'car', label: 'Car', column: 2 },
    { id: 'terminal', label: 'Terminal', column: 3 },
    { id: 'carHandler', label: 'CarHandler', column: 4, createdBy: 'terminal', createdAtLine: 10, destroyedAtLine: 31 },
  ],
  variables: ['car.mode: {pass, stop}', 'car.state: {idle, departure, cruising, arrival}'],
  visibleEvents: [],
  messages: [
    { id: 'arrivReq', name: 'arrivReq', from: 'car', to: 'terminal', kind: 'synch', temp: h, sendLine: 9, receiveLine: 9 },
    { id: 'arrivAck', name: 'arrivAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 11, receiveLine: 11 },
    { id: 'alertStop', name: 'alertStop', from: 'proxSensor', to: 'car', kind: 'synch', temp: h, sendLine: 15, receiveLine: 15 },
    { id: 'disengage', name: 'disengage', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 16, receiveLine: 16 },
    { id: 'stop', name: 'stop', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 18, receiveLine: 18 },
    { id: 'departReq', name: 'departReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 28, receiveLine: 28 },
    { id: 'departAck', name: 'departAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 29, receiveLine: 29 },
  ],
  conditions: [
    // A standalone subchart is itself a block, so its opening condition is its entry barrier.
    { line: 8, instances: ['car'], sharedBy: ['proxSensor', 'cruiser', 'car', 'terminal'], temp: c, expr: 'car.state = arrival', guardOf: 'Perform approach' },
    { line: 14, instances: ['car'], sharedBy: ['proxSensor', 'cruiser', 'car'], temp: c, expr: 'car.mode = stop', guardOf: 'stopping at terminal' },
    { line: 17, instances: ['car'], sharedBy: ['cruiser', 'car'], temp: c, expr: '"stopsAt->isEmpty=TRUE"', guardOf: 'Stop at terminal' },
    { line: 19, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = idle' },
    { line: 22, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = departure' },
    { line: 27, instances: ['car'], sharedBy: ['car', 'carHandler'], temp: c, expr: 'car.mode = pass', guardOf: 'Pass through terminal' },
    { line: 30, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = cruising' },
  ],
  // Exit at the chart's guard, or pass and then "stopping" (3) × "Pass through" (2).
  unfoldings: { count: 7, main: 2 },
  order: {
    before: [
      ['proxSensor@L8', 'alertStop!'],
      ['arrivReq?', 'L10'],
      ['L10', 'arrivAck!'],
      ['L14', 'alertStop!'],
      ['disengage?', 'L17'],
      ['L17', 'stop!'],
      ['L17', 'L21'],
    ],
    unordered: [],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
