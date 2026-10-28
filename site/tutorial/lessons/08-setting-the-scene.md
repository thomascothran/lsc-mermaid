---
title: Setting the scene
part: 2
summary: A prechart says “once this has happened, then this must follow”.
---

A trigger is one message. Often a rule only applies after a little story has played out:
"once a customer has ordered **and paid**, the barista must hand over the drink". That
little story is called a **prechart**.

```lsc
lsc-alpha universal
  title Paid orders are served
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"

  prechart
    customer ->> barista: order(latte)
    customer ->> till: pay
  end

  barista ->> customer: latte
```

The prechart is written between `prechart` and `end`, before the rest of the chart. In the
picture it is the six-sided frame at the top, with dashed edges. The participants' boxes sit
inside it. Below it, inside the solid frame, is the part of the rule that must happen. That
part is called the chart's **body**.

## How a prechart works

A prechart is **watched**, not demanded. Read the chart as:

1. Watch for the prechart's story: a customer orders, and then pays.
2. If the whole story happens, the rule starts, and the body must follow: the barista hands
   over a latte.
3. If the story stops partway, or goes differently, nothing is required. A customer who orders
   and then leaves without paying hasn't broken the rule. The rule never started.

That's why the prechart's frame is dashed: nothing in it has to happen. Inside the prechart,
the lines and arrows are drawn solid anyway. In a prechart they only describe the story to
watch for, so there's no "may" or "must" to show.

The story in a prechart follows the same "what comes before what" facts as any chart (lesson
3). And every event in the prechart comes before every event in the body: the body starts only
once the whole prechart has happened.

## With a trigger as well

A chart can have a trigger and a prechart. The trigger comes first: the rule is only watched for
after the trigger, and the body must follow once the prechart has played out.

```lsc
lsc-alpha universal
  title Paid phone orders are marked
  participant barista as "Barista", till as "Till"
  activation on env ->> barista: phone order

  prechart
    env ->> till: card payment
  end

  barista ->> till: mark as paid
```

## Try it

Add one more step to the prechart of "Paid orders are served": after the payment, the till
prints a receipt for the customer. Only then must the barista hand over the latte.

:::answer Show a model answer

```lsc
lsc-alpha universal
  title Paid orders are served
  actor customer as "Customer"
  participant barista as "Barista", till as "Till"

  prechart
    customer ->> barista: order(latte)
    customer ->> till: pay
    till ->> customer: receipt
  end

  barista ->> customer: latte
```

:::

## Check your understanding

The till breaks down just after the customer pays, and never prints the receipt. Under the
model answer's rule, must the barista still hand over the latte?

:::answer Show the answer
No. The prechart never finished, so the rule never started, and the rule demands nothing. The
café might well still serve the latte, but this rule doesn't say it must.
:::
