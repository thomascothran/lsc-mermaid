---
title: What comes before what
part: 1
summary: Events on one line happen in order. Between lines, only arrows create order.
---

So far every chart has been a single thread: one thing, then the next. Real stories are
messier. In this one, the customer orders, then two things happen: the barista starts the
grinder, and the customer pays at the till.

```lsc
lsc-alpha existential
  title Two things at once
  actor customer as "Customer"
  participant barista as "Barista", grinder as "Grinder", till as "Till"

  customer ->> barista: order(latte)
  barista ->> grinder: grind
  customer ->> till: pay
```

Which happens first, the grinding or the paying? The picture puts `grind` above `pay`, so you
might say grinding. But look at who does what:

- The barista grinds **after** taking the order. Both happen on the barista's line, and the
  order is higher up.
- The customer pays **after** ordering. Both happen on the customer's line.
- Nothing connects grinding to paying. Different participants do them, and no arrow runs
  between them.

So the chart doesn't say which comes first. They could happen in either order, or at the same
moment. The text has to list them one way or the other, but writing `pay` before `grind` would
give exactly the same chart.

## The rule

A chart is not one timeline. It is a set of "this comes before that" facts:

1. **Along one participant's line**, everything happens in order, top to bottom.
2. **Along an arrow**, sending a message comes before receiving it.
3. **Facts chain together.** If A comes before B and B comes before C, then A comes before C.

Anything these rules don't order is left open. Here are the facts for the chart above:

| Fact                         | Why                                               |
| ---------------------------- | ------------------------------------------------- |
| `order` comes before `grind` | Both are on the barista's line                    |
| `order` comes before `pay`   | Both are on the customer's line                   |
| `grind` and `pay`: no order  | Different lines, and no chain of facts joins them |

This is one of the ideas that make Live Sequence Charts useful. You say exactly as much about
order as you mean, and no more.

## Try it

Change the chart so that the customer can only pay **after** the grinding. Do it by adding one
message, not by moving lines around. Hint: the customer has to learn something from the
barista.

:::answer Show a model answer

```lsc
lsc-alpha existential
  title Grind, then pay
  actor customer as "Customer"
  participant barista as "Barista", grinder as "Grinder", till as "Till"

  customer ->> barista: order(latte)
  barista ->> grinder: grind
  barista ->> customer: total(3.50)
  customer ->> till: pay
```

Now there's a chain: `grind` comes before `total` on the barista's line, `total` arrives at the
customer, and `pay` comes after that on the customer's line. So grinding comes before paying.
:::

## Check your understanding

In the model answer, could the till receive the payment before the barista starts the
grinder?

:::answer Show the answer
No. Follow the chain of facts backwards from the till: the till receives `pay` after the
customer sends it; the customer pays after receiving `total`; `total` is received after the
barista sends it; and the barista sends `total` after sending `grind`, because both are on the
barista's line. Every link is a line or an arrow, so grinding comes first.
:::
