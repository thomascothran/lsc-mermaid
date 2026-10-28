---
title: Choices
part: 3
summary: Use if … else when exactly one of two things happens.
---

Customers either drink in, from a mug, or take away, in a paper cup. Exactly one of the two
happens. Write that with `if` and `else`:

```lsc
lsc-alpha universal
  title Mug or paper cup
  actor customer as "Customer"
  participant barista as "Barista"
  var customer.eatIn: bool
  activation on customer ->> barista: order(latte)

  if "Drinking in" customer: eatIn
    barista ->> customer: latte(mug)
  else "Taking away"
    barista ->> customer: latte(paper cup)
  end
```

## How it reads

- `if` is followed by an optional name in quotes, then the participants the check is about,
  a colon, and the check: `customer: eatIn`.
- The lines up to `else` happen when the check is true.
- The lines from `else` to `end` happen when it is false.
- The `else` part is optional. Without it, nothing happens when the check is false.

The picture shows one frame split in two, each half with its own "Subchart:" tab. The check sits
on the top border. Each half is a chapter of its own: a false cold check inside one half ends
only that half.

## Why not two chapters?

You could try writing two chapters, one starting with `cold condition customer: eatIn` and the
next with `cold condition customer: not eatIn`. That's not the same. Each check is made
separately, when its chapter starts, and the facts may have changed in between: a customer can
change their mind. Then both chapters, or neither, might happen. With `if … else`, the check is
made once and exactly one branch happens.

## Try it

Add a third choice: customers who bring their own cup. Hint: put a second `if … else` inside the
`else`, and use a variable with a list of words.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Which cup?
  actor customer as "Customer"
  participant barista as "Barista"
  var customer.cup: {mug, paper, own}
  activation on customer ->> barista: order(latte)

  if "Drinking in" customer: cup = mug
    barista ->> customer: latte(mug)
  else
    if "Own cup" customer: own
      customer ->> barista: own cup
      barista ->> customer: latte(own cup)
    else "Taking away"
      barista ->> customer: latte(paper cup)
    end
  end
```

`customer: own` is short for `customer: cup = own`.
:::

## Check your understanding

In "Mug or paper cup", is it possible that the customer gets no latte at all?

:::answer Show the answer
No. The check is made once, and exactly one branch happens. Both branches hand over a latte, and
every line in them is hot.
:::
