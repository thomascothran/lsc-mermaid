---
title: Must the story carry on?
part: 2
summary: Each point on a line is hot (the story must move past it) or cold (it may stop there).
---

A rule like "whenever a customer orders, the barista hands over a latte" is too strict for a
real café. Customers change their minds. Here is a fairer rule: the barista must tell the
customer the price. After that, the customer may walk away. But once the customer has paid,
the barista must hand over the latte.

```lsc
lsc-alpha universal
  title Serving an order
  actor customer as "Customer"
  participant barista as "Barista"
  activation on customer ->> barista: order(latte)

  barista ->> customer: price(3.50)
  cold progress customer, barista
  customer ->> barista: pay(3.50)
  hot progress barista
  barista ->> customer: latte
```

Look at the lines running down from the customer and the barista. Parts of them are solid, and
parts are dashed.

## Points on a line

Every time something happens on a participant's line, such as sending or receiving a message,
that is a **point** on the line. The proper name is a _location_. Each point is one of two
kinds:

- **Hot**: the story must move on past this point. The line below it is drawn **solid**.
- **Cold**: the story may stop here. The line below it is drawn **dashed**.

The top of each line, just under its box, counts as a point too. That's where each participant
starts when the rule begins.

Points are hot unless you say otherwise. That's why every rule so far has demanded every one
of its messages: each participant had to move past every point, so everything had to happen.

## Changing the temperature

`cold progress customer, barista` makes both lines cold, starting at the point each one has
reached, and carrying on down. Here each has just dealt with the price, so after the price:

- the customer may stop, and never pay;
- the barista may stop too, because there may be no payment to wait for.

`hot progress barista` makes the barista's line hot again from the point it has reached: the
payment. Once paid, the barista must move on, and hand over the latte.

A `progress` setting lasts until the next `progress` for the same participant. "Hot" and "cold"
are called the point's **temperature**. Must is hot, may is cold.

## The last point is always cold

The last point on every line is cold, whatever you write. There is nothing after it to move on
to, so the rule can't demand anything more. The picture doesn't show this. Below the last
point, the line simply carries on in the same style as the stretch above it, down to the
bottom of the frame.

This also explains why you can't write `hot progress` for a participant that has nothing left
to do: the page reports it as an error.

## Try it

The café decides that once the customer has been told the price, the customer must pay; only
the barista may stop after the price. Change the chart.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Serving an order
  actor customer as "Customer"
  participant barista as "Barista"
  activation on customer ->> barista: order(latte)

  barista ->> customer: price(3.50)
  cold progress barista
  customer ->> barista: pay(3.50)
  hot progress barista
  barista ->> customer: latte
```

Only the barista's line turns dashed after the price. The customer's line stays solid, so the
customer must go on to pay.
:::

## Check your understanding

In the first chart, the customer's line is dashed after the price. So once the customer has
paid, may the customer leave without the latte?

:::answer Show the answer
No. The barista's line is hot from the payment on, so the barista must hand over the latte. A
hand-over needs someone to take it, so the customer receives it. The customer's dashed line
only matters if nobody else is obliged to do anything with the customer. The next lesson looks
at messages more closely.
:::
