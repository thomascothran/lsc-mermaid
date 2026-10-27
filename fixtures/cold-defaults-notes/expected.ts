import type { FixtureExpectation } from '../types.js';

const h = 'hot';
const c = 'cold';

export default {
  source: 'Not from a figure: cold defaults (p. 57), explicit hot elements, notes, quoted ids and accessibility',
  kind: 'chart',
  mode: 'existential',
  title: 'Checkout',
  accTitle: 'Checkout scenario',
  accDescr: 'A shopper pays and the payment endpoint confirms the charge.',
  defaults: 'cold',
  instances: [
    { id: 'shopper', label: 'Shopper', column: 0, head: 'actor' },
    { id: 'shop', label: 'Web shop', column: 1 },
    // A quoted id is the text between the quotes.
    { id: 'end', label: 'Payment endpoint', column: 2 },
  ],
  variables: ['shop.total: int[0..1000]', 'shop.paid: bool'],
  visibleEvents: [
    { from: 'shop', to: 'shopper', name: 'receipt', kind: 'synch', dir: '!' },
    { from: 'end', to: 'shop', name: 'refund', kind: 'asynch', dir: '?' },
  ],
  messages: [
    { id: 'checkout', name: 'checkout', from: 'shopper', to: 'shop', kind: 'synch', temp: c, sendLine: 16, receiveLine: 16 },
    { id: 'charge', name: 'charge', args: 'total', from: 'shop', to: 'end', kind: 'asynch', temp: h, sendLine: 20, receiveLine: 20 },
    { id: 'charged', name: 'charged', from: 'end', to: 'shop', kind: 'asynch', temp: c, sendLine: 22, receiveLine: 22 },
    { id: 'thanks', name: 'thanks', from: 'shop', to: 'shopper', kind: 'synch', temp: c, sendLine: 25, receiveLine: 25 },
  ],
  conditions: [
    // `not` binds looser than comparisons and tighter than `and`; a bool variable prints as itself.
    { line: 19, instances: ['shop'], sharedBy: ['shop'], temp: h, expr: 'shop.total > 0 and not shop.paid' },
    { line: 24, instances: ['shop'], sharedBy: ['shop'], temp: c, expr: 'shop.paid' },
  ],
  notes: [
    { line: 17, placement: { rightOf: 'shop' }, text: 'total computed here' },
    { line: 23, placement: { over: ['shop', 'end'] }, text: 'settlement' },
    { line: 26, placement: { leftOf: 'shopper' }, text: 'may leave now' },
  ],
  // Everything defaults to cold. `hot progress` on line 18 heats shop's current location (1,
  // after checkout) and end's top (0). `cold progress` on line 21 cools shop again from its
  // current location (3, after charge).
  locations: {
    shopper: { body: [c, c, c] },
    shop: { body: [c, h, h, c, c, c, c] },
    end: { body: [h, h, c] },
  },
  // The cold condition on line 24 is outside every block: it can end the chart, but that is
  // not a separate unfolding.
  unfoldings: { count: 1, main: 1 },
  order: {
    before: [
      ['checkout?', 'L19'],
      ['L19', 'charge!'],
      ['charge!', 'charge?'],
      ['charge?', 'charged!'],
      ['charged?', 'L24'],
      ['L24', 'thanks!'],
      ['checkout!', 'thanks?'],
    ],
    unordered: [],
  },
  diagnostics: [],
} satisfies FixtureExpectation;
