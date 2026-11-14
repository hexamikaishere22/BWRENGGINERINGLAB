export type Language = 'id' | 'en';
export type Difficulty = 'cadet' | 'operator' | 'senior' | 'expert' | 'master';
export type ChallengeMode = 'standard' | 'compound' | 'deception' | 'slow-drift' | 'master';
export type FaultKind =
  | 'feedwater' | 'circulation' | 'condenser' | 'load' | 'sensor'
  | 'heater' | 'stuck-rod' | 'pump-a' | 'pump-b' | 'offsite-power'
  | 'msiv' | 'instrument-freeze' | 'instrument-bias' | 'slow-leak' | 'suppression-load';
export type RunStatus = 'running' | 'failed' | 'completed';
export type RodGroup = 'A' | 'B' | 'C' | 'D';
export type StartupStage = 'generation' | 'cold-shutdown' | 'system-review' | 'thermal-conditioning' | 'low-power-review' | 'generation-review';
export type SystemActionKey =
  | 'offsitePower' | 'dieselAvailable' | 'feedwaterAuto' | 'feedwaterHeater' | 'msivOpen'
  | 'pumpAAvailable' | 'pumpBAvailable' | 'hpi' | 'lpi' | 'rhr' | 'ads' | 'boron';

export interface Controls {
  /** Legacy aggregate rod command retained for compatibility. */
  rods: number;
  /** Legacy aggregate circulation command retained for compatibility. */
  circulation: number;
  recircA: number;
  recircB: number;
  feedwater: number;
  turbine: number;
  feedwaterTemp: number;
  rodGroups: Record<RodGroup, number>;
}

export interface RodGroupState {
  target: number;
  actual: number;
  stuck: boolean;
}

export interface SystemState {
  offsitePower: boolean;
  dieselAvailable: boolean;
  feedwaterAuto: boolean;
  feedwaterHeater: boolean;
  msivOpen: boolean;
  pumpAAvailable: boolean;
  pumpBAvailable: boolean;
  hpi: boolean;
  lpi: boolean;
  rhr: boolean;
  ads: boolean;
  boron: boolean;
  suppressionPoolHeat: number;
  containmentPressure: number;
}

export interface PendingAction {
  key: SystemActionKey;
  value: boolean;
  completeAt: number;
}

export interface FaultInstance {
  kind: FaultKind;
  until: number;
  severity: number;
}

export interface HistoryPoint {
  time: number;
  plantHours: number;
  rodsActual: number;
  power: number;
  pressure: number;
  water: number;
  waterIndicated: number;
  thermal: number;
  grid: number;
  xenon: number;
  period: number;
  flowRatio: number;
  boilingMargin: number;
  integrity: number;
}

export interface EventRecord {
  time: number;
  key: string;
}

export interface SimState {
  seed: number;
  randomState: number;
  mode: ChallengeMode;
  difficulty: Difficulty;
  elapsed: number;
  plantHours: number;
  status: RunStatus;
  failureKey: string | null;
  scram: boolean;
  controls: Controls;
  rodGroups: Record<RodGroup, RodGroupState>;
  systems: SystemState;
  pendingActions: PendingAction[];
  startupStage: StartupStage;
  startupChecks: boolean[];
  rodsActual: number;
  power: number;
  pressure: number;
  water: number;
  waterIndicated: number;
  voidFraction: number;
  pressureRate: number;
  thermal: number;
  steam: number;
  feedwaterFlow: number;
  turbineFlow: number;
  grid: number;
  feedwaterTemp: number;
  iodine135: number;
  xenon135: number;
  xenonInhibition: number;
  delayedNeutronIndex: number;
  periodSeconds: number;
  reactivityIndex: number;
  flowRatio: number;
  boilingMargin: number;
  fuelIntegrity: number;
  fuelLeakIndex: number;
  damageIndex: number;
  severityTier: 0 | 1 | 2 | 3 | 4 | 5;
  cumulativeLimitExposure: number;
  operatingLimitBreaches: number;
  unnecessaryScrams: number;
  score: number;
  stableSeconds: number;
  faults: FaultInstance[];
  acknowledgedAlarms: string[];
  events: EventRecord[];
  history: HistoryPoint[];
  nextChallengeAt: number;
  lastHistoryAt: number;
  lastPressure: number;
  lastPower: number;
}

export interface Readings {
  power: number;
  pressure: number;
  water: number;
  waterInventory: number;
  thermal: number;
  grid: number;
  xenon: number;
  period: number;
  flowRatio: number;
  boilingMargin: number;
  containmentPressure: number;
  fuelIntegrity: number;
}

export interface AlarmEntry {
  key: string;
  acknowledged: boolean;
  priority: 'advisory' | 'caution' | 'critical';
}
