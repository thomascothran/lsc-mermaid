---
title: Facts and checks
part: 2
summary: Variables hold facts, and conditions check them. A failed hot check breaks the rule; a failed cold check ends it quietly.
---

Charts can check facts along the way. Is there oat milk left? Has the order been paid? Here is
a rule for oat lattes that uses both:

```lsc
lsc-alpha universal
  title Oat lattes
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  var barista.oatCartons: int[0..20]
  var till.paid: bool
  activation on customer ->> barista: order(oat latte)

  cold condition barista: oatCartons > 0
  barista ->> till: ring up(oat latte)
  customer ->> till: pay
  condition barista, till: paid
  barista ->> customer: oat latte
```

## Facts: variables

A **variable** is a named fact that can change, like the number of oat milk cartons. Declare it
near the top with `var`:

```
var barista.oatCartons: int[0..20]
var till.paid: bool
```

`barista.oatCartons` belongs to the barista: it's something the barista knows. After the colon
comes the variable's **type**, the kind of value it holds:

| Type         | Holds                     | Example                                |
| ------------ | ------------------------- | -------------------------------------- |
| `bool`       | true or false             | `var till.paid: bool`                  |
| `int`        | a whole number            | `var queue: int`                       |
| `int[0..20]` | a whole number in a range | `var barista.oatCartons: int[0..20]`   |
| `{a, b, c}`  | one of a list of words    | `var barista.milk: {dairy, oat, none}` |

A variable can also belong to nobody in particular: `var queue: int`.

## Checks: conditions

A **condition** is a check, drawn as a six-sided box on the lines of the participants it names.
After `condition`, list the participants, then a colon, then what must be true.

`condition barista, till: paid` is shared by the barista and the till, so its box spans both
lines. A shared condition makes everyone involved meet at it: the condition is checked once
both have reached it, and neither moves on before it has been checked. Here, that means the
barista can't hand over the latte until the till shows the order as paid.

Just `paid` is short for `paid = true`, because `paid` is a `bool`. With a list of words, the
word alone works the same way: `oat` is short for `milk = oat`.

## Hot and cold checks

Conditions have a temperature, like everything else:

- A **hot** condition must be true when it is reached. If it is false, the rule is broken. It's
  drawn with a solid outline, and it's the usual kind.
- A **cold** condition is a question. If it is false, the chart ends quietly at that point, and
  nothing more is required. It's drawn with a dashed outline.

In "Oat lattes", `cold condition barista: oatCartons > 0` says: if the café is out of oat milk,
this rule has nothing more to say. Without the cold check, an oat latte order with no oat milk
left would break the rule.

## Writing checks

Checks can use:

- comparisons: `=`, `!=` (not equal), `<`, `<=`, `>`, `>=`;
- arithmetic: `+`, `-`, `*`, `/`;
- `and`, `or` and `not`, with brackets to group: `not (paid or free)`;
- numbers, `true` and `false`, and the words from a `{…}` type.

A check can also be plain words in double quotes, such as
`condition barista: "the cup is not cracked"`. The page draws it as written and doesn't check it.
That's useful when the fact is hard to put into variables.

## Try it

Add a variable `var barista.milk: {dairy, oat, none}` and replace the oat check with a cold
check that the milk is oat.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Oat lattes
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  var barista.milk: {dairy, oat, none}
  var till.paid: bool
  activation on customer ->> barista: order(oat latte)

  cold condition barista: milk = oat
  barista ->> till: ring up(oat latte)
  customer ->> till: pay
  condition barista, till: paid
  barista ->> customer: oat latte
```

`cold condition barista: oat` means the same thing.
:::

## Check your understanding

A customer pays, but the till fails to record it, so `paid` is false at the shared check. What
does the rule say should happen? What would it say if the check were written
`cold condition barista, till: paid`?

:::answer Show the answer
As written, the check is hot, so a false `paid` breaks the rule: the café has taken money for
an order it can't account for. That is exactly the kind of failure the rule is there to catch.

With a cold check, a false `paid` ends the rule quietly. The barista wouldn't have to hand over
the latte, and nothing would count as wrong. A cold check suits situations that are
acceptable; a hot check suits ones that must never occur.
:::
