---
title: Reading a full chart
part: 4
summary: The rail car from the paper that introduced Live Sequence Charts, one piece at a time.
---

Live Sequence Charts were introduced in a 2001 paper by Werner Damm and David Harel. Its running
example is an automated rail car that carries passengers between terminals. Here is the
paper's most detailed chart of how a car behaves (its Figure 10), written in this notation. It's
big, but you have now met every idea in it.

```lsc expect=warning
lsc-alpha universal
  title Car behavior
  instance destPanel as "DestPanel", terminal as "Terminal"
  instance controlCenter as "Control Center", cruiser as "Cruiser"
  instance car as "Car", carHandler as "CarHandler"
  instance proxSensor as "Proximity Sensor"
  var car.mode: {pass, stop}
  var car.isEmpty: bool
  var car.state: {idle, departure, cruising, arrival}
  activation when car.idle

  subchart "car leaving terminal - called from another terminal"
    cold condition car: idle
    env ->> destPanel: button Pressed
    destPanel ->> terminal: callCar
    terminal ->> controlCenter: sendCar
    controlCenter ->> car: setDest
    timeout car: tm(90)
    condition car: departure
  end

  subchart "Perform departure"
    cold condition car: departure
    coregion car
      car ->> carHandler: departReq
      car ->> cruiser: start
    end
    coregion car
      carHandler ->> car: departAck
      cruiser ->> car: started
    end
    car ->> cruiser: engage
    condition car: cruising
    destroy carHandler
  end

  condition car, proxSensor: cruising
  proxSensor ->> car: alert100

  subchart "Perform approach"
    cold condition car: arrival
    car ->> terminal: arrivReq
    create carHandler as "CarHandler" by terminal
    carHandler ->> car: arrivAck

    subchart "Stopping at terminal"
      cold condition car: mode = stop
      proxSensor ->> car: alertStop
      car ->> cruiser: disengage
      if "Stop at terminal" car: "stops_at->isEmpty=TRUE"
        car ->> cruiser: stop
        condition car: idle
      else "Temporary stop at terminal"
        timeout car: tm(90)
        condition car: departure
      end
    end

    subchart "Pass through terminal"
      cold condition car: mode = pass
      car ->> carHandler: departReq
      carHandler ->> car: departAck
      condition car: cruising
      destroy carHandler
    end
  end
```

Take it a piece at a time.

## The cast and the trigger

```
instance destPanel as "DestPanel", terminal as "Terminal"
instance controlCenter as "Control Center", cruiser as "Cruiser"
instance car as "Car", carHandler as "CarHandler"
instance proxSensor as "Proximity Sensor"
var car.mode: {pass, stop}
var car.isEmpty: bool
var car.state: {idle, departure, cruising, arrival}
activation when car.idle
```

Seven participants (lesson 2). The **destination panel** is the button passengers press at a
terminal. The **cruiser** drives the car's motor. The **car handler** looks after the car while
it's at a terminal. The **proximity sensor** tells the car when it's near a terminal.

The car has three variables (lesson 11): whether it will pass or stop at the next terminal, a
true-or-false fact, and its state, which is one of four words.

The chart is a universal rule (lesson 6), and it starts whenever the car is idle (lesson 7).
`car.idle` is short for `car.state = idle`.

## Chapter 1: being called

```
subchart "car leaving terminal - called from another terminal"
  cold condition car: idle
  env ->> destPanel: button Pressed
  …
  controlCenter ->> car: setDest
  timeout car: tm(90)
  condition car: departure
end
```

A chapter (lesson 13) that opens with a cold check: if the car isn't idle, skip it. Someone
outside the chart (lesson 5) presses the button at another terminal. The request passes from
the panel to the terminal, to the control centre, to the car. The car waits 90 seconds
(lesson 17), and then must be in the `departure` state: a hot check.

## Chapter 2: departing

```
subchart "Perform departure"
  cold condition car: departure
  coregion car
    car ->> carHandler: departReq
    car ->> cruiser: start
  end
  coregion car
    carHandler ->> car: departAck
    cruiser ->> car: started
  end
  …
  destroy carHandler
end
```

The car asks the car handler for permission to leave and tells the cruiser to start, in either
order (lesson 16). Then it collects both answers, again in either order. Both coregions are
needed: the car must send both requests before it collects either answer. Once cruising, the
car handler leaves the story (lesson 17): the car no longer needs it.

## In between

```
condition car, proxSensor: cruising
proxSensor ->> car: alert100
```

A check shared by the car and the proximity sensor (lesson 11): both meet at it, and it must
be true. Then the sensor warns the car that it is 100 metres from a terminal.

## Chapter 3: approaching

```
subchart "Perform approach"
  cold condition car: arrival
  car ->> terminal: arrivReq
  create carHandler as "CarHandler" by terminal
  carHandler ->> car: arrivAck
  subchart "Stopping at terminal"
    …
  end
  subchart "Pass through terminal"
    …
  end
end
```

The car tells the terminal it's arriving, and the terminal creates a new car handler for it: a
fresh box in the same column (lesson 17).

The page shows a warning on the `create` line, and it has found a real gap in the paper's
chart. If chapter 2 is skipped at its cold check, the first car handler never leaves the story.
Chapter 3 then brings in a second car handler while the first is still there, and there can't
be two in one column. The warning names the line where the first one should have left.

Then come two chapters inside this chapter. Each
opens with a cold check on the car's mode, so only the one that matches happens.

Inside "Stopping at terminal" is a choice (lesson 15). Its check is written in quotes because
the paper writes it in a notation this page doesn't read, `stops_at->isEmpty=TRUE`: "the car has
no more stops to make". If so, the car stops and becomes idle. Otherwise it makes a temporary
stop, waits 90 seconds, and departs again.

## Try it

The paper's car waits 90 seconds in two places. Change the chart so that the temporary stop
waits only 30 seconds.

:::answer Show a model answer
Change the second `timeout car: tm(90)`, the one inside the `else`, to `timeout car: tm(30)`.
The first one, in chapter 1, is a different wait. Only the label changes in the picture:
charts don't measure time (lesson 17), so the number is for the reader.
:::

## Check your understanding

Chapters 2 and 3 both open with a cold check. Suppose the car reaches chapter 3 while its state
is still `cruising`, not `arrival`. What happens, and is the rule broken?

:::answer Show the answer
The cold check `cold condition car: arrival` is false, so chapter 3 is skipped (lesson 13).
That's the end of the chart, so the rule finishes quietly. Nothing is broken: a false cold
check is never a failure. Only a false hot check, or a participant stopping where its line is
hot, breaks a rule.
:::
