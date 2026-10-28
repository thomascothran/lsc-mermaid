---
title: Any order, and the same moment
part: 3
summary: A coregion lets events on one line happen in any order. A simultaneous region makes them one moment.
---

On a participant's line, things happen in the order they're written. Two ways to relax that.

## Any order: `coregion`

Once a customer has paid, the barista needs two things before handing over a drink: the order
slip from the customer, and the till's word that it has been paid. They can come in either order.

```lsc
lsc-alpha universal
  title Two things before making
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  activation on customer ->> till: pay

  coregion barista
    customer ->> barista: order slip
    till ->> barista: paid
  end
  barista ->> customer: latte
```

`coregion barista` … `end` holds events on the barista's line that may happen in any order. The
picture shows it as a dotted line beside the barista's line, with short ticks at its ends.

Everything before the coregion still comes before all of it, and all of it comes before
everything after. Here, the barista hands over the latte only once both have arrived.

## The same moment: `simultaneous`

When the customer pays, the till prints a receipt and sends a ticket to the barista in one go.

```lsc
lsc-alpha universal
  title Receipt and ticket
  actor customer as "Customer"
  participant till as "Till", barista as "Barista"
  activation on customer ->> till: pay

  simultaneous till
    till -) customer: receipt
    till -) barista: ticket
  end
```

`simultaneous till` … `end` makes the till's events inside it one single point on the till's
line: they happen at the same moment. They're drawn on one row.

The customer and the barista aren't listed after `simultaneous`, so for them nothing changes:
each receives in their own time. To make several participants' events in the region one moment,
list them all: `simultaneous till, barista`.

A simultaneous region can include one check, made at that same moment.

## Try it

Add a hot check to the simultaneous region of "Receipt and ticket" that the till's drawer is
shut, using a variable `var till.drawerShut: bool`.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Receipt and ticket
  actor customer as "Customer"
  participant till as "Till", barista as "Barista"
  var till.drawerShut: bool
  activation on customer ->> till: pay

  simultaneous till
    till -) customer: receipt
    till -) barista: ticket
    condition till: drawerShut
  end
```

:::

## Check your understanding

In "Two things before making", may the barista hand over the latte after the order slip
arrives but before the till says `paid`?

:::answer Show the answer
No. The coregion only frees the order of the events inside it. Handing over the latte comes
after the coregion, so it waits for both.
:::
