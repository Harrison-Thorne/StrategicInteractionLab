import React, { useEffect, useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import api from '../api';

type GameId = 'rps' | 'mp' | 'pd';
type AlgId = 'hedge' | 'regret' | 'fp';

type Metric = {
  seed: number;
  ep: number;
  winA: number | null;
  avgRewardA: number;
  coopRate: number | null;
  l2Dist: number | null;
};

const defaultSeeds = '1,2,3';
const ACTION_COLORS = ['#60a5fa', '#f59e0b', '#22c55e', '#a855f7', '#f97373', '#38bdf8', '#14b8a6'];

type TraceStep = {
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

type TracePayload = {
  actsA: string[];
  actsB: string[];
  steps: TraceStep[];
};

const EvalPage: React.FC = () => {
  const [game, setGame] = useState<GameId>('rps');
  const [algA, setAlgA] = useState<AlgId>('hedge');
  const [algB, setAlgB] = useState<AlgId>('regret');
  const [seedsText, setSeedsText] = useState<string>(defaultSeeds);
  const [episodes, setEpisodes] = useState<number>(5);
  const [stepsPerEp, setStepsPerEp] = useState<number>(500);
  const [lr, setLr] = useState<number>(0.5);
  const [running, setRunning] = useState(false);
  const [runId, setRunId] = useState<number | null>(null);
  const [summary, setSummary] = useState<any | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [trace, setTrace] = useState<TracePayload | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);
  const [traceSeed, setTraceSeed] = useState<number | null>(null);
  const [traceEp, setTraceEp] = useState<number | null>(null);

  async function runEval() {
    try {
      setRunning(true);
      setSummary(null);
      setMetrics([]);
      setTrace(null);
      setTraceSeed(null);
      setTraceEp(null);
      const seeds = seedsText.split(',').map((s) => parseInt(s.trim(), 10)).filter((x) => !isNaN(x));
      const res = await api.post('/api/eval/start', { game, algA, algB, seeds, episodes, stepsPerEp, lr });
      const id = res.data?.run_id as number;
      setRunId(id);
      // poll summary (though server returns after done, keep for robustness)
      for (let i = 0; i < 20; i++) {
        const sres = await api.get(`/api/eval/summary/${id}`);
        if (sres.status === 204) { await new Promise(r => setTimeout(r, 500)); continue; }
        setSummary(sres.data);
        break;
      }
      const mres = await api.get(`/api/eval/metrics/${id}`);
      setMetrics(mres.data);
      await loadTrace(id);
    } finally {
      setRunning(false);
    }
  }

  async function loadTrace(id: number) {
    try {
      setTraceLoading(true);
      const tres = await api.get(`/api/eval/trace/${id}`);
      const payload: TracePayload = tres.data;
      setTrace(payload);
      const seeds = Array.from(new Set(payload.steps.map((s) => s.seed))).sort((a, b) => a - b);
      setTraceSeed((prev) => prev ?? (seeds[0] ?? null));
    } finally {
      setTraceLoading(false);
    }
  }

  // Aggregations by episode
  const byEp = useMemo(() => {
    const map = new Map<number, Metric[]>();
    for (const m of metrics) {
      if (!map.has(m.ep)) map.set(m.ep, []);
      map.get(m.ep)!.push(m);
    }
    const eps = Array.from(map.keys()).sort((a, b) => a - b);
    const avgReward = eps.map((ep) => {
      const list = map.get(ep)!;
      const mean = list.reduce((a, b) => a + b.avgRewardA, 0) / list.length;
      return { ep, mean };
    });
    const coop = eps.map((ep) => {
      const list = map.get(ep)!.filter(x => x.coopRate != null);
      const mean = list.length ? list.reduce((a, b) => a + (b.coopRate as number), 0) / list.length : null;
      return { ep, mean };
    });
    const l2 = eps.map((ep) => {
      const list = map.get(ep)!.filter(x => x.l2Dist != null);
      const mean = list.length ? list.reduce((a, b) => a + (b.l2Dist as number), 0) / list.length : null;
      return { ep, mean };
    });
    return { eps, avgReward, coop, l2 };
  }, [metrics]);

  // Histogram for winA
  const winHist = useMemo(() => {
    const data = metrics.map((m) => (m.winA == null ? NaN : m.winA)).filter((x) => !isNaN(x));
    const bins = 10;
    const counts = Array(bins).fill(0);
    for (const x of data) {
      let idx = Math.floor(x * bins);
      if (idx >= bins) idx = bins - 1;
      if (idx < 0) idx = 0;
      counts[idx] += 1;
    }
    const labels = counts.map((_, i) => `${(i / bins).toFixed(1)}-${((i + 1) / bins).toFixed(1)}`);
    return { labels, counts };
  }, [metrics]);

  const summaryView = useMemo(() => {
    if (!summary) return null;
    const s = summary.summary || {};
    function fmt(x: any) { return x == null ? '-' : Number(x).toFixed(3); }
    return (
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ flexWrap: 'wrap', gap: 16 }}>
          <div>winA: {fmt(s.winA_mean)} ± {fmt(s.winA_std)}</div>
          <div>avgRewardA: {fmt(s.avgRewardA_mean)} ± {fmt(s.avgRewardA_std)}</div>
          {game === 'pd' && <div>coopRate: {fmt(s.coopRate_mean)} ± {fmt(s.coopRate_std)}</div>}
          {game !== 'pd' && <div>l2Dist: {fmt(s.l2Dist_mean)} ± {fmt(s.l2Dist_std)}</div>}
        </div>
      </div>
    );
  }, [summary, game]);

  const rewardOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: byEp.eps },
    yAxis: { type: 'value', name: 'avgRewardA' },
    series: [{ type: 'line', data: byEp.avgReward.map((d) => d.mean), smooth: true }],
  }), [byEp]);

  const coopOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: byEp.eps },
    yAxis: { type: 'value', name: 'coopRate', min: 0, max: 1 },
    series: [{ type: 'bar', data: byEp.coop.map((d) => d.mean ?? null) }],
  }), [byEp]);

  const l2Option = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: byEp.eps },
    yAxis: { type: 'value', name: 'l2Dist' },
    series: [{ type: 'line', data: byEp.l2.map((d) => d.mean ?? null), smooth: true }],
  }), [byEp]);

  const winHistOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: {},
    xAxis: { type: 'category', data: winHist.labels, axisLabel: { interval: 1 } },
    yAxis: { type: 'value', name: 'count' },
    series: [{ type: 'bar', data: winHist.counts }],
  }), [winHist]);

  const availableSeeds = useMemo(() => trace ? Array.from(new Set(trace.steps.map((s) => s.seed))).sort((a, b) => a - b) : [], [trace]);

  useEffect(() => {
    if (!trace) return;
    if (traceSeed == null && availableSeeds.length) {
      setTraceSeed(availableSeeds[0]);
    }
  }, [trace, availableSeeds, traceSeed]);

  const availableEps = useMemo(() => {
    if (!trace || traceSeed == null) return [];
    return Array.from(new Set(trace.steps.filter((s) => s.seed === traceSeed).map((s) => s.ep))).sort((a, b) => a - b);
  }, [trace, traceSeed]);

  useEffect(() => {
    if (!trace || traceSeed == null) return;
    if (traceEp == null || !availableEps.includes(traceEp)) {
      setTraceEp(availableEps[0] ?? null);
    }
  }, [trace, traceSeed, traceEp, availableEps]);

  const filteredSteps = useMemo(() => {
    if (!trace) return [];
    return trace.steps.filter((s) => (traceSeed == null || s.seed === traceSeed) && (traceEp == null || s.ep === traceEp));
  }, [trace, traceSeed, traceEp]);

  const actionCategories = useMemo(() => trace ? Array.from(new Set([...trace.actsA, ...trace.actsB])) : [], [trace]);

  const decisionData = useMemo(() => {
    if (!trace) return [];
    return filteredSteps.flatMap((s) => ([
      { step: s.t, player: 'A', action: trace.actsA[s.actionA] ?? String(s.actionA), reward: s.rewardA, seed: s.seed, ep: s.ep },
      { step: s.t, player: 'B', action: trace.actsB[s.actionB] ?? String(s.actionB), reward: s.rewardB, seed: s.seed, ep: s.ep },
    ]));
  }, [filteredSteps, trace]);

  const decisionOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 80, left: 70 },
    tooltip: {
      trigger: 'item',
      formatter: (p: any) => {
        const d = p.data;
        return `seed ${d.seed} · ep ${d.ep}<br/>t = ${d.step}<br/>P${d.player} played ${d.action}<br/>reward: ${d.reward}`;
      }
    },
    dataset: { source: decisionData },
    xAxis: { type: 'value', name: 't' },
    yAxis: { type: 'category', data: ['A', 'B'], inverse: true, name: 'player' },
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
      encode: { x: 'step', y: 'player' },
      itemStyle: { opacity: 0.9 },
      emphasis: { focus: 'series' },
    }],
  }), [decisionData, actionCategories]);

  const recentSteps = useMemo(() => filteredSteps.slice(-12).reverse(), [filteredSteps]);

  function downloadTraceCsv() {
    if (!trace || !trace.steps.length) return;
    const header = ['seed', 'ep', 't', 'actionA', 'actionB', 'rewardA', 'rewardB', 'pA', 'pB'];
    const lines = trace.steps.map((s) => {
      const aAct = trace.actsA[s.actionA] ?? String(s.actionA);
      const bAct = trace.actsB[s.actionB] ?? String(s.actionB);
      const pA = s.pA.map((x) => x.toFixed(4)).join('|');
      const pB = s.pB.map((x) => x.toFixed(4)).join('|');
      return [s.seed, s.ep, s.t, aAct, bAct, s.rewardA, s.rewardB, `"${pA}"`, `"${pB}"`].join(',');
    });
    const blob = new Blob([`${header.join(',')}\n${lines.join('\n')}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eval_steps_run${runId ?? 'latest'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container page-animate">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 className="page-title">Algorithm Evaluation Suite</h2>
            <p className="page-subtitle">
              Batch experiments across seeds and episodes to compare learning algorithms quantitatively.
            </p>
          </div>
          <div className="section-meta">
            <div className="pill">
              <span className="pill-dot" />
              Summary statistics
            </div>
            <div className="pill">
              <span className="pill-dot accent" />
              Distributional view
            </div>
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="col">
            <div className="muted">Game</div>
            <select value={game} onChange={(e) => setGame(e.target.value as GameId)}>
              <option value="rps">RPS</option>
              <option value="mp">Matching Pennies</option>
              <option value="pd">Prisoner's Dilemma</option>
            </select>
          </div>
          <div className="col">
            <div className="muted">Alg A</div>
            <select value={algA} onChange={(e) => setAlgA(e.target.value as AlgId)}>
              <option value="hedge">hedge</option>
              <option value="regret">regret</option>
              <option value="fp">fp</option>
            </select>
          </div>
          <div className="col">
            <div className="muted">Alg B</div>
            <select value={algB} onChange={(e) => setAlgB(e.target.value as AlgId)}>
              <option value="hedge">hedge</option>
              <option value="regret">regret</option>
              <option value="fp">fp</option>
            </select>
          </div>
          <div className="col" style={{ minWidth: 200 }}>
            <div className="muted">Seeds (comma)</div>
            <input value={seedsText} onChange={(e) => setSeedsText(e.target.value)} />
          </div>
          <div className="col">
            <div className="muted">Episodes</div>
            <input type="number" min={1} max={200} value={episodes} onChange={(e) => setEpisodes(parseInt(e.target.value || '1', 10))} />
          </div>
          <div className="col">
            <div className="muted">Steps/Ep</div>
            <input type="number" min={10} max={20000} value={stepsPerEp} onChange={(e) => setStepsPerEp(parseInt(e.target.value || '10', 10))} />
          </div>
          <div className="col">
            <div className="muted">lr</div>
            <input type="number" step={0.05} min={0.05} max={5} value={lr} onChange={(e) => setLr(parseFloat(e.target.value || '0.5'))} />
          </div>
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="primary" onClick={runEval} disabled={running}>Run Eval</button>
          </div>
        </div>
      </div>

      {summaryView}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Per-step Decisions</h3>
            <p className="page-subtitle">Inspect every action taken during evaluation runs.</p>
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <div className="col" style={{ minWidth: 160 }}>
              <div className="muted">Seed</div>
              <select value={traceSeed ?? ''} onChange={(e) => setTraceSeed(e.target.value ? Number(e.target.value) : null)} disabled={!availableSeeds.length}>
                {availableSeeds.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="col" style={{ minWidth: 160 }}>
              <div className="muted">Episode</div>
              <select value={traceEp ?? ''} onChange={(e) => setTraceEp(e.target.value ? Number(e.target.value) : null)} disabled={!availableEps.length}>
                {availableEps.map((ep) => <option key={ep} value={ep}>{ep}</option>)}
              </select>
            </div>
            <button onClick={downloadTraceCsv} disabled={!trace || !trace.steps.length}>Download steps CSV</button>
          </div>
        </div>
        <div className="row" style={{ gap: 16, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 320 }}>
            <ReactECharts echarts={echarts} option={decisionOption} style={{ height: 300 }} />
            {!trace && <div className="muted" style={{ marginTop: 8 }}>Run an evaluation to see step-level actions.</div>}
            {traceLoading && <div className="muted" style={{ marginTop: 8 }}>Loading trace...</div>}
          </div>
          <div className="col" style={{ flex: '0 0 320px', minWidth: 260, gap: 8 }}>
            <div className="muted">Latest steps (selected seed/episode)</div>
            <div style={{ border: '1px solid rgba(148, 163, 184, 0.35)', borderRadius: 12, padding: '0.6rem', background: 'rgba(15, 23, 42, 0.6)', maxHeight: 300, overflowY: 'auto' }}>
              {recentSteps.length === 0 && <div className="muted">No steps recorded yet.</div>}
              {recentSteps.map((s) => {
                const aAct = trace?.actsA[s.actionA] ?? String(s.actionA);
                const bAct = trace?.actsB[s.actionB] ?? String(s.actionB);
                const colorA = actionCategories.length ? ACTION_COLORS[actionCategories.indexOf(aAct) % ACTION_COLORS.length] : '#1e293b';
                const colorB = actionCategories.length ? ACTION_COLORS[actionCategories.indexOf(bAct) % ACTION_COLORS.length] : '#1e293b';
                return (
                  <div key={`${s.seed}-${s.ep}-${s.t}`} className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                    <div className="muted" style={{ minWidth: 60 }}>t = {s.t}</div>
                    <div className="row" style={{ gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      <span className="pill" style={{ padding: '0.1rem 0.55rem', background: `${colorA}33`, borderColor: 'rgba(148, 163, 184, 0.35)' }}>A: {aAct}</span>
                      <span className="pill" style={{ padding: '0.1rem 0.55rem', background: `${colorB}33`, borderColor: 'rgba(148, 163, 184, 0.35)' }}>B: {bAct}</span>
                      <span className="pill" style={{ padding: '0.1rem 0.5rem', background: 'rgba(34,197,94,0.15)', borderColor: 'rgba(148, 163, 184, 0.3)' }}>rA: {s.rewardA}</span>
                      <span className="pill" style={{ padding: '0.1rem 0.5rem', background: 'rgba(56,189,248,0.15)', borderColor: 'rgba(148, 163, 184, 0.3)' }}>rB: {s.rewardB}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>A Win Rate Histogram</h3>
              <p className="page-subtitle">Distribution of A&apos;s win rate across independent seeds.</p>
            </div>
          </div>
          <ReactECharts echarts={echarts} option={winHistOption} style={{ height: 260 }} />
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Avg Reward by Episode</h3>
              <p className="page-subtitle">Episode-level aggregation of average rewards for player A.</p>
            </div>
          </div>
          <ReactECharts echarts={echarts} option={rewardOption} style={{ height: 260 }} />
        </div>
        {game === 'pd' ? (
          <div className="card">
            <div className="section-header">
              <div>
                <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Cooperation Rate (A)</h3>
                <p className="page-subtitle">How often player A chooses cooperative actions in PD.</p>
              </div>
            </div>
            <ReactECharts echarts={echarts} option={coopOption} style={{ height: 260 }} />
          </div>
        ) : (
          <div className="card">
            <div className="section-header">
              <div>
                <h3 className="page-title" style={{ fontSize: '1.05rem' }}>L2 Distance to Uniform (A)</h3>
                <p className="page-subtitle">How far A&apos;s strategy is from the uniform mixed strategy.</p>
              </div>
            </div>
            <ReactECharts echarts={echarts} option={l2Option} style={{ height: 260 }} />
          </div>
        )}
      </div>
    </div>
  );
};

export default EvalPage;
