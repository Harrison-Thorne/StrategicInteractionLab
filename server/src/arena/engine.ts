import { v4 as uuidv4 } from 'uuid';

export type GameId = 'rps' | 'mp' | 'pd';

type Vec = number[];

export interface ArenaOptions {
  game: GameId;
  stepsPerTick?: number; // batch size per onTick
  seed?: number;
  lr?: number; // learning rate for Hedge
}

export interface TickPayload {
  iter: number;
  rewardA: number;
  rewardB: number;
  rewardMean: number;
  distA: number[];
  distB: number[];
  lastActionA: number;
  lastActionB: number;
  jointCounts: number[][];
}

export interface Runner {
  run_id: string;
  start: () => void;
  stop: () => void;
  onTick: (cb: (p: TickPayload) => void) => () => void; // returns unsubscribe
  getState: () => TickPayload;
}

type GameSpec = {
  id: GameId;
  actsA: string[];
  actsB: string[];
  A: number[][]; // payoff for A
  B: number[][]; // payoff for B
};

const GAMES: Record<GameId, GameSpec> = {
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

function normalize(v: Vec): Vec {
  const s = v.reduce((a, b) => a + b, 0);
  if (s <= 0) return v.map(() => 1 / v.length);
  return v.map((x) => x / s);
}

function expectedPayoffVector(M: number[][], opp: Vec): Vec {
  return M.map((row) => row.reduce((acc, mij, j) => acc + mij * opp[j], 0));
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

export function createRunner(opts: ArenaOptions): Runner {
  const spec = GAMES[opts.game];
  if (!spec) throw new Error('invalid game');
  const lr = opts.lr ?? 0.5;
  const stepsPerTick = Math.max(1, opts.stepsPerTick ?? 10);
  const seed = opts.seed ?? 1234;
  const rng = mulberry32(seed);
  const run_id = uuidv4();

  const actsA = spec.actsA;
  const actsB = spec.actsB;
  const A = spec.A;
  const B = spec.B;
  const nA = actsA.length;
  const nB = actsB.length;
  let wA: Vec = Array(nA).fill(1);
  let wB: Vec = Array(nB).fill(1);
  let pA: Vec = normalize([...wA]);
  let pB: Vec = normalize([...wB]);
  let jointCounts: number[][] = Array.from({ length: nA }, () => Array(nB).fill(0));
  let iter = 0;
  let lastActionA = 0;
  let lastActionB = 0;
  let rewardA = 0;
  let rewardB = 0;
  let timer: NodeJS.Timeout | null = null;
  const listeners = new Set<(p: TickPayload) => void>();

  function stepOnce() {
    // Hedge
    const uA = expectedPayoffVector(A, pB);
    const uB = expectedPayoffVector(B, pA);
    const sA = Math.max(1, ...uA.map((x) => Math.abs(x)));
    const sB = Math.max(1, ...uB.map((x) => Math.abs(x)));
    wA = wA.map((w, i) => w * Math.exp((lr / sA) * uA[i]));
    wB = wB.map((w, i) => w * Math.exp((lr / sB) * uB[i]));
    pA = normalize(wA);
    pB = normalize(wB);
    lastActionA = sampleIndex(pA, rng);
    lastActionB = sampleIndex(pB, rng);
    rewardA = A[lastActionA][lastActionB];
    rewardB = B[lastActionA][lastActionB];
    jointCounts[lastActionA][lastActionB] += 1;
    iter += 1;
  }

  function emitTick() {
    const payload: TickPayload = {
      iter,
      rewardA,
      rewardB,
      rewardMean: (rewardA + rewardB) / 2,
      distA: [...pA],
      distB: [...pB],
      lastActionA,
      lastActionB,
      jointCounts: jointCounts.map((row) => [...row]),
    };
    for (const cb of listeners) cb(payload);
  }

  const start = () => {
    if (timer) return;
    timer = setInterval(() => {
      for (let i = 0; i < stepsPerTick; i++) stepOnce();
      emitTick();
    }, 0);
  };

  const stop = () => {
    if (timer) clearInterval(timer);
    timer = null;
  };

  const onTick = (cb: (p: TickPayload) => void) => {
    listeners.add(cb);
    return () => listeners.delete(cb);
  };

  const getState = (): TickPayload => ({
    iter,
    rewardA,
    rewardB,
    rewardMean: (rewardA + rewardB) / 2,
    distA: [...pA],
    distB: [...pB],
    lastActionA,
    lastActionB,
    jointCounts: jointCounts.map((row) => [...row]),
  });

  return { run_id, start, stop, onTick, getState };
}
