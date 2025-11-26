import { db, insertEvalMetric, insertEvalSummary } from '../db';
import { makeStepper } from './algos';

type GameId = 'rps' | 'mp' | 'pd';

type Vec = number[];

function normalize(v: number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  if (s <= 0) return v.map(() => 1 / v.length);
  return v.map((x) => x / s);
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
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

const GAMES = {
  rps: {
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
    actsA: ['R', 'P', 'S'],
    actsB: ['R', 'P', 'S'],
    zeroSum: true,
  },
  mp: {
    A: [
      [1, -1],
      [-1, 1],
    ],
    B: [
      [-1, 1],
      [1, -1],
    ],
    actsA: ['H', 'T'],
    actsB: ['H', 'T'],
    zeroSum: true,
  },
  pd: {
    A: [
      [3, 0],
      [5, 1],
    ],
    B: [
      [3, 5],
      [0, 1],
    ],
    actsA: ['C', 'D'],
    actsB: ['C', 'D'],
    zeroSum: false,
  },
} as const;

export async function runEval(params: {
  run_id: number;
  game: GameId;
  algA: 'hedge' | 'regret' | 'fp';
  algB: 'hedge' | 'regret' | 'fp';
  seeds: number[];
  episodes: number;
  stepsPerEp: number;
  lr?: number;
}) {
  const spec = GAMES[params.game];
  const A = spec.A as unknown as number[][];
  const B = spec.B as unknown as number[][];
  const nA = A.length;
  const nB = A[0].length;
  const uniformA = Array(nA).fill(1 / nA);

  const metrics: Array<{ winA: number | null; avgRewardA: number; coopRate: number | null; l2Dist: number | null; seed: number; ep: number }> = [];

  for (const seed of params.seeds) {
    const rng = mulberry32(seed);
    for (let ep = 1; ep <= params.episodes; ep++) {
      // reset per episode
      let pA: Vec = [...uniformA];
      let pB: Vec = Array(nB).fill(1 / nB);
      const stepA = makeStepper(params.algA, nA, params.lr);
      const stepB = makeStepper(params.algB, nB, params.lr);
      let coopCount = 0; // for PD only: action index 0 is 'C'
      let rewardSumA = 0;

      for (let t = 0; t < params.stepsPerEp; t++) {
        // update strategies given opponent's current mix
        pA = stepA(pB, A);
        pB = stepB(pA, B);
        // sample actions
        const a = sampleIndex(pA, rng);
        const b = sampleIndex(pB, rng);
        const rA = A[a][b];
        rewardSumA += rA;
        if (params.game === 'pd' && a === 0) coopCount += 1;
      }

      const avgRewardA = rewardSumA / params.stepsPerEp;
      let winA: number | null = null;
      let coopRate: number | null = null;
      let l2Dist: number | null = null;
      if (spec.zeroSum) {
        winA = (avgRewardA + 1) / 2; // map [-1,1] to [0,1]
        // l2 distance to uniform
        const d2 = pA.reduce((acc, pi, i) => acc + Math.pow(pi - uniformA[i], 2), 0);
        l2Dist = Math.sqrt(d2);
      } else {
        coopRate = coopCount / params.stepsPerEp;
      }

      await insertEvalMetric({ run_id: params.run_id, seed, ep, winA, avgRewardA, coopRate, l2Dist });
      metrics.push({ winA, avgRewardA, coopRate, l2Dist, seed, ep });
    }
  }

  // compute summary
  function meanStd(xs: number[]) {
    if (!xs.length) return { mean: null as number | null, std: null as number | null };
    const m = xs.reduce((a, b) => a + b, 0) / xs.length;
    const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
    return { mean: m, std: Math.sqrt(v) };
  }

  const winList = metrics.map(m => m.winA).filter((x): x is number => x != null);
  const avgList = metrics.map(m => m.avgRewardA).filter((x): x is number => x != null);
  const coopList = metrics.map(m => m.coopRate).filter((x): x is number => x != null);
  const l2List = metrics.map(m => m.l2Dist).filter((x): x is number => x != null);

  const msWin = meanStd(winList);
  const msAvg = meanStd(avgList);
  const msCoop = meanStd(coopList);
  const msL2 = meanStd(l2List);

  await insertEvalSummary({
    run_id: params.run_id,
    winA_mean: msWin.mean, winA_std: msWin.std,
    avgRewardA_mean: msAvg.mean, avgRewardA_std: msAvg.std,
    coopRate_mean: msCoop.mean, coopRate_std: msCoop.std,
    l2Dist_mean: msL2.mean, l2Dist_std: msL2.std,
  });
}

export type EvalTraceStep = {
  seed: number;
  ep: number;
  t: number;
  actionA: number;
  actionB: number;
  rewardA: number;
  rewardB: number;
  pA: number[];
  pB: number[];
};

export function generateEvalTrace(params: {
  game: GameId;
  algA: 'hedge' | 'regret' | 'fp';
  algB: 'hedge' | 'regret' | 'fp';
  seeds: number[];
  episodes: number;
  stepsPerEp: number;
  lr?: number;
}): { steps: EvalTraceStep[]; actsA: string[]; actsB: string[] } {
  const spec = GAMES[params.game];
  if (!spec) throw new Error('invalid_game');
  const A = spec.A as unknown as number[][];
  const B = spec.B as unknown as number[][];
  const nA = A.length;
  const nB = A[0].length;
  const steps: EvalTraceStep[] = [];

  for (const seed of params.seeds) {
    const rng = mulberry32(seed);
    for (let ep = 1; ep <= params.episodes; ep++) {
      let pA: Vec = Array(nA).fill(1 / nA);
      let pB: Vec = Array(nB).fill(1 / nB);
      const stepA = makeStepper(params.algA, nA, params.lr);
      const stepB = makeStepper(params.algB, nB, params.lr);

      for (let t = 1; t <= params.stepsPerEp; t++) {
        pA = stepA(pB, A);
        pB = stepB(pA, B);
        const a = sampleIndex(pA, rng);
        const b = sampleIndex(pB, rng);
        const rA = A[a][b];
        const rB = B[a][b];
        steps.push({
          seed,
          ep,
          t,
          actionA: a,
          actionB: b,
          rewardA: rA,
          rewardB: rB,
          pA: [...pA],
          pB: [...pB],
        });
      }
    }
  }

  return { steps, actsA: [...spec.actsA], actsB: [...spec.actsB] };
}
