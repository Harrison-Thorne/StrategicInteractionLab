export type Stepper = (opp: number[], payoff: number[][]) => number[];

function normalize(v: number[]): number[] {
  const s = v.reduce((a, b) => a + b, 0);
  if (s <= 0) return v.map(() => 1 / v.length);
  return v.map((x) => x / s);
}

function softmax(u: number[], tau: number): number[] {
  const t = Math.max(1e-4, tau);
  const m = Math.max(...u);
  const exps = u.map((x) => Math.exp((x - m) / t));
  const s = exps.reduce((a, b) => a + b, 0);
  return exps.map((x) => x / (s || 1));
}

export function makeStepper(alg: 'hedge' | 'regret' | 'fp', acts: number, lr?: number): Stepper {
  const eta = lr ?? 0.5;
  let w = Array(acts).fill(1) as number[]; // weights for hedge
  let p = normalize([...w]);
  let R = Array(acts).fill(0) as number[]; // cumulative regrets
  let oppHist: number[] | null = null; // opponent empirical frequency
  let t = 0;

  const stepHedge: Stepper = (opp, M) => {
    // Expected payoff for each pure action
    const u = M.map((row) => row.reduce((acc, mij, j) => acc + mij * opp[j], 0));
    const s = Math.max(1, ...u.map((x) => Math.abs(x)));
    w = w.map((wi, i) => wi * Math.exp((eta / s) * u[i]));
    p = normalize(w);
    return p;
  };

  const stepRegret: Stepper = (opp, M) => {
    const u = M.map((row) => row.reduce((acc, mij, j) => acc + mij * opp[j], 0));
    const ubar = p.reduce((acc, pi, i) => acc + pi * u[i], 0);
    // update cumulative positive regrets
    for (let i = 0; i < acts; i++) R[i] = Math.max(0, R[i] + (u[i] - ubar));
    const sumPos = R.reduce((a, b) => a + b, 0);
    if (sumPos <= 1e-12) {
      // fallback to uniform when no positive regrets
      p = Array(acts).fill(1 / acts);
    } else {
      p = R.map((r) => r / sumPos);
    }
    return p;
  };

  const stepFP: Stepper = (opp, M) => {
    // init opp history lazily to opp dimension
    if (!oppHist || oppHist.length !== opp.length) oppHist = Array(opp.length).fill(0);
    t += 1;
    for (let j = 0; j < opp.length; j++) oppHist[j] += opp[j];
    const q = oppHist.map((c) => c / t);
    const u = M.map((row) => row.reduce((acc, mij, j) => acc + mij * q[j], 0));
    // soft best response with temperature tau = 1/eta
    const tau = 1 / Math.max(eta, 1e-3);
    p = softmax(u, tau);
    return p;
  };

  if (alg === 'hedge') return stepHedge;
  if (alg === 'regret') return stepRegret;
  return stepFP;
}
