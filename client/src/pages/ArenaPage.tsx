import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { io, Socket } from 'socket.io-client';
import api from '../api';

type Vec = number[];

type GameId = 'rps' | 'mp' | 'pd';

type GameSpec = {
  id: GameId;
  name: string;
  acts1: string[];
  acts2: string[];
  A1: number[][]; // payoff for player 1
  A2: number[][]; // payoff for player 2
  zeroSum?: boolean;
};

type TickRecord = {
  t: number;
  a1: number;
  a2: number;
  r1: number;
  r2: number;
  p1: Vec; // player1 mixed strategy snapshot
  p2: Vec; // player2 mixed strategy snapshot
};

function clamp01(x: number) { return Math.max(0, Math.min(1, x)); }

function normalize(v: Vec): Vec {
  const s = v.reduce((a, b) => a + b, 0);
  if (s <= 0) return v.map(() => 1 / v.length);
  return v.map((x) => x / s);
}

function expectedPayoffVector(A: number[][], opp: Vec): Vec {
  // returns vector u where u[i] = sum_j A[i][j] * opp[j]
  return A.map((row) => row.reduce((acc, aij, j) => acc + aij * opp[j], 0));
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

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const GAMES: GameSpec[] = [
  {
    id: 'rps',
    name: 'Rock-Paper-Scissors',
    acts1: ['R', 'P', 'S'],
    acts2: ['R', 'P', 'S'],
    A1: [
      //    R   P   S
      /*R*/ [0, -1, 1],
      /*P*/ [1, 0, -1],
      /*S*/ [-1, 1, 0],
    ],
    A2: [
      [0, 1, -1],
      [-1, 0, 1],
      [1, -1, 0],
    ],
    zeroSum: true,
  },
  {
    id: 'mp',
    name: 'Matching Pennies',
    acts1: ['H', 'T'],
    acts2: ['H', 'T'],
    A1: [
      /*H*/ [1, -1],
      /*T*/ [-1, 1],
    ],
    A2: [
      /*H*/ [-1, 1],
      /*T*/ [1, -1],
    ],
    zeroSum: true,
  },
  {
    id: 'pd',
    name: "Prisoner's Dilemma(2x2)",
    acts1: ['C', 'D'],
    acts2: ['C', 'D'],
    // Payoffs: (R,R)= (3,3), (S,T)= (0,5), (T,S)= (5,0), (P,P)= (1,1)
    A1: [
      /*C*/ [3, 0],
      /*D*/ [5, 1],
    ],
    A2: [
      /*C*/ [3, 5],
      /*D*/ [0, 1],
    ],
    zeroSum: false,
  },
];

const defaultSteps = 500;

const ArenaPage: React.FC = () => {
  const [gameId, setGameId] = useState<GameId>('rps');
  const [steps, setSteps] = useState<number>(defaultSteps);
  const [seed, setSeed] = useState<string>('1234');
  const [lr, setLr] = useState<number>(0.5); // learning rate for Hedge
  const [running, setRunning] = useState(false);
  const [backendMode, setBackendMode] = useState(true);
  const socketRef = useRef<Socket | null>(null);
  const runIdRef = useRef<string | null>(null);

  const recsRef = useRef<TickRecord[]>([]);
  const tRef = useRef(0);
  const w1Ref = useRef<Vec>([]);
  const w2Ref = useRef<Vec>([]);
  const p1Ref = useRef<Vec>([]);
  const p2Ref = useRef<Vec>([]);
  const heatRef = useRef<number[][]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rngRef = useRef<() => number>(() => Math.random());

  const game = useMemo(() => GAMES.find((g) => g.id === gameId)!, [gameId]);

  function initState(withSeed = seed) {
    // init RNG
    const s = parseInt(withSeed || '1234', 10) || 1234;
    rngRef.current = mulberry32(s);
    const n1 = game.acts1.length;
    const n2 = game.acts2.length;
    w1Ref.current = Array(n1).fill(1);
    w2Ref.current = Array(n2).fill(1);
    p1Ref.current = normalize([...w1Ref.current]);
    p2Ref.current = normalize([...w2Ref.current]);
    heatRef.current = Array.from({ length: n1 }, () => Array(n2).fill(0));
    recsRef.current = [];
    tRef.current = 0;
  }

  useEffect(() => {
    initState();
    // reset on game or scenario change to keep dimensions consistent
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId]);

  // Load scenarios list when entering custom
  // removed scenarios/lessons related effects in rollback

  useEffect(() => () => { if (timerRef.current) clearInterval(timerRef.current); if (socketRef.current) socketRef.current.disconnect(); }, []);

  function stepOnce() {
    const p1 = p1Ref.current;
    const p2 = p2Ref.current;
    const A1 = game.A1; const A2 = game.A2;

    // expected payoff vectors for each pure action
    const u1 = expectedPayoffVector(A1, p2);
    const u2 = expectedPayoffVector(A2, p1);

    // stability: scale by max abs to keep exponentials stable
    const s1 = Math.max(1, ...u1.map((x) => Math.abs(x)));
    const s2 = Math.max(1, ...u2.map((x) => Math.abs(x)));

    // Hedge update (full-information)
    const w1 = w1Ref.current.map((w, i) => w * Math.exp((lr / s1) * u1[i]));
    const w2 = w2Ref.current.map((w, i) => w * Math.exp((lr / s2) * u2[i]));
    w1Ref.current = w1;
    w2Ref.current = w2;
    p1Ref.current = normalize(w1);
    p2Ref.current = normalize(w2);

    // sample actions
    const a1 = sampleIndex(p1Ref.current, rngRef.current);
    const a2 = sampleIndex(p2Ref.current, rngRef.current);

    // realized rewards
    const r1 = A1[a1][a2];
    const r2 = A2[a1][a2];

    heatRef.current[a1][a2] += 1;

    tRef.current += 1;
    recsRef.current.push({ t: tRef.current, a1, a2, r1, r2, p1: [...p1Ref.current], p2: [...p2Ref.current] });
  }

  async function start() {
    if (running) return;
    setRunning(true);
    if (backendMode) {
      try {
        const res = await api.post('/api/arena/start', {
          game: gameId,
          stepsPerTick: 10,
          seed: parseInt(seed || '1234', 10) || 1234,
          lr,
        });
        const run_id = res.data?.run_id as string;
        if (!run_id) throw new Error('no run_id');
        runIdRef.current = run_id;
        const s = io('http://localhost:4000/arena', {
          withCredentials: true,
          query: { run_id },
        });
        socketRef.current = s;
        s.on('tick', (payload: any) => {
          // append
          tRef.current = payload.iter;
          p1Ref.current = payload.distA;
          p2Ref.current = payload.distB;
          heatRef.current = payload.jointCounts;
          recsRef.current.push({
            t: payload.iter,
            a1: payload.lastActionA,
            a2: payload.lastActionB,
            r1: payload.rewardA,
            r2: payload.rewardB,
            p1: [...payload.distA],
            p2: [...payload.distB],
          });
          if (tRef.current >= steps) {
            stop();
          } else {
            setTick((x) => x + 1);
          }
        });
      } catch (e) {
        // fallback to local if backend unavailable
        setBackendMode(false);
        startLocal();
      }
    } else {
      startLocal();
    }
  }

  function startLocal() {
    const batch = 20;
    timerRef.current = setInterval(() => {
      for (let i = 0; i < batch; i++) {
        if (tRef.current >= steps) { stop(); return; }
        stepOnce();
      }
      setTick((x) => x + 1);
    }, 0);
  }

  async function stop() {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    setRunning(false);
    if (socketRef.current) {
      try {
        // attempt to stop on server if possible
        const rid = runIdRef.current;
        if (rid) { try { await api.post('/api/arena/stop', { run_id: rid }); } catch {} }
        socketRef.current.disconnect();
      } catch {}
      socketRef.current = null;
    }
    runIdRef.current = null;
  }

  async function reset() {
    await stop();
    initState();
    setTick((x) => x + 1);
  }

  const [tick, setTick] = useState(0); // render trigger

  // Derived datasets
  const iters = recsRef.current.map((r) => r.t);
  const rewards1 = recsRef.current.map((r) => r.r1);
  const window = 50;
  const ma1 = useMemo(() => movingAvg(rewards1, window), [tick]);

  const probSeries = useMemo(() => {
    const n = game.acts1.length;
    const series: number[][] = Array.from({ length: n }, () => []);
    for (const r of recsRef.current) {
      for (let i = 0; i < n; i++) series[i].push(r.p1[i]);
    }
    return series;
  }, [tick, game.id]);

  const heatSeries = useMemo(() => {
    const data: [number, number, number][] = [];
    const counts = heatRef.current;
    const total = recsRef.current.length || 1;
    for (let i = 0; i < counts.length; i++) {
      for (let j = 0; j < counts[i].length; j++) {
        data.push([j, i, counts[i][j] / total]);
      }
    }
    return data;
  }, [tick]);

  // Charts options
  const rewardOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: iters, name: 't' },
    yAxis: { type: 'value', name: 'reward' },
    series: [
      { name: 'moving avg (P1)', type: 'line', data: ma1, smooth: true, showSymbol: false },
    ],
  }), [tick]);

  const probsOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: iters },
    yAxis: { type: 'value', min: 0, max: 1 },
    legend: { data: game.acts1 },
    series: game.acts1.map((label, i) => ({ name: label, type: 'line', data: probSeries[i] || [], smooth: true, showSymbol: false })),
  }), [tick, game.id]);

  const heatOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 60 },
    tooltip: {
      formatter: (p: any) => {
        const i = p.value[1];
        const j = p.value[0];
        const freq = p.value[2];
        return `${game.acts1[i]} vs ${game.acts2[j]}<br/>freq: ${(freq * 100).toFixed(1)}%`;
      }
    },
    xAxis: { type: 'category', data: game.acts2, name: 'P2' },
    yAxis: { type: 'category', data: game.acts1, name: 'P1' },
    visualMap: { min: 0, max: 1, orient: 'horizontal', left: 'center', bottom: 0 },
    series: [{ type: 'heatmap', data: heatSeries }],
  }), [tick, game.id]);

  return (
    <div className="container page-animate">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 className="page-title">Learning Dynamics Arena</h2>
            <p className="page-subtitle">
              Run repeated games and visualize how online learning converges under different incentives.
            </p>
          </div>
          <div className="section-meta">
            <div className="pill">
              <span className="pill-dot" />
              Real-time simulation
            </div>
            <div className="pill">
              <span className="pill-dot accent" />
              Socket.IO back-end
            </div>
            <div className="pill">
              <span className="pill-dot" />
              Heatmap + trajectory views
            </div>
          </div>
        </div>
        <Controls
          gameId={gameId}
          setGameId={(id) => { setGameId(id); }}
          steps={steps}
          setSteps={(n) => setSteps(n)}
          seed={seed}
          setSeed={(s) => setSeed(s)}
          lr={lr}
          setLr={(x) => setLr(x)}
          running={running}
          backendMode={backendMode}
          setBackendMode={setBackendMode}
          onStart={() => { initState(seed); start(); }}
          onStop={() => stop()}
          onReset={() => reset()}
          t={tRef.current}
        />
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Average Reward (P1)</h3>
              <p className="page-subtitle">Smoothed rewards over time with a moving window.</p>
            </div>
          </div>
          <ChartBoundary>
            <ReactECharts echarts={echarts} option={rewardOption} style={{ height: 260 }} />
          </ChartBoundary>
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Strategy Distribution (P1)</h3>
              <p className="page-subtitle">Track how the mixed strategy evolves under Hedge updates.</p>
            </div>
          </div>
          <ChartBoundary>
            <ReactECharts echarts={echarts} option={probsOption} style={{ height: 300 }} />
          </ChartBoundary>
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Joint Action Frequency</h3>
              <p className="page-subtitle">Empirical distribution over joint actions across the horizon.</p>
            </div>
          </div>
          <ChartBoundary>
            <ReactECharts echarts={echarts} option={heatOption} style={{ height: 320 }} />
          </ChartBoundary>
        </div>
      </div>
    </div>
  );
};

function movingAvg(xs: number[], w: number): number[] {
  const out: number[] = [];
  let s = 0;
  for (let i = 0; i < xs.length; i++) {
    s += xs[i];
    if (i >= w) s -= xs[i - w];
    out.push(s / Math.min(i + 1, w));
  }
  return out;
}

const Controls: React.FC<{
  gameId: GameId;
  setGameId: (g: GameId) => void;
  steps: number; setSteps: (n: number) => void;
  seed: string; setSeed: (s: string) => void;
  lr: number; setLr: (x: number) => void;
  running: boolean;
  backendMode: boolean; setBackendMode: (b: boolean) => void;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  t: number;
}> = ({ gameId, setGameId, steps, setSteps, seed, setSeed, lr, setLr, running, backendMode, setBackendMode, onStart, onStop, onReset, t }) => {
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div className="col" style={{ minWidth: 180 }}>
        <div className="muted">Game</div>
        <select value={gameId} onChange={(e) => setGameId(e.target.value as GameId)}>
          <option value="rps">Rock-Paper-Scissors</option>
          <option value="mp">Matching Pennies</option>
          <option value="pd">Prisoner's Dilemma(2x2)</option>
        </select>
      </div>
      
      <div className="col" style={{ minWidth: 140 }}>
        <div className="muted">Steps</div>
        <input type="number" min={1} max={20000} value={steps} onChange={(e) => setSteps(parseInt(e.target.value || '1', 10))} />
      </div>
      <div className="col" style={{ minWidth: 160 }}>
        <div className="muted">Seed</div>
        <input value={seed} onChange={(e) => setSeed(e.target.value)} />
      </div>
      <div className="col" style={{ minWidth: 180 }}>
        <div className="muted">Learning rate (Hedge)</div>
        <input type="number" step={0.05} min={0.05} max={5} value={lr} onChange={(e) => setLr(parseFloat(e.target.value || '0.5'))} />
      </div>
      <div className="col" style={{ minWidth: 180 }}>
        <div className="muted">Backend mode</div>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={backendMode} onChange={(e) => setBackendMode(e.target.checked)} />
          <span className="muted">Use server (Socket.IO)</span>
        </label>
      </div>
      <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
        {!running ? (
          <button className="primary" onClick={onStart}>Start</button>
        ) : (
          <button onClick={onStop}>Stop</button>
        )}
        <button onClick={onReset}>Reset</button>
      </div>
      <div className="muted" style={{ marginLeft: 'auto' }}>t = {t}</div>
    </div>
  );
};

export default ArenaPage;

class ChartBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; msg?: string }>{
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(err: any) {
    return { hasError: true, msg: String(err?.message || err) };
  }
  componentDidCatch(err: any) {
    // swallow chart errors to avoid whole page blank in dev overlay
    console.error('Chart error:', err);
  }
  render() {
    if (this.state.hasError) return <div className="muted">Chart failed to render.</div>;
    return this.props.children as any;
  }
}
