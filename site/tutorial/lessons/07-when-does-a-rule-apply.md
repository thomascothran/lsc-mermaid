---
title: When does a rule apply?
part: 2
summary: Start a rule with a trigger message, or with a trigger condition.
---

The last lesson ended with a rule that applied all the time. Here it is again, with a trigger:

```lsc
lsc-alpha universal
  title Serving a latte
  actor customer as "Customer"
  participant barista as "Barista"
  activation on customer ->> barista: order(latte)

  barista ->> customer: latte
```

Read it as: **whenever the barista receives an order from the customer, the barista must hand
over a latte.** The warning has gone.

## A trigger message

`activation on` names the message that starts the rule. It is written like any other message,
but it goes before the first message of the chart, with the participant lists.

In the picture, the trigger is the dashed arrow above the frame. It sits outside the frame
because it isn't part of what the rule demands. The rule doesn't say that customers must
order; it says what must follow when they do. That is also why it is dashed: dashed means
"may", and nobody has to order.

The rule starts when the message is **received**. To start it when the message is sent
instead, write `activation on send customer ->> barista: order`.

Triggers often come from outside the chart. A phone order, for example, comes from `env`:

```lsc
lsc-alpha universal
  title Phone orders are rung up
  participant barista as "Barista", till as "Till"
  activation on env ->> barista: phone order

  barista ->> till: ring up
```

## A trigger condition

Some rules start when something becomes true, rather than when a message arrives. Write those
with `activation when`:

```lsc
lsc-alpha universal
  title Closing up
  participant barista as "Barista", till as "Till"
  activation when closingTime

  barista ->> till: cash up
  till ->> barista: total
```

The condition appears in the chart's tab, after "AC:" (for "activation condition"). The rule
starts at any moment when `closingTime` is true. Lesson 11 shows how to write conditions
properly, with names and values. For now, a single word works as a statement that is either
true or false.

A chart can have one trigger message, one trigger condition, or both. With both, the message
must arrive while the condition is true.

## Try it

Write a rule: whenever the till receives a payment from the customer, the till must print a
receipt for the customer.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Every payment gets a receipt
  actor customer as "Customer"
  participant till as "Till"
  activation on customer ->> till: pay

  till ->> customer: receipt
```

:::

## Check your understanding

In "Serving a latte", the trigger arrow is dashed. Does that mean the order might get lost on
its way to the barista?

:::answer Show the answer
No. The dashes say that the trigger is optional: the rule doesn't require anyone to order. If
the order does reach the barista, the rule starts, and the barista must hand over a latte.
:::
