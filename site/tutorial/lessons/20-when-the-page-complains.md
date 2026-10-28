---
title: When the page complains
part: 4
summary: Errors and warnings, the common mistakes, and saving and sharing your charts.
---

Sooner or later, the page will tell you something is wrong. It does so in two ways.

## Errors that stop the drawing

Some mistakes leave the page unable to draw the chart at all. It shows a red box with the
problem and the line it's on, and keeps the last good drawing, faded, so you can see where you
were. This chart uses an arrow from another kind of diagram:

```lsc expect=error
lsc-alpha universal
  title Serving a latte
  activation on customer ->> barista: order
  barista -->> customer: latte
```

The message explains that `-->>` is not an arrow in this notation and shows what to write
instead. Many messages work like that: read them to the end.

## Problems marked on the drawing

Other problems don't stop the drawing. The chart is drawn, a numbered marker appears beside the
row with the problem, and the problems are listed under the chart. Some are **warnings**: the
chart probably doesn't say what you meant. Others are **errors**: the chart breaks a rule of
the notation, though it can still be drawn.

```lsc expect=error
lsc-alpha universal
  title Serving the queue
  actor customer as "Customer"
  participant barista as "Barista"
  activation on customer ->> barista: order

  subchart "Next customer" repeat *
    barista ->> customer: coffee
  end
  hot progress barista
```

There are two problems here. The `repeat *` has no cold check, so it can never end (a warning,
lesson 14). And `hot progress barista` asks the barista to move on when the barista has nothing
left to do (an error, lesson 9).

In the playground, **Show diagnostics** switches the markers and the list off, for a clean
picture to export. The problems are still there; you just don't see them.

## Common mistakes

| You wrote                                                     | The fix                                                                                                  |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `barista -->> customer: latte`                                | Dashes mean cold, not a reply: `cold barista ->> customer: latte`, or just `barista ->> customer: latte` |
| `lsc-alpha` alone on the first line                           | Say which kind of chart: `lsc-alpha universal` or `lsc-alpha existential`                                |
| A `subchart`, `if`, `coregion` or `prechart` with no `end`    | Every block needs an `end`. The message may only say that it found something unexpected                  |
| `receive barista customer: order`                             | `receive barista from customer: order`                                                                   |
| `create participant rider`                                    | `create rider by till`: say who brings the rider in                                                      |
| `cold` or `hot` inside a `prechart`                           | A prechart is only watched, so its contents have no temperature                                          |
| `condition waiter: ready`, with no waiter in the chart        | Checks, chapters and notes can only name participants the chart already has                              |
| A participant called `end`, or another word the notation uses | Put it in quotes: `participant "end" as "End"`                                                           |

## Saving and sharing

Everything you need is in the playground (the **Editor** button at the top of the page):

- The playground keeps your last chart in this browser.
- **Copy link** copies a link that reopens your chart, with your settings. The chart is inside
  the link itself, so nothing is uploaded anywhere.
- **Download SVG** and **Copy SVG** save the picture as an image that stays sharp at any size.
- **Theme** changes the colours, and **Temperature cue** adds a second clue for cold elements
  (lesson 10).
- **Gallery** shows every worked example, including all the paper's figures.

Every chart in this tutorial has an **Open in playground** link that takes your edited version
along.

If you build websites, the project's
[README](https://github.com/thomascothran/lsc-mermaid#using-the-plugin-in-a-page) explains how
to draw these charts on your own pages, and how to turn chart text into image files.

## Try it

Fix both problems in "Serving the queue": let the chapter end when there's no one left to serve,
and remove the line that can't be satisfied. Use a variable `var queue: int`.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Serving the queue
  actor customer as "Customer"
  participant barista as "Barista"
  var queue: int
  activation on customer ->> barista: order

  subchart "Next customer" repeat *
    cold condition barista: queue > 0
    barista ->> customer: coffee
  end
```

Both markers disappear.
:::

## Check your understanding

A chart shows a warning but is drawn as expected. Is it safe to ignore the warning?

:::answer Show the answer
Sometimes. A warning means the chart is valid but probably doesn't say what you meant. Read it,
and check whether it's right. In lesson 6, the warning pointed out that a rule with no trigger
applies all the time; that's almost never what anyone means. If you've checked and the chart
says what you meant, you can leave it.
:::
