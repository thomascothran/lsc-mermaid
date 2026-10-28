---
title: Who and when
part: 1
summary: Columns are participants, time runs down the page, and an arrow is a message.
---

Here is a very short story. A customer asks a barista for a coffee, and the barista hands one
over. This is the same story as a chart:

```lsc
lsc-alpha existential
  customer ->> barista: order
  barista ->> customer: coffee
```

Read it like this:

- **Each column is a participant**: someone, or something, that takes part in the story. Here
  there are two, `customer` and `barista`. Each has a box at the top with its name, and a
  line running down from it.
- **Time runs down the page.** Things near the top happen before things lower down.
- **Each arrow is a message** from one participant to another, with a label saying what it is.
  The customer sends `order` to the barista. After that, the barista sends `coffee` back.

A "message" doesn't have to be words. Handing over a cup is a message too: something passes
from one participant to another.

## The text behind the picture

Under every chart in this tutorial is the text that draws it. Three lines are all it takes.

The first line, `lsc-alpha existential`, tells the page what kind of picture to draw. For now,
read it as "here is one way things can go". Lesson 6 explains what else it can say.

Every other line is a message, written as

```
sender ->> receiver: label
```

The arrow `->>` is typed as a dash and two "greater than" signs. Lesson 4 shows a second kind of
arrow.

The spaces at the start of each line are only there to make the text easier to read. You can
leave them out.

Notice that nothing in the text lists the participants. A participant appears the first time a
message mentions it. Columns are placed from left to right in the order participants are first
mentioned. The customer is mentioned first, so the customer's column is on the left.

## Try it

Under the chart above, add a third line in which the customer pays the barista:

```
customer ->> barista: pay
```

The picture updates as you type. If you make a mistake, a red box explains what's wrong, and
"Undo my changes" puts the text back as it was.

:::answer Show a model answer

```lsc
lsc-alpha existential
  customer ->> barista: order
  barista ->> customer: coffee
  customer ->> barista: pay
```

The new arrow goes from left to right, like the first one, and sits at the bottom because it
happens last.
:::

## Check your understanding

Suppose you swapped the two message lines, so that the chart starts with
`barista ->> customer: coffee`. What would change in the picture?

:::answer Show the answer
Two things change. The coffee arrow is now at the top, because it is written first and so
happens first. The columns also swap places: the barista is now mentioned first, so the
barista's column moves to the left.

```lsc
lsc-alpha existential
  barista ->> customer: coffee
  customer ->> barista: order
```

:::
