import React, { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import * as echarts from 'echarts';
import api from '../api';
import { useI18n } from '../i18n';

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
  const { t } = useI18n();

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
    yAxis: { type: 'value', name: t('rl.axis.avgRewardA') },
    series: [{ type: 'line', data: logs.map((l) => l.avgRewardA) ?? [], smooth: true }],
  }), [logs, t]);

  const winOption = useMemo(() => ({
    grid: { top: 20, right: 10, bottom: 30, left: 40 },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: logs.map((l) => l.ep) ?? [] },
    yAxis: { type: 'value', name: t('rl.axis.winA'), min: 0, max: 1 },
    series: [{ type: 'line', data: logs.map((l) => l.winA ?? null) ?? [], smooth: true }],
  }), [logs, t]);

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
            <h2 className="page-title">{t('rl.title')}</h2>
            <p className="page-subtitle">{t('rl.subtitle')}</p>
          </div>
          <div className="section-meta">
            <div className="pill"><span className="pill-dot" />{t('rl.pillSelfPlay')}</div>
            <div className="pill"><span className="pill-dot accent" />{t('rl.pillCpu')}</div>
            <div className="pill"><span className="pill-dot" />{t('rl.pillDownload')}</div>
          </div>
        </div>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap' }}>
          <div className="col">
            <div className="muted">{t('rl.control.game')}</div>
            <select value={game} onChange={(e) => setGame(e.target.value as GameId)}>
              <option value="pd">{t('rl.control.pd')}</option>
              <option value="rps">{t('rl.control.rps')}</option>
              <option value="mp">{t('rl.control.mp')}</option>
            </select>
          </div>
          <div className="col">
            <div className="muted">{t('rl.control.episodes')}</div>
            <input type="number" min={10} max={5000} value={episodes} onChange={(e) => setEpisodes(parseInt(e.target.value || '1', 10))} />
          </div>
          <div className="col">
            <div className="muted">{t('rl.control.stepsPerEp')}</div>
            <input type="number" min={20} max={5000} value={stepsPerEp} onChange={(e) => setStepsPerEp(parseInt(e.target.value || '20', 10))} />
          </div>
          <div className="col">
            <div className="muted">{t('rl.control.lr')}</div>
            <input type="number" step={0.01} min={0.001} max={1} value={lr} onChange={(e) => setLr(parseFloat(e.target.value || '0.05'))} />
          </div>
          <div className="col">
            <div className="muted">{t('rl.control.hidden')}</div>
            <input type="number" min={4} max={128} value={hidden} onChange={(e) => setHidden(parseInt(e.target.value || '16', 10))} />
          </div>
          <div className="col">
            <div className="muted">{t('rl.control.seed')}</div>
            <input type="number" value={seed} onChange={(e) => setSeed(parseInt(e.target.value || '1234', 10))} />
          </div>
          <div className="col" style={{ minWidth: 200 }}>
            <div className="muted">{t('rl.control.distributed')}</div>
            <label className="row" style={{ gap: 8, alignItems: 'center' }}>
              <input type="checkbox" checked={distributed} onChange={(e) => setDistributed(e.target.checked)} />
              <span className="muted">{t('rl.control.distributedLabel')}</span>
            </label>
          </div>
          {distributed && (
            <div className="col">
              <div className="muted">{t('rl.control.workers')}</div>
              <input type="number" min={1} max={16} value={workers} onChange={(e) => setWorkers(parseInt(e.target.value || '1', 10))} />
            </div>
          )}
          <div className="row" style={{ gap: 8, marginLeft: 'auto' }}>
            <button className="primary" onClick={startTrain} disabled={running}>{t('rl.control.train')}</button>
            <button onClick={downloadPolicy} disabled={!result}>{t('rl.control.download')}</button>
          </div>
        </div>
      </div>

      <div className="col" style={{ gap: 16 }}>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('rl.chart.rewardTitle')}</h3>
              <p className="page-subtitle">{t('rl.chart.rewardSubtitle')}</p>
            </div>
          </div>
          <ReactECharts echarts={echarts} option={rewardOption} style={{ height: 260 }} />
        </div>
        <div className="card">
          <div className="section-header">
            <div>
              <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('rl.chart.winTitle')}</h3>
              <p className="page-subtitle">{t('rl.chart.winSubtitle')}</p>
            </div>
          </div>
          <ReactECharts echarts={echarts} option={winOption} style={{ height: 260 }} />
        </div>
        {result && (
          <div className="card">
            <div className="section-header">
              <div>
                <h3 className="page-title" style={{ fontSize: '1.05rem' }}>{t('rl.summary.title')}</h3>
                <p className="page-subtitle">
                  {('distributed' in result && result.distributed) ? t('rl.summary.subtitleAggregated') : t('rl.summary.subtitle')}
                </p>
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
