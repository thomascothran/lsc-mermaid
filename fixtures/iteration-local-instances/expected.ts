import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Not from a figure: iteration (p. 56), local instances, self-messages and cold messages (p. 54)',
  kind: 'chart',
  mode: 'universal',
  title: 'Poll until ready',
  defaults: 'hot',
  instances: [
    { id: 'operator', label: 'operator', column: 0, head: 'actor' },
    // An unquoted label runs to the end of the line.
    { id: 'monitor', label: 'Plant monitor', column: 1 },
    { id: 'sensor', label: 'sensor', column: 2 },
    { id: 'logger', label: 'logger', column: 3 },
    // A local instance gets its own column after the chart-level ones.
    { id: 'scratch', label: 'scratch', column: 4, scope: 'Summarise' },
  ],
  variables: ['sensor.ready: bool', 'sensor.level: int[0..100]', 'copies: int'],
  visibleEvents: [],
  // `activation on send`: the activating event is the send by a named instance (V25).
  activation: {
    condition: 'not sensor.ready',
    message: { from: 'operator', to: 'monitor', name: 'begin', kind: 'synch', dir: '!' },
  },
  messages: [
    { id: 'poll', name: 'poll', from: 'monitor', to: 'sensor', kind: 'asynch', temp: h, sendLine: 14, receiveLine: 14 },
    { id: 'reading', name: 'reading', args: 'level', from: 'sensor', to: 'monitor', kind: 'asynch', temp: h, sendLine: 15, receiveLine: 15 },
    { id: 'compute', name: 'compute', from: 'monitor', to: 'scratch', kind: 'synch', temp: h, sendLine: 20, receiveLine: 20 },
    // A self-message is a send location followed by a receive location on one line.
    { id: 'reduce', name: 'reduce', from: 'scratch', to: 'scratch', kind: 'synch', temp: h, sendLine: 21, receiveLine: 21 },
    { id: 'summary', name: 'summary', from: 'scratch', to: 'monitor', kind: 'synch', temp: h, sendLine: 22, receiveLine: 22 },
    { id: 'trace', name: 'trace', from: 'monitor', to: 'logger', kind: 'asynch', temp: c, sendLine: 26, receiveLine: 26 },
    { id: 'report', name: 'report', from: 'monitor', to: 'operator', kind: 'asynch', temp: h, sendLine: 29, receiveLine: 29 },
  ],
  conditions: [
    // The while-loop guard: an entry barrier over the block's instances, not operator.
    { line: 13, instances: ['sensor'], sharedBy: ['monitor', 'sensor'], temp: c, expr: 'not sensor.ready', guardOf: 'Poll' },
  ],
  // "Poll" is one pass or is left at its guard; the other subcharts have no cold condition.
  unfoldings: { count: 2, main: 1 },
  order: {
    before: [
      ['L13', 'poll!'],
      ['poll?', 'reading!'],
      // Poll's exit barrier and Summarise's entry barrier synchronise monitor with sensor.
      ['reading!', 'compute?'],
      ['compute?', 'reduce!'],
      ['reduce!', 'reduce?'],
      ['reduce?', 'summary!'],
      // A local instance takes part in its subchart's exit barrier.
      ['summary!', 'report!'],
      ['summary?', 'trace!'],
      ['trace!', 'trace?'],
      ['trace!', 'report!'],
    ],
    unordered: [
      // logger is in no later block, so the cold trace synchronises nothing.
      ['trace?', 'report!'],
      ['trace?', 'report?'],
    ],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
