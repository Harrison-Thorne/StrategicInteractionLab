export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface JwtUserPayload {
  uid: number;
  email: string;
}

export interface Note {
  id: number;
  user_id: number;
  content: string;
  created_at: string;
}

export type GameId = 'rps' | 'mp' | 'pd';

export type AlgId = 'hedge' | 'regret' | 'fp';

export interface EvalRun {
  id: number;
  user_id: number;
  game: GameId;
  algA: AlgId;
  algB: AlgId;
  seeds: number[];
  episodes: number;
  stepsPerEp: number;
  lr?: number | null;
  created_at: string;
}

export interface EvalMetricRow {
  id: number;
  run_id: number;
  seed: number;
  ep: number;
  winA: number | null;
  avgRewardA: number;
  coopRate: number | null;
  l2Dist: number | null;
  created_at: string;
}

export interface EvalSummaryRow {
  id: number;
  run_id: number;
  winA_mean: number | null;
  winA_std: number | null;
  avgRewardA_mean: number | null;
  avgRewardA_std: number | null;
  coopRate_mean: number | null;
  coopRate_std: number | null;
  l2Dist_mean: number | null;
  l2Dist_std: number | null;
  created_at: string;
}
