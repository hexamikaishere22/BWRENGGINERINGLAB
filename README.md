# BWR Engineering Lab v3.2

BWR Engineering Lab v3.2 is a Vite + React + TypeScript educational simulator. The v3.2 release adds slower and interacting disturbances, normalized xenon/iodine dynamics, measurement uncertainty, delayed system-state changes, a cold-shutdown learning path, and a graduated consequence profile. The About page credits **Hexamika** as the creator/project owner.

> **Educational model only.** Every engine coefficient, threshold, system delay, period, inventory, flow, boiling-margin, and severity value is a synthetic index selected for game behavior. These values are not BWR setpoints, equipment data, fuel limits, or validated safety criteria. This software is not for plant operation, design, safety analysis, emergency response, or certified operator training.

## What's new in v3.2

- **Creator credit:** `Hexamika` is the creator/project owner in `src/data/site.ts` and the About page.
- **Five difficulty tiers:** Cadet, Operator, Senior, Expert, and Master. More difficult settings shorten the interval between events and expand the fault catalog / overlap probability.
- **Slow and compound challenges:** dynamic, compound, sensor-deception, gradual-drift, and Master challenge modes. Events are seed-reproducible and can overlap.
- **Iodine/Xenon time-history proxy:** normalized I-135/Xe-135 states can create a delayed xenon rise after a simulated shutdown. The game clock is compressed: one simulated engine second advances one model minute (60:1 relative to the plant-hours display). This is a pedagogical time scale, not a prediction of real xenon timing.
- **Delayed-neutron / period indicator:** a conceptual lag and period proxy make rapid changes visible. The software does not solve design point-kinetics or use real delayed-neutron constants.
- **Level swell indication:** hidden inventory and indicated level are separate. A falling synthetic pressure index can make the indicated level temporarily diverge from inventory.
- **Power/flow map and boiling-margin proxy:** the dashboard displays a global flow/power ratio and dimensionless margin. This is not CHF/MCPR or a real fuel thermal limit calculation.
- **Feedwater temperature/heater disturbance:** an index-based disturbance adds a small feedback to the game model. Its sign and size must not be generalized to all BWR designs.
- **Systems & I&C panel:** separate recirculation A/B availability, conceptual MSIV state, feedwater Auto/Manual, high-/low-pressure injection, RHR, ADS, boron, external/backup power states, and suppression-pool / containment indices.
- **Action delays and abstract interlocks:** selected changes enter a transition queue instead of applying instantly. The interlock model is fictional and does not reproduce any plant/vendor logic.
- **Instrument uncertainty and annunciator:** drift, bias and frozen-channel faults can cause displayed indications to disagree with process proxies. Alarms can be acknowledged individually or together.
- **Rod groups and cold-shutdown path:** groups A-D have separate command/actual indices, a stuck-group fault, and a staged learning checklist from cold shutdown to generation.
- **Graduated consequence profile:** the game scores growing limit exposure, integrity proxy and degradation from tiers 0-5. This is intentionally **not an INES rating**. A training-only SCRAM-latch reset unlocks a restart attempt after the simulated power index has fallen sufficiently low, allowing learners to observe the xenon inhibition effect; the threshold is synthetic and is not a real reset criterion.


The runtime remains lightweight: the primary simulator view uses HTML/CSS/SVG rather than a WebGL renderer. Historian data are capped at 180 points. React UI updates are throttled separately from engine substeps. The challenge seed is retained in the session data to support repeatable testing.



## Main learning areas

The Learn page covers the BWR direct cycle and main components, fission/reactivity, point-kinetics concepts, I-135/Xe-135 time-history, delayed neutrons and reactor period, level swell/shrink and measurement uncertainty, flow/power interactions, CHF and CPR/MCPR concepts, feedwater temperature feedback, system functions, blackout concepts, model verification/validation, and the actual simplified game equations. Every equation is labeled as a general theory equation or a synthetic game proxy.

The About page describes the project's educational purpose and credits **Hexamika** as creator. AI-assisted implementation is credited separately.

## Important modeling boundaries

- Xenon and iodine use normalized state variables and synthetic coefficients. They do not use core-specific nuclear data, flux maps, or a validated iodine/xenon depletion model.
- Period and delayed-neutron behavior are qualitative teaching proxies, not point-kinetics solutions.
- Indicated level / inventory disagreement is a simple swell proxy, not a two-phase vessel instrumentation model.
- Flow/power and boiling-margin values are indices. They are not CHF correlations, CPR/MCPR calculations, fuel limits or operating maps.
- Feedwater-temperature response depends on reactor design and state; this simulator applies a small synthetic coupling only.
- MSIV, ECCS-related switches, RHR, ADS, boron, diesel and electrical interlocks are conceptual state variables with fictional delays. They do not represent actual equipment actuation sequence or protection logic.
- The 0-5 severity profile is a game consequence scale. INES is a public communication scale for nuclear/radiological event significance; it is not a score of operator performance or an operating response guide.
- A software test passing is not physical-model verification or validation. The model has not been validated against plant data or a particular reactor design.

## Exports

The Simulation page supports:

- **PDF:** session metadata, challenge seed/mode, final indices, advanced telemetry, trend graph, alarm/fault summary, and a paginated event list.
- **CSV:** up to 180 recent historian points.
- **JSON:** full session state and event history for replay/review.

A generated example PDF is stored at `examples/sample-session-report.pdf`.

## Tests

`npm test` runs 25 engine assertions plus static architecture, service-worker, and lightweight strict TypeScript checks:

1. `tests/engine.test.cjs` — deterministic events, compound challenges, control/SCRAM state, sensor deception, difficulty scaling, slow-drift challenge, bounded historian, CSV/PDF generation, all five challenge-mode labels and pagination, hour-scale xenon transient, training-only post-SCRAM restart attempt, cold-start progression, independent rod-group control, delayed transitions, electrical-bus interlock, delayed backup-power state, alarm acknowledgement, level swell, auto/manual feedwater, heater temperature drift, and low-flow margin behavior.
2. `tests/run_checks.py` — TS/TSX lightweight strict typecheck (using the TypeScript compiler), PWA manifest/service-worker syntax, language keys, source architecture, feature presence, and creator metadata.

The production build is `tsc --noEmit && vite build`. In restricted authoring environments without npm registry connectivity, dependencies may need to be installed in a normal development environment before `npm run build` can be verified.

## Android / PWA

Deploy the Vite `dist/` directory to HTTPS. Open the site in Chrome on Android and choose **Install app** / **Add to Home Screen**. A previous online visit is required before offline cache behavior can be relied on. Validate installation and offline loading on the actual target handset.
