import { addChallenge, nextInterval, nextRandom } from './challenge';
import type {
  AlarmEntry, ChallengeMode, Difficulty, FaultKind, HistoryPoint, Readings, RodGroup,
  SimState, StartupStage, SystemActionKey,
} from './types';

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const round1 = (value: number) => Math.round(value * 10) / 10;
const groups: RodGroup[] = ['A', 'B', 'C', 'D'];

export function createInitialState(seed = Date.now(), mode: ChallengeMode = 'standard', difficulty: Difficulty = 'operator', coldStart = false): SimState {
  const normalizedSeed = (seed >>> 0) || 0x9e3779b9;
  const initialRandom = nextRandom(normalizedSeed);
  const initialPower = coldStart ? 0.5 : 70;
  const rodGroups = Object.fromEntries(groups.map((group) => [group, { target: 50, actual: 50, stuck: false }])) as SimState['rodGroups'];
  return {
    seed: normalizedSeed, randomState: initialRandom.state, mode, difficulty,
    elapsed: 0, plantHours: 0, status: 'running', failureKey: null, scram: false,
    controls: {
      rods: coldStart ? 100 : 50, circulation: 65, recircA: 65, recircB: 65,
      feedwater: coldStart ? 0 : 60, turbine: coldStart ? 0 : 68,
      feedwaterTemp: 70, rodGroups: { A: 50, B: 50, C: 50, D: 50 },
    },
    rodGroups: coldStart
      ? Object.fromEntries(groups.map((group) => [group, { target: 100, actual: 100, stuck: false }])) as SimState['rodGroups']
      : rodGroups,
    systems: {
      offsitePower: true, dieselAvailable: false, feedwaterAuto: true, feedwaterHeater: true,
      msivOpen: true, pumpAAvailable: true, pumpBAvailable: true,
      hpi: false, lpi: false, rhr: false, ads: false, boron: false,
      suppressionPoolHeat: 8, containmentPressure: 12,
    },
    pendingActions: [],
    startupStage: coldStart ? 'cold-shutdown' : 'generation',
    startupChecks: [false, false, false, false],
    rodsActual: coldStart ? 100 : 50,
    power: initialPower, pressure: 42, water: 60, waterIndicated: 60, voidFraction: 0.34,
    pressureRate: 0, thermal: coldStart ? 25 : 86, steam: coldStart ? 0.5 : 62,
    feedwaterFlow: coldStart ? 0 : 63, turbineFlow: coldStart ? 0 : 60, grid: coldStart ? 0 : 54,
    feedwaterTemp: 70,
    iodine135: 0.3125, xenon135: 0.4167, xenonInhibition: 0,
    delayedNeutronIndex: initialPower, periodSeconds: 999, reactivityIndex: 0,
    flowRatio: coldStart ? 0 : 0.93, boilingMargin: coldStart ? 100 : 70.1,
    fuelIntegrity: 100, fuelLeakIndex: 0, damageIndex: 0, severityTier: 0,
    cumulativeLimitExposure: 0, operatingLimitBreaches: 0, unnecessaryScrams: 0,
    score: 0, stableSeconds: 0,
    faults: [], acknowledgedAlarms: [], events: [{ time: 0, key: coldStart ? 'cold-shutdown-started' : 'session-started' }],
    history: [{ time: 0, plantHours: 0, rodsActual: coldStart ? 100 : 50, power: initialPower, pressure: 42, water: 60, waterIndicated: 60, thermal: coldStart ? 25 : 86, grid: coldStart ? 0 : 54, xenon: 0.4167, period: 999, flowRatio: coldStart ? 0 : 0.93, boilingMargin: coldStart ? 100 : 70.1, integrity: 100 }],
    nextChallengeAt: 18 + nextInterval(mode, initialRandom.value, difficulty), lastHistoryAt: 0,
    lastPressure: 42, lastPower: initialPower,
  };
}

export function createColdShutdownState(seed = Date.now(), mode: ChallengeMode = 'slow-drift', difficulty: Difficulty = 'expert'): SimState {
  return createInitialState(seed, mode, difficulty, true);
}

export function applyControl(state: SimState, key: keyof SimState['controls'], value: number): SimState {
  if (state.status !== 'running' || (key === 'rods' && state.scram)) return state;
  const nextValue = clamp(Math.round(value), 0, 100);
  if (key === 'rods') {
    const rodGroups = Object.fromEntries(groups.map((group) => [group, { ...state.rodGroups[group], target: nextValue }])) as SimState['rodGroups'];
    return { ...state, controls: { ...state.controls, rods: nextValue, rodGroups: { A: nextValue, B: nextValue, C: nextValue, D: nextValue } }, rodGroups };
  }
  if (key === 'circulation') {
    return { ...state, controls: { ...state.controls, circulation: nextValue, recircA: nextValue, recircB: nextValue } };
  }
  return { ...state, controls: { ...state.controls, [key]: nextValue } };
}

export function applyRodGroupControl(state: SimState, group: RodGroup, value: number): SimState {
  if (state.status !== 'running' || state.scram || state.rodGroups[group].stuck || activeFault(state, 'stuck-rod') > 0) return state;
  const target = clamp(Math.round(value), 0, 100);
  const rodGroups = { ...state.rodGroups, [group]: { ...state.rodGroups[group], target } };
  const rodCommands = { ...state.controls.rodGroups, [group]: target };
  const rods = groups.reduce((sum, key) => sum + rodCommands[key], 0) / groups.length;
  return { ...state, rodGroups, controls: { ...state.controls, rodGroups: rodCommands, rods } };
}

export function resetScramForTraining(state: SimState): SimState {
  // The unlock threshold is a synthetic game index, not a plant reset criterion.
  if (state.status !== 'running' || !state.scram || state.power > 4) return state;
  return {
    ...state,
    scram: false,
    events: [...state.events, { time: state.elapsed, key: 'scram-reset-training' }].slice(-120),
  };
}

export function triggerScram(state: SimState): SimState {
  if (state.status !== 'running' || state.scram) return state;
  const unnecessary = state.power < 95 && state.pressure < 70 && state.water > 42 && state.faults.length === 0;
  const rodGroups = Object.fromEntries(groups.map((group) => [group, { ...state.rodGroups[group], target: 100 }])) as SimState['rodGroups'];
  const events = [...state.events, { time: state.elapsed, key: 'scram-activated' }];
  if (unnecessary) events.push({ time: state.elapsed, key: 'scram-unnecessary' });
  return {
    ...state, scram: true, rodGroups,
    controls: { ...state.controls, rods: 100, rodGroups: { A: 100, B: 100, C: 100, D: 100 } },
    unnecessaryScrams: state.unnecessaryScrams + (unnecessary ? 1 : 0),
    score: Math.max(0, state.score - (unnecessary ? 120 : 0)), events: events.slice(-120),
  };
}

const ACTION_DELAY: Record<SystemActionKey, number> = {
  offsitePower: 1.5, dieselAvailable: 7, feedwaterAuto: 2, feedwaterHeater: 4,
  msivOpen: 3.5, pumpAAvailable: 4, pumpBAvailable: 4, hpi: 3, lpi: 4,
  rhr: 5, ads: 2, boron: 8,
};

export function queueSystemAction(state: SimState, key: SystemActionKey, value: boolean): SimState {
  if (state.status !== 'running') return state;
  const electricallyPowered: SystemActionKey[] = ['pumpAAvailable', 'pumpBAvailable', 'hpi', 'lpi', 'rhr'];
  const powerBus = state.systems.offsitePower || state.systems.dieselAvailable;
  if (value && electricallyPowered.includes(key) && !powerBus) {
    return { ...state, events: [...state.events, { time: state.elapsed, key: 'action-blocked-power' }].slice(-120) };
  }
  if (key === 'dieselAvailable' && value && state.systems.offsitePower) {
    return { ...state, events: [...state.events, { time: state.elapsed, key: 'action-blocked-diesel' }].slice(-120) };
  }
  const pendingActions = state.pendingActions.filter((action) => action.key !== key);
  pendingActions.push({ key, value, completeAt: state.elapsed + ACTION_DELAY[key] });
  return {
    ...state, pendingActions,
    events: [...state.events, { time: state.elapsed, key: `action-start-${key}` }].slice(-120),
  };
}

export function acknowledgeAlarm(state: SimState, key: string): SimState {
  return { ...state, acknowledgedAlarms: [...new Set([...state.acknowledgedAlarms, key])] };
}

export function acknowledgeAllAlarms(state: SimState): SimState {
  return { ...state, acknowledgedAlarms: [...new Set([...state.acknowledgedAlarms, ...getAlarmKeys(state)])] };
}

export function setStartupCheck(state: SimState, index: number, checked: boolean): SimState {
  if (state.startupStage === 'generation' || index < 0 || index >= state.startupChecks.length) return state;
  const startupChecks = [...state.startupChecks];
  startupChecks[index] = checked;
  const completed = startupChecks.every(Boolean);
  let startupStage: StartupStage = state.startupStage;
  let events = state.events;
  if (completed) {
    const stages: StartupStage[] = ['cold-shutdown', 'system-review', 'thermal-conditioning', 'low-power-review', 'generation-review', 'generation'];
    const current = stages.indexOf(startupStage);
    startupStage = stages[Math.min(stages.length - 1, current + 1)];
    events = [...events, { time: state.elapsed, key: `startup-stage-${startupStage}` }].slice(-120);
    if (startupStage !== state.startupStage) startupChecks.fill(false);
  }
  return { ...state, startupChecks, startupStage, events };
}

function activeFault(state: SimState, kind: FaultKind): number {
  return state.faults.find((fault) => fault.kind === kind)?.severity ?? 0;
}

function processActions(state: SimState): SimState {
  const due = state.pendingActions.filter((action) => action.completeAt <= state.elapsed);
  if (!due.length) return state;
  let systems = { ...state.systems };
  const events = [...state.events];
  for (const action of due) {
    systems = { ...systems, [action.key]: action.value };
    events.push({ time: state.elapsed, key: `action-complete-${action.key}` });
  }
  return { ...state, systems, pendingActions: state.pendingActions.filter((action) => action.completeAt > state.elapsed), events: events.slice(-120) };
}

function appendHistory(state: SimState): HistoryPoint[] {
  const point: HistoryPoint = {
    time: round1(state.elapsed), plantHours: round1(state.plantHours), rodsActual: round1(state.rodsActual), power: round1(state.power),
    pressure: round1(state.pressure), water: round1(state.water), waterIndicated: round1(state.waterIndicated),
    thermal: round1(state.thermal), grid: round1(state.grid), xenon: round1(state.xenon135),
    period: round1(clamp(state.periodSeconds, -999, 999)), flowRatio: round1(state.flowRatio),
    boilingMargin: round1(state.boilingMargin), integrity: round1(state.fuelIntegrity),
  };
  return [...state.history, point].slice(-180);
}

export function tickModel(previous: SimState, dt = 0.2): SimState {
  if (previous.status !== 'running') return previous;
  const step = clamp(dt, 0.02, 0.5);
  let state: SimState = { ...previous, elapsed: previous.elapsed + step, plantHours: previous.plantHours + step / 60 };

  const expired = state.faults.filter((fault) => fault.until <= state.elapsed);
  if (expired.length) {
    const expiredKinds = expired.map((fault) => fault.kind);
    state = {
      ...state,
      faults: state.faults.filter((fault) => fault.until > state.elapsed),
      events: [...state.events, ...expiredKinds.map((kind) => ({ time: state.elapsed, key: `recovered-${kind}` }))].slice(-120),
    };
  }
  if (state.elapsed >= state.nextChallengeAt) state = addChallenge(state);
  state = processActions(state);

  const feedFault = activeFault(state, 'feedwater');
  const recircFault = activeFault(state, 'circulation');
  const condenserFault = activeFault(state, 'condenser');
  const loadFault = activeFault(state, 'load');
  const heaterFault = activeFault(state, 'heater');
  const slowLeakFault = activeFault(state, 'slow-leak');
  const pumpAFault = activeFault(state, 'pump-a');
  const pumpBFault = activeFault(state, 'pump-b');
  const stuckRod = activeFault(state, 'stuck-rod');
  const offsiteFault = activeFault(state, 'offsite-power');
  const gridPowerAvailable = (state.systems.offsitePower && offsiteFault < 0.5) || state.systems.dieselAvailable;

  const rodGroups = { ...state.rodGroups };
  const rodRate = state.scram ? 10 : 3.5; // synthetic game motion limit, not actuator data
  for (const group of groups) {
    const current = rodGroups[group];
    const stuck = current.stuck || (stuckRod > 0 && group === 'C');
    const target = state.scram ? 100 : current.target;
    rodGroups[group] = {
      ...current,
      stuck: stuckRod > 0 && group === 'C',
      actual: stuck ? current.actual : current.actual + clamp(target - current.actual, -rodRate * step, rodRate * step),
    };
  }
  const rodsActual = groups.reduce((sum, group) => sum + rodGroups[group].actual, 0) / groups.length;

  const pumpPowerFactor = gridPowerAvailable ? 1 : 0.08;
  const recircA = state.controls.recircA * (state.systems.pumpAAvailable ? 1 : 0) * (1 - pumpAFault * 0.85) * (1 - recircFault * 0.6) * pumpPowerFactor;
  const recircB = state.controls.recircB * (state.systems.pumpBAvailable ? 1 : 0) * (1 - pumpBFault * 0.85) * (1 - recircFault * 0.6) * pumpPowerFactor;
  const circulation = clamp((recircA + recircB) / 2, 0, 100);

  // Hour-scale I-135 / Xe-135 trend using normalized teaching coefficients.
  // One model-clock second is represented as one simulated minute to make slow poison drift visible.
  const pNorm = clamp(state.power / 70, 0, 1.8);
  const iodineRate = 0.025 * pNorm - 0.08 * state.iodine135;
  const xenonRate = 0.08 * state.iodine135 - (0.025 + 0.035 * pNorm) * state.xenon135;
  const iodine135 = clamp(state.iodine135 + iodineRate * (step / 60), 0, 3);
  const xenon135 = clamp(state.xenon135 + xenonRate * (step / 60), 0, 3);
  const xenonInhibition = clamp((xenon135 - 0.4167) * 42, -5, 35);

  const coldFeedwaterEffect = Math.max(0, 70 - state.feedwaterTemp) * 0.055;
  const rodAverage = rodsActual;
  const circulationEffect = (circulation - 65) * 0.22;
  const reactivityIndex = clamp((50 - rodAverage) * 0.72 + circulationEffect + coldFeedwaterEffect - xenonInhibition, -75, 75);
  const delayedNeutronIndex = state.delayedNeutronIndex + (state.power - state.delayedNeutronIndex) * Math.min(1, 0.045 * step);
  const boronSuppression = state.systems.boron ? 26 : 0;
  const scramTarget = state.scram ? 1.2 : 0;
  const powerTarget = state.scram
    ? scramTarget
    : clamp(70 + reactivityIndex + (delayedNeutronIndex - state.power) * 0.08 - boronSuppression, 0.5, 145);
  const powerResponse = state.scram ? 0.28 : 0.075;
  const power = Math.max(0.25, state.power + (powerTarget - state.power) * Math.min(1, powerResponse * step));
  const logarithmicRate = Math.abs(state.power) > 0.1 && power > 0.1 ? Math.log(power / state.power) / step : 0;
  const periodSeconds = Math.abs(logarithmicRate) < 0.00001 ? 999 : 1 / logarithmicRate;

  const desiredFeedwater = state.systems.feedwaterAuto
    ? clamp(60 + (58 - state.water) * 0.45, 0, 100)
    : state.controls.feedwater;
  const feedwaterTempTarget = state.systems.feedwaterHeater && heaterFault < 0.1 ? state.controls.feedwaterTemp : 28;
  const feedwaterTemp = clamp(state.feedwaterTemp + (feedwaterTempTarget - state.feedwaterTemp) * Math.min(1, (0.015 + heaterFault * 0.05) * step), 10, 100);
  const feedwaterColdPenalty = Math.max(0, 70 - feedwaterTemp) / 70;
  const steam = Math.max(0.15, power * 0.84 + state.thermal * 0.025);
  const feedwaterPowerFactor = gridPowerAvailable ? 1 : 0.18;
  const feedwaterFlow = desiredFeedwater * 1.04 * (1 - feedFault * 0.62) * feedwaterPowerFactor;
  const msivFault = activeFault(state, 'msiv');
  const turbineDemand = state.systems.msivOpen ? state.controls.turbine * 0.93 * (1 - msivFault * 0.8) : 0;
  const turbineCapacity = turbineDemand * (1 - condenserFault * 0.55) * (1 - loadFault * 0.84);
  const turbineFlow = Math.min(steam, Math.max(0, turbineCapacity));
  const adsVent = state.systems.ads ? 10 : 0;
  const pressureTarget = clamp(42 + (steam - turbineFlow) * 0.55 + condenserFault * 8 - adsVent, 5, 112);
  const pressure = clamp(state.pressure + (pressureTarget - state.pressure) * Math.min(1, 0.13 * step), 0, 115);
  const pressureRate = (pressure - state.pressure) / step;

  const hpiFlow = state.systems.hpi && gridPowerAvailable ? 7 : 0;
  const lpiFlow = state.systems.lpi && gridPowerAvailable ? 5 : 0;
  const rhrFlow = state.systems.rhr && gridPowerAvailable ? 3.5 : 0;
  const inventoryLoss = slowLeakFault * 0.18;
  const water = clamp(state.water + (feedwaterFlow + hpiFlow + lpiFlow + rhrFlow - steam - inventoryLoss) * 0.025 * step, 0, 112);

  const voidFraction = clamp(0.12 + power * 0.0048 - circulation * 0.0018 - Math.max(0, pressure - 45) * 0.0015 - feedwaterColdPenalty * 0.08, 0.03, 0.82);
  // Swell proxy: falling pressure expands voids and can raise the indicated level while inventory falls.
  const levelSwell = clamp(Math.max(0, -pressureRate) * 0.55 + voidFraction * 13, 0, 22);
  const waterIndicated = clamp(water + levelSwell, 0, 120);

  const bypassHeat = Math.max(0, steam - turbineFlow) * 0.22;
  const suppressionPoolHeat = clamp(state.systems.suppressionPoolHeat + (bypassHeat + adsVent * 0.5 - (state.systems.rhr ? 1.6 : 0.2)) * step * 0.012, 0, 120);
  const containmentPressure = clamp(state.systems.containmentPressure + (adsVent * 0.18 + activeFault(state, 'suppression-load') * 0.9 - (state.systems.rhr ? 0.9 : 0.1)) * step * 0.04, 0, 120);
  const systems = { ...state.systems, suppressionPoolHeat, containmentPressure };

  const flowRatio = circulation / Math.max(8, power);
  const flowPenalty = Math.max(0, 0.9 - flowRatio) * 42;
  // This is not CPR/MCPR: only a dimensionless boiling-margin teaching proxy.
  const boilingMargin = clamp(100 - power * 0.34 - flowPenalty - voidFraction * 18 - Math.max(0, 70 - water) * 0.15, 0, 100);
  const coolingContribution = (water - 35) * 0.008 + circulation * 0.0015 + (state.systems.rhr ? 0.07 : 0);
  const thermalTarget = 22 + power * 0.88 + Math.max(0, 48 - water) * 0.55 + Math.max(0, 35 - boilingMargin) * 0.3;
  const thermal = clamp(state.thermal + (thermalTarget - state.thermal) * clamp(0.055 + coolingContribution, 0.025, 0.16) * step, 0, 200);
  const grid = clamp(turbineFlow * 0.88, 0, 100);

  const highStress = (thermal > 128 ? 1 : 0) + (boilingMargin < 28 ? 1 : 0) + (water < 30 ? 1 : 0) + (flowRatio < 0.55 ? 1 : 0);
  const cumulativeLimitExposure = state.cumulativeLimitExposure + (highStress >= 2 ? step : 0);
  const operatingLimitBreaches = state.operatingLimitBreaches + (highStress >= 2 && Math.floor(cumulativeLimitExposure / 30) > Math.floor(state.cumulativeLimitExposure / 30) ? 1 : 0);
  const damageRate = Math.max(0, highStress - 1) * 0.012 + (thermal > 150 ? 0.035 : 0) + (water < 15 ? 0.025 : 0);
  const damageIndex = clamp(state.damageIndex + damageRate * step, 0, 100);
  const fuelLeakIndex = clamp(state.fuelLeakIndex + Math.max(0, damageIndex - 24) * 0.0008 * step, 0, 100);
  const fuelIntegrity = clamp(100 - damageIndex * 0.8 - fuelLeakIndex * 0.3, 0, 100);
  const severityTier: SimState['severityTier'] =
    damageIndex >= 80 ? 5 : damageIndex >= 58 ? 4 : fuelLeakIndex >= 25 ? 3 : cumulativeLimitExposure >= 90 ? 2 : highStress > 0 || operatingLimitBreaches > 0 ? 1 : 0;

  const stable = power < 112 && pressure < 82 && water > 28 && water < 84 && thermal < 132 && grid > 25 && grid < 95 && boilingMargin > 25;
  const stableSeconds = state.stableSeconds + (stable ? step : 0);
  const score = Math.max(0, Math.floor(stableSeconds * 0.5 + state.elapsed * 0.08 + Math.max(0, 20 - state.faults.length) * 1.5 - state.unnecessaryScrams * 120 - damageIndex * 2));

  state = {
    ...state, systems, rodGroups, controls: { ...state.controls, circulation, rods: rodsActual },
    rodsActual, power, pressure, pressureRate, water, waterIndicated, voidFraction, thermal, steam,
    feedwaterFlow, turbineFlow, grid, feedwaterTemp, iodine135, xenon135, xenonInhibition,
    delayedNeutronIndex, periodSeconds, reactivityIndex, flowRatio, boilingMargin,
    fuelIntegrity, fuelLeakIndex, damageIndex, severityTier, cumulativeLimitExposure,
    operatingLimitBreaches, stableSeconds, score,
  };

  let failureKey: string | null = null;
  if (damageIndex >= 88) failureKey = 'failure-partial-damage';
  else if (containmentPressure >= 105) failureKey = 'failure-containment-index';
  else if (water <= 2) failureKey = 'failure-low-inventory';
  else if (thermal >= 190) failureKey = 'failure-thermal-index';
  if (failureKey) {
    state = { ...state, status: 'failed', failureKey, events: [...state.events, { time: state.elapsed, key: failureKey }].slice(-120) };
  }

  if (state.elapsed - state.lastHistoryAt >= 2 || failureKey) {
    state = { ...state, history: appendHistory(state), lastHistoryAt: state.elapsed, lastPressure: pressure, lastPower: power };
  } else {
    state = { ...state, lastPressure: pressure, lastPower: power };
  }
  return state;
}

export function getReadings(state: SimState): Readings {
  const drift = activeFault(state, 'sensor') + activeFault(state, 'instrument-bias');
  const offset = drift * 7;
  const frozen = activeFault(state, 'instrument-freeze') > 0;
  return {
    power: frozen ? Math.max(0, state.history[state.history.length - 1]?.power ?? state.power) : clamp(state.power + offset, 0, 180),
    pressure: frozen ? (state.history[state.history.length - 1]?.pressure ?? state.pressure) : clamp(state.pressure - offset * 0.55, 0, 120),
    water: frozen ? (state.history[state.history.length - 1]?.waterIndicated ?? state.waterIndicated) : clamp(state.waterIndicated + offset * 0.35, 0, 120),
    waterInventory: state.water,
    thermal: clamp(state.thermal + offset * 1.2, 0, 200), grid: state.grid,
    xenon: state.xenon135, period: state.periodSeconds, flowRatio: state.flowRatio,
    boilingMargin: state.boilingMargin, containmentPressure: state.systems.containmentPressure,
    fuelIntegrity: state.fuelIntegrity,
  };
}

export function getAlarmKeys(state: SimState): string[] {
  const r = getReadings(state);
  const alarms: string[] = [];
  if (r.power > 112) alarms.push('alarm-power');
  if (r.pressure > 82) alarms.push('alarm-pressure');
  if (r.waterInventory < 28) alarms.push('alarm-low-water');
  if (r.water > 84) alarms.push('alarm-high-water');
  if (r.thermal > 132) alarms.push('alarm-thermal');
  if (state.faults.length) alarms.push('alarm-fault');
  if (Math.abs(r.water - r.waterInventory) > 12) alarms.push('alarm-level-disagreement');
  if (r.period > 0 && r.period < 12) alarms.push('alarm-period');
  if (r.flowRatio < 0.55) alarms.push('alarm-flow-map');
  if (r.boilingMargin < 25) alarms.push('alarm-boiling-margin');
  if (r.xenon > 0.78) alarms.push('alarm-xenon');
  if (r.containmentPressure > 72) alarms.push('alarm-containment');
  if (!state.systems.offsitePower && !state.systems.dieselAvailable) alarms.push('alarm-electrical');
  return alarms;
}

export function getAlarmEntries(state: SimState): AlarmEntry[] {
  return getAlarmKeys(state).map((key) => ({
    key, acknowledged: state.acknowledgedAlarms.includes(key),
    priority: ['alarm-boiling-margin', 'alarm-low-water', 'alarm-thermal', 'alarm-containment'].includes(key)
      ? 'critical' : ['alarm-power', 'alarm-pressure', 'alarm-period', 'alarm-flow-map'].includes(key) ? 'caution' : 'advisory',
  }));
}

export function getFaultLabelKey(kind: FaultKind): string { return `fault-${kind}`; }
export function getTrendSeries(state: SimState) { return state.history.map((point) => ({ ...point })); }

export function exportCsv(state: SimState): string {
  const header = 'time_s,plant_hours,power_index,pressure_index,water_inventory_index,indicated_level_index,thermal_index,grid_index,xenon_index,period_index,flow_power_ratio,boiling_margin_index,fuel_integrity_index';
  const rows = state.history.map((point) => [point.time, point.plantHours, point.power, point.pressure, point.water, point.waterIndicated, point.thermal, point.grid, point.xenon, point.period, point.flowRatio, point.boilingMargin, point.integrity].join(','));
  return [header, ...rows].join('\n');
}

export function formatTime(seconds: number): string {
  const total = Math.floor(seconds);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

export function severityLabel(tier: SimState['severityTier'], language: 'id' | 'en'): string {
  const labels = language === 'id'
    ? ['Normal', 'Pelanggaran batas model', 'Paparan stres berlanjut', 'Indikasi integritas bahan bakar', 'Proxy kerusakan sebagian', 'Kegagalan model berat']
    : ['Normal', 'Model limit excursion', 'Sustained stress exposure', 'Fuel integrity indication', 'Partial damage proxy', 'Severe model failure'];
  return labels[tier];
}

export function getActionAvailability(state: SimState, key: SystemActionKey): { available: boolean; reason?: string } {
  const electrical = state.systems.offsitePower || state.systems.dieselAvailable;
  if (['pumpAAvailable', 'pumpBAvailable', 'hpi', 'lpi', 'rhr'].includes(key) && !electrical) {
    return { available: false, reason: 'action-blocked-power' };
  }
  if (key === 'dieselAvailable' && state.systems.offsitePower) return { available: false, reason: 'action-blocked-diesel' };
  return { available: true };
}
