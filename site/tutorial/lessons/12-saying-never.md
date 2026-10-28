---
title: Saying “never”
part: 2
summary: Forbid a scenario with a prechart that describes it and a check that can never be true.
---

Some rules are about what must **never** happen. Once the manager has closed the till for the
day, nobody may ring up another sale. Live Sequence Charts have no special word for "never".
They don't need one:

```lsc
lsc-alpha universal
  title No sales after closing
  participant manager as "Manager", till as "Till", barista as "Barista"

  prechart
    manager ->> till: close
    barista ->> till: ring up
  end

  condition till: false
```

Read it step by step:

1. The prechart watches for the scenario: the manager closes the till, and then the barista
   rings up a sale.
2. If that ever happens, the body starts. Its only content is a hot check that must be true.
3. The check is `false`, which is never true. So reaching it always breaks the rule.

So the scenario in the prechart must never happen. This pattern is called a **forbidden
scenario**.

## Why not write the scenario as a universal chart?

A universal chart says what **must** happen. A chart with `close` and then `ring up` in its body
would demand a sale after closing: the opposite of what we want. The prechart only watches, so
the scenario is described without being demanded. The `false` check then turns "if this
happens" into "this must not happen".

## Try it

Write a forbidden scenario: the barista must never hand over two lattes for one order.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title One latte per order
  actor customer as "Customer"
  participant barista as "Barista"

  prechart
    customer ->> barista: order(latte)
    barista ->> customer: latte
    barista ->> customer: latte
  end

  condition customer: false
```

The `false` check can go on any participant's line. Here it's on the customer's.
:::

## Check your understanding

What would `cold condition till: false` say in the first chart, instead of the hot check?

:::answer Show the answer
Nothing useful. A false cold check ends the rule quietly, so the chart would say "if the till
is closed and then a sale is rung up, nothing more is required". Sales after closing would be
allowed. The check has to be hot.
:::
