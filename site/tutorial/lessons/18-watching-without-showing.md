---
title: Watching without showing
part: 3
summary: A chart can watch for messages it doesn't draw, and forbid them while it runs.
---

While the barista is serving an order, the café doesn't want any refunds going through the
till. There's no refund in the story, so it can't be drawn. But the chart can still watch for
one:

```lsc
lsc-alpha universal
  title No refunds mid-order
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  visible barista ->> till: refund
  activation on customer ->> barista: order(latte)

  barista ->> till: ring up(latte)
  customer ->> till: pay
  barista ->> customer: latte
```

`visible barista ->> till: refund` makes `refund` a **visible event** of the chart: one the
chart watches. The tab lists it after "visible:".

## What a chart watches

While a rule is running, it watches its visible events. A watched event may only happen as the
chart's next step. Every message in the chart is watched automatically, in its place. A message
listed with `visible` has no place in the chart, so it can't happen at all while the rule runs.

So, once the barista has received the order, and until the latte has been handed over:

- no refund may go through the till;
- the messages in the chart may only happen in their place. For example, the customer can't pay
  twice: the second `pay` would be out of place.

Messages the chart doesn't watch can still happen at any time: the barista can chat with
another customer, and the rule doesn't care.

`visible send …` watches only the sending of a message, and `visible receive …` only its
receipt. Plain `visible` watches both.

## Try it

The café also wants no discounts while an order is being served. Add a visible event for a
`discount` message from the barista to the till.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title No refunds mid-order
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  visible barista ->> till: refund
  visible barista ->> till: discount
  activation on customer ->> barista: order(latte)

  barista ->> till: ring up(latte)
  customer ->> till: pay
  barista ->> customer: latte
```

:::

## Check your understanding

Under this rule, may the barista put a refund through the till after handing over the latte?

:::answer Show the answer
Yes. Once the latte has been handed over, the rule has finished and stops watching. Visible
events are only forbidden out of place while the rule is running.
:::
