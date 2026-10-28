---
title: “Can happen” versus “must happen”
part: 2
summary: An existential chart is an example of what can happen. A universal chart is a rule.
---

Every chart so far has started with `lsc-alpha existential`, and every one has had a dashed
frame around it. Both say the same thing: **here is one way things can go**. The chart is an
example. It doesn't claim that every visit to the café looks like this, only that this one is
possible.

An example is useful, but often you want to say more: "whenever this happens, that must
follow". That is a rule, and a rule is written as a **universal** chart:

```lsc expect=warning
lsc-alpha universal
  title Serving a latte
  actor customer as "Customer"
  participant barista as "Barista"

  customer ->> barista: order(latte)
  barista ->> customer: latte
```

The only change in the text is the word `universal`, and the only change in the picture is the
frame: it is now **solid**. Throughout Live Sequence Charts, the same idea holds:

> **Solid means must. Dashed means may.**

You'll meet it again for messages, for stretches of a participant's line, and for checks.

## The two kinds of chart

| First line              | Name              | Frame  | Means                                                              |
| ----------------------- | ----------------- | ------ | ------------------------------------------------------------------ |
| `lsc-alpha existential` | Existential chart | Dashed | This can happen: at least one run of the café goes like this       |
| `lsc-alpha universal`   | Universal chart   | Solid  | This must happen: every time the rule applies, things go like this |

The words come from logic. "Existential" is "there exists a case where…", and "universal" is
"in every case…". The first line must always say which kind the chart is.

## Why is there a warning?

Under the chart, the page shows a warning, and a numbered marker beside the chart shows which
line of the text it is about. Read the rule as it is written: the customer orders a latte and the barista
hands one over. But **when**? The chart doesn't say, so it applies at every moment: the café
would have to be serving lattes all the time. That's not what we meant.

A rule needs a trigger: "whenever a customer orders a latte, the barista must hand one over".
The next lesson shows how to write one.

## Try it

Change the first line back to `existential`. What happens to the frame and to the warning?

:::answer Show a model answer

```lsc
lsc-alpha existential
  title Serving a latte
  actor customer as "Customer"
  participant barista as "Barista"

  customer ->> barista: order(latte)
  barista ->> customer: latte
```

The frame turns dashed, and the warning goes away: an example doesn't need a trigger, because
it doesn't claim to apply at any particular time.
:::

## Check your understanding

You draw an existential chart in which a customer pays with a gift card. Does the chart say
that customers must pay with gift cards?

:::answer Show the answer
No. An existential chart only says that paying with a gift card can happen. To say that it must
happen, in some situation, you need a universal chart and a trigger for that situation.
:::
