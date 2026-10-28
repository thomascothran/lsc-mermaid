---
title: Repeating
part: 3
summary: Repeat a chapter while a check holds, a fixed number of times, or as many times as a variable says.
---

Some parts of a story happen more than once. A barista serves the queue one customer at a time,
for as long as there is a queue. Add `repeat` to a chapter to say so:

```lsc
lsc-alpha universal
  title Serving the queue
  actor customer as "Customer"
  participant barista as "Barista"
  var queue: int
  activation when queue > 0

  subchart "Next customer" repeat *
    cold condition barista: queue > 0
    customer ->> barista: order
    barista ->> customer: coffee
  end
```

The customer column stands for whoever is at the front of the queue, so each round of the
chapter serves the next person.

## Three ways to repeat

| Written        | Means                                                               | Tab shows |
| -------------- | ------------------------------------------------------------------- | --------- |
| `repeat *`     | Again and again, until a cold check inside it is false              | `*`       |
| `repeat 3`     | Exactly three times                                                 | `3`       |
| `repeat shots` | As many times as the variable `shots` says, when the chapter starts | `shots`   |

`repeat *` with a cold check at the start is a "while" loop: while there is a queue, serve the
next customer. When the check is false, the chapter ends and the story carries on after `end`.

Every round of a repeated chapter starts and finishes together, like a chapter of its own.

## Counting

For a fixed number, write the number. For a number that varies, declare an `int` variable and
write its name. It's read once, when the chapter starts.

```lsc
lsc-alpha universal
  title Espresso shots
  participant barista as "Barista", machine as "Machine"
  var shots: int
  activation on env ->> barista: order(espresso)

  subchart "Pull a shot" repeat shots
    barista ->> machine: pull
    machine ->> barista: shot
  end
```

## Try it

Remove the cold check from "Serving the queue". What does the page say, and why?

:::answer Show a model answer

```lsc expect=warning
lsc-alpha universal
  title Serving the queue
  actor customer as "Customer"
  participant barista as "Barista"
  var queue: int
  activation when queue > 0

  subchart "Next customer" repeat *
    customer ->> barista: order
    barista ->> customer: coffee
  end
```

The page warns that `repeat *` has no cold condition. Without one, nothing ever ends the
repeating: the barista would have to serve customers forever. The only way out would be for the
rule to break.
:::

## Check your understanding

A double espresso always takes exactly two shots. How would you change "Espresso shots" for a
chart about double espressos?

:::answer Show the answer
Write `repeat 2` instead of `repeat shots`, and remove the `var shots: int` line, which is no
longer needed:

```lsc
lsc-alpha universal
  title Double espresso
  participant barista as "Barista", machine as "Machine"
  activation on env ->> barista: order(double espresso)

  subchart "Pull a shot" repeat 2
    barista ->> machine: pull
    machine ->> barista: shot
  end
```

:::
