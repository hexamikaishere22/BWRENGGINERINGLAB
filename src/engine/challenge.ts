import type { ChallengeMode, Difficulty, FaultInstance, FaultKind, SimState } from './types';

const CATALOG: FaultKind[] = [
  'feedwater', 'circulation', 'condenser', 'load', 'sensor', 'heater', 'stuck-rod',
  'pump-a', 'pump-b', 'offsite-power', 'msiv', 'instrument-freeze', 'instrument-bias',
  'slow-leak', 'suppression-load',
];

export function nextRandom(state: number): { value: number; state: number } {
  let x = state >>> 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  x >>>= 0;
  return { value: x / 0x100000000, state: x || 0x6d2b79f5 };
}

const difficultyFactor: Record<Difficulty, number> = {
  cadet: 1.65, operator: 1.25, senior: 1, expert: 0.72, master: 0.48,
};

export function nextInterval(mode: ChallengeMode, random: number, difficulty: Difficulty = 'operator'): number {
  const ranges: Record<ChallengeMode, [number, number]> = {
    standard: [52, 82], compound: [34, 52], deception: [42, 65], 'slow-drift': [24, 42], master: [16, 34],
  };
  const [min, max] = ranges[mode];
  return (min + random * (max - min)) * difficultyFactor[difficulty];
}

function eligibleFaults(difficulty: Difficulty): FaultKind[] {
  if (difficulty === 'cadet') return CATALOG.slice(0, 6);
  if (difficulty === 'operator') return CATALOG.slice(0, 10);
  return CATALOG;
}

export function addChallenge(state: SimState): SimState {
  let seed = state.randomState;
  const pick = () => {
    const result = nextRandom(seed);
    seed = result.state;
    return result.value;
  };
  const allowed = eligibleFaults(state.difficulty);
  const available = allowed.filter((kind) => !state.faults.some((fault) => fault.kind === kind));
  if (!available.length) {
    return { ...state, randomState: seed, nextChallengeAt: state.elapsed + nextInterval(state.mode, pick(), state.difficulty) };
  }

  const first = available[Math.floor(pick() * available.length)];
  const severityBase = state.difficulty === 'master' ? 0.74 : state.difficulty === 'expert' ? 0.65 : 0.5;
  const durationBase = state.difficulty === 'master' ? 110 : state.difficulty === 'expert' ? 90 : 68;
  const duration = durationBase + pick() * durationBase * 0.6;
  const newFaults: FaultInstance[] = [{ kind: first, until: state.elapsed + duration, severity: severityBase + pick() * 0.28 }];
  const events = [...state.events, { time: state.elapsed, key: `challenge-${first}` }];

  const shouldCompound = ['compound', 'slow-drift', 'master'].includes(state.mode) || ['expert', 'master'].includes(state.difficulty);
  if (shouldCompound && available.length > 1 && pick() > (state.difficulty === 'master' ? 0.08 : 0.34)) {
    const remaining = available.filter((item) => item !== first);
    const second = remaining[Math.floor(pick() * remaining.length)];
    newFaults.push({ kind: second, until: state.elapsed + duration * (0.68 + pick() * 0.24), severity: severityBase + pick() * 0.28 });
    events.push({ time: state.elapsed, key: `challenge-${second}` });
  }

  if (['deception', 'master'].includes(state.mode) || state.difficulty === 'master') {
    const sensorFault: FaultKind = pick() > 0.5 ? 'instrument-freeze' : 'instrument-bias';
    if (!newFaults.some((fault) => fault.kind === sensorFault) && !state.faults.some((fault) => fault.kind === sensorFault)) {
      newFaults.push({ kind: sensorFault, until: state.elapsed + duration * 1.25, severity: 0.72 + pick() * 0.2 });
      events.push({ time: state.elapsed, key: `challenge-${sensorFault}` });
    }
  }

  if (state.mode === 'slow-drift' && !newFaults.some((fault) => fault.kind === 'slow-leak')) {
    newFaults.push({ kind: 'slow-leak', until: state.elapsed + duration * 1.8, severity: 0.25 + pick() * 0.18 });
    events.push({ time: state.elapsed, key: 'challenge-slow-leak' });
  }

  return {
    ...state,
    randomState: seed,
    faults: [...state.faults, ...newFaults],
    events: events.slice(-120),
    nextChallengeAt: state.elapsed + nextInterval(state.mode, pick(), state.difficulty),
  };
}
