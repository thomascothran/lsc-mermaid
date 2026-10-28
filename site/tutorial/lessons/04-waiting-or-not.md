---
title: Waiting or not
part: 1
summary: Hand-overs and letters, and letters that cross or overtake each other.
---

Some messages are like handing someone a cup: the giver and the taker do it together. Others
are like posting a letter: the sender drops it in the box and gets on with the day, and the
letter arrives later. Charts draw these two kinds differently.

```lsc
lsc-alpha existential
  title A hand-over and a ticket
  actor customer as "Customer"
  participant barista as "Barista", kitchen as "Kitchen"

  customer ->> barista: order(latte, toast)
  barista -) kitchen: ticket(toast)
  barista ->> customer: latte
```

## Two arrows

- **`->>` is a hand-over.** The sender waits until the message has been received. It is drawn
  with a filled arrowhead. In the jargon, it is a _synchronous_ message.
- **`-)` is a letter.** The sender carries on straight away. It is drawn with an open arrowhead.
  It is an _asynchronous_ message.

This changes what comes before what. In the chart above, the barista posts the toast ticket to
the kitchen and then hands over the latte. Because the ticket is a letter, the barista doesn't
wait for the kitchen to pick it up. The kitchen receiving the ticket and the customer receiving
the latte are not ordered: either can happen first.

If the ticket were a hand-over (`->>`), the barista would wait for the kitchen to take it
before doing anything else. The kitchen would then always have the ticket before the customer
has the latte.

## Letters that take time

On one line, `barista -) kitchen: ticket` draws the letter straight across, as if it arrived at
once. To show a letter that takes a while, write the sending and the receiving as separate
lines:

```
send barista -) kitchen: ticket(toast)
receive kitchen from barista: ticket
```

`send` says where the letter leaves. `receive … from …` says where it arrives, and the arrow
slopes down between the two. The receiving line names the message without its details: the
name is enough to match it to the sending.

Separate lines let letters do things one-line messages can't. Here the barista sends a ticket
while the kitchen sends news of its own. Each is posted before the other arrives, so the two
letters cross:

```lsc
lsc-alpha existential
  title Crossing letters
  participant barista as "Barista", kitchen as "Kitchen"

  send barista -) kitchen: ticket(toast)
  send kitchen -) barista: out of bread
  receive kitchen from barista: ticket
  receive barista from kitchen: out of bread
```

## Letters that overtake

When the same participant sends two letters with the same name, give each a label starting
with `#`, so the chart knows which receiving goes with which sending. Then a later letter can
arrive first:

```lsc
lsc-alpha existential
  title Overtaking tickets
  participant barista as "Barista", kitchen as "Kitchen"

  send #first barista -) kitchen: ticket(toast)
  send #second barista -) kitchen: ticket(soup)
  receive #second kitchen from barista: ticket
  receive #first kitchen from barista: ticket
```

Keep `send` and `receive` for letters (`-)`). A hand-over can't take time to arrive: the sender
is waiting for it.

## Try it

In "Overtaking tickets", swap the two `receive` lines so the tickets arrive in the order they
were sent. What happens to the arrows?

:::answer Show a model answer

```lsc
lsc-alpha existential
  title Tickets in order
  participant barista as "Barista", kitchen as "Kitchen"

  send #first barista -) kitchen: ticket(toast)
  send #second barista -) kitchen: ticket(soup)
  receive #first kitchen from barista: ticket
  receive #second kitchen from barista: ticket
```

The arrows no longer cross. The first ticket arrives first, and the second follows.
:::

## Check your understanding

In the first chart, change `barista -) kitchen: ticket(toast)` to
`barista ->> kitchen: ticket(toast)`. Which of these is now fixed: the kitchen gets the ticket
before the customer gets the latte, or the other way round?

:::answer Show the answer
The kitchen gets the ticket first. With a hand-over, the barista waits until the kitchen has
received the ticket, and only then hands over the latte.
:::
