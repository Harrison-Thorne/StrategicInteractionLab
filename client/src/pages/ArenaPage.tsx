import React, { useEffect, useMemo, useRef, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import { io, Socket } from 'socket.io-client';
import api from '../api';
import { useI18n } from '../i18n';

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

const ACTION_COLORS = ['#60a5fa', '#f59e0b', '#22c55e', '#a855f7', '#f97373', '#38bdf8', '#14b8a6'];

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
  const { t } = useI18n();
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

  function downloadCsv() {
    if (!recsRef.current.length) return;
    const header = ['t', 'p1_action', 'p2_action', 'reward1', 'reward2', 'p1_probs', 'p2_probs'];
    const lines = recsRef.current.map((r) => {
      const p1Act = game.acts1[r.a1] ?? String(r.a1);
      const p2Act = game.acts2[r.a2] ?? String(r.a2);
      const p1Prob = r.p1.map((x) => x.toFixed(4)).join('|');
      const p2Prob = r.p2.map((x) => x.toFixed(4)).join('|');
      return [r.t, p1Act, p2Act, r.r1, r.r2, `"${p1Prob}"`, `"${p2Prob}"`].join(',');
    });
    const blob = new Blob([`${header.join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arena_steps_${game.id}.csv`;
    a.click();
    URL.revokeObjectURL(url);
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

  const p1Label = t('arena.axis.p1');
  const p2Label = t('arena.axis.p2');

  const decisionData = useMemo(() => recsRef.current.flatMap((r) => ([
    { t: r.t, player: p1Label, action: game.acts1[r.a1] ?? String(r.a1), reward: r.r1 },
    { t: r.t, player: p2Label, action: game.acts2[r.a2] ?? String(r.a2), reward: r.r2 },
  ])), [tick, gameId, p1Label, p2Label]);

  const actionCategories = useMemo(() => Array.from(new Set([...game.acts1, ...game.acts2])), [gameId]);

  const actionColorMap = useMemo(() => {
    const map = new Map<string, string>();
    actionCategories.forEach((a, idx) => { map.set(a, ACTION_COLORS[idx % ACTION_COLORS.length]); });
    return map;
  }, [actionCategories]);

  const recentSteps = useMemo(() => recsRef.current.slice(-12).reverse(), [tick]);

  // Charts options
  const rewardOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: iters, name: t('arena.axis.t') },
    yAxis: { type: 'value', name: t('arena.axis.reward') },
    series: [
      { name: t('arena.avgRewardTitle'), type: 'line', data: ma1, smooth: true, showSymbol: false },
    ],
  }), [tick, t]);

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
        return t('arena.tooltip.freq', { p1: game.acts1[i], p2: game.acts2[j], freq: (freq * 100).toFixed(1) });
      }
    },
    xAxis: { type: 'category', data: game.acts2, name: t('arena.axis.p2') },
    yAxis: { type: 'category', data: game.acts1, name: t('arena.axis.p1') },
    visualMap: { min: 0, max: 1, orient: 'horizontal', left: 'center', bottom: 0 },
    series: [{ type: 'heatmap', data: heatSeries }],
  }), [tick, game.id, t]);

  const decisionOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 80, left: 70 },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const d = p.data;
        return t('arena.tooltip.decision', { t: d.t, player: d.player, action: d.action, reward: d.reward });
      }
    },
    dataset: { source: decisionData },
    xAxis: { type: 'value', name: t('arena.axis.t') },
    yAxis: { type: 'category', data: [p1Label, p2Label], inverse: true, name: t('arena.axis.player') },
    dataZoom: [
      { type: 'inside', xAxisIndex: 0, filterMode: 'none' },
      { type: 'slider', xAxisIndex: 0, height: 18, bottom: 48 },
    ],
    visualMap: {
      type: 'piecewise',
      dimension: 'action',
      categories: actionCategories,
      orient: 'horizontal',
      bottom: 10,
      left: 'center',
      itemWidth: 12,
      itemHeight: 12,
      textStyle: { color: '#e5e7eb' },
      inRange: { color: ACTION_COLORS },
    },
    series: [{
      type: 'scatter',
      symbol: 'roundRect',
      symbolSize: 12,
      encode: { x: 't', y: 'player' },
      itemStyle: { opacity: 0.9 },
      emphasis: { focus: 'series' },
    }],
  }), [decisionData, actionCategories, p1Label, p2Label, t]);

  return (
    <div className="container page-animate">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 className="page-title">{t('arena.title')}</h2>
            <p className="page-subtitle">
              {t('arena.subtitle')}
            </p>
          </div>
          <div className="section-meta">
            <div className="pill">
              <span className="pill-dot" />
              {t('arena.pillRealtime')}
            </div>
            <div className="pill">
              <span className="pill-dot accent" />
              {t('arena.pillSocket')}
            </div>
            <div className="pill">
              <span className="pill-dot" />
              {t('arena.pillHeatmap')}
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
          currentT={tRef.current}
        />
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('arena.decisionTitle')}</h3>
              <p className="page-subtitle">{t('arena.decisionSubtitle')}</p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button onClick={downloadCsv} disabled={!recsRef.current.length}>{t('arena.downloadCsv')}</button>
            </div>
          </div>
          <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 320 }}>
              <ChartBoundary errorText={t('common.chartError')}>
                <ReactECharts echarts={echarts} option={decisionOption} style={{ height: 300 }} />
              </ChartBoundary>
            </div>
            <div className="col" style={{ flex: '0 0 320px', minWidth: 260, gap: 8 }}>
              <div className="muted">{t('arena.latestSteps')}</div>
              <div style={{ border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: 12, padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', maxHeight: 300, overflowY: 'auto' }}>
                {recentSteps.length === 0 && <div className="muted">{t('arena.noSteps')}</div>}
                {recentSteps.map((r) => {
                  const p1Act = game.acts1[r.a1] ?? String(r.a1);
                  const p2Act = game.acts2[r.a2] ?? String(r.a2);
                  return (
                    <div key={r.t} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                      <div className="muted" style={{ minWidth: 52 }}>{t('arena.control.time', { t: r.t })}</div>
                      <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                        <span className="pill" style={{ padding: '0.1rem 0.55rem', background: `${actionColorMap.get(p1Act) ?? '#1e293b'}33`, borderColor: 'rgba(148, 163, 184, 0.35)' }}>{t('arena.label.p1')} {p1Act}</span>
                        <span className="pill" style={{ padding: '0.1rem 0.55rem', background: `${actionColorMap.get(p2Act) ?? '#1e293b'}33`, borderColor: 'rgba(148, 163, 184, 0.35)' }}>{t('arena.label.p2')} {p2Act}</span>
                        <span className="pill" style={{ padding: '0.1rem 0.5rem', background: 'rgba(34,197,94,0.15)', borderColor: 'rgba(148, 163, 184, 0.3)' }}>{t('arena.label.r1')} {r.r1}</span>
                        <span className="pill" style={{ padding: '0.1rem 0.5rem', background: 'rgba(56,189,248,0.15)', borderColor: 'rgba(148, 163, 184, 0.3)' }}>{t('arena.label.r2')} {r.r2}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('arena.avgRewardTitle')}</h3>
              <p className="page-subtitle">{t('arena.avgRewardSubtitle')}</p>
            </div>
          </div>
          <ChartBoundary errorText={t('common.chartError')}>
            <ReactECharts echarts={echarts} option={rewardOption} style={{ height: 260 }} />
          </ChartBoundary>
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('arena.strategyTitle')}</h3>
              <p className="page-subtitle">{t('arena.strategySubtitle')}</p>
            </div>
          </div>
          <ChartBoundary errorText={t('common.chartError')}>
            <ReactECharts echarts={echarts} option={probsOption} style={{ height: 300 }} />
          </ChartBoundary>
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('arena.heatTitle')}</h3>
              <p className="page-subtitle">{t('arena.heatSubtitle')}</p>
            </div>
          </div>
          <ChartBoundary errorText={t('common.chartError')}>
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
  currentT: number;
}> = ({ gameId, setGameId, steps, setSteps, seed, setSeed, lr, setLr, running, backendMode, setBackendMode, onStart, onStop, onReset, currentT }) => {
  const { t } = useI18n();
  return (
    <div className="row" style={{ flexWrap: 'wrap', gap: 12 }}>
      <div className="col" style={{ minWidth: 180 }}>
        <div className="muted">{t('arena.control.game')}</div>
        <select value={gameId} onChange={(e) => setGameId(e.target.value as GameId)}>
          <option value="rps">{t('arena.control.rps')}</option>
          <option value="mp">{t('arena.control.mp')}</option>
          <option value="pd">{t('arena.control.pd')}</option>
        </select>
      </div>
      
      <div className="col" style={{ minWidth: 140 }}>
        <div className="muted">{t('arena.control.steps')}</div>
        <input type="number" min={1} max={20000} value={steps} onChange={(e) => setSteps(parseInt(e.target.value || '1', 10))} />
      </div>
      <div className="col" style={{ minWidth: 160 }}>
        <div className="muted">{t('arena.control.seed')}</div>
        <input value={seed} onChange={(e) => setSeed(e.target.value)} />
      </div>
      <div className="col" style={{ minWidth: 180 }}>
        <div className="muted">{t('arena.control.lr')}</div>
        <input type="number" step={0.05} min={0.05} max={5} value={lr} onChange={(e) => setLr(parseFloat(e.target.value || '0.5'))} />
      </div>
      <div className="col" style={{ minWidth: 180 }}>
        <div className="muted">{t('arena.control.backend')}</div>
        <label className="row" style={{ gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={backendMode} onChange={(e) => setBackendMode(e.target.checked)} />
          <span className="muted">{t('arena.control.backendLabel')}</span>
        </label>
      </div>
      <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
        {!running ? (
          <button className="primary" onClick={onStart}>{t('arena.control.start')}</button>
        ) : (
          <button onClick={onStop}>{t('arena.control.stop')}</button>
        )}
        <button onClick={onReset}>{t('arena.control.reset')}</button>
      </div>
      <div className="muted" style={{ marginLeft: 'auto' }}>{t('arena.control.time', { t: currentT })}</div>
    </div>
  );
};

export default ArenaPage;

class ChartBoundary extends React.Component<{ children: React.ReactNode; errorText?: string }, { hasError: boolean; msg?: string }>{
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
    if (this.state.hasError) return <div className="muted">{this.props.errorText || 'Chart failed to render.'}</div>;
    return this.props.children as any;
  }
}
