# Data contract

Components talk only through these four JSON shapes (see `shared/contracts/`).

```
C1 Observation  ->  C2 Transmission(payload=Observation)  ->  DB  ->  C3 RiskAssessment  ->  C4 Recommendation
```

Each component implements ONE entry function; the backend router calls it:

| Component | Function | Input | Output |
|---|---|---|---|
| C1 | `component1_sensing.src.adaptive_sampling.decide(reading, context)` | raw reading + context | Observation |
| C2 | `component2_comms.src.routing.deliver(observation, network_state)` | Observation | Transmission |
| C3 | `component3_prediction.src.predict.assess(history_df)` | recent observations + rainfall | RiskAssessment |
| C4 | `component4_decision.src.recommender.recommend(assessments, resources, comm_status)` | list of RiskAssessment | list of Recommendation |

Sites used in the demo: Ambatale, Biyagama, Hanwella (Kelani River). Replace with your real sites later.
