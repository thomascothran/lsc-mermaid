---
title: Chapters
part: 3
summary: Subcharts group part of a story. Everyone in one starts it together and finishes it together.
---

Longer stories read better in chapters. A chapter in a chart is called a **subchart**. Here,
serving an order has two chapters: taking payment, and making the drink.

```lsc
lsc-alpha universal
  title Serving an order
  actor customer as "Customer"
  participant barista as "Barista", grinder as "Grinder", till as "Till"
  activation on customer ->> barista: order(latte)

  subchart "Take payment"
    barista ->> till: ring up(latte)
    customer ->> till: pay
  end

  subchart "Make the drink"
    barista ->> grinder: grind
    grinder ->> barista: ground coffee
  end

  barista ->> customer: latte
```

A subchart is written between `subchart` and `end`, with an optional name in quotes. It's drawn
as a frame with a tab saying "Subchart:" and its name.

## Who is in a chapter

A subchart includes the participants that do something inside it. "Take payment" includes the
customer, the barista and the till. "Make the drink" includes only the barista and the grinder.

The lines of participants who aren't in a chapter pass behind its frame: look at the grinder's
line, which isn't drawn inside "Take payment". To include someone who does nothing inside,
list them after `over`: `subchart "Make the drink" over barista, grinder, customer`.

## Starting and finishing together

Here is the important part. **Everyone in a chapter starts it together, and finishes it
together.** Nobody in it moves on to what comes after until everyone has finished.

That changes what comes before what. Without the chapters, the barista could start grinding
before the customer paid: different lines, no arrow between them (lesson 3). With them, the
barista is in "Take payment", so the barista can't leave it, and start grinding, until the
customer has paid.

## Chapters that may not happen

A chapter can begin with a cold check. If the check is false, that chapter is skipped, and the
story carries on after its `end`. A false cold check inside a chapter only ends that chapter,
not the whole chart.

```lsc
lsc-alpha universal
  title Serving an order
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  var customer.wantsPastry: bool
  activation on customer ->> barista: order(latte)

  subchart "Add a pastry"
    cold condition customer: wantsPastry
    customer ->> barista: croissant
    barista ->> till: ring up(croissant)
  end

  barista ->> till: ring up(latte)
  barista ->> customer: latte
```

A check at the start of a chapter is drawn across the top of its frame. It works as the
chapter's door: everyone in the chapter meets there before anything in the chapter happens.

## Try it

In the first chart, add the customer to "Make the drink" with `over`, so that the customer
waits there. What changes in the picture?

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Serving an order
  actor customer as "Customer"
  participant barista as "Barista", grinder as "Grinder", till as "Till"
  activation on customer ->> barista: order(latte)

  subchart "Take payment"
    barista ->> till: ring up(latte)
    customer ->> till: pay
  end

  subchart "Make the drink" over barista, grinder, customer
    barista ->> grinder: grind
    grinder ->> barista: ground coffee
  end

  barista ->> customer: latte
```

The frame of "Make the drink" now stretches to the customer's column, and the customer's line
runs through it.
:::

## Check your understanding

In the pastry chart, a customer doesn't want a pastry. Must the barista still ring up the
latte?

:::answer Show the answer
Yes. The false check skips "Add a pastry" only. The story carries on after its `end`, where the
barista must ring up the latte and hand it over.
:::
