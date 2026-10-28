---
title: The outside world
part: 1
summary: Use env for messages from, or to, anyone the chart doesn't name.
---

Sometimes a message comes from somewhere the chart doesn't care about. The café's phone rings
with an order. Who is calling? It doesn't matter for this story. The chart can say so with the
special name `env`, short for "environment": everything outside the chart.

```lsc
lsc-alpha existential
  title A phone order
  participant barista as "Barista", till as "Till"

  env ->> barista: phone order(mocha)
  barista ->> till: ring up(mocha)
  till -) env: text receipt
```

`env` is not a column. Messages from `env` come in from the edge of the chart's frame, and
messages to `env` go out to it: whichever edge is nearer.

## When to use `env`

Use a participant when its part in the story matters, and `env` when it doesn't. If the chart
is about how the barista and the till work together, the caller is outside the story. If the
chart is about how the caller is treated, the caller deserves a column.

`env` can only be used in one-line messages. The outside world has no line of its own, so
there is nowhere to write a separate `send` or `receive` for it.

## Try it

The café's door chime is a participant called `door`. Add a first message in which someone
from outside walks in and sets off the chime, and a second in which the chime alerts the
barista.

:::answer Show a model answer

```lsc
lsc-alpha existential
  title Someone walks in
  participant door as "Door chime", barista as "Barista"

  env ->> door: open
  door -) barista: ding
```

The person walking in isn't named, so their message comes from `env`, at the frame's edge.
:::

## Check your understanding

Why can't you write `send env -) barista: phone order`?

:::answer Show the answer
A separate `send` marks a point on the sender's line, and `env` has no line. Messages to and
from the outside world are always written on one line.
:::
