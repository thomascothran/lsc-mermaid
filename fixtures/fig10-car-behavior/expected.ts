import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

const S1 = 'car leaving terminal - called from another terminal';
const S2 = 'Perform departure';
const S3 = 'Perform approach';
const S4 = 'Stopping at terminal';
const S5 = 'Pass through terminal';
const IF = 'Stop at terminal';

export default {
  source: 'Fig. 10, pp. 61–63: full car behaviour',
  kind: 'chart',
  mode: 'universal',
  title: 'Car behavior',
  defaults: 'hot',
  instances: [
    { id: 'destPanel', label: 'DestPanel', column: 0 },
    { id: 'terminal', label: 'Terminal', column: 1 },
    { id: 'controlCenter', label: 'Control Center', column: 2 },
    { id: 'cruiser', label: 'Cruiser', column: 3 },
    { id: 'car', label: 'Car', column: 4 },
    { id: 'carHandler', label: 'CarHandler', column: 5, destroyedAtLine: 34 },
    // Second lifetime: same column and name (reading 17).
    {
      id: 'carHandler@2',
      name: 'carHandler',
      label: 'CarHandler',
      column: 5,
      createdBy: 'terminal',
      createdAtLine: 43,
      destroyedAtLine: 64,
    },
    { id: 'proxSensor', label: 'Proximity Sensor', column: 6 },
  ],
  variables: [
    'car.mode: {pass, stop}',
    'car.isEmpty: bool',
    'car.state: {idle, departure, cruising, arrival}',
  ],
  visibleEvents: [],
  activation: { condition: 'car.state = idle' },
  messages: [
    { id: 'button Pressed', name: 'button Pressed', from: 'env', to: 'destPanel', kind: 'synch', temp: h, sendLine: 14, receiveLine: 14 },
    { id: 'callCar', name: 'callCar', from: 'destPanel', to: 'terminal', kind: 'synch', temp: h, sendLine: 15, receiveLine: 15 },
    { id: 'sendCar', name: 'sendCar', from: 'terminal', to: 'controlCenter', kind: 'synch', temp: h, sendLine: 16, receiveLine: 16 },
    { id: 'setDest', name: 'setDest', from: 'controlCenter', to: 'car', kind: 'synch', temp: h, sendLine: 17, receiveLine: 17 },
    { id: 'departReq', name: 'departReq', from: 'car', to: 'carHandler', kind: 'synch', temp: h, sendLine: 25, receiveLine: 25 },
    { id: 'start', name: 'start', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 26, receiveLine: 26 },
    { id: 'departAck', name: 'departAck', from: 'carHandler', to: 'car', kind: 'synch', temp: h, sendLine: 29, receiveLine: 29 },
    { id: 'started', name: 'started', from: 'cruiser', to: 'car', kind: 'synch', temp: h, sendLine: 30, receiveLine: 30 },
    { id: 'engage', name: 'engage', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 32, receiveLine: 32 },
    { id: 'alert100', name: 'alert100', from: 'proxSensor', to: 'car', kind: 'synch', temp: h, sendLine: 38, receiveLine: 38 },
    { id: 'arrivReq', name: 'arrivReq', from: 'car', to: 'terminal', kind: 'synch', temp: h, sendLine: 42, receiveLine: 42 },
    { id: 'arrivAck', name: 'arrivAck', from: 'carHandler@2', to: 'car', kind: 'synch', temp: h, sendLine: 44, receiveLine: 44 },
    { id: 'alertStop', name: 'alertStop', from: 'proxSensor', to: 'car', kind: 'synch', temp: h, sendLine: 48, receiveLine: 48 },
    { id: 'disengage', name: 'disengage', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 49, receiveLine: 49 },
    { id: 'stop', name: 'stop', from: 'car', to: 'cruiser', kind: 'synch', temp: h, sendLine: 51, receiveLine: 51 },
    { id: 'departReq#2', name: 'departReq', from: 'car', to: 'carHandler@2', kind: 'synch', temp: h, sendLine: 61, receiveLine: 61 },
    { id: 'departAck#2', name: 'departAck', from: 'carHandler@2', to: 'car', kind: 'synch', temp: h, sendLine: 62, receiveLine: 62 },
  ],
  conditions: [
    { line: 13, instances: ['car'], sharedBy: ['destPanel', 'terminal', 'controlCenter', 'car'], temp: c, expr: 'car.state = idle', guardOf: S1 },
    { line: 19, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = departure' },
    { line: 23, instances: ['car'], sharedBy: ['cruiser', 'car', 'carHandler'], temp: c, expr: 'car.state = departure', guardOf: S2 },
    { line: 33, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = cruising' },
    { line: 37, instances: ['car', 'proxSensor'], sharedBy: ['car', 'proxSensor'], temp: h, expr: 'car.state = cruising' },
    // carHandler@2 is created inside the block, so it is not part of the entry barrier.
    { line: 41, instances: ['car'], sharedBy: ['terminal', 'cruiser', 'car', 'proxSensor'], temp: c, expr: 'car.state = arrival', guardOf: S3 },
    { line: 47, instances: ['car'], sharedBy: ['cruiser', 'car', 'proxSensor'], temp: c, expr: 'car.mode = stop', guardOf: S4 },
    { line: 50, instances: ['car'], sharedBy: ['cruiser', 'car'], temp: c, expr: '"stops_at->isEmpty=TRUE"', guardOf: IF },
    { line: 52, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = idle' },
    { line: 55, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = departure' },
    { line: 60, instances: ['car'], sharedBy: ['car', 'carHandler@2'], temp: c, expr: 'car.mode = pass', guardOf: S5 },
    { line: 63, instances: ['car'], sharedBy: ['car'], temp: h, expr: 'car.state = cruising' },
  ],
  // S1: 2 (pass or exit at its guard). S2: 2. S3: exit at guard, or pass and then
  // S4 (exit, or pass and take either branch: 3) × S5 (2) = 1 + 6 = 7. Total 2 × 2 × 7.
  // Main unfoldings (no cold condition fails): one per branch of the if.
  unfoldings: { count: 28, main: 2 },
  order: {
    before: [
      // Guards are entry barriers (reading 12): idle is evaluated before destPanel acts.
      ['destPanel@L13', 'button Pressed?'],
      ['L13', 'callCar!'],
      ['setDest?', 'L18'],
      // Coregions (readings 3–4): synchronous receipts precede everything on car after the
      // coregion holding the send.
      ['departReq?', 'departAck?'],
      ['departReq?', 'started?'],
      ['start?', 'departAck?'],
      ['start?', 'started?'],
      ['departAck?', 'engage!'],
      ['started?', 'engage!'],
      // Shared condition (p. 70).
      ['L37', 'alert100!'],
      ['engage?', 'alert100!'],
      // Creation order (reading 18).
      ['arrivReq?', 'L43'],
      ['L43', 'arrivAck!'],
      ['L43', 'departReq#2?'],
    ],
    unordered: [
      ['departReq!', 'start!'],
      ['departReq?', 'start?'],
      ['departAck?', 'started?'],
    ],
  },
  diagnostics: [
    { code: 'V14', severity: 'info', line: 14 },
    { code: 'V15', severity: 'info', line: 24 },
    // If "Perform departure" exits at its guard, the first carHandler is still alive here.
    { code: 'V8', severity: 'warning', line: 43 },
    { code: 'V16', severity: 'info', line: 61 },
    { code: 'V16', severity: 'info', line: 62 },
  ],
} satisfies FixtureExpectation;
