---
title: Names and words
part: 1
summary: Give a chart a title, give participants proper names, add details to messages, and leave notes.
---

The chart from lesson 1 works, but it's terse. Here is the same café visit with more words in
it: a title, proper names for the participants, details on the messages, and a note.

```lsc
lsc-alpha existential
  title Ordering a coffee
  %% The columns appear in the order they are listed here.
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"

  customer ->> barista: order(latte)
  barista ->> till: ring up(latte)
  note right of till: shows the price
  till ->> customer: price(3.50)
  customer ->> till: pay(3.50)
  barista ->> customer: latte
```

## A title

`title Ordering a coffee` puts a name on the chart. It appears in a tab in the top-left corner,
starting with "LSC:". Names matter once you have more than one chart: each chart usually says
one thing, and the title says which.

## Listing the participants

Lesson 1 let the messages introduce the participants. You can also list them before the first
message:

- `participant barista as "Barista"` adds a column. The first word, `barista`, is the short
  name you use in the text. The part after `as` is what the picture shows. Use quotes when the
  name has spaces or capitals you want to keep.
- `actor customer` does the same, but draws a little stick figure. Use it for people, if you
  like. It means nothing more than `participant`.
- You can list several participants on one line, separated by commas.

Listing participants also fixes the column order: the columns appear in the order you list
them, wherever they are first used. `instance` is a third word that means the same as
`participant`; you'll see it in charts from the paper.

## Message details

A message label can carry details in brackets: `order(latte)`, `price(3.50)`. The word before
the brackets is the message's **name**. The part in brackets is extra detail for the reader.
Charts compare messages by name, so `order(latte)` and `order(tea)` are both `order` messages.
That will matter in later lessons, when charts start watching for messages.

A name can have spaces in it, as in `ring up(latte)`.

## Notes and comments

- `note right of till: shows the price` draws a note box beside the till's line. There is also
  `note left of …` and `note over …`, which can span several participants:
  `note over barista, till: …`. Notes are for the reader. They change nothing about what the
  chart means.
- A line starting with `%%` is a comment. It doesn't appear in the picture at all. Use it for
  reminders to yourself. A comment must take up the whole line.

The blank line in the middle is ignored too. Use blank lines to group the text.

## Try it

Add a note over the barista and the customer, after the last message, that says
"enjoy!". Then change the customer from an `actor` to a `participant` and see what changes.

:::answer Show a model answer

```lsc
lsc-alpha existential
  title Ordering a coffee
  participant customer as "Customer"
  participant barista as "Barista", till as "Till"

  customer ->> barista: order(latte)
  barista ->> till: ring up(latte)
  note right of till: shows the price
  till ->> customer: price(3.50)
  customer ->> till: pay(3.50)
  barista ->> customer: latte
  note over customer, barista: enjoy!
```

As a `participant`, the customer gets a box instead of a stick figure. Nothing else changes.
:::

## Check your understanding

A friend writes `barista ->> customer: latte(oat milk)` in one chart and
`barista ->> customer: latte(extra hot)` in another. Do the two charts talk about the same kind
of message?

:::answer Show the answer
Yes. Both messages are named `latte`; the brackets only hold details for the reader. If the
difference matters, put it in the name instead, for example `oat latte`.
:::
