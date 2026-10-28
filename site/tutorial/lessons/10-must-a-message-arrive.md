---
title: Must a message arrive?
part: 2
summary: Hot messages must arrive once sent. Cold messages may get lost. Plus “defaults cold” and the temperature cue.
---

Messages have a temperature too. Every message so far has been drawn with a solid line, which
means **hot**: once sent, it must arrive. A **cold** message, drawn dashed, may get lost on the
way.

Here the barista posts a ticket to the kitchen for the customer's toast. The kitchen's printer
sometimes jams, so the ticket may never arrive. Either way, the barista must hand over the
latte.

```lsc
lsc-alpha universal
  title Tickets can get lost
  actor customer as "Customer"
  participant barista as "Barista", kitchen as "Kitchen"
  activation on customer ->> barista: order(latte, toast)

  cold progress kitchen
  cold barista -) kitchen: ticket(toast)
  barista ->> customer: latte
```

Put `cold` in front of a message to make it cold, or `hot` to make it hot. Hot is the usual
setting, so you rarely need to write `hot`.

## Three things to check

Whether a message must be sent, and whether it must arrive, depends on three things:

| Question                         | Decided by                                                |
| -------------------------------- | --------------------------------------------------------- |
| Must it be sent?                 | The sender's line: is the point before the sending hot?   |
| Once sent, must it arrive?       | The message: is it hot?                                   |
| Must the receiver get it anyway? | The receiver's line: is the point before the receipt hot? |

In "Tickets can get lost":

- The barista's line is hot, so the barista must send the ticket.
- The ticket is cold, so it may get lost.
- The kitchen's line is cold from the top (`cold progress kitchen`), so the kitchen doesn't
  have to receive it.

All three matter. Without `cold progress kitchen`, the kitchen's line would be hot: the kitchen
would have to move past its first point, which is receiving the ticket. The ticket would have to
arrive after all, cold or not.

## Most things optional: `defaults cold`

Some charts are mostly "may", with a few "musts". Rather than writing `cold` everywhere, put
`defaults cold` near the top. Then every point, message and check is cold unless marked `hot`.

```lsc
lsc-alpha universal
  title Free cookies are logged
  defaults cold
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"
  activation on customer ->> barista: complaint

  barista ->> customer: free cookie
  hot progress barista
  hot barista ->> till: log(cookie)
```

The barista may hand out a free cookie, but doesn't have to. A barista who does must then log
it on the till. The `log` message is hot, so the till must receive it, even though the till's
line is dashed: a hot message, once sent, must arrive.

## When dashes are hard to see

Telling dashed lines from solid ones can be hard on some screens, in print, or for some
readers. The page can add a second clue. In the playground, the **Temperature cue** menu
offers three settings: line style only, line style plus colour, and line style plus a small "C"
badge on everything cold. Here is the ticket chart with the badges:

```lsc cue=line+badge
lsc-alpha universal
  title Tickets can get lost
  actor customer as "Customer"
  participant barista as "Barista", kitchen as "Kitchen"
  activation on customer ->> barista: order(latte, toast)

  cold progress kitchen
  cold barista -) kitchen: ticket(toast)
  barista ->> customer: latte
```

:::aside For readers who know other sequence diagrams
In many diagrams, a dashed arrow means a reply. Not here: a dashed arrow always means a cold
message. Live Sequence Charts have no reply arrows. A reply is just another message.
:::

## Try it

In "Tickets can get lost", remove the line `cold progress kitchen`. What changes in the picture,
and what does the rule now demand of the kitchen?

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Tickets can get lost
  actor customer as "Customer"
  participant barista as "Barista", kitchen as "Kitchen"
  activation on customer ->> barista: order(latte, toast)

  cold barista -) kitchen: ticket(toast)
  barista ->> customer: latte
```

The kitchen's line turns solid down to the ticket. The kitchen must now move past the top of
its line, which means receiving the ticket. So the ticket must arrive after all, even though
the message is still drawn dashed.
:::

## Check your understanding

In "Free cookies are logged", a barista receives a complaint and does nothing. Has the rule been
broken?

:::answer Show the answer
No. With `defaults cold`, the top of the barista's line is cold, so the barista may stop there.
The rule only demands something once the barista has handed out a cookie.
:::
