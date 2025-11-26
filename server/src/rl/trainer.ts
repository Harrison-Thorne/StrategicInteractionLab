import { v4 as uuidv4 } from 'uuid';

export type RLGameId = 'rps' | 'mp' | 'pd';

type Vec = number[];

type GameSpec = {
  id: RLGameId;
  actsA: string[];
  actsB: string[];
  A: number[][];
  B: number[][];
  zeroSum: boolean;
};

const GAMES: Record<RLGameId, GameSpec> = {
  rps: {
    id: 'rps',
    actsA: ['R', 'P', 'S'],
    actsB: ['R', 'P', 'S'],
    A: [
      [0, -1, 1],
      [1, 0, -1],
      [-1, 1, 0],
    ],
    B: [
      [0, 1, -1],
      [-1, 0, 1],
      [1, -1, 0],
    ],
    zeroSum: true,
  },
  mp: {
    id: 'mp',
    actsA: ['H', 'T'],
    actsB: ['H', 'T'],
    A: [
      [1, -1],
      [-1, 1],
    ],
    B: [
      [-1, 1],
      [1, -1],
    ],
    zeroSum: true,
  },
  pd: {
    id: 'pd',
    actsA: ['C', 'D'],
    actsB: ['C', 'D'],
    A: [
      [3, 0],
      [5, 1],
    ],
    B: [
      [3, 5],
      [0, 1],
    ],
    zeroSum: false,
  },
};

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function softmax(logits: Vec): Vec {
  const m = Math.max(...logits);
  const exps = logits.map((x) => Math.exp(x - m));
  const s = exps.reduce((a, b) => a + b, 0) || 1;
  return exps.map((x) => x / s);
}

function oneHot(n: number, idx: number): Vec {
  return Array.from({ length: n }, (_, i) => (i === idx ? 1 : 0));
}

function sampleIndex(p: Vec, rng: () => number): number {
  const r = rng();
  let acc = 0;
  for (let i = 0; i < p.length; i++) {
    acc += p[i];
    if (r <= acc) return i;
  }
  return p.length - 1;
}

type Policy = {
  W1: number[][]; // hidden x input
  b1: number[]; // hidden
  W2: number[][]; // acts x hidden
  b2: number[]; // acts
};

function zeros(rows: number, cols: number): number[][] {
  return Array.from({ length: rows }, () => Array(cols).fill(0));
}

function initPolicy(input: number, hidden: number, acts: number, rng: () => number): Policy {
  const randn = () => {
    // Box-Muller
    const u = 1 - rng();
    const v = rng();
    return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  };
  const scale1 = 1 / Math.sqrt(input);
  const scale2 = 1 / Math.sqrt(hidden);
  const W1 = zeros(hidden, input).map((row) => row.map(() => randn() * scale1));
  const b1 = Array(hidden).fill(0);
  const W2 = zeros(acts, hidden).map((row) => row.map(() => randn() * scale2));
  const b2 = Array(acts).fill(0);
  return { W1, b1, W2, b2 };
}

function forward(pol: Policy, x: Vec) {
  const hidden = pol.W1.map((row, i) => {
    const z = row.reduce((acc, wj, j) => acc + wj * x[j], pol.b1[i]);
    return Math.tanh(z);
  });
  const logits = pol.W2.map((row, i) => row.reduce((acc, wj, j) => acc + wj * hidden[j], pol.b2[i]));
  const probs = softmax(logits);
  return { hidden, logits, probs };
}

function addScaled(a: number[][], b: number[][], scale: number) {
  for (let i = 0; i < a.length; i++) for (let j = 0; j < a[i].length; j++) a[i][j] += b[i][j] * scale;
}
function addScaledVec(a: number[], b: number[], scale: number) {
  for (let i = 0; i < a.length; i++) a[i] += b[i] * scale;
}

type StepCache = {
  x: Vec;
  hidden: Vec;
  probs: Vec;
  action: number;
  reward: number;
};

type TrainLogs = Array<{ ep: number; avgRewardA: number; avgRewardB: number; winA: number | null }>;

export type TrainConfig = {
  game: RLGameId;
  episodes: number;
  stepsPerEp: number;
  lr?: number;
  hidden?: number;
  seed?: number;
  selfPlay?: boolean; // if false, agent B plays Hedge best-response; true = both learned
};

export type TrainResult = {
  run_id: string;
  config: TrainConfig;
  logs: TrainLogs;
  policyA: Policy;
  policyB: Policy;
  actsA: string[];
  actsB: string[];
};

export type DistributedTrainResult = {
  distributed: true;
  workers: number;
  base_seed: number;
  workerRuns: Array<{ run_id: string; seed: number; logs: TrainLogs }>;
  aggregatedLogs: TrainLogs;
  config: TrainConfig;
  actsA: string[];
  actsB: string[];
};

export function trainSelfPlay(cfg: TrainConfig): TrainResult {
  const spec = GAMES[cfg.game];
  if (!spec) throw new Error('invalid_game');
  const rng = mulberry32(cfg.seed ?? 1234);
  const inputDim = Math.max(spec.actsA.length, spec.actsB.length) + 1; // bias + last opp action one-hot
  const hidden = Math.max(8, cfg.hidden ?? 16);
  const lr = cfg.lr ?? 0.05;
  const stepsPerEp = Math.max(10, cfg.stepsPerEp);
  const episodes = Math.max(1, cfg.episodes);
  const actsA = spec.actsA.length;
  const actsB = spec.actsB.length;

  let polA = initPolicy(inputDim, hidden, actsA, rng);
  let polB = initPolicy(inputDim, hidden, actsB, rng);

  const logs: TrainLogs = [];

  for (let ep = 1; ep <= episodes; ep++) {
    let lastA = 0;
    let lastB = 0;
    const stepsA: StepCache[] = [];
    const stepsB: StepCache[] = [];
    let rewardSumA = 0;
    let rewardSumB = 0;

    for (let t = 0; t < stepsPerEp; t++) {
      const xA = [1, ...oneHot(inputDim - 1, lastB).slice(0, inputDim - 1)];
      const xB = [1, ...oneHot(inputDim - 1, lastA).slice(0, inputDim - 1)];

      const fa = forward(polA, xA);
      const fb = forward(polB, xB);
      const a = sampleIndex(fa.probs, rng);
      const b = sampleIndex(fb.probs, rng);
      const rA = spec.A[a][b];
      const rB = spec.B[a][b];
      rewardSumA += rA;
      rewardSumB += rB;

      stepsA.push({ x: xA, hidden: fa.hidden, probs: fa.probs, action: a, reward: rA });
      stepsB.push({ x: xB, hidden: fb.hidden, probs: fb.probs, action: b, reward: rB });

      lastA = a; lastB = b;
    }

    // baselines
    const baselineA = rewardSumA / stepsPerEp;
    const baselineB = rewardSumB / stepsPerEp;

    function update(pol: Policy, steps: StepCache[], baseline: number) {
      const dW2 = zeros(pol.W2.length, pol.W2[0].length);
      const db2 = Array(pol.b2.length).fill(0);
      const dW1 = zeros(pol.W1.length, pol.W1[0].length);
      const db1 = Array(pol.b1.length).fill(0);
      for (const s of steps) {
        const adv = s.reward - baseline;
        const onehot = oneHot(pol.b2.length, s.action);
        const dlogits = onehot.map((o, i) => o - s.probs[i]);
        for (let i = 0; i < pol.W2.length; i++) {
          for (let j = 0; j < pol.W2[i].length; j++) dW2[i][j] += adv * dlogits[i] * s.hidden[j];
          db2[i] += adv * dlogits[i];
        }
        // backprop to hidden and input
        const dhidden = Array(pol.b1.length).fill(0);
        for (let j = 0; j < pol.W2[0].length; j++) {
          for (let i = 0; i < pol.W2.length; i++) dhidden[j] += adv * dlogits[i] * pol.W2[i][j];
          dhidden[j] *= (1 - s.hidden[j] * s.hidden[j]); // tanh'
        }
        for (let j = 0; j < pol.W1.length; j++) {
          for (let k = 0; k < pol.W1[j].length; k++) dW1[j][k] += dhidden[j] * s.x[k];
          db1[j] += dhidden[j];
        }
      }
      const scale = lr / steps.length;
      addScaled(pol.W2, dW2, scale);
      addScaledVec(pol.b2, db2, scale);
      addScaled(pol.W1, dW1, scale);
      addScaledVec(pol.b1, db1, scale);
    }

    update(polA, stepsA, baselineA);
    update(polB, stepsB, baselineB);

    let winA: number | null = null;
    if (spec.zeroSum) {
      const avgRewardA = rewardSumA / stepsPerEp;
      winA = (avgRewardA + 1) / 2;
    }

    logs.push({
      ep,
      avgRewardA: rewardSumA / stepsPerEp,
      avgRewardB: rewardSumB / stepsPerEp,
      winA,
    });
  }

  return {
    run_id: uuidv4(),
    config: { ...cfg, lr, hidden, stepsPerEp, episodes },
    logs,
    policyA: polA,
    policyB: polB,
    actsA: spec.actsA,
    actsB: spec.actsB,
  };
}

export function trainSelfPlayDistributed(cfg: TrainConfig & { workers: number }): DistributedTrainResult {
  const workers = Math.max(1, Math.min(16, cfg.workers));
  const baseSeed = cfg.seed ?? 1234;
  const runs = Array.from({ length: workers }, (_, i) => {
    const seed = baseSeed + i;
    const run = trainSelfPlay({ ...cfg, seed });
    return { run_id: run.run_id, seed, logs: run.logs };
  });
  // aggregate logs by episode index
  const episodes = runs[0]?.logs.length || cfg.episodes;
  const aggregatedLogs: TrainLogs = [];
  for (let idx = 0; idx < episodes; idx++) {
    let sumA = 0; let sumB = 0; let sumWin = 0; let countWin = 0;
    for (const r of runs) {
      const log = r.logs[idx];
      sumA += log?.avgRewardA ?? 0;
      sumB += log?.avgRewardB ?? 0;
      if (log?.winA != null) { sumWin += log.winA; countWin += 1; }
    }
    aggregatedLogs.push({
      ep: idx + 1,
      avgRewardA: sumA / workers,
      avgRewardB: sumB / workers,
      winA: countWin ? sumWin / countWin : null,
    });
  }
  return {
    distributed: true,
    workers,
    base_seed: baseSeed,
    workerRuns: runs,
    aggregatedLogs,
    config: cfg,
    actsA: GAMES[cfg.game].actsA,
    actsB: GAMES[cfg.game].actsB,
  };
}
