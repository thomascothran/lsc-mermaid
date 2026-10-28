(ns lsc.pavlov-test
  "Every fixture the skeleton automaton supports, run through pavlov's model
  checker, and the b-thread's behaviour state by state. The automata in
  `test/resources/automata` are written by `pnpm automata:update`."
  (:require [clojure.java.io :as io]
            [clojure.test :refer [deftest is testing]]
            [lsc.pavlov :as lp]
            [tech.thomascothran.pavlov.bthread :as b]
            [tech.thomascothran.pavlov.event :as e]
            [tech.thomascothran.pavlov.model.check :as check]))

(defn- chart
  [fixture]
  (lp/read-automaton (slurp (io/resource (str "automata/" fixture ".json")))))

(def fixtures
  "The fixtures with an automaton, and their mode."
  {"cold-defaults-notes" "existential"
   "crossing-overtaking" "existential"
   "fig01-visible-events" "universal"
   "fig02-car-departure" "universal"
   "fig03-existential" "existential"
   "fig04-prechart-cold-locations" "universal"
   "forbidden-scenario" "universal"})

(defn- event-types
  [automaton]
  (mapv lp/default-event-type (:events automaton)))

(defn- happy-path
  "The chart's events in text order: the activation, then the first enabled
  event at each cut, with every condition true."
  [automaton]
  (let [types (event-types automaton)]
    (loop [id (:start automaton) out []]
      (let [state (get-in automaton [:states id])]
        (case (:kind state)
          "wait" (let [[ev to] (first (:on state))] (recur to (conj out (types ev))))
          "condition" (recur (:ifTrue state) out)
          "outcome" out)))))

(defn- program
  "A b-thread that requests `events` in order, then terminates the program."
  [events]
  (b/scenario (conj (mapv (fn [t] {:request #{t}}) events)
                    {:request #{{:type :done :terminal true}}})))

(defn- check-universal
  [automaton events & [opts]]
  (check/check {:bthreads {:program (program events)}
                :safety-bthreads {:chart (lp/bthread automaton opts)}}))

(defn- check-existential
  [automaton events & [opts]]
  (let [chart (lp/bthread automaton opts)
        completed (keyword (or (:name opts) "lsc") "completed")]
    (check/check {:bthreads {:program (program events) :chart chart}
                  :possible #{completed}})))

(defn- violation-reasons
  [result]
  (set (map (comp :reason :event) (:safety-violations result))))

(deftest every-fixture-is-tested
  (is (= (set (keys fixtures))
         (set (keep (fn [f] (second (re-matches #"(.*)\.json" (.getName f))))
                    (file-seq (io/file (io/resource "automata"))))))))

(deftest fixtures-load
  (doseq [[fixture mode] fixtures]
    (testing fixture
      (let [a (chart fixture)]
        (is (= mode (:mode a)))
        (is (seq (happy-path a)))))))

;; ---------------------------------------------------------------------------
;; Universal charts

(deftest fig02-car-departure
  (let [a (chart "fig02-car-departure")
        path (happy-path a)]
    (is (= [:env->car/setDest :car->carHandler/departReq :carHandler->car/departAck
            :car->cruiser/start :cruiser->car/started :car->cruiser/engage]
           path))
    (testing "a program that carries out the chart satisfies it"
      (is (nil? (check-universal a path))))
    (testing "the chart applies only after its activation message"
      (is (nil? (check-universal a (rest path))))
      (is (nil? (check-universal a []))))
    (testing "stopping at a hot cut breaks a promise"
      (let [result (check-universal a (take 2 path))]
        (is (:liveness-violation result))
        (is (empty? (:safety-violations result)))))
    (testing "an event out of order is a violation"
      (let [result (check-universal a [:env->car/setDest :carHandler->car/departAck])]
        (is (= #{:out-of-order} (violation-reasons result)))
        (is (= :carHandler->car/departAck
               (-> result :safety-violations first :event :event)))))
    (testing "an event the chart doesn't contain is ignored"
      (is (nil? (check-universal a (concat (take 2 path) [:other] (drop 2 path))))))
    (testing "the chart is followed again after it completes"
      (is (nil? (check-universal a (concat path path))))
      (is (:liveness-violation (check-universal a (concat path (take 2 path))))))
    (testing ":enforce blocks the event instead of reporting it"
      (let [result (check-universal a [:env->car/setDest :carHandler->car/departAck]
                                    {:mode :enforce})]
        (is (empty? (:safety-violations result)))
        (is (= [[:env->car/setDest]] (mapv :path (:deadlocks result))))))))

(deftest fig01-visible-events
  (let [a (chart "fig01-visible-events")
        path (happy-path a)]
    (testing "a visible event out of place is a violation"
      (is (= #{:out-of-order}
             (violation-reasons (check-universal a [:car->carHandler/arrivReq])))))
    (testing "without an activation, promises start with the chart's first event"
      (is (nil? (check-universal a [])))
      (is (nil? (check-universal a path)))
      (is (nil? (check-universal a (concat path path))))
      (is (:liveness-violation (check-universal a (take 1 path)))))
    (testing "events on unrelated lines may interleave in any order"
      (let [reordered [:passenger->destPanel/pressButton :env->car/setDest
                       :destPanel->passenger/flashSign :car->carHandler/departReq
                       :carHandler->car/departAck]]
        (is (empty? (:safety-violations (check-universal a reordered))))))))

(deftest fig04-prechart-cold-locations
  (let [a (chart "fig04-prechart-cold-locations")
        path (happy-path a)]
    (is (= [:carHandler->car/departAck :proxSensor->car/alert100
            :car->carHandler/arrivReq :carHandler->car/arrivAck]
           path))
    (is (nil? (check-universal a path)))
    (testing "the body is hot until arrivReq, then cold"
      (is (:liveness-violation (check-universal a (take 2 path))))
      (is (nil? (check-universal a (take 3 path)))))
    (testing "a pre-chart that is not matched activates nothing"
      (is (nil? (check-universal a [:proxSensor->car/alert100 :car->carHandler/arrivReq])))
      (is (nil? (check-universal a [:carHandler->car/departAck :car->carHandler/arrivReq]))))
    (testing "the event that ends the pre-chart can start it again"
      (is (:liveness-violation
           (check-universal a [:carHandler->car/departAck :carHandler->car/departAck
                               :proxSensor->car/alert100]))))))

(deftest forbidden-scenario
  (let [a (chart "forbidden-scenario")]
    (testing "the forbidden sequence is a violation"
      (let [result (check-universal a [:car->carHandler/departReq :car->carHandler/arrivReq])]
        (is (= #{:hot-condition} (violation-reasons result)))
        (is (= "c1" (-> result :safety-violations first :event :condition)))))
    (testing "anything else is allowed"
      (is (nil? (check-universal a [:car->carHandler/departReq])))
      (is (nil? (check-universal a [:car->carHandler/arrivReq :car->carHandler/departReq]))))))

;; ---------------------------------------------------------------------------
;; Existential charts

(deftest fig03-existential
  (let [a (chart "fig03-existential")
        path (happy-path a)
        opts {:name "car-stopping"}]
    (testing "a program that carries out the chart satisfies it"
      (is (nil? (check-existential a path opts))))
    (testing "a program that doesn't, doesn't"
      (is (= #{:car-stopping/completed}
             (:impossible (check-existential a (reverse path) opts))))
      (is (= #{:car-stopping/completed}
             (:impossible (check-existential a (butlast path) opts)))))
    (testing "an existential chart never holds a hot bid"
      (is (not (:liveness-violation (check-existential a (take 2 path) opts)))))))

(deftest crossing-overtaking
  (let [a (chart "crossing-overtaking")
        opts {:name "crossing"}]
    (is (nil? (check-existential a (happy-path a) opts)))
    (testing "the messages cross: each is sent before either is received"
      (is (nil? (check-existential
                 a
                 [:client->server/request! :server->client/notify!
                  :client->server/request? :server->client/notify?
                  :client->server/data! :client->server/data!
                  :client->server/data? :client->server/data?]
                 opts))))
    (testing "a receipt before its send is not the chart"
      (is (seq (:impossible (check-existential
                             a
                             [:server->client/notify! :server->client/notify?
                              :client->server/request! :client->server/request?
                              :client->server/data! :client->server/data!
                              :client->server/data? :client->server/data?]
                             opts)))))))

(deftest cold-defaults-notes
  (let [a (chart "cold-defaults-notes")
        path (happy-path a)
        opts {:name "checkout"}]
    (testing "conditions without predicates are explored both ways"
      (is (nil? (check-existential a path opts)))
      (let [lts (-> (check/check {:bthreads {:program (program path)
                                             :chart (lp/bthread a opts)}
                                  :possible #{:no-such-event}})
                    meta
                    :lts)
            choices (into #{}
                          (comp (map :event)
                                (filter #(= :checkout/condition (e/type %)))
                                (map (juxt :condition :value)))
                          (:edges lts))]
        (is (= #{["c1" true] ["c1" false] ["c2" true] ["c2" false]} choices))))
    (testing "predicates decide conditions"
      (is (nil? (check-existential a path (assoc opts :conditions {"c1" (constantly true)
                                                                   "paid" (constantly true)}))))
      (is (= #{:checkout/completed}
             (:impossible (check-existential
                           a path (assoc opts :conditions {"c1" (constantly true)
                                                           "c2" (constantly false)}))))))))

;; ---------------------------------------------------------------------------
;; The b-thread, step by step

(defn- notify
  [bthread & events]
  (last (map #(b/notify! bthread %) (cons nil events))))

(deftest bids
  (let [a (chart "fig02-car-departure")]
    (testing "inactive, the chart waits only on its activation"
      (is (= {:wait-on #{:env->car/setDest}} (notify (lp/bthread a)))))
    (testing "in the body, it waits on its visible events and is hot"
      (let [bid (notify (lp/bthread a) :env->car/setDest)]
        (is (:hot bid))
        (is (= #{:car->carHandler/departReq :carHandler->car/departAck
                 :car->cruiser/start :cruiser->car/started :car->cruiser/engage}
               (:wait-on bid)))
        (is (nil? (:block bid)))))
    (testing ":enforce blocks the visible events that are not enabled"
      (is (= #{:carHandler->car/departAck :car->cruiser/start :cruiser->car/started
               :car->cruiser/engage}
             (:block (notify (lp/bthread a {:mode :enforce}) :env->car/setDest)))))
    (testing "a violation names the chart and the event"
      (is (= {:request #{{:type :car-departure/violated
                          :invariant-violated true
                          :reason :out-of-order
                          :event {:type :car->cruiser/start}}}}
             (notify (lp/bthread a) :env->car/setDest {:type :car->cruiser/start}))))
    (testing "after its violation event the chart starts again"
      (let [bt (lp/bthread a)
            bid (notify bt :env->car/setDest :car->cruiser/start)]
        (is (= {:wait-on #{:env->car/setDest}} (b/notify! bt (first (:request bid)))))))))

(deftest options
  (let [a (chart "fig02-car-departure")]
    (testing ":event-type maps chart events to program events"
      (is (= {:wait-on #{"env setDest"}}
             (notify (lp/bthread a {:event-type (fn [{:keys [from name]}] (str from " " name))})))))
    (testing ":enforce is for universal charts only"
      (is (thrown? clojure.lang.ExceptionInfo
                   (lp/bthread (chart "fig03-existential") {:mode :enforce}))))
    (testing "an unknown :mode is rejected"
      (is (thrown? clojure.lang.ExceptionInfo (lp/bthread a {:mode :strict}))))))

(deftest condition-predicates
  (let [a (chart "cold-defaults-notes")
        seen (atom nil)
        bt (lp/bthread a {:name "checkout"
                          :conditions {"c1" (fn [ctx] (reset! seen ctx) true)}})]
    (notify bt :shopper->shop/checkout)
    (is (= {:condition {:id "c1" :text "total > 0 and not paid" :temp "hot"}
            :event :shopper->shop/checkout
            :events [:shopper->shop/checkout]}
           @seen))
    (testing "a condition without a predicate is a choice, and blocks visible events"
      (let [bid (notify bt :shop->end/charge! :shop->end/charge? :end->shop/charged!
                        :end->shop/charged?)]
        (is (= #{{:type :checkout/condition :condition "c2" :value true}
                 {:type :checkout/condition :condition "c2" :value false}}
               (:request bid)))
        (is (contains? (:block bid) :shop->shopper/receipt))))))

(deftest read-automaton
  (is (thrown? clojure.lang.ExceptionInfo (lp/read-automaton "{\"automatonVersion\": 2}"))))
