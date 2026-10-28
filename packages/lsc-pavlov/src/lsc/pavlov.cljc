(ns lsc.pavlov
  "Run a Live Sequence Chart as a pavlov b-thread.

  `lsc-model` turns a basic chart into its skeleton automaton and exports it as
  JSON (`mermaid-lsc --automaton chart.lsc`). This namespace interprets that
  automaton; it holds no semantics of its own.

  ```clojure
  (require '[lsc.pavlov :as lp])

  (def departure (lp/read-automaton (slurp \"car-departure.json\")))

  (lp/bthread departure {:name \"car-departure\"})
  ```

  A universal chart reports a violation with an `:invariant-violated` event and
  holds `:hot` bids while it has a promise to keep, so it goes in the model
  checker's `:safety-bthreads`. An existential chart requests a completed event
  when it is carried out, for the model checker's `:possible`.

  See \"Skeleton automaton and pavlov\" in the proposal."
  (:require [clojure.string :as str]
            [tech.thomascothran.pavlov.bthread :as b]
            [tech.thomascothran.pavlov.event :as e]
            #?(:bb [cheshire.core :as json]
               :clj [clojure.data.json :as json])))

(def automaton-version 1)

(defn read-automaton
  "Parse the JSON form of a skeleton automaton into a map with keyword keys."
  [text]
  (let [automaton #?(:bb (json/parse-string text true)
                     :clj (json/read-str text :key-fn keyword)
                     :cljs (js->clj (js/JSON.parse text) :keywordize-keys true))]
    (when-not (= automaton-version (:automatonVersion automaton))
      (throw (ex-info "Unsupported skeleton automaton version"
                      {:automatonVersion (:automatonVersion automaton)
                       :supported automaton-version})))
    automaton))

(defn default-event-type
  "The pavlov event type of a chart event: `:car->carHandler/departReq` for a
  synchronous message, with `!` (send) or `?` (receipt) appended to the name
  for an asynchronous one."
  [{:keys [from to name dir]}]
  (keyword (str from "->" to) (str name dir)))

(defn- default-name
  [automaton]
  (let [title (some-> (:title automaton) str/trim not-empty)]
    (if title
      (str/replace (str/lower-case title) #"\s+" "-")
      "lsc")))

(defn- compile-chart
  "Precompute what each state of the automaton waits on, enables and blocks."
  [automaton {:keys [event-type conditions mode] :as opts}]
  (let [universal? (= "universal" (:mode automaton))
        enforce? (= :enforce mode)
        _ (when-not (#{:monitor :enforce} mode)
            (throw (ex-info "`:mode` must be :monitor or :enforce" {:mode mode})))
        _ (when (and enforce? (not universal?))
            (throw (ex-info "`:mode :enforce` applies to universal charts only"
                            {:mode (:mode automaton)})))
        chart-name (or (:name opts) (default-name automaton))
        types (mapv (fn [ev] (event-type (select-keys ev [:from :to :name :kind :dir])))
                    (:events automaton))
        visible (into #{} (keep-indexed (fn [i ev] (when (:visible ev) (types i))))
                      (:events automaton))
        predicate (fn [{:keys [id text]}]
                    (or (get conditions id) (get conditions (keyword id))
                        (get conditions text)))
        states
        (mapv (fn [state]
                (case (:kind state)
                  "wait"
                  (let [on (into {} (map (fn [[ev to]] [(types ev) to])) (:on state))
                        deviation (keyword (:deviation state))
                        deviations (if (= :ignore deviation)
                                     #{}
                                     (into #{} (remove on) visible))]
                    {:kind :wait
                     :hot (and universal? (:hot state))
                     :on on
                     :deviation deviation
                     :deviations deviations
                     :wait-on (into (set (keys on)) deviations)
                     :block (when (and enforce? (= :abort deviation)) deviations)})

                  "condition"
                  (let [c (get (:conditions automaton) (:condition state))]
                    {:kind :condition
                     :hot (and universal? (:hot state))
                     :condition (select-keys c [:id :text :temp])
                     :value (:value c)
                     :predicate (predicate c)
                     :if-true (:ifTrue state)
                     :if-false (:ifFalse state)
                     :temp (:temp c)})

                  "outcome"
                  {:kind :outcome
                   :outcome (keyword (:outcome state))}))
              (:states automaton))]
    {:universal? universal?
     :name chart-name
     :violated (keyword chart-name "violated")
     :completed (keyword chart-name "completed")
     :condition (keyword chart-name "condition")
     :visible visible
     :track? (boolean (seq conditions))
     :start (:start automaton)
     :states states}))

;; ---------------------------------------------------------------------------
;; Stepping
;;
;; The b-thread's state is a plain value, so the model checker can save and
;; restore it: `{:at state-id}`, plus `:events` when conditions have
;; predicates, or `{:emit event}` while it requests one of its own events.

(declare enter)

(defn- fresh
  [chart]
  (cond-> {} (:track? chart) (assoc :events [])))

(defn- restart
  "Start the chart again. A deviating event that ended the pre-chart is
  offered to the start state, which ignores anything it doesn't enable."
  [chart offered]
  (let [st (enter chart (fresh chart) (:start chart) {})]
    (if-let [event (and offered (contains? st :at) offered)]
      (let [state (get-in chart [:states (:at st)])
            to (get-in state [:on (e/type event)])]
        (if (and to (= :wait (:kind state)))
          (enter chart (cond-> st (:track? chart) (update :events conj event)) to {:event event})
          st))
      st)))

(defn- violation
  [chart fields]
  {:emit (merge {:type (:violated chart) :invariant-violated true} fields)})

(defn- outcome
  [chart outcome-kind {:keys [event condition]}]
  (case outcome-kind
    :completed (if (:universal? chart)
                 (restart chart nil)
                 {:emit {:type (:completed chart)}})
    :exit (restart chart nil)
    :not-activated (restart chart event)
    :abort (if (:universal? chart)
             (violation chart (if condition
                                {:reason :hot-condition :condition condition}
                                {:reason :out-of-order :event event}))
             (restart chart nil))))

(defn- enter
  "Enter state `id`, evaluating conditions that have a value or a predicate,
  until the b-thread must wait. `ctx` holds the `:event` that led here, or the
  `:condition` whose failure did."
  [chart st id ctx]
  (let [state (get-in chart [:states id])]
    (case (:kind state)
      :wait (assoc st :at id)
      :condition
      (let [value (cond (boolean? (:value state)) (:value state)
                        (:predicate state)
                        (boolean ((:predicate state)
                                  {:condition (:condition state)
                                   :event (:event ctx)
                                   :events (:events st [])})))]
        (cond (true? value) (enter chart st (:if-true state) ctx)
              (false? value) (enter chart st (:if-false state)
                                    {:condition (get-in state [:condition :id])})
              :else (assoc st :at id)))
      :outcome (outcome chart (:outcome state) ctx))))

(defn- choose
  "Follow a condition chosen by the model checker."
  [chart st state event]
  (if (:value event)
    (enter chart (dissoc st :at) (:if-true state) {:event event})
    (enter chart (dissoc st :at) (:if-false state)
           {:condition (get-in state [:condition :id])})))

(defn- advance
  [chart st event]
  (cond
    (contains? st :emit) (restart chart nil)

    :else
    (let [state (get-in chart [:states (:at st)])
          t (e/type event)]
      (case (:kind state)
        :condition (if (= t (:condition chart))
                     (choose chart st state event)
                     st)
        :wait
        (if-let [to (get-in state [:on t])]
          (enter chart (cond-> st (:track? chart) (update :events conj event)) to {:event event})
          (if (contains? (:deviations state) t)
            (case (:deviation state)
              :not-activated (restart chart event)
              :abort (outcome chart :abort {:event event})
              st)
            st))))))

(defn- bid
  [chart st]
  (if-let [own (:emit st)]
    {:request #{own}}
    (let [state (get-in chart [:states (:at st)])]
      (case (:kind state)
        :wait (cond-> {:wait-on (:wait-on state)}
                (:hot state) (assoc :hot true)
                (seq (:block state)) (assoc :block (:block state)))
        :condition (let [id (get-in state [:condition :id])]
                     (cond-> {:request #{{:type (:condition chart) :condition id :value true}
                                         {:type (:condition chart) :condition id :value false}}
                              :block (:visible chart)}
                       (:hot state) (assoc :hot true)))))))

(defn bthread
  "Return a new b-thread that follows the chart of `automaton`, as read by
  `read-automaton`. B-threads are stateful: call this once for each program
  or model check.

  Options:
  - `:name` - the namespace of the b-thread's own events. Defaults to the
    chart's title, lower-cased with spaces replaced by `-`, or \"lsc\".
  - `:event-type` - a function from `{:from :to :name :kind :dir}` to the
    pavlov event type of a chart event. `:kind` is \"synch\" or \"asynch\";
    `:dir` is \"!\" or \"?\" for an asynchronous event. Defaults to
    `default-event-type`.
  - `:conditions` - a map from a condition's id (\"c1\", \"c2\", …) or text to
    a predicate. An id takes precedence over a text. A predicate receives
    `{:condition {:id :text :temp} :event e :events [...]}`, where `:events`
    are the chart events since the chart last started. A condition with
    neither a predicate nor a constant value becomes a choice the model
    checker explores: the b-thread requests a true and a false
    `<name>/condition` event and blocks the chart's visible events.
  - `:mode` - `:monitor` (default) or `:enforce`, which also blocks the
    events that would break a universal chart.

  Events the b-thread requests:
  - `{:type <name>/violated :invariant-violated true :reason r ...}` when a
    universal chart is broken; `:reason` is `:out-of-order` (with `:event`)
    or `:hot-condition` (with `:condition`).
  - `{:type <name>/completed}` when an existential chart completes.
  - `{:type <name>/condition :condition id :value v}` as described above."
  ([automaton] (bthread automaton nil))
  ([automaton opts]
   (let [chart (compile-chart automaton
                              (merge {:event-type default-event-type :mode :monitor}
                                     (into {} (remove (comp nil? val)) opts)))]
     (b/step (fn [st event]
               (let [st' (if (nil? st)
                           (enter chart (fresh chart) (:start chart) {})
                           (advance chart st event))]
                 [st' (bid chart st')]))))))
