---
title: Arrivals and departures
part: 3
summary: Participants who join or leave partway through, timers, and helpers that only exist inside one chapter.
---

Not every participant is there from the start. When an order comes in through a delivery app,
the till calls a rider, who arrives, collects the drink, and leaves.

```lsc
lsc-alpha universal
  title Delivery orders
  participant till as "Till", barista as "Barista"
  activation on env ->> till: app order(latte)

  create rider as "Rider" by till
  till -) barista: ticket(latte)

  subchart "Make the latte" over barista
    instance wand as "Steam wand"
    barista ->> wand: steam milk
    timeout barista: tm(40s)
    wand ->> barista: hot milk
  end

  barista ->> rider: latte
  destroy rider
```

## Joining: `create`

`create rider as "Rider" by till` brings a new participant into the story, at that point. It's
drawn as a dashed arrow labelled "new" from the till to the rider's box, which appears at that
height rather than at the top. The arrow is dashed but it isn't a cold message: the "new" label
tells them apart.

A created participant can't be used before its `create` line.

## Leaving: `destroy`

`destroy rider` ends the rider's part in the story. The rider's line stops with a cross. After
that, the rider can't take part, unless a later `create rider` brings in a new rider. A new
rider gets a fresh box in the same column.

## Helpers inside one chapter

`instance wand as "Steam wand"` inside a subchart adds a participant that exists only in that
chapter. Its column is drawn only inside the chapter's frame.

## Timers: `timeout`

`timeout barista: tm(40s)` draws a square loop on the barista's line: the barista waits for a
timer. The label is free text. Charts don't measure time: the timeout is a point on the line,
like any other, and the label tells the reader how long.

## Try it

Make the rider confirm the delivery to the till before leaving.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Delivery orders
  participant till as "Till", barista as "Barista"
  activation on env ->> till: app order(latte)

  create rider as "Rider" by till
  till -) barista: ticket(latte)

  subchart "Make the latte" over barista
    instance wand as "Steam wand"
    barista ->> wand: steam milk
    timeout barista: tm(40s)
    wand ->> barista: hot milk
  end

  barista ->> rider: latte
  rider -) till: delivered
  destroy rider
```

:::

## Check your understanding

What would the page say if you moved `create rider as "Rider" by till` to just before
`destroy rider`?

:::answer Show the answer
It reports an error: `barista ->> rider: latte` would use the rider before the rider has
joined the story.

```lsc expect=error
lsc-alpha universal
  title Delivery orders
  participant till as "Till", barista as "Barista"
  activation on env ->> till: app order(latte)

  till -) barista: ticket(latte)
  barista ->> rider: latte
  create rider as "Rider" by till
  destroy rider
```

:::
