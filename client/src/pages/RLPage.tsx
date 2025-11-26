import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import api from '../api';

type GameId = 'rps' | 'mp' | 'pd';

type TrainResp = {
  run_id: string;
  config: {
    game: GameId;
    episodes: number;
    stepsPerEp: number;
    lr: number;
    hidden: number;
  };
  logs: Array<{ ep: number; avgRewardA: number; avgRewardB: number; winA: number | null }>;
  actsA: string[];
  actsB: string[];
  policyA: any;
  policyB: any;
};

type DistributedTrainResp = {
  distributed: true;
  workers: number;
  base_seed: number;
  workerRuns: Array<{ run_id: string; seed: number; logs: TrainResp['logs'] }>;
  aggregatedLogs: TrainResp['logs'];
  config: TrainResp['config'];
  actsA: string[];
  actsB: string[];
};

type TrainRespUnion = TrainResp | DistributedTrainResp;

const RLPage: React.FC = () => {
  const [game, setGame] = useState<GameId>('pd');
  const [episodes, setEpisodes] = useState(80);
  const [stepsPerEp, setStepsPerEp] = useState(200);
  const [lr, setLr] = useState(0.05);
  const [hidden, setHidden] = useState(16);
  const [seed, setSeed] = useState(1234);
  const [running, setRunning] = useState(false);
  const [distributed, setDistributed] = useState(false);
  const [workers, setWorkers] = useState(4);
  const [result, setResult] = useState<TrainRespUnion | null>(null);

  async function startTrain() {
    setRunning(true);
    setResult(null);
    try {
      const path = distributed ? '/api/rl/train/distributed' : '/api/rl/train';
      const body = distributed ? { game, episodes, stepsPerEp, lr, hidden, seed, workers } : { game, episodes, stepsPerEp, lr, hidden, seed };
      const res = await api.post(path, body);
      setResult(res.data);
    } finally {
      setRunning(false);
    }
  }

  const logs = useMemo(() => {
    if (!result) return [];
    if ('distributed' in result && result.distributed) return result.aggregatedLogs;
    return result.logs;
  }, [result]);

  const rewardOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: logs.map((l) => l.ep) ?? [] },
    yAxis: { type: 'value', name: 'avgRewardA' },
    series: [{ type: 'line', data: logs.map((l) => l.avgRewardA) ?? [], smooth: true }],
  }), [logs]);

  const winOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: logs.map((l) => l.ep) ?? [] },
    yAxis: { type: 'value', name: 'winA', min: 0, max: 1 },
    series: [{ type: 'line', data: logs.map((l) => l.winA ?? null) ?? [], smooth: true }],
  }), [logs]);

  function downloadPolicy() {
    if (!result) return;
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rl_policy_${result.run_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="container page-animate">
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="section-header">
          <div>
            <h2 className="page-title">Deep RL Trainer (Demo)</h2>
            <p className="page-subtitle">CPU-only self-play policy-gradient trainer for small matrix games.</p>
          </div>
          <div className="section-meta">
            <div className="pill"><span className="pill-dot" />Self-play PG</div>
            <div className="pill"><span className="pill-dot accent" />CPU friendly</div>
            <div className="pill"><span className="pill-dot" />Downloadable policy</div>
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="col">
            <div className="muted">Game</div>
            <select value={game} onChange={(e) => setGame(e.target.value as GameId)}>
              <option value="pd">Prisoner's Dilemma</option>
              <option value="rps">RPS</option>
              <option value="mp">Matching Pennies</option>
            </select>
          </div>
          <div className="col">
            <div className="muted">Episodes</div>
            <input type="number" min={10} max={5000} value={episodes} onChange={(e) => setEpisodes(parseInt(e.target.value || '1', 10))} />
          </div>
          <div className="col">
            <div className="muted">Steps / Episode</div>
            <input type="number" min={20} max={5000} value={stepsPerEp} onChange={(e) => setStepsPerEp(parseInt(e.target.value || '20', 10))} />
          </div>
          <div className="col">
            <div className="muted">Learning rate</div>
            <input type="number" step={0.01} min={0.001} max={1} value={lr} onChange={(e) => setLr(parseFloat(e.target.value || '0.05'))} />
          </div>
          <div className="col">
            <div className="muted">Hidden size</div>
            <input type="number" min={4} max={128} value={hidden} onChange={(e) => setHidden(parseInt(e.target.value || '16', 10))} />
          </div>
          <div className="col">
            <div className="muted">Seed</div>
            <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value || '1234', 10))} />
          </div>
          <div className="col" style={{ minWidth: 200 }}>
            <div className="muted">Distributed demo</div>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={distributed} onChange={(e) => setDistributed(e.target.checked)} />
              <span className="muted">Enable multi-worker aggregation</span>
            </label>
          </div>
          {distributed && (
            <div className="col">
              <div className="muted">Workers</div>
              <input type="number" min={1} max={16} value={workers} onChange={(e) => setWorkers(parseInt(e.target.value || '1', 10))} />
            </div>
          )}
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="primary" onClick={startTrain} disabled={running}>Train</button>
            <button onClick={downloadPolicy} disabled={!result}>Download policy</button>
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Average Reward (A)</h3>
              <p className="page-subtitle">Reward trajectory across episodes.</p>
            </div>
          </div>
          <ReactECharts echarts={echarts} option={rewardOption} style={{ height: 260 }} />
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Win Rate (zero-sum games)</h3>
              <p className="page-subtitle">Mapped from reward for RPS / Matching Pennies.</p>
            </div>
          </div>
          <ReactECharts echarts={echarts} option={winOption} style={{ height: 260 }} />
        </div>
        {result && (
          <div className="card">
            <div className="section-header">
              <div>
                <h3 className="page-title" style={{ fontSize: '1.05rem' }}>Run Summary</h3>
                <p className="page-subtitle">Configuration + last policy snapshot{('distributed' in result && result.distributed) ? ' (aggregated view)' : ''}.</p>
              </div>
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', background: 'rgba(15,23,42,0.6)', padding: '0.8rem', borderRadius: 12, border: '1px solid rgba(148,163,184,0.35)', maxHeight: 360, overflow: 'auto' }}>
{JSON.stringify((() => {
  if ('distributed' in result && result.distributed) {
    return {
      distributed: true,
      workers: result.workers,
      base_seed: result.base_seed,
      config: result.config,
      actsA: result.actsA,
      actsB: result.actsB,
      aggregatedLastLog: result.aggregatedLogs[result.aggregatedLogs.length - 1],
      workerRuns: result.workerRuns.map((w) => ({ run_id: w.run_id, seed: w.seed })),
    };
  }
  return {
    run_id: result.run_id,
    config: result.config,
    actsA: result.actsA,
    actsB: result.actsB,
    lastLog: result.logs[result.logs.length - 1],
  };
})(), null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

export default RLPage;
