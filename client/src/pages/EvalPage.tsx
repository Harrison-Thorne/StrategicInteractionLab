import React, { useMemo, useState } from 'react';
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

  async function runEval() {
    try {
      setRunning(true);
      setSummary(null);
      setMetrics([]);
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
    } finally {
      setRunning(false);
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
